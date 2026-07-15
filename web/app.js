const LOCAL_HELPER = "http://127.0.0.1:5178";
const LOCAL_PLATFORMS = new Set(["qq", "qishui"]);
const MAX_RESULTS_PER_PLATFORM = 200;

const queryInput = document.querySelector("#queryInput");
const limitInput = document.querySelector("#limitInput");
const searchButton = document.querySelector("#searchButton");
const sampleButton = document.querySelector("#sampleButton");
const clearButton = document.querySelector("#clearButton");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");
const checkHelperButton = document.querySelector("#checkHelperButton");
const helperStatus = document.querySelector("#helperStatus");
const resultBody = document.querySelector("#resultBody");
const rowTemplate = document.querySelector("#rowTemplate");
const notice = document.querySelector("#notice");
const totalCount = document.querySelector("#totalCount");
const onlineCount = document.querySelector("#onlineCount");
const localCount = document.querySelector("#localCount");
const platformInputs = [...document.querySelectorAll('input[name="platform"]')];

let currentRows = [];
let helperConnected = false;

function selectedPlatforms() {
  return platformInputs.filter((item) => item.checked).map((item) => item.value);
}

function parseQueries() {
  return queryInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitPlatforms(platforms) {
  return {
    online: platforms.filter((platform) => !LOCAL_PLATFORMS.has(platform)),
    local: platforms.filter((platform) => LOCAL_PLATFORMS.has(platform)),
  };
}

function statText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function statusLabel(row) {
  if (row.error) return "失败";
  if (row.source === "local") return "本地助手";
  if (row.matchType === "exact") return "精确同名";
  if (row.matchType === "candidate") return "候选";
  if (row.matchType === "search-page") return "搜索页";
  return "在线返回";
}

function showNotice(text) {
  notice.hidden = !text;
  notice.textContent = text || "";
}

function setBusy(isBusy) {
  searchButton.disabled = isBusy;
  searchButton.textContent = isBusy ? "搜索中..." : "搜索并回填";
}

function createLink(url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = url;
  return link;
}

function flattenPlatformResult(result, source) {
  if (result.error) {
    return [
      {
        query: result.query,
        platform: result.platform,
        platformLabel: result.platformLabel || result.platform,
        rank: "",
        song: null,
        matchType: "error",
        source,
        error: result.error,
        detail: result.detail || "",
      },
    ];
  }

  if (!result.candidates || result.candidates.length === 0) {
    return [
      {
        query: result.query,
        platform: result.platform,
        platformLabel: result.platformLabel || result.platform,
        rank: "",
        song: null,
        matchType: "none",
        source,
      },
    ];
  }

  return result.candidates.map((candidate) => ({
    query: result.query,
    platform: result.platform,
    platformLabel: result.platformLabel,
    rank: candidate.rank,
    song: candidate,
    matchType: candidate.matchType,
    source,
  }));
}

function renderRows(rows) {
  resultBody.replaceChildren();
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = '<td colspan="12">输入关键词后，搜索结果会显示在这里。</td>';
    resultBody.append(tr);
  } else {
    for (const row of rows) {
      const node = rowTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector(".query").textContent = row.query || "";
      node.querySelector(".platform").textContent = row.platformLabel || "";
      node.querySelector(".rank").textContent = row.rank ? String(row.rank) : "";
      if (row.error) {
        node.querySelector(".song").textContent = row.error;
        node.querySelector(".artists").textContent = row.detail || "";
      } else if (row.song) {
        node.querySelector(".song").textContent = row.song.name || "";
        node.querySelector(".artists").textContent = row.song.artists || "";
        node.querySelector(".album").textContent = row.song.album || "";
        node.querySelector(".favorite").textContent = statText(
          row.song.favoriteText,
          row.song.favoriteCount,
          row.song.likeCount,
        );
        node.querySelector(".listen").textContent = statText(row.song.listenText, row.song.listenCount);
        node.querySelector(".comment").textContent = statText(row.song.commentCount);
        node.querySelector(".share").textContent = statText(row.song.shareCount);
        if (row.song.link) node.querySelector(".link").append(createLink(row.song.link));
      }
      const badge = document.createElement("span");
      badge.className = `badge ${row.error ? "error" : row.source === "local" ? "helper" : ""}`;
      badge.textContent = statusLabel(row);
      node.querySelector(".status").append(badge);
      resultBody.append(node);
    }
  }

  totalCount.textContent = String(rows.length);
  onlineCount.textContent = String(rows.filter((row) => row.source === "online").length);
  localCount.textContent = String(rows.filter((row) => row.source === "local").length);
  copyButton.disabled = rows.length === 0;
  downloadButton.disabled = rows.length === 0;
}

async function checkHelper() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(`${LOCAL_HELPER}/api/status`, { signal: controller.signal });
    const data = await response.json();
    helperConnected = response.ok && data.ok;
    helperStatus.textContent = helperConnected
      ? `已连接：${data.name || "本地助手"}`
      : "未连接";
  } catch {
    helperConnected = false;
    helperStatus.textContent = "未连接，请下载并启动本地助手";
  } finally {
    clearTimeout(timeout);
  }
  return helperConnected;
}

async function searchEndpoint(baseUrl, query, platforms, limit) {
  const response = await fetch(`${baseUrl}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, platforms, limit, qqBrowserMode: true }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "搜索失败");
  return data.platforms || [];
}

async function searchOne(query, limit, platforms) {
  const { online, local } = splitPlatforms(platforms);
  const rows = [];

  if (online.length) {
    const results = await searchEndpoint("", query, online, limit);
    rows.push(...results.flatMap((result) => flattenPlatformResult(result, "online")));
  }

  if (local.length) {
    if (!helperConnected && !(await checkHelper())) {
      rows.push(
        ...local.map((platform) => ({
          query,
          platform,
          platformLabel: platform === "qq" ? "QQ 音乐" : "汽水音乐 App",
          rank: "",
          song: null,
          matchType: "error",
          source: "local",
          error: "需本地助手",
          detail: "请下载并启动本地助手，再点击“连接本地助手”。",
        })),
      );
    } else {
      const results = await searchEndpoint(LOCAL_HELPER, query, local, limit);
      rows.push(...results.flatMap((result) => flattenPlatformResult(result, "local")));
    }
  }

  return rows;
}

async function runSearch() {
  const queries = parseQueries();
  const platforms = selectedPlatforms();
  const limit = Math.min(Math.max(Number(limitInput.value || 10), 1), MAX_RESULTS_PER_PLATFORM);

  if (queries.length === 0) {
    showNotice("请输入至少一个关键词。");
    queryInput.focus();
    return;
  }
  if (platforms.length === 0) {
    showNotice("请选择至少一个平台。");
    return;
  }

  const hasLocal = platforms.some((platform) => LOCAL_PLATFORMS.has(platform));
  showNotice(hasLocal ? "QQ / 汽水需要本地助手；未启动时会提示下载，不影响在线平台查询。" : "");

  currentRows = [];
  renderRows(currentRows);
  setBusy(true);
  try {
    for (const query of queries) {
      const rows = await searchOne(query, limit, platforms);
      currentRows.push(...rows);
      renderRows(currentRows);
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}

function serializeRows(rows) {
  return rows.map((row) => [
    row.query,
    row.platformLabel || "",
    row.rank || "",
    row.song?.name || "",
    row.song?.artists || "",
    row.song?.album || "",
    statText(row.song?.favoriteText, row.song?.favoriteCount, row.song?.likeCount),
    statText(row.song?.listenText, row.song?.listenCount),
    statText(row.song?.commentCount),
    statText(row.song?.shareCount),
    row.song?.link || "",
    row.error ? `${row.error} ${row.detail || ""}`.trim() : statusLabel(row),
  ]);
}

function rowsToTsv(rows) {
  return [
    ["输入关键词", "平台", "序号", "歌曲名", "歌手名", "专辑名", "收藏/点赞", "在听", "评论", "转发", "链接", "状态"].join("\t"),
    ...serializeRows(rows).map((row) => row.join("\t")),
  ].join("\n");
}

function csvEscape(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

function rowsToCsv(rows) {
  return [
    ["输入关键词", "平台", "序号", "歌曲名", "歌手名", "专辑名", "收藏/点赞", "在听", "评论", "转发", "链接", "状态"]
      .map(csvEscape)
      .join(","),
    ...serializeRows(rows).map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

searchButton.addEventListener("click", runSearch);
checkHelperButton.addEventListener("click", checkHelper);
sampleButton.addEventListener("click", () => {
  queryInput.value = "Bad Girl Good Girl miss A\n无人之岛 任然\n用一生等一人 凯飒";
});
clearButton.addEventListener("click", () => {
  queryInput.value = "";
  currentRows = [];
  showNotice("");
  renderRows(currentRows);
});
copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(rowsToTsv(currentRows));
  showNotice("已复制表格。");
});
downloadButton.addEventListener("click", () => {
  const blob = new Blob(["\ufeff", rowsToCsv(currentRows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "music-link-results.csv";
  link.click();
  URL.revokeObjectURL(url);
});
platformInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const hasLocal = selectedPlatforms().some((platform) => LOCAL_PLATFORMS.has(platform));
    showNotice(hasLocal ? "QQ / 汽水需要本地助手。未安装时请先下载 Windows 助手。" : "");
  });
});

renderRows([]);
checkHelper();
