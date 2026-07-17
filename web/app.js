const LOCAL_HELPER = "http://127.0.0.1:5178";
const LOCAL_PLATFORMS = new Set(["qq", "qishui"]);
const MAX_RESULTS_PER_PLATFORM = 200;
const STATIC_HOST_RE = /(^|\.)github\.io$/i;
const platformLabels = {
  netease: "网易云音乐",
  kugou: "酷狗音乐",
  qq: "QQ 音乐",
  kuwo: "酷我音乐",
  qishui: "汽水音乐 App",
};

const queryInput = document.querySelector("#queryInput");
const limitInput = document.querySelector("#limitInput");
const searchButton = document.querySelector("#searchButton");
const sampleButton = document.querySelector("#sampleButton");
const clearButton = document.querySelector("#clearButton");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");
const checkHelperButton = document.querySelector("#checkHelperButton");
const openHelperButton = document.querySelector("#openHelperButton");
const helperStatus = document.querySelector("#helperStatus");
const resultBody = document.querySelector("#resultBody");
const rowTemplate = document.querySelector("#rowTemplate");
const notice = document.querySelector("#notice");
const totalCount = document.querySelector("#totalCount");
const onlineCount = document.querySelector("#onlineCount");
const localCount = document.querySelector("#localCount");
const platformInputs = [...document.querySelectorAll('input[name="platform"]')];
const linkModeButton = document.querySelector("#linkModeButton");
const offlineModeButton = document.querySelector("#offlineModeButton");
const offlineInput = document.querySelector("#offlineInput");
const offlineCheckButton = document.querySelector("#offlineCheckButton");
const offlineSampleButton = document.querySelector("#offlineSampleButton");
const offlineClearButton = document.querySelector("#offlineClearButton");
const offlineCopyButton = document.querySelector("#offlineCopyButton");
const offlineCsvButton = document.querySelector("#offlineCsvButton");
const offlineJsonButton = document.querySelector("#offlineJsonButton");
const offlineNotice = document.querySelector("#offlineNotice");
const offlineResultBody = document.querySelector("#offlineResultBody");
const offlineTotalCount = document.querySelector("#offlineTotalCount");
const offlineDownCount = document.querySelector("#offlineDownCount");
const offlinePlayableCount = document.querySelector("#offlinePlayableCount");
const offlineUnknownCount = document.querySelector("#offlineUnknownCount");

let currentRows = [];
let currentOfflineRows = [];
let helperConnected = false;
let helperSupportsOffline = false;

function showStartupError(message) {
  const target = document.querySelector("#notice") || document.querySelector("#offlineNotice") || document.querySelector("#helperStatus");
  if (!target) return;
  target.hidden = false;
  target.textContent = message;
}

window.addEventListener("error", (event) => {
  showStartupError(`页面脚本出错：${event.message || "未知错误"}。请按 Ctrl + F5 强制刷新后重试。`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || "未知错误");
  showStartupError(`页面操作失败：${reason}`);
});

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
  if (STATIC_HOST_RE.test(location.hostname)) {
    return {
      online: [],
      local: platforms,
    };
  }

  return {
    online: platforms.filter((platform) => !LOCAL_PLATFORMS.has(platform)),
    local: platforms.filter((platform) => LOCAL_PLATFORMS.has(platform)),
  };
}

function platformLabel(platform) {
  return platformLabels[platform] || platform;
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

function showOfflineNotice(text) {
  offlineNotice.hidden = !text;
  offlineNotice.textContent = text || "";
}

function setMode(mode) {
  const isOffline = mode === "offline";
  document.body.dataset.mode = isOffline ? "offline" : "link";
  linkModeButton.classList.toggle("active", !isOffline);
  offlineModeButton.classList.toggle("active", isOffline);
}

function setBusy(isBusy) {
  searchButton.disabled = isBusy;
  searchButton.textContent = isBusy ? "搜索中..." : "搜索并回填";
}

function setOfflineBusy(isBusy) {
  offlineCheckButton.disabled = isBusy;
  offlineCheckButton.textContent = isBusy ? "检测中..." : "开始检测";
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

function parseOfflineLinks() {
  const seen = new Set();
  return offlineInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const matched = line.match(/https?:\/\/[^\s"'<>，。；、]+/i);
      return matched ? matched[0] : "";
    })
    .filter((url) => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function offlineStatusClass(status) {
  if (status === "已下架") return "down";
  if (status === "可播放") return "playable";
  return "unknown";
}

function renderOfflineRows(rows) {
  offlineResultBody.replaceChildren();

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = '<td colspan="7">输入歌曲链接后，检测结果会显示在这里。</td>';
    offlineResultBody.append(tr);
  } else {
    rows.forEach((row, index) => {
      const tr = document.createElement("tr");
      const linkCell = document.createElement("td");
      if (row.url) linkCell.append(createLink(row.url));

      const badge = document.createElement("span");
      badge.className = `badge ${offlineStatusClass(row.status)}`;
      badge.textContent = row.status || "不确定";

      const statusCell = document.createElement("td");
      statusCell.append(badge);

      const cells = [
        String(index + 1),
        row.platform || "",
        statusCell,
        linkCell,
        row.songId || "",
        row.evidence || "",
        row.elapsedMs ? `${row.elapsedMs} ms` : "",
      ];

      for (const value of cells) {
        if (value instanceof HTMLElement) {
          tr.append(value);
        } else {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        }
      }
      offlineResultBody.append(tr);
    });
  }

  offlineTotalCount.textContent = String(rows.length);
  offlineDownCount.textContent = String(rows.filter((row) => row.status === "已下架").length);
  offlinePlayableCount.textContent = String(rows.filter((row) => row.status === "可播放").length);
  offlineUnknownCount.textContent = String(rows.filter((row) => row.status !== "已下架" && row.status !== "可播放").length);
  offlineCopyButton.disabled = rows.length === 0;
  offlineCsvButton.disabled = rows.length === 0;
  offlineJsonButton.disabled = rows.length === 0;
}

function serializeOfflineRows(rows) {
  return rows.map((row, index) => [
    index + 1,
    row.platform || "",
    row.status || "",
    row.url || "",
    row.songId || "",
    row.evidence || "",
    row.elapsedMs ? `${row.elapsedMs} ms` : "",
  ]);
}

function offlineRowsToTsv(rows) {
  return [
    ["序号", "平台", "状态", "链接", "歌曲 ID", "判断依据", "耗时"].join("\t"),
    ...serializeOfflineRows(rows).map((row) => row.join("\t")),
  ].join("\n");
}

function offlineRowsToCsv(rows) {
  return [
    ["序号", "平台", "状态", "链接", "歌曲 ID", "判断依据", "耗时"].map(csvEscape).join(","),
    ...serializeOfflineRows(rows).map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

async function runOfflineCheck() {
  const links = parseOfflineLinks();
  if (links.length === 0) {
    showOfflineNotice("请至少输入一个歌曲链接。");
    offlineInput.focus();
    return;
  }

  if (!(await checkHelper())) {
    showOfflineNotice("没有连上本地助手。请先下载并启动新版本地助手，再检测链接是否下架。");
    return;
  }

  if (!helperSupportsOffline) {
    showOfflineNotice("当前运行的是旧版本地助手，不支持下架检测。请关闭旧助手窗口，重新下载并启动最新助手。");
    return;
  }

  currentOfflineRows = [];
  renderOfflineRows(currentOfflineRows);
  showOfflineNotice("正在检测，部分平台需要打开无头 Chrome / Edge 读取页面，请稍等。");
  setOfflineBusy(true);

  try {
    const response = await fetch(`${LOCAL_HELPER}/api/offline-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links }),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("本地助手没有返回有效数据。请确认已经关闭旧助手，并启动最新版本地助手。");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "检测失败");

    currentOfflineRows = data.results || [];
    renderOfflineRows(currentOfflineRows);
    showOfflineNotice(`检测完成：共 ${currentOfflineRows.length} 条。`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showOfflineNotice(
      message === "Failed to fetch"
        ? "连接本地助手失败。请确认新版本地助手窗口正在运行；如果刚更新过，请关闭旧助手后重新下载并启动。"
        : message,
    );
  } finally {
    setOfflineBusy(false);
  }
}

async function checkHelper() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  helperStatus.textContent = "正在连接本地助手...";
  try {
    const response = await fetch(`${LOCAL_HELPER}/api/status?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json();
    helperConnected = response.ok && data.ok;
    helperSupportsOffline = Boolean(data.features?.offlineCheck && Number(data.features?.offlineCheckVersion || 0) >= 8);
    helperStatus.textContent = helperConnected
      ? `已连接：${data.name || "本地助手"}${helperSupportsOffline ? "" : "（旧版，请更新）"}`
      : "未连接";
  } catch {
    helperConnected = false;
    helperSupportsOffline = false;
    helperStatus.textContent = "未连接：请确认本地助手窗口正在运行，或直接访问 http://127.0.0.1:5178/";
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

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      baseUrl
        ? "本地助手没有返回有效数据，请确认助手窗口仍在运行。"
        : "当前 GitHub Pages 页面不能直接运行搜索接口，请先下载并启动 Windows 本地助手。",
    );
  }

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

  if (STATIC_HOST_RE.test(location.hostname)) {
    showNotice("当前 GitHub Pages 版本需要启动本地助手后再搜索；Windows 助手已内置 Node，解压双击即可。");
  }

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
checkHelperButton.addEventListener("click", async () => {
  const ok = await checkHelper();
  if (!ok) showNotice("没有连上本地助手。请确认助手窗口没有关闭，或打开 http://127.0.0.1:5178/ 检查。");
});
openHelperButton?.addEventListener("click", () => {
  helperStatus.textContent = "正在打开本地助手控制台...";
  const opened = window.open(LOCAL_HELPER, "_blank", "noopener,noreferrer");
  if (!opened) {
    helperStatus.textContent = `浏览器拦截了新窗口，请在地址栏手动打开：${LOCAL_HELPER}`;
    showNotice(`浏览器拦截了本地助手窗口，请手动打开：${LOCAL_HELPER}`);
    return;
  }
  setTimeout(checkHelper, 800);
});
linkModeButton.addEventListener("click", () => setMode("link"));
offlineModeButton.addEventListener("click", () => setMode("offline"));
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
offlineCheckButton.addEventListener("click", runOfflineCheck);
offlineSampleButton.addEventListener("click", () => {
  offlineInput.value = [
    "https://music.163.com/#/song?id=1805058188",
    "https://y.qq.com/n/ryqq/songDetail/001Qu4I30eVFYb",
    "https://www.kuwo.cn/play_detail/263195765",
  ].join("\n");
});
offlineClearButton.addEventListener("click", () => {
  offlineInput.value = "";
  currentOfflineRows = [];
  showOfflineNotice("");
  renderOfflineRows(currentOfflineRows);
});
offlineCopyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(offlineRowsToTsv(currentOfflineRows));
  showOfflineNotice("已复制下架检测表格。");
});
offlineCsvButton.addEventListener("click", () => {
  const blob = new Blob(["\ufeff", offlineRowsToCsv(currentOfflineRows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "music-offline-check-results.csv";
  link.click();
  URL.revokeObjectURL(url);
});
offlineJsonButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(currentOfflineRows, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "music-offline-check-results.json";
  link.click();
  URL.revokeObjectURL(url);
});
platformInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const hasLocal = selectedPlatforms().some((platform) => LOCAL_PLATFORMS.has(platform));
    showNotice(hasLocal ? "QQ / 汽水需要本地助手。未安装时请先下载 Windows 助手。" : "");
  });
});

setMode("link");
renderRows([]);
renderOfflineRows([]);
checkHelper();
