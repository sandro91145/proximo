// Optional Supabase Edge Function: forwards requests to the Carris Metropolitana API
// and adds CORS headers. Only needed if the browser blocks direct calls.
//
// Deploy:  supabase functions deploy cm-proxy --no-verify-jwt
// Then set CONFIG.PROXY in app.js to:
//   https://<your-project>.supabase.co/functions/v1/cm-proxy

const UPSTREAM = "https://api.carrismetropolitana.pt/v2";
const ALLOWED = [/^\/stops$/, /^\/lines$/, /^\/alerts$/, /^\/locations\/(localities|municipalities)$/, /^\/arrivals\/by_stop\/[\w-]+$/];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!ALLOWED.some((re) => re.test(path))) {
    return new Response(JSON.stringify({ error: "path not allowed" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const res = await fetch(UPSTREAM + path, { headers: { Accept: "application/json" } });
  const live = path.startsWith("/arrivals") || path === "/alerts";
  return new Response(res.body, {
    status: res.status,
    headers: {
      ...cors,
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": live ? "public, max-age=15" : "public, max-age=3600",
    },
  });
});
