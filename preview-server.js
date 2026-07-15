import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { searchCloud } from "./shared/cloud-search.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const webDir = join(__dirname, "web");
const port = Number(process.env.PORT || 5280);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".zip": "application/zip",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }
  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, mode: "preview" });
    return;
  }
  if (url.pathname === "/api/search") {
    try {
      const body = req.method === "POST" ? await readJson(req) : {};
      sendJson(
        res,
        200,
        await searchCloud({
          q: body.q ?? url.searchParams.get("q"),
          platforms: body.platforms ?? url.searchParams.get("platforms"),
          limit: body.limit ?? url.searchParams.get("limit"),
        }),
      );
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

async function serveStatic(_req, res, url) {
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = normalize(join(webDir, requestedPath));
  if (!filePath.startsWith(webDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
}).listen(port, () => {
  console.log(`cloud hybrid preview: http://localhost:${port}`);
});
