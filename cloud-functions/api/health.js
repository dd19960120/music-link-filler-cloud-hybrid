const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export function onRequestOptions() {
  return new Response(null, { status: 204, headers });
}

export function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, mode: "cloud" }), { headers });
}
