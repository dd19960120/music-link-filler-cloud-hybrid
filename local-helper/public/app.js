const input = document.querySelector("#songInput");
const qqCookieInput = document.querySelector("#qqCookieInput");
const qqBrowserModeInput = document.querySelector("#qqBrowserModeInput");
const qqBrowserButton = document.querySelector("#qqBrowserButton");
const qqBrowserStatus = document.querySelector("#qqBrowserStatus");
const qishuiCookieInput = document.querySelector("#qishuiCookieInput");
const qishuiDeviceInput = document.querySelector("#qishuiDeviceInput");
const qishuiInstallInput = document.querySelector("#qishuiInstallInput");
const limitInput = document.querySelector("#limitInput");
const searchButton = document.querySelector("#searchButton");
const selectAllButton = document.querySelector("#selectAllButton");
const sampleButton = document.querySelector("#sampleButton");
const clearButton = document.querySelector("#clearButton");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");
const resultBody = document.querySelector("#resultBody");
const rowTemplate = document.querySelector("#rowTemplate");
const networkStatus = document.querySelector("#networkStatus");
const totalCount = document.querySelector("#totalCount");
const exactCount = document.querySelector("#exactCount");
const reviewCount = document.querySelector("#reviewCount");
const platformInputs = [...document.querySelectorAll('input[name="platform"]')];
const MAX_RESULTS_PER_PLATFORM = 200;

let currentRows = [];

function parseSongNames() {
  return input.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function selectedPlatforms() {
  return platformInputs.filter((item) => item.checked).map((item) => item.value);
}

function setStatus(text, className = "") {
  networkStatus.textContent = text;
  networkStatus.className = `status-chip ${className}`.trim();
}

function setBrowserStatus(text, className = "") {
  qqBrowserStatus.textContent = text;
  qqBrowserStatus.className = `mini-status ${className}`.trim();
}

function setBusy(isBusy) {
  searchButton.disabled = isBusy;
  searchButton.textContent = isBusy ? "搜索中..." : "搜索并回填";
  platformInputs.forEach((item) => {
    item.disabled = isBusy;
  });
}

function statusLabel(matchType) {
  if (matchType === "exact") return "精确同名";
  if (matchType === "candidate") return "候选";
  if (matchType === "search-page") return "搜索页";
  if (matchType === "error") return "搜索失败";
  return "未找到";
}

function updateSummary(rows) {
  const exact = rows.filter((row) => row.matchType === "exact").length;
  const review = rows.filter((row) => row.matchType !== "exact").length;
  totalCount.textContent = String(rows.length);
  exactCount.textContent = String(exact);
  reviewCount.textContent = String(review);
  copyButton.disabled = rows.length === 0;
  downloadButton.disabled = rows.length === 0;
}

function createLink(url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = url;
  return link;
}

function statText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function renderRows(rows) {
  resultBody.replaceChildren();

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = '<td colspan="14">输入关键词并选择平台后，搜索结果会显示在这里。</td>';
    resultBody.append(tr);
    updateSummary(rows);
    return;
  }

  for (const row of rows) {
    const node = rowTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".input-name").textContent = row.query;
    node.querySelector(".platform-name").textContent = row.platformLabel || "";
    node.querySelector(".rank").textContent = row.rank ? String(row.rank) : "";

    if (row.error) {
      node.querySelector(".song-name").innerHTML = `<span class="error-text">${row.error}</span>`;
      node.querySelector(".artist-name").textContent = row.detail || "";
    } else if (row.song) {
      node.querySelector(".song-name").textContent = row.song.name;
      node.querySelector(".artist-name").textContent = row.song.artists;
      node.querySelector(".album-name").textContent = row.song.album || "";
      node.querySelector(".lyricist-name").textContent = row.song.lyricist || "";
      node.querySelector(".composer-name").textContent = row.song.composer || "";
      node.querySelector(".like-count").textContent = statText(
        row.song.favoriteText,
        row.song.favoriteCount,
        row.song.likeCount,
      );
      node.querySelector(".listen-count").textContent = statText(row.song.listenText, row.song.listenCount);
      node.querySelector(".comment-count").textContent = row.song.commentCount ?? "";
      node.querySelector(".share-count").textContent = row.song.shareCount ?? "";
      if (row.song.link) node.querySelector(".song-link").append(createLink(row.song.link));
    }

    const badge = document.createElement("span");
    badge.className = `badge ${row.matchType || "none"}`;
    badge.textContent = statusLabel(row.matchType);
    node.querySelector(".match-status").append(badge);
    resultBody.append(node);
  }

  updateSummary(rows);
}

function flattenPlatformResult(result) {
  if (result.error) {
    return [
      {
        query: result.query,
        platform: result.platform,
        platformLabel: result.platformLabel,
        rank: "",
        song: null,
        matchType: "error",
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
        platformLabel: result.platformLabel,
        rank: "",
        song: null,
        matchType: "none",
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
  }));
}

async function searchSong(query, limit, platforms) {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      limit,
      platforms,
      qqCookie: qqCookieInput.value.trim(),
      qqBrowserMode: qqBrowserModeInput.checked,
      qishuiCookie: qishuiCookieInput?.value.trim() || "",
      qishuiDeviceId: qishuiDeviceInput?.value.trim() || "",
      qishuiInstallId: qishuiInstallInput?.value.trim() || "",
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    return [
      {
        query,
        platformLabel: platforms.join(" / "),
        rank: "",
        song: null,
        matchType: "error",
        error: data.error || "鎼滅储澶辫触",
        detail: data.detail || "",
      },
    ];
  }

  return data.platforms.flatMap(flattenPlatformResult);
}

async function runSearch() {
  const names = parseSongNames();
  const platforms = selectedPlatforms();
  const limit = Math.min(Math.max(Number(limitInput.value || 10), 1), MAX_RESULTS_PER_PLATFORM);

  if (names.length === 0) {
    setStatus("请输入歌曲名");
    input.focus();
    return;
  }

  if (platforms.length === 0) {
    setStatus("请选择平台");
    return;
  }

  currentRows = [];
  renderRows(currentRows);
  setBusy(true);
  setStatus(`搜索 0/${names.length}`, "is-working");

  try {
    for (let index = 0; index < names.length; index += 1) {
      const rows = await searchSong(names[index], limit, platforms);
      currentRows.push(...rows);
      renderRows(currentRows);
      setStatus(`搜索 ${index + 1}/${names.length}`, "is-working");
    }

    setStatus("已完成", "is-done");
  } finally {
    setBusy(false);
  }
}

async function refreshQqBrowserStatus() {
  try {
    const response = await fetch("/api/qq-browser/status");
    const data = await response.json();
    setBrowserStatus(data.connected ? "已连接" : "未连接", data.connected ? "is-done" : "");
  } catch {
    setBrowserStatus("未连接");
  }
}

async function startQqBrowser() {
  qqBrowserButton.disabled = true;
  setBrowserStatus("连接中...", "is-working");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch("/api/qq-browser/start", {
      method: "POST",
      signal: controller.signal,
    });
    const data = await response.json();

    if (!response.ok || !data.connected) {
      setBrowserStatus(data.error || "连接失败", "is-error");
      return;
    }

    qqBrowserModeInput.checked = true;
    setBrowserStatus("已连接", "is-done");
  } catch {
    setBrowserStatus("连接超时", "is-error");
  } finally {
    clearTimeout(timeout);
    qqBrowserButton.disabled = false;
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
    row.song?.lyricist || "",
    row.song?.composer || "",
    statText(row.song?.favoriteText, row.song?.favoriteCount, row.song?.likeCount),
    statText(row.song?.listenText, row.song?.listenCount),
    row.song?.commentCount ?? "",
    row.song?.shareCount ?? "",
    row.song?.link || "",
    row.error ? "搜索失败" : statusLabel(row.matchType),
  ]);
}

function rowsToTsv(rows) {
  return [
    ["输入关键词", "平台", "序号", "歌曲名", "歌手名", "专辑名", "词作者", "曲作者", "收藏/点赞", "在听", "评论", "转发", "链接", "状态"].join("\t"),
    ...serializeRows(rows).map((row) => row.join("\t")),
  ].join("\n");
}

function csvEscape(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

function rowsToCsv(rows) {
  return [
    ["输入关键词", "平台", "序号", "歌曲名", "歌手名", "专辑名", "词作者", "曲作者", "收藏/点赞", "在听", "评论", "转发", "链接", "状态"]
      .map(csvEscape)
      .join(","),
    ...serializeRows(rows).map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}
searchButton.addEventListener("click", runSearch);
qqBrowserButton.addEventListener("click", startQqBrowser);

selectAllButton.addEventListener("click", () => {
  const shouldCheck = platformInputs.some((item) => !item.checked);
  platformInputs.forEach((item) => {
    item.checked = shouldCheck;
  });
  selectAllButton.textContent = shouldCheck ? "取消全选" : "全选平台";
});

sampleButton.addEventListener("click", () => {
  input.value = "晴天\n后来\n起风了\n夜曲";
  setStatus("示例已填入");
});

clearButton.addEventListener("click", () => {
  input.value = "";
  currentRows = [];
  renderRows(currentRows);
  setStatus("待搜索");
  input.focus();
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(rowsToTsv(currentRows));
  setStatus("已复制", "is-done");
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob(["\ufeff", rowsToCsv(currentRows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "music-link-results.csv";
  link.click();
  URL.revokeObjectURL(url);
});

platformInputs.forEach((item) => {
  item.addEventListener("change", () => {
    selectAllButton.textContent = platformInputs.every((inputItem) => inputItem.checked)
      ? "取消全选"
      : "全选平台";
  });
});

input.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    runSearch();
  }
});

refreshQqBrowserStatus();



