import { searchCloud } from "../../shared/cloud-search.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  return handleSearch({
    q: url.searchParams.get("q"),
    platforms: url.searchParams.get("platforms"),
    limit: url.searchParams.get("limit"),
  });
}

export async function onRequestPost(context) {
  let body = {};
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  return handleSearch(body);
}

async function handleSearch(input) {
  try {
    return json(await searchCloud(input));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
}
