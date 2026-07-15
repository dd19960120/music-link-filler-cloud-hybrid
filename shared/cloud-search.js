import { createCipheriv, createHash, randomUUID } from "node:crypto";

const MAX_RESULTS_PER_PLATFORM = 200;

const platformConfig = {
  netease: { label: "网易云音乐" },
  kugou: { label: "酷狗音乐" },
  kuwo: { label: "酷我音乐" },
};

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

function normalizeSongName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function matchType(name, query) {
  return normalizeSongName(name) === normalizeSongName(query) ? "exact" : "candidate";
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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
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

function mapResult(
  {
    platform,
    rank,
    id,
    name,
    artists,
    album,
    link,
    favoriteCount,
    favoriteText,
    listenCount,
    listenText,
    commentCount,
    shareCount,
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
    lyricist: "",
    composer: "",
    link,
    favoriteCount: favoriteCount ?? "",
    favoriteText: favoriteText ?? "",
    listenCount: listenCount ?? "",
    listenText: listenText ?? "",
    likeCount: "",
    commentCount: commentCount ?? "",
    shareCount: shareCount ?? "",
    matchType: matchType(cleanName, query),
  };
}

async function hydrateRows(rows, getStats, batchSize = 6) {
  const hydrated = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const batchRows = await Promise.all(
      batch.map(async (row) => {
        try {
          return { ...row, ...(await getStats(row)) };
        } catch {
          return row;
        }
      }),
    );
    hydrated.push(...batchRows);
  }
  return hydrated;
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

async function getNeteaseStats(row) {
  const commentUrl = `https://music.163.com/api/v1/resource/comments/R_SO_4_${encodeURIComponent(row.id)}?limit=1&offset=0`;
  const [commentData, redData] = await Promise.all([
    fetchJson(commentUrl, { headers: { Referer: "https://music.163.com/" } }),
    fetchNeteaseEapi("/api/song/red/count", { songId: Number(row.id) }),
  ]);
  return {
    favoriteText: redData.data?.countDesc || "",
    favoriteCount: redData.data?.count ?? "",
    commentCount: commentData.total ?? "",
  };
}

async function getKugouStats(row) {
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
  const data = await fetchJson(url, { headers: { Referer: "https://www.kugou.com/" } });
  return { commentCount: data.combine_count ?? data.count ?? "" };
}

async function getKuwoStats(row) {
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
  const data = await fetchJson(url, { headers: { Referer: "https://www.kuwo.cn/" } });
  return { commentCount: data.total ?? data.data?.total ?? "" };
}

export async function searchNetease(keyword, limit) {
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

export async function searchKugou(keyword, limit) {
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

export async function searchKuwo(keyword, limit) {
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
  const data = await fetchJson(url, { headers: { Referer: "https://www.kuwo.cn/" } });
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

const searchers = {
  netease: searchNetease,
  kugou: searchKugou,
  kuwo: searchKuwo,
};

export async function searchCloudPlatform(platform, keyword, limit) {
  if (!searchers[platform]) {
    return {
      platform,
      platformLabel: platform,
      query: keyword,
      count: 0,
      candidates: [],
      error: "需本地助手",
      detail: "该平台依赖本机登录态或客户端数据，请下载安装并启动本地助手。",
    };
  }
  try {
    const candidates = await searchers[platform](keyword, limit);
    return {
      platform,
      platformLabel: platformConfig[platform].label,
      query: keyword,
      count: candidates.length,
      candidates,
    };
  } catch (error) {
    return {
      platform,
      platformLabel: platformConfig[platform]?.label || platform,
      query: keyword,
      count: 0,
      candidates: [],
      error: "搜索失败",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function searchCloud({ q, platforms, limit }) {
  const keyword = String(q || "").trim();
  const safeLimit = Math.min(Math.max(Number(limit || 10), 1), MAX_RESULTS_PER_PLATFORM);
  const safePlatforms = (Array.isArray(platforms) ? platforms : String(platforms || "netease").split(","))
    .map((platform) => String(platform).trim())
    .filter(Boolean);

  if (!keyword) throw new Error("请输入关键词");
  if (safePlatforms.length === 0) throw new Error("请选择平台");

  const results = await Promise.all(
    safePlatforms.map((platform) => searchCloudPlatform(platform, keyword, safeLimit)),
  );
  return {
    query: keyword,
    requestId: randomUUID(),
    platforms: results,
  };
}
