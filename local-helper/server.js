import { createServer, request as httpRequest } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createCipheriv, createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const qqProfileDir = join(__dirname, ".qq-browser-profile");
const port = Number(process.env.PORT || 5178);
const qqDebugPort = Number(process.env.QQ_DEBUG_PORT || 9223);
const shouldOpenBrowser = process.env.NO_OPEN !== "1" && !process.argv.includes("--no-open");
const qishuiDeviceId = process.env.QISHUI_DEVICE_ID || "7390000000000000000";
const qishuiInstallId = process.env.QISHUI_INSTALL_ID || "7390000000000000000";
const MAX_RESULTS_PER_PLATFORM = 200;
const MAX_OFFLINE_CHECK_LINKS = 300;
const OFFLINE_CHECK_CONCURRENCY = 2;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const platformConfig = {
  netease: { label: "网易云音乐" },
  kugou: { label: "酷狗音乐" },
  qq: { label: "QQ音乐" },
  kuwo: { label: "酷我音乐" },
};

Object.assign(platformConfig, {
  netease: { label: "网易云音乐" },
  kugou: { label: "酷狗音乐" },
  qq: { label: "QQ音乐" },
  kuwo: { label: "酷我音乐" },
  qishui: { label: "汽水音乐App" },
});

let qqChromeProcess = null;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendCorsOptions(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  res.end();
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function normalizeSongName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（【「『《]/g, "(")
    .replace(/[）】」』》]/g, ")")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[·・]/g, "")
    .trim();
}

function matchType(name, query) {
  return normalizeSongName(name) === normalizeSongName(query) ? "exact" : "candidate";
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCookie(value) {
  return String(value || "")
    .replace(/[\r\n]/g, "")
    .trim()
    .slice(0, 12000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(ms = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timeout) };
}

async function fetchJson(url, options = {}) {
  const { controller, done } = withTimeout(options.timeoutMs || 12000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    const cleaned = text.trim().replace(/^[^(]+\((.*)\);?$/s, "$1");

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      if (cleaned.startsWith("{'") || cleaned.startsWith("[{'")) {
        return JSON.parse(cleaned.replaceAll("'", "\""));
      }
      throw error;
    }
  } finally {
    done();
  }
}

async function fetchText(url, options = {}) {
  const { controller, done } = withTimeout(options.timeoutMs || 12000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    done();
  }
}

function neteaseEapiParams(uri, data) {
  const json = JSON.stringify(data);
  const digest = createHash("md5")
    .update(`nobody${uri}use${json}md5forencrypt`)
    .digest("hex");
  const payload = `${uri}-36cd479b6b5-${json}-36cd479b6b5-${digest}`;
  const cipher = createCipheriv("aes-128-ecb", Buffer.from("e82ckenh8dichen8"), null);
  cipher.setAutoPadding(true);
  const params = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()])
    .toString("hex")
    .toUpperCase();
  return new URLSearchParams({ params });
}

async function fetchNeteaseEapi(uri, data = {}) {
  const header = {
    osver: "16.2",
    deviceId: "",
    os: "iPhone OS",
    appver: "9.0.90",
    versioncode: "140",
    mobilename: "",
    buildver: String(Math.floor(Date.now() / 1000)),
    resolution: "1170x2532",
    __csrf: "",
    channel: "distribution",
    requestId: `${Date.now()}_${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
  };
  const body = { ...data, header };
  const cookie = Object.entries(header)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("; ");

  return fetchJson(`https://interface.music.163.com/eapi/${uri.slice(5)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)",
      Cookie: cookie,
    },
    body: neteaseEapiParams(uri, body),
  });
}

function fetchLocalJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 2500;

  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: options.method || "GET" }, (res) => {
      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("本地调试端口连接超时"));
    });
    req.end();
  });
}

function mapResult(
  {
    platform,
    rank,
    id,
    name,
    artists,
    album,
    lyricist,
    composer,
    link,
    favoriteCount,
    favoriteText,
    listenCount,
    listenText,
    likeCount,
    commentCount,
    shareCount,
    forcedMatchType,
  },
  query,
) {
  const cleanName = cleanText(name);

  return {
    platform,
    platformLabel: platformConfig[platform]?.label || platform,
    rank,
    id,
    name: cleanName,
    artists: cleanText(artists),
    album: cleanText(album),
    lyricist: cleanText(lyricist),
    composer: cleanText(composer),
    link,
    favoriteCount: favoriteCount ?? "",
    favoriteText: favoriteText ?? "",
    listenCount: listenCount ?? "",
    listenText: listenText ?? "",
    likeCount: likeCount ?? "",
    commentCount: commentCount ?? "",
    shareCount: shareCount ?? "",
    matchType: forcedMatchType || matchType(cleanName, query),
  };
}

async function hydrateRows(rows, getStats, batchSize = 6) {
  const hydrated = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const batchRows = await Promise.all(
      batch.map(async (row) => {
        try {
          const stats = await getStats(row);
          return { ...row, ...stats };
        } catch {
          return row;
        }
      }),
    );
    hydrated.push(...batchRows);
  }
  return hydrated;
}

function extractQqSongMid(value) {
  const text = String(value || "");
  const direct = text.match(/\b[0-9A-Za-z]{14}\b/);
  if (direct) return direct[0];

  try {
    const url = new URL(text);
    const fromPath = url.pathname.match(/songDetail\/([0-9A-Za-z]+)/);
    if (fromPath) return fromPath[1];
    return url.searchParams.get("songmid") || url.searchParams.get("songMid") || "";
  } catch {
    return "";
  }
}

async function fetchQqMusicu(payload) {
  return fetchJson("https://u.y.qq.com/cgi-bin/musicu.fcg?format=json", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://i2.y.qq.com/n3/other/pages/playsong/index.html",
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    },
    body: JSON.stringify(payload),
  });
}

function parseQqListenCount(text) {
  const match = String(text || "").match(/([\d.]+)\s*(\u4e07|w|W|k|K)?\s*\u4eba?\u5728\u542c/);
  if (!match) return "";
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return "";
  const unit = match[2] || "";
  if (unit === "\u4e07" || unit.toLowerCase() === "w") return Math.round(number * 10000);
  if (unit.toLowerCase() === "k") return Math.round(number * 1000);
  return Math.round(number);
}

async function getQqTrackByMid(songMid) {
  if (!songMid) return null;
  const data = await fetchQqMusicu({
    songinfo: {
      method: "get_song_detail_yqq",
      module: "music.pf_song_detail_svr",
      param: { song_mid: songMid },
    },
  });
  const track = data.songinfo?.data?.track_info;
  if (!track?.id) return null;
  return {
    id: track.id,
    mid: track.mid || songMid,
  };
}

async function getQqStats(row) {
  const idValue = String(row.id || "");
  const songMid = /^[0-9A-Za-z]{14}$/.test(idValue) ? idValue : extractQqSongMid(row.link);
  const track = await getQqTrackByMid(songMid);
  if (!track?.id) return {};

  const data = await fetchQqMusicu({
    comm: { ct: 23, cv: 1 },
    req_comment: {
      module: "music.globalComment.CommentCountSrv",
      method: "GetCmCount",
      param: {
        request: {
          biz_type: 1,
          biz_id: String(track.id),
          biz_sub_type: 0,
        },
      },
    },
    req_listen: {
      module: "music.sharing.PlayPageSvr",
      method: "GetSongTag",
      param: { songID: track.id },
    },
    req_fav: {
      module: "music.musicasset.SongFavRead",
      method: "GetSongFansNumberByMid",
      param: { v_songMid: [track.mid] },
    },
  });

  const comment = data.req_comment?.data?.response || {};
  const listenText = data.req_listen?.data?.songTag || "";
  const favData = data.req_fav?.data || {};

  return {
    favoriteText: favData.m_show?.[track.mid] || "",
    favoriteCount: favData.m_numbers?.[track.mid] ?? "",
    listenText,
    listenCount: parseQqListenCount(listenText),
    commentCount: comment.count ?? "",
  };
}

async function getNeteaseStats(row) {
  if (!row.id) return {};
  const url = `https://music.163.com/api/v1/resource/comments/R_SO_4_${encodeURIComponent(row.id)}?limit=1&offset=0`;
  const [commentData, redData] = await Promise.all([
    fetchJson(url, {
      headers: {
        Referer: "https://music.163.com/",
      },
    }),
    fetchNeteaseEapi("/api/song/red/count", { songId: Number(row.id) }),
  ]);
  return {
    favoriteText: redData.data?.countDesc || "",
    favoriteCount: redData.data?.count ?? "",
    commentCount: commentData.total ?? "",
  };
}

async function getKugouStats(row) {
  if (!row.id) return {};
  const url = new URL("https://mcomment.kugou.com/index.php");
  url.search = new URLSearchParams({
    r: "commentsv2/getCommentWithLike",
    code: "fc4be23b4e972707f36b8a828a93ba8a",
    extdata: row.id,
    p: "1",
    pagesize: "1",
    kugouid: "0",
    clientver: "1000",
    appid: "1005",
  });
  const data = await fetchJson(url, {
    headers: {
      Referer: "https://www.kugou.com/",
    },
  });
  return {
    commentCount: data.combine_count ?? data.count ?? "",
  };
}

async function getKuwoStats(row) {
  if (!row.id) return {};
  const url = new URL("https://comment.kuwo.cn/com.s");
  url.search = new URLSearchParams({
    type: "get_comment",
    f: "web",
    page: "1",
    rows: "1",
    digest: "15",
    sid: row.id,
    uid: "0",
    prod: "newWeb",
    httpsStatus: "1",
  });
  const data = await fetchJson(url, {
    headers: {
      Referer: "https://www.kuwo.cn/",
    },
  });
  return {
    commentCount: data.total ?? data.data?.total ?? "",
  };
}

async function searchNetease(keyword, limit) {
  const body = new URLSearchParams({
    s: keyword,
    type: "1",
    limit: String(limit),
    offset: "0",
  });

  const data = await fetchJson("https://music.163.com/api/search/get/web?csrf_token=", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: "https://music.163.com/",
    },
    body,
  });

  const rows = (data.result?.songs || []).map((song, index) =>
    mapResult(
      {
        platform: "netease",
        rank: index + 1,
        id: song.id,
        name: song.name,
        artists: Array.isArray(song.artists)
          ? song.artists.map((artist) => artist.name).filter(Boolean).join(" / ")
          : "",
        album: song.album?.name || "",
        link: `https://music.163.com/#/song?id=${song.id}`,
      },
      keyword,
    ),
  );
  return hydrateRows(rows, getNeteaseStats);
}

async function searchKugou(keyword, limit) {
  const url = new URL("https://mobiles.kugou.com/api/v3/search/song");
  url.search = new URLSearchParams({
    format: "json",
    keyword,
    page: "1",
    pagesize: String(limit),
    showtype: "1",
  });

  const data = await fetchJson(url);
  const rows = (data.data?.info || []).map((song, index) => {
    const hash = song.hash || song.HASH || "";
    const albumId = song.album_id || song.album_audio_id || "";

    return mapResult(
      {
        platform: "kugou",
        rank: index + 1,
        id: hash,
        name: song.songname || song.filename || "",
        artists: song.singername || "",
        album: song.album_name || "",
        link: hash
          ? `https://www.kugou.com/song/#hash=${hash}${albumId ? `&album_id=${albumId}` : ""}`
          : `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${encodeURIComponent(keyword)}`,
      },
      keyword,
    );
  });
  return hydrateRows(rows, getKugouStats);
}

function getCookieValue(cookie, name) {
  const match = String(cookie || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function qqCommonParams(cookie) {
  const uin = getCookieValue(cookie, "uin") || getCookieValue(cookie, "o_cookie") || "0";
  const numericUin = uin.replace(/^o/, "") || "0";

  return {
    ct: 24,
    cv: 0,
    uin: numericUin,
    format: "json",
    inCharset: "utf-8",
    outCharset: "utf-8",
    notice: 0,
    platform: "yqq.json",
    needNewCode: 0,
  };
}

function qqSearchId(type = 3) {
  const typePart = BigInt(type) * 18014398509481984n;
  const randomPart = BigInt(Math.round(Math.random() * 4194304)) * 4294967296n;
  const now = new Date();
  const msOfDay = BigInt((now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds());
  return String(typePart + randomPart + msOfDay);
}

function qqSearchRequest(keyword, pageNum, pageSize, cookie = "") {
  return {
    comm: qqCommonParams(cookie),
    req_1: {
      method: "DoSearchForQQMusicDesktop",
      module: "music.search.SearchCgiService",
      param: {
        remoteplace: "yqq.yqq.yqq",
        searchid: qqSearchId(3),
        search_type: 0,
        query: keyword,
        page_num: pageNum,
        num_per_page: pageSize,
      },
    },
  };
}

function fallbackQqSearchPage(keyword, note = "") {
  return [
    mapResult(
      {
        platform: "qq",
        rank: 1,
        id: "",
        name: keyword,
        artists: note,
        album: "",
        link: `https://y.qq.com/n/ryqq_v2/search?w=${encodeURIComponent(keyword)}&t=song`,
        forcedMatchType: "search-page",
      },
      keyword,
    ),
  ];
}

async function searchQqApi(keyword, limit, options = {}) {
  const qqCookie = sanitizeCookie(options.qqCookie);
  const headers = {
    Referer: "https://y.qq.com/n/ryqq/search",
    Origin: "https://y.qq.com",
  };
  if (qqCookie) headers.Cookie = qqCookie;

  const pageSize = Math.min(Math.max(limit, 1), 10);
  const maxPages = Math.ceil(limit / pageSize);
  const songs = [];
  const seen = new Set();

  for (let pageNum = 1; pageNum <= maxPages && songs.length < limit; pageNum += 1) {
    const payload = qqSearchRequest(keyword, pageNum, pageSize, qqCookie);
    let data;
    try {
      data = await fetchJson("https://u.y.qq.com/cgi-bin/musicu.fcg?format=json", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      const url = new URL("https://u.y.qq.com/cgi-bin/musicu.fcg");
      url.search = new URLSearchParams({
        format: "json",
        data: JSON.stringify(payload),
      });
      data = await fetchJson(url, { headers });
    }
    const list = data.req_1?.data?.body?.song?.list || [];
    if (list.length === 0) break;

    for (const song of list) {
      const key = song.mid || song.songmid || song.id || `${song.name}-${song.album?.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      songs.push(song);
      if (songs.length >= limit) break;
    }
  }

  if (songs.length === 0) {
    return fallbackQqSearchPage(
      keyword,
      qqCookie
        ? "已使用 Cookie，但 QQ 接口未返回歌曲列表；建议改用 QQ 浏览器自动化模式。"
        : "QQ 音乐网页搜索现在需要登录态；请勾选 QQ 浏览器自动化并在 QQ 浏览器里登录。",
    );
  }

  const rows = songs.map((song, index) => {
    const mid = song.mid || song.songmid || "";
    return mapResult(
      {
        platform: "qq",
        rank: index + 1,
        id: mid,
        name: song.name || song.songname || "",
        artists: Array.isArray(song.singer)
          ? song.singer.map((artist) => artist.name).filter(Boolean).join(" / ")
          : "",
        album: song.album?.name || song.albumname || "",
        link: mid
          ? `https://y.qq.com/n/ryqq/songDetail/${mid}`
          : `https://y.qq.com/n/ryqq_v2/search?w=${encodeURIComponent(keyword)}`,
      },
      keyword,
    );
  });
  return hydrateRows(rows, getQqStats, 4);
}
async function searchQq(keyword, limit, options = {}) {
  if (options.qqBrowserMode) {
    try {
      const browserRows = await searchQqBrowser(keyword, limit);
      if (browserRows.length > 0) return browserRows;
      throw new Error("QQ ???????????????????? QQ ???????????????????");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error("QQ ?????????" + detail);
    }
  }

  return searchQqApi(keyword, limit, options);
}

async function searchKuwo(keyword, limit) {
  const url = new URL("http://search.kuwo.cn/r.s");
  url.search = new URLSearchParams({
    all: keyword,
    ft: "music",
    itemset: "web_2013",
    client: "kt",
    pn: "0",
    rn: String(limit),
    rformat: "json",
    encoding: "utf8",
  });

  const data = await fetchJson(url, {
    headers: {
      Referer: "https://www.kuwo.cn/",
    },
  });

  const rows = (data.abslist || []).map((song, index) => {
    const rid = String(song.MUSICRID || song.musicrid || song.id || "").replace(/\D+/g, "");
    return mapResult(
      {
        platform: "kuwo",
        rank: index + 1,
        id: rid,
        name: song.SONGNAME || song.NAME || song.name || "",
        artists: song.ARTIST || song.artist || "",
        album: song.ALBUM || song.album || "",
        link: rid
          ? `https://www.kuwo.cn/play_detail/${rid}`
          : `https://www.kuwo.cn/search/list?key=${encodeURIComponent(keyword)}`,
      },
      keyword,
    );
  });
  return hydrateRows(rows, getKuwoStats);
}

function chromeCandidates() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const home = process.env.HOME || "";

  const windowsCandidates = [
    join(programFiles, "Google\\Chrome\\Application\\chrome.exe"),
    join(programFilesX86, "Google\\Chrome\\Application\\chrome.exe"),
    join(localAppData, "Google\\Chrome\\Application\\chrome.exe"),
    join(programFiles, "Microsoft\\Edge\\Application\\msedge.exe"),
    join(programFilesX86, "Microsoft\\Edge\\Application\\msedge.exe"),
  ];

  const macCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    join(home, "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
  ];

  return process.platform === "darwin" ? macCandidates : windowsCandidates;
}

function findChrome() {
  return chromeCandidates().find((candidate) => candidate && existsSync(candidate));
}

const offlinePlatformRules = [
  {
    name: "网易云音乐",
    key: "netease",
    domains: ["music.163.com", "163cn.tv"],
    idPatterns: [/song\?id=(\d+)/i, /id=(\d+)/i, /song\/(\d+)/i],
  },
  {
    name: "QQ音乐",
    key: "qq",
    domains: ["y.qq.com", "i.y.qq.com", "c.y.qq.com", "c6.y.qq.com"],
    idPatterns: [/songDetail\/([A-Za-z0-9]+)/i, /songid=(\d+)/i, /songmid=([A-Za-z0-9]+)/i],
  },
  {
    name: "酷狗音乐",
    key: "kugou",
    domains: ["kugou.com", "kg.qq.com"],
    idPatterns: [/hash=([A-Za-z0-9]+)/i, /song\/([A-Za-z0-9]+)/i, /mixsongid=(\d+)/i],
  },
  {
    name: "酷我音乐",
    key: "kuwo",
    domains: ["kuwo.cn"],
    idPatterns: [/play_detail\/(\d+)/i, /rid=(\d+)/i, /MUSIC_(\d+)/i],
  },
  {
    name: "汽水音乐",
    key: "qishui",
    domains: ["qishui.douyin.com", "music.douyin.com", "douyin.com"],
    idPatterns: [/track_id=([A-Za-z0-9_-]+)/i, /music\/([A-Za-z0-9_-]+)/i, /s\/([A-Za-z0-9_-]+)/i],
  },
];

const offlinePagePatterns = {
  netease: [
    /暂无版权|因合作方要求.*?暂时无法播放|该歌曲暂时无法播放|歌曲已下架|资源不存在|播放按钮.*?disabled/i,
    /u-btni-play-dis|ply-dis|btn-dis/i,
  ],
  qq: [
    /您查看的歌曲已下架|歌曲已下架|该歌曲不存在|很抱歉.*?无法播放|无法播放|暂无版权/i,
    /mod_empty|feedback.*?平台/i,
  ],
  kugou: [/此音乐暂时不能播放|获取数据失败|歌曲不存在|资源不存在|暂无版权|已下架|无法播放/i],
  kuwo: [/歌曲不存在|暂无版权|版权原因|已下架|无法播放|暂时不能播放|资源不存在|播放失败/i],
  qishui: [/目前暂不支持播放该歌曲|暂不支持播放该歌曲|歌曲不存在|已下架|无法播放|资源不存在/i],
  other: [/歌曲已下架|已下架|暂时不能播放|暂不支持播放|资源不存在|无法播放|暂无版权|页面不存在|404/i],
};

const playablePagePatterns = {
  netease: [/data-res-action=["']play["']/i, /class=["'][^"']*(?:u-btni-play|btn-play|ply)[^"']*["']/i],
  qq: [/class=["'][^"']*(?:mod_song_info|song_detail__info|data__name|songlist__songname)[^"']*["']/i],
  kugou: [/class=["'][^"']*(?:audio|player|playBtn|btn_play)[^"']*["']/i, /下载这首歌|酷狗音乐/i],
  kuwo: [/class=["'][^"']*(?:player|play|song)[^"']*["']/i, /立即播放|酷我音乐/i],
  qishui: [/进入汽水音乐|class=["'][^"']*(?:player|music-player|play)[^"']*["']/i],
  other: [/播放|评论|收藏|歌手|专辑/i],
};

function normalizeOfflineLinks(input) {
  const seen = new Set();
  const links = [];
  const values = Array.isArray(input) ? input : String(input || "").split(/\r?\n/);

  for (const item of values) {
    const text = String(item || "").trim();
    const match = text.match(/https?:\/\/[^\s"'<>，。；、]+/i);
    if (!match) continue;
    const value = match[0];
    if (seen.has(value)) continue;
    seen.add(value);
    links.push(value);
  }

  return links;
}

function detectOfflinePlatform(url) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { name: "链接格式异常", key: "other", id: "" };
  }

  const rule = offlinePlatformRules.find((item) =>
    item.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
  );
  if (!rule) return { name: "其他平台", key: "other", id: "" };

  const decoded = decodeURIComponent(url);
  let id = "";
  for (const pattern of rule.idPatterns) {
    const matched = decoded.match(pattern);
    if (matched?.[1]) {
      id = matched[1];
      break;
    }
  }

  return { name: rule.name, key: rule.key, id };
}

async function checkNeteaseOfflineApi(songId) {
  try {
    const data = await fetchJson(
      `https://music.163.com/api/song/enhance/player/url?id=${encodeURIComponent(songId)}&ids=%5B${encodeURIComponent(songId)}%5D&br=128000`,
      {
        timeoutMs: 9000,
        headers: { Referer: "https://music.163.com/" },
      },
    );
    const item = Array.isArray(data.data) ? data.data[0] : null;
    if (!item) return { status: "已下架", evidence: "网易云接口未返回播放数据" };
    if (item.url) return { status: "可播放", evidence: "网易云播放接口返回了可用播放地址" };
    if (item.code && Number(item.code) !== 200) {
      return { status: "已下架", evidence: `网易云播放接口返回不可播 code=${item.code}` };
    }
    if (item.freeTrialInfo) return { status: "可播放", evidence: "网易云接口返回试听信息，歌曲未下架但可能受版权限制" };
    return { status: "已下架", evidence: "网易云播放接口返回空播放地址" };
  } catch {
    return null;
  }
}

async function checkKuwoOfflineApi(songId) {
  try {
    const url = new URL("https://www.kuwo.cn/api/v1/www/music/playUrl");
    url.search = new URLSearchParams({
      mid: songId,
      type: "music",
      httpsStatus: "1",
      reqId: randomUUID(),
    });
    const data = await fetchJson(url.toString(), {
      timeoutMs: 9000,
      headers: { Referer: `https://www.kuwo.cn/play_detail/${songId}` },
    });
    if (data.data?.url || data.url) return { status: "可播放", evidence: "酷我播放接口返回了可用播放地址" };
    if (String(data.code || "") && String(data.code) !== "200") {
      return { status: "已下架", evidence: `酷我播放接口返回异常 code=${data.code}` };
    }
    return null;
  } catch {
    return null;
  }
}

async function checkOfflineByPlatformApi(detected) {
  if (!detected.id) return null;
  if (detected.key === "netease") return checkNeteaseOfflineApi(detected.id);
  if (detected.key === "kuwo") return checkKuwoOfflineApi(detected.id);
  return null;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const selectedPort = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(selectedPort));
    });
    probe.on("error", reject);
  });
}

async function waitForChromeDebugPort(debugPort) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      await fetchLocalJson(`http://127.0.0.1:${debugPort}/json/version`, { timeoutMs: 1200 });
      return;
    } catch {
      await sleep(150);
    }
  }
  throw new Error("无头 Chrome 启动超时");
}

function normalizeOfflineUrlForChrome(url, platformKey) {
  if (platformKey === "netease" && url.includes("music.163.com/#/")) {
    return url.replace("music.163.com/#/", "music.163.com/");
  }
  return url;
}

async function dumpOfflineDom(url, platformKey) {
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error("未找到 Chrome 或 Edge，请先安装 Chrome 或 Edge 后重试。");
  }

  const debugPort = await getFreePort();
  const tempProfile = await mkdtemp(join(tmpdir(), "music-offline-chrome-"));
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--mute-audio",
    "--window-size=1365,900",
    `--user-data-dir=${tempProfile}`,
    `--remote-debugging-port=${debugPort}`,
    "--lang=zh-CN",
    "about:blank",
  ];

  const browser = spawn(chromePath, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  browser.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForChromeDebugPort(debugPort);
    const targets = await fetchLocalJson(`http://127.0.0.1:${debugPort}/json/list`, { timeoutMs: 2500 });
    const pageTarget = targets.find((target) => target.type === "page") || targets[0];
    if (!pageTarget?.webSocketDebuggerUrl) throw new Error("无法连接无头 Chrome 页面");

    const client = await connectCdp(pageTarget.webSocketDebuggerUrl);
    try {
      await client.send("Page.enable");
      await client.send("Runtime.enable");
      await client.send("Page.navigate", { url: normalizeOfflineUrlForChrome(url, platformKey) });
      await sleep(platformKey === "qishui" ? 6500 : 4500);
      const result = await client.send("Runtime.evaluate", {
        expression: "document.documentElement ? document.documentElement.outerHTML : ''",
        returnByValue: true,
      });
      return typeof result.result?.value === "string" ? result.result.value : "";
    } finally {
      client.close();
    }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : cleanBrowserError(stderr) || "页面检测失败");
  } finally {
    browser.kill();
    rm(tempProfile, { recursive: true, force: true }).catch(() => {});
  }
}

function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function clipEvidence(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

function judgeOfflineStatus(platformKey, html, text) {
  const source = `${html}\n${text}`.slice(0, 4_000_000);
  const offline = [...(offlinePagePatterns[platformKey] || []), ...offlinePagePatterns.other];
  for (const pattern of offline) {
    const matched = source.match(pattern);
    if (matched) return { status: "已下架", evidence: `命中下架特征：${clipEvidence(matched[0])}` };
  }

  const playable = [...(playablePagePatterns[platformKey] || []), ...playablePagePatterns.other];
  for (const pattern of playable) {
    const matched = source.match(pattern);
    if (matched) return { status: "可播放", evidence: `未命中下架提示，命中可播放页面特征：${clipEvidence(matched[0])}` };
  }

  if (/访问过于频繁|验证码|安全验证|登录|not found|404/i.test(text)) {
    return { status: "不确定", evidence: `页面可能被拦截或需要登录：${clipEvidence(text)}` };
  }

  return { status: "不确定", evidence: "未命中明确下架提示，也未发现足够的可播放特征" };
}

function cleanBrowserError(stderr) {
  return String(stderr || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.includes("DevTools listening"))
    .slice(-2)
    .join(" ");
}

async function checkOfflineOne(url) {
  const started = Date.now();
  const detected = detectOfflinePlatform(url);
  try {
    const apiVerdict = await checkOfflineByPlatformApi(detected);
    if (apiVerdict) {
      return {
        url,
        platform: detected.name,
        platformKey: detected.key,
        songId: detected.id,
        status: apiVerdict.status,
        evidence: apiVerdict.evidence,
        elapsedMs: Date.now() - started,
      };
    }

    const html = await dumpOfflineDom(url, detected.key);
    const text = htmlToPlainText(html);
    const verdict = judgeOfflineStatus(detected.key, html, text);
    return {
      url,
      platform: detected.name,
      platformKey: detected.key,
      songId: detected.id,
      status: verdict.status,
      evidence: verdict.evidence,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      url,
      platform: detected.name,
      platformKey: detected.key,
      songId: detected.id,
      status: "检测失败",
      evidence: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
    };
  }
}

async function checkOfflineMany(links) {
  const results = new Array(links.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(OFFLINE_CHECK_CONCURRENCY, links.length) }, async () => {
    while (next < links.length) {
      const index = next;
      next += 1;
      results[index] = await checkOfflineOne(links[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function qqBrowserStatus() {
  try {
    const data = await fetchLocalJson(`http://127.0.0.1:${qqDebugPort}/json/version`, {
      timeoutMs: 2500,
    });
    return {
      connected: true,
      browser: data.Browser || "",
      debugPort: qqDebugPort,
    };
  } catch {
    return {
      connected: false,
      browser: "",
      debugPort: qqDebugPort,
    };
  }
}

async function startQqBrowser() {
  const status = await qqBrowserStatus();
  if (status.connected) return { ...status, started: false };

  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error("没有找到 Chrome 或 Edge，请先安装 Chrome。");
  }

  await mkdir(qqProfileDir, { recursive: true });

  qqChromeProcess = spawn(
    chromePath,
    [
      `--remote-debugging-port=${qqDebugPort}`,
      `--user-data-dir=${qqProfileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "https://y.qq.com/n/ryqq_v2/search",
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: process.platform === "win32" ? false : undefined,
    },
  );
  qqChromeProcess.unref();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(500);
    const nextStatus = await qqBrowserStatus();
    if (nextStatus.connected) return { ...nextStatus, started: true };
  }

  throw new Error("Chrome 已启动，但调试端口暂时连不上。");
}

async function getQqPageTarget() {
  const targets = await fetchLocalJson(`http://127.0.0.1:${qqDebugPort}/json`, {
    timeoutMs: 2500,
  });
  const pages = targets.filter((target) => target.type === "page");
  const qqPage = pages.find((target) => String(target.url || "").includes("y.qq.com"));
  return qqPage || pages[0];
}

async function createQqPageTarget(url) {
  try {
    return await fetchLocalJson(
      `http://127.0.0.1:${qqDebugPort}/json/new?${encodeURIComponent(url)}`,
      { method: "PUT", timeoutMs: 2500 },
    );
  } catch {
    return getQqPageTarget();
  }
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();

    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          id += 1;
          const currentId = id;
          ws.send(JSON.stringify({ id: currentId, method, params }));
          return new Promise((innerResolve, innerReject) => {
            pending.set(currentId, { resolve: innerResolve, reject: innerReject });
          });
        },
        close() {
          ws.close();
        },
      });
    });

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;

      const callbacks = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callbacks.reject(new Error(message.error.message));
      else callbacks.resolve(message.result);
    });

    ws.addEventListener("error", () => reject(new Error("无法连接 QQ 浏览器调试端口")));
  });
}

async function waitForQqResults(client) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = await client.send("Runtime.evaluate", {
      expression:
        "document.querySelectorAll('a[href*=\"/songDetail/\"]').length",
      returnByValue: true,
    });
    if (Number(result.result?.value || 0) > 0) return;
    await sleep(500);
  }
}

function qqExtractExpression(limit) {
  return `(() => {
    const limit = ${Number(limit)};
    const seen = new Set();
    const results = [];
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const climb = (node) => {
      let current = node;
      for (let i = 0; current && i < 8; i += 1) {
        const text = clean(current.innerText);
        if (text && text.length > 8) return current;
        current = current.parentElement;
      }
      return node.parentElement || node;
    };

    for (const anchor of document.querySelectorAll('a[href*="/songDetail/"]')) {
      const href = anchor.href;
      if (!href || seen.has(href)) continue;
      const name = clean(anchor.getAttribute('title') || anchor.textContent);
      if (!name) continue;

      seen.add(href);
      const row = anchor.closest('li, tr, [class*="song"], [class*="list"]') || climb(anchor);
      const singers = Array.from(row.querySelectorAll('a[href*="/singer/"]'))
        .map((item) => clean(item.getAttribute('title') || item.textContent))
        .filter(Boolean);
      const album = Array.from(row.querySelectorAll('a[href*="/album"]'))
        .map((item) => clean(item.getAttribute('title') || item.textContent))
        .find(Boolean) || '';

      results.push({
        name,
        artists: Array.from(new Set(singers)).join(' / '),
        album,
        link: href.split('?')[0],
      });

      if (results.length >= limit) break;
    }

    return results;
  })()`;
}

function qqBrowserApiExpression(keyword, limit) {
  return `(() => {
    const keyword = ${JSON.stringify(keyword)};
    const limit = ${Number(limit)};
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const makeSearchId = () => {
      const typePart = 3n * 18014398509481984n;
      const randomPart = BigInt(Math.round(Math.random() * 4194304)) * 4294967296n;
      const now = new Date();
      const msOfDay = BigInt((now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds());
      return String(typePart + randomPart + msOfDay);
    };
    const getWebpackRequire = () => {
      if (window.__qqMusicWebpackRequire) return window.__qqMusicWebpackRequire;
      if (!window.webpackJsonp || typeof window.webpackJsonp.push !== 'function') return null;
      const captureId = Math.floor(Math.random() * 1000000000);
      window.webpackJsonp.push([
        [captureId],
        {
          [captureId]: (module, exports, require) => {
            window.__qqMusicWebpackRequire = require;
          },
        },
        [[captureId]],
      ]);
      return window.__qqMusicWebpackRequire || null;
    };
    const normalizeSong = (song) => {
      const mid = song.mid || song.songmid || song.songMID || '';
      const singers = Array.isArray(song.singer)
        ? song.singer
        : Array.isArray(song.singer_list)
          ? song.singer_list
          : Array.isArray(song.vec_singer)
            ? song.vec_singer
            : [];
      return {
        id: mid,
        name: clean(song.name || song.songname || song.title),
        artists: singers.map((artist) => clean(artist.name || artist.singerName || artist.title)).filter(Boolean).join(' / '),
        album: clean(song.album?.name || song.albumname || song.albumName || song.album?.title),
        link: mid ? 'https://y.qq.com/n/ryqq/songDetail/' + mid : '',
      };
    };
    const fetchPage = async (pageNum, pageSize) => {
      const payload = {
        comm: {
          ct: 24,
          cv: 0,
          uin: '0',
          format: 'json',
          inCharset: 'utf-8',
          outCharset: 'utf-8',
          notice: 0,
          platform: 'yqq.json',
          needNewCode: 0,
        },
        req_1: {
          method: 'DoSearchForQQMusicDesktop',
          module: 'music.search.SearchCgiService',
          param: {
            remoteplace: 'yqq.yqq.yqq',
            searchid: makeSearchId(),
            search_type: 0,
            query: keyword,
            page_num: pageNum,
            num_per_page: pageSize,
          },
        },
      };
      const url = new URL('https://u.y.qq.com/cgi-bin/musicu.fcg');
      url.search = new URLSearchParams({ format: 'json', data: JSON.stringify(payload) });
      const response = await fetch(url.toString(), {
        credentials: 'include',
        headers: { accept: 'application/json,text/plain,*/*' },
      });
      if (!response.ok) throw new Error('QQ API HTTP ' + response.status);
      const data = await response.json();
      return data?.req_1?.data?.body?.song?.list || [];
    };
    const searchPage = async (pageNum, pageSize) => {
      const require = getWebpackRequire();
      const searchModule = require ? require(466) : null;
      if (searchModule?.a) {
        const result = await searchModule.a({
          remoteplace: 'yqq.yqq.yqq',
          searchid: makeSearchId(),
          search_type: 0,
          query: keyword,
          page_num: pageNum,
          num_per_page: pageSize,
        });
        const list = result?.data?.song || [];
        if (Array.isArray(list) && list.length) return list;
      }
      return fetchPage(pageNum, pageSize);
    };

    return (async () => {
      const pageSize = Math.min(Math.max(limit, 1), 10);
      const maxPages = Math.ceil(limit / pageSize);
      const rows = [];
      const seen = new Set();
      for (let pageNum = 1; pageNum <= maxPages && rows.length < limit; pageNum += 1) {
        const list = await searchPage(pageNum, pageSize);
        if (!list.length) break;
        for (const song of list) {
          const row = normalizeSong(song);
          if (!row.name) continue;
          const key = row.id || row.link || row.name + '-' + row.artists + '-' + row.album;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push(row);
          if (rows.length >= limit) break;
        }
      }
      return { rows };
    })().catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  })()`;
}

async function searchQqBrowser(keyword, limit) {
  const status = await qqBrowserStatus();
  if (!status.connected) {
    throw new Error("???????/?? QQ ??????????????? QQ ???");
  }

  const searchUrl = "https://y.qq.com/n/ryqq_v2/search?w=" + encodeURIComponent(keyword) + "&t=song";
  let target = await getQqPageTarget();
  if (!target?.webSocketDebuggerUrl) target = await createQqPageTarget(searchUrl);
  if (!target?.webSocketDebuggerUrl) throw new Error("???????? QQ ?????");

  const client = await connectCdp(target.webSocketDebuggerUrl);

  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.navigate", { url: searchUrl });
    await sleep(1800);

    const apiEvaluation = await client.send("Runtime.evaluate", {
      expression: qqBrowserApiExpression(keyword, limit),
      returnByValue: true,
      awaitPromise: true,
    });
    const apiValue = apiEvaluation.result?.value || {};
    const apiRows = Array.isArray(apiValue.rows) ? apiValue.rows : [];
    if (apiRows.length > 0) {
      const mappedRows = apiRows.map((song, index) =>
        mapResult(
          {
            platform: "qq",
            rank: index + 1,
            id: song.id || "",
            name: song.name,
            artists: song.artists,
            album: song.album,
            link: song.link || searchUrl,
          },
          keyword,
        ),
      );
      return hydrateRows(mappedRows, getQqStats, 4);
    }

    await waitForQqResults(client);

    const rows = [];
    const seen = new Set();
    let stableRounds = 0;
    const maxScrollAttempts = Math.max(12, Math.ceil(limit / 10) + 6);

    for (let attempt = 0; attempt < maxScrollAttempts && rows.length < limit; attempt += 1) {
      const evaluation = await client.send("Runtime.evaluate", {
        expression: qqExtractExpression(limit),
        returnByValue: true,
        awaitPromise: true,
      });
      const currentRows = evaluation.result?.value || [];
      const before = rows.length;

      for (const row of currentRows) {
        const key = row.link || row.name + "-" + row.artists + "-" + row.album;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
        if (rows.length >= limit) break;
      }

      stableRounds = rows.length === before ? stableRounds + 1 : 0;
      if (rows.length >= limit) break;

      await client.send("Runtime.evaluate", {
        expression:
          "(() => {" +
          "const scroller = document.scrollingElement || document.documentElement || document.body;" +
          "scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });" +
          "window.dispatchEvent(new Event('scroll'));" +
          "if (" + stableRounds + " >= 2) {" +
          "const next = Array.from(document.querySelectorAll('a,button,[role=\\\"button\\\"]')).find((item) => {" +
          "const text = [item.textContent, item.getAttribute('aria-label'), item.title, item.className].map((value) => String(value || '')).join(' ');" +
          "return /???|??|Next|?|>|page.*next|next.*page/i.test(text);" +
          "});" +
          "if (next && !next.disabled) next.click();" +
          "}" +
          "return scroller.scrollTop;" +
          "})()",
        returnByValue: true,
      });
      await sleep(stableRounds >= 2 ? 1600 : 900);
    }

    if (rows.length === 0) {
      const diagnostic = await client.send("Runtime.evaluate", {
        expression: `(() => {
          const text = String(document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
          const isLoginVisible = /登录/.test(text);
          const clientWall = /查看更多内容|下载客户端|立即下载/.test(text);
          if (isLoginVisible && clientWall) return 'QQ 音乐网页未登录，且当前搜索页要求登录或下载客户端后查看更多内容。请在“打开/连接 QQ 浏览器”窗口里登录 QQ 音乐后重试。';
          if (isLoginVisible) return 'QQ 音乐网页未登录。请在“打开/连接 QQ 浏览器”窗口里登录 QQ 音乐后重试。';
          if (clientWall) return 'QQ 音乐网页当前要求下载客户端查看更多内容，网页端没有渲染歌曲列表。';
          return 'QQ 浏览器窗口没有渲染歌曲列表，可能是 QQ 音乐网页限制或页面尚未加载完成。';
        })()`,
        returnByValue: true,
      });
      throw new Error(diagnostic.result?.value || "QQ 浏览器窗口没有渲染歌曲列表。");
    }

    const mappedRows = rows.map((song, index) =>
      mapResult(
        {
          platform: "qq",
          rank: index + 1,
          id: "",
          name: song.name,
          artists: song.artists,
          album: song.album,
          link: song.link,
        },
        keyword,
      ),
    );
    return hydrateRows(mappedRows, getQqStats, 4);
  } finally {
    client.close();
  }
}

function runQishuiHelper(keyword, limit) {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("汽水音乐App模式目前只支持 Windows。"));
      return;
    }

    if (!existsSync(qishuiHelperPath)) {
      reject(new Error("缺少 QishuiSodaHelper.exe，请先编译或重新解压完整工具。"));
      return;
    }

    const child = spawn(qishuiHelperPath, ["--keyword", keyword, "--limit", String(limit)], {
      cwd: __dirname,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("汽水音乐App查询超时，请确认汽水音乐已打开且没有被弹窗遮挡。"));
    }, 45000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `汽水 helper 退出码 ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout || "[]"));
      } catch {
        reject(new Error("汽水 helper 返回内容不是有效 JSON。"));
      }
    });
  });
}

async function searchQishui(keyword, limit) {
  const rows = await runQishuiHelper(keyword, Math.min(limit, MAX_RESULTS_PER_PLATFORM));
  return rows.map((song, index) =>
    mapResult(
      {
        platform: "qishui",
        rank: index + 1,
        id: "",
        name: song.name || "",
        artists: song.artists || "",
        album: song.album || "",
        lyricist: song.lyricist || "",
        composer: song.composer || "",
        link: song.link || "",
        forcedMatchType: song.link ? undefined : "candidate",
      },
      keyword,
    ),
  );
}

function qishuiCommonParams(options = {}) {
  const auto = options.qishuiAuto || {};
  const deviceId = sanitizeCookie(options.qishuiDeviceId) || auto.did || qishuiDeviceId;
  const installId = sanitizeCookie(options.qishuiInstallId) || auto.iid || qishuiInstallId;

  return {
    aid: "386088",
    app_name: "luna_pc",
    region: "cn",
    geo_region: "cn",
    os_region: "cn",
    sim_region: "",
    device_id: deviceId,
    cdid: "",
    iid: installId,
    version_name: "3.5.1",
    version_code: "3050100",
    channel: "official",
    build_mode: "official",
    network_carrier: "",
    ac: "wifi",
    tz_name: "Asia/Shanghai",
    resolution: "",
    device_platform: "windows",
    device_type: "Windows",
    os_version: "Windows",
    fp: deviceId,
  };
}

function qishuiHeaders(options = {}) {
  const cookie = sanitizeCookie(options.qishuiCookie) || options.qishuiAuto?.cookie || "";
  const headers = {
    "User-Agent": "LunaPC/3.5.1",
    "x-luna-background-type": "background",
    "x-luna-is-background-req": "1",
    "x-luna-is-local-user": cookie ? "1" : "0",
  };
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function readQishuiDevice() {
  try {
    const devicePath = join(process.env.APPDATA || "", "SodaMusic", "DeviceV1");
    if (!existsSync(devicePath)) return {};
    const data = JSON.parse(gunzipSync(readFileSync(devicePath)).toString("utf8"));
    return {
      did: String(data.did || ""),
      iid: String(data.iid || ""),
      cdid: String(data.cdid || ""),
    };
  } catch {
    return {};
  }
}

async function readQishuiCookie() {
  try {
    const cookiePath = join(process.env.APPDATA || "", "SodaMusic", "Network", "Cookies");
    if (!existsSync(cookiePath)) return "";
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(cookiePath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          "select host_key, name, value from cookies where host_key like '%qishui.com' or host_key like '%bytedance.com' order by host_key, name",
        )
        .all();
      return rows
        .filter((row) => row.name && row.value)
        .map((row) => `${row.name}=${row.value}`)
        .join("; ");
    } finally {
      db.close();
    }
  } catch {
    return "";
  }
}

async function getQishuiAutoOptions() {
  const device = readQishuiDevice();
  const cookie = await readQishuiCookie();
  return { ...device, cookie };
}

async function fetchQishuiApi(path, query, options = {}) {
  const url = new URL(`https://api.qishui.com${path}`);
  url.search = new URLSearchParams({
    ...qishuiCommonParams(options),
    ...query,
  });

  return fetchJson(url, {
    headers: qishuiHeaders(options),
    timeoutMs: 15000,
  });
}

function qishuiArtists(song) {
  const artists = song.artists || song.artist_list || song.singers || [];
  if (Array.isArray(artists)) {
    return artists
      .map((artist) => artist.name || artist.artist_name || artist.display_name || "")
      .filter(Boolean)
      .join(" / ");
  }
  return song.artist_name || song.artist || "";
}

function qishuiAlbum(song) {
  return song.album?.name || song.album?.album_name || song.album_name || "";
}

function qishuiStatValue(stats, ...keys) {
  for (const key of keys) {
    const value = stats?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function qishuiSongStats(song) {
  const stats = song.stats || song.stat || song.count_info || song.counts || {};
  return {
    likeCount: qishuiStatValue(stats, "count_collected", "collected_count", "collect_count", "like_count"),
    commentCount: qishuiStatValue(stats, "count_comment", "comment_count"),
    shareCount: qishuiStatValue(stats, "count_shared", "share_count"),
  };
}

function qishuiMergeStats(apiStats, shareStats) {
  return {
    likeCount: shareStats.likeCount !== "" ? shareStats.likeCount : (apiStats.likeCount ?? ""),
    commentCount: shareStats.commentCount !== "" ? shareStats.commentCount : (apiStats.commentCount ?? ""),
    shareCount: shareStats.shareCount !== "" ? shareStats.shareCount : (apiStats.shareCount ?? ""),
  };
}

function qishuiSongFromItem(item) {
  return (
    item.entity?.track ||
    item.track ||
    item.media ||
    item.item ||
    item.data ||
    item.song ||
    item.playable ||
    item
  );
}

function qishuiCandidateScore(song, keyword) {
  const query = normalizeSongName(keyword);
  const name = normalizeSongName(song.name || song.title || "");
  const artists = normalizeSongName(qishuiArtists(song));
  const album = normalizeSongName(qishuiAlbum(song));
  let score = 0;

  if (name && query === name) score += 100;
  else if (name && query.includes(name)) score += 70;
  else if (name && name.includes(query)) score += 40;

  if (artists && query.includes(artists)) score += 45;
  for (const artist of artists.split("/").filter(Boolean)) {
    if (artist && query.includes(artist)) score += 30;
  }

  if (album && query.includes(album)) score += 10;
  return score;
}

function qishuiResultItems(data) {
  const groups = data.result_groups || data.resultGroups || [];
  const items = [];

  for (const group of groups) {
    const groupItems =
      group.data ||
      group.result_items ||
      group.items ||
      group.search_result_items ||
      group.tracks ||
      [];
    if (Array.isArray(groupItems)) items.push(...groupItems);
  }

  return items;
}

function parseQishuiStatsFromText(text) {
  const picked = {};
  const patterns = {
    likeCount: /"count_collected"\s*:\s*(\d+)/,
    commentCount: /"count_comment"\s*:\s*(\d+)/,
    shareCount: /"count_shared"\s*:\s*(\d+)/,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = String(text || "").match(pattern);
    if (match) picked[key] = Number(match[1]);
  }

  return picked;
}

function parseQishuiStatsObject(statsText) {
  const stats = parseQishuiStatsFromText(`{${statsText || ""}}`);
  return {
    likeCount: stats.likeCount ?? 0,
    commentCount: stats.commentCount ?? 0,
    shareCount: stats.shareCount ?? 0,
  };
}

function parseQishuiScopedStats(text, itemId) {
  const id = String(itemId || "");
  if (!id) return null;

  const markers = [`"trackInfo":{"id":"${id}"`, `"track":{"id":"${id}"`];
  for (const marker of markers) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex < 0) continue;

    const scopedText = text.slice(markerIndex, markerIndex + 90000);
    const statsMatch = scopedText.match(/"stats"\s*:\s*\{([^}]*)\}/);
    if (statsMatch) return parseQishuiStatsObject(statsMatch[1]);
    return {
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
    };
  }

  return null;
}

function parseQishuiShareStats(html, itemId) {
  const text = String(html || "");
  const scopedStats = parseQishuiScopedStats(text, itemId);
  if (scopedStats) return scopedStats;

  return parseQishuiStatsFromText(text);
}

async function getQishuiSharePageStats(url, itemId) {
  if (!url) return {};
  try {
    const html = await fetchText(url, { timeoutMs: 15000 });
    return parseQishuiShareStats(html, itemId);
  } catch {
    return {};
  }
}

async function getQishuiShareData(song, options) {
  const itemId = String(song.id || song.track_id || song.media_id || "");
  const itemType = String(song.media_type || song.item_type || "track");
  if (!itemId) return { link: "", likeCount: "", commentCount: "", shareCount: "" };

  try {
    const data = await fetchQishuiApi(
      "/luna/pc/share_info",
      {
        item_type: itemType,
        item_id: itemId,
        extra: "",
        scene: "",
      },
      options,
    );
    const descLink = String(data.share_info?.share_link_desc || "").match(/https?:\/\/\S+/)?.[0] || "";
    const displayLink =
      data.share_info?.short_share_link ||
      descLink ||
      data.share_info?.share_link ||
      data.share_info?.link ||
      "";
    const statsLink = data.share_info?.share_link || descLink || displayLink;
    const stats = await getQishuiSharePageStats(statsLink, itemId);

    return {
      link: displayLink,
      likeCount: stats.likeCount ?? "",
      commentCount: stats.commentCount ?? "",
      shareCount: stats.shareCount ?? "",
    };
  } catch {
    return { link: "", likeCount: "", commentCount: "", shareCount: "" };
  }
}

function qishuiSearchPageMeta(data) {
  const groups = data.result_groups || data.resultGroups || [];
  const trackGroup = groups.find((group) => group.id === "tracks") || groups[0] || {};
  return {
    nextCursor: String(trackGroup.next_cursor ?? trackGroup.cursor ?? ""),
    hasMore: Boolean(trackGroup.has_more),
  };
}

async function searchQishuiHttp(keyword, limit, options = {}) {
  const searchId = randomUUID();
  const rows = [];
  const seen = new Set();
  let cursor = "0";
  let lastData = null;
  const maxPages = Math.max(1, Math.ceil(limit / 20) + 2);

  for (let page = 0; page < maxPages && rows.length < limit; page += 1) {
    const data = await fetchQishuiApi(
      "/luna/pc/search/track",
      {
        q: keyword,
        cursor,
        search_id: searchId,
        search_method: "input",
        debug_params: "",
        from_search_id: "",
        search_scene: "",
      },
      options,
    );
    lastData = data;

    const pageRows = qishuiResultItems(data)
      .map(qishuiSongFromItem)
      .filter((song) => song && (song.name || song.title || song.id || song.track_id));

    for (const song of pageRows) {
      const key = song.id || song.track_id || song.media_id || `${song.name}-${qishuiArtists(song)}-${qishuiAlbum(song)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(song);
      if (rows.length >= limit) break;
    }

    const meta = qishuiSearchPageMeta(data);
    if (!meta.hasMore || !meta.nextCursor || meta.nextCursor === cursor) break;
    cursor = meta.nextCursor;
  }

  if (rows.length === 0 && lastData?.status_code && lastData.status_code !== 0) {
    throw new Error(lastData.status_info?.status_msg || `?????? ${lastData.status_code}`);
  }

  const withLinks = [];
  const batchSize = 5;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const hydrated = await Promise.all(
      batch.map(async (song) => {
        const shareData = await getQishuiShareData(song, options);
        const directStats = qishuiSongStats(song);
        const mergedStats = qishuiMergeStats(directStats, shareData);
        return {
          ...song,
          qishuiLink: shareData.link,
          qishuiLikeCount: mergedStats.likeCount,
          qishuiCommentCount: mergedStats.commentCount,
          qishuiShareCount: mergedStats.shareCount,
          qishuiScore: qishuiCandidateScore(song, keyword),
        };
      }),
    );
    withLinks.push(...hydrated);
  }

  const sortedRows = withLinks
    .map((song, index) => ({ ...song, qishuiOriginalIndex: index }))
    .sort(
      (left, right) =>
        (right.qishuiScore || 0) - (left.qishuiScore || 0) ||
        left.qishuiOriginalIndex - right.qishuiOriginalIndex,
    );

  return sortedRows.map((song, index) =>
    mapResult(
      {
        platform: "qishui",
        rank: index + 1,
        id: song.id || song.track_id || song.media_id || "",
        name: song.name || song.title || "",
        artists: qishuiArtists(song),
        album: qishuiAlbum(song),
        lyricist: song.lyricist || song.lyric_writer || song.author || "",
        composer: song.composer || song.compose || song.music_writer || "",
        link: song.qishuiLink || "",
        likeCount: song.qishuiLikeCount,
        commentCount: song.qishuiCommentCount,
        shareCount: song.qishuiShareCount,
        forcedMatchType: song.qishuiLink ? undefined : "candidate",
      },
      keyword,
    ),
  );
}
const searchers = {
  netease: searchNetease,
  kugou: searchKugou,
  qq: searchQq,
  kuwo: searchKuwo,
  qishui: searchQishuiHttp,
};

async function searchPlatform(platform, keyword, limit, options) {
  try {
    const candidates = await searchers[platform](keyword, limit, options);
    return {
      platform,
      platformLabel: platformConfig[platform].label,
      query: keyword,
      count: candidates.length,
      candidates,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const friendlyDetail =
      platform === "qishui" && detail.includes("HTTP 403")
        ? "汽水接口拒绝了直连请求。请在高级项填写汽水 Cookie/device_id/iid；如果仍失败，需要改用汽水客户端内部协议连接模式，不会使用鼠标控制。"
        : detail;
    return {
      platform,
      platformLabel: platformConfig[platform].label,
      query: keyword,
      count: 0,
      candidates: [],
      error: "搜索失败",
      detail: friendlyDetail,
    };
  }
}

async function handleApiSearch(req, res, url) {
  const body = req.method === "POST" ? await readJsonBody(req) : {};
  const q = String(body.q ?? url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    Math.max(Number(body.limit ?? url.searchParams.get("limit") ?? 10), 1),
    MAX_RESULTS_PER_PLATFORM,
  );
  const rawPlatforms = Array.isArray(body.platforms)
    ? body.platforms.join(",")
    : String(body.platforms ?? url.searchParams.get("platforms") ?? "netease");
  const platforms = rawPlatforms
    .split(",")
    .map((platform) => platform.trim())
    .filter((platform) => searchers[platform]);
  const options = {
    qqCookie: sanitizeCookie(body.qqCookie),
    qqBrowserMode: Boolean(body.qqBrowserMode),
    qishuiCookie: sanitizeCookie(body.qishuiCookie),
    qishuiDeviceId: sanitizeCookie(body.qishuiDeviceId),
    qishuiInstallId: sanitizeCookie(body.qishuiInstallId),
    qishuiAuto: await getQishuiAutoOptions(),
  };

  if (!q) {
    sendJson(res, 400, { error: "请输入歌曲名" });
    return;
  }

  if (platforms.length === 0) {
    sendJson(res, 400, { error: "请至少选择一个音乐平台" });
    return;
  }

  const results = await Promise.all(
    platforms.map((platform) => searchPlatform(platform, q, limit, options)),
  );

  sendJson(res, 200, {
    query: q,
    requestId: randomUUID(),
    platforms: results,
  });
}

async function handleOfflineCheck(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readJsonBody(req);
  const links = normalizeOfflineLinks(body.links || body.text || []).slice(0, MAX_OFFLINE_CHECK_LINKS);

  if (links.length === 0) {
    sendJson(res, 400, { error: "请至少输入一个歌曲链接" });
    return;
  }

  const results = await checkOfflineMany(links);
  sendJson(res, 200, {
    requestId: randomUUID(),
    count: results.length,
    results,
  });
}

async function handleQqBrowserStart(_req, res) {
  try {
    sendJson(res, 200, await startQqBrowser());
  } catch (error) {
    sendJson(res, 500, {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleQqBrowserStatus(_req, res) {
  sendJson(res, 200, await qqBrowserStatus());
}

async function handleQishuiStatus(_req, res) {
  const auto = await getQishuiAutoOptions();
  sendJson(res, 200, {
    hasDevice: Boolean(auto.did && auto.iid),
    hasCookie: Boolean(auto.cookie),
    didLength: String(auto.did || "").length,
    iidLength: String(auto.iid || "").length,
    cookieLength: String(auto.cookie || "").length,
  });
}

async function handleLocalStatus(_req, res) {
  const qq = await qqBrowserStatus();
  const qishui = await getQishuiAutoOptions();
  sendJson(res, 200, {
    ok: true,
    name: "歌曲链接回填本地助手",
    version: "cloud-hybrid-1",
    platforms: {
      qq: {
        available: true,
        browserConnected: qq.connected,
        debugPort: qq.debugPort,
      },
      qishui: {
        available: Boolean(qishui.did && qishui.iid),
        hasDevice: Boolean(qishui.did && qishui.iid),
        hasCookie: Boolean(qishui.cookie),
      },
    },
  });
}

async function serveStatic(_req, res, url) {
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = normalize(join(publicDir, requestedPath));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function openBrowser(url) {
  if (!shouldOpenBrowser) return;

  const platform = process.platform;
  const command =
    platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    sendCorsOptions(res);
    return;
  }

  if (url.pathname === "/api/search") {
    await handleApiSearch(req, res, url);
    return;
  }

  if (url.pathname === "/api/offline-check" || url.pathname === "/api/check") {
    await handleOfflineCheck(req, res);
    return;
  }

  if (url.pathname === "/api/qq-browser/start") {
    await handleQqBrowserStart(req, res);
    return;
  }

  if (url.pathname === "/api/qq-browser/status") {
    await handleQqBrowserStatus(req, res);
    return;
  }

  if (url.pathname === "/api/qishui/status") {
    await handleQishuiStatus(req, res);
    return;
  }

  if (url.pathname === "/api/status") {
    await handleLocalStatus(req, res);
    return;
  }

  await serveStatic(req, res, url);
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。请关闭另一个工具窗口，或换一个 PORT 后再启动。`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`歌曲链接回填工具已启动：${url}`);
  openBrowser(url);
});
