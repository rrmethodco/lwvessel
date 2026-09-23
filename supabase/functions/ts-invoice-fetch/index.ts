import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Fetches each event's portal Invoice document (the only place line items exist -- the
// API does not expose them) and stores the raw HTML for parsing.
const SECRET = "9d0cda18e527962beb024146c5dbf3e7";
const TS_BASE = "https://api.tripleseat.com";
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

async function getToken() {
  const id = Deno.env.get("TRIPLESEAT_CLIENT_ID"); const secret = Deno.env.get("TRIPLESEAT_CLIENT_SECRET");
  for (const p of ["/oauth/token", "/oauth2/token"]) {
    const r = await fetch(TS_BASE + p, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }) });
    const j = await r.json().catch(() => null); if (j && j.access_token) return j.access_token;
  } return null;
}

Deno.serve(async (req) => {
  const started = Date.now();
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== SECRET) return json({ error: "forbidden" }, 403);
  const ids = String(url.searchParams.get("ids") || "").split(",").map(s => s.trim()).filter(Boolean);
  const budgetMs = parseInt(url.searchParams.get("budgetMs") || "80000", 10);
  const token = await getToken(); if (!token) return json({ tokenError: true });
  const supa = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const results = []; let timedOut = false;
  for (const id of ids) {
    if (Date.now() - started > budgetMs) { timedOut = true; break; }
    try {
      const r = await fetch(`${TS_BASE}/v1/events/${id}.json`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      const j = await r.json().catch(() => null); const e = j && (j.event || j);
      const views = (e && e.documents && e.documents[0] && e.documents[0].views) || [];
      const v = views.find(x => /invoice/i.test(x.name || "")) || views.find(x => /banquet event order/i.test(x.name || "")) || views[0];
      if (!v) { results.push({ id, error: "no document" }); continue; }
      const pr = await fetch(v.url, { headers: { Accept: "text/html" }, redirect: "follow" });
      const html = await pr.text();
      const { error } = await supa.from("ts_invoice_html").upsert({ event_id: Number(id), doc_url: v.url, html, fetched_at: new Date().toISOString() });
      results.push({ id, view: v.name, status: pr.status, bytes: html.length, dbError: error ? error.message : null });
    } catch (err) { results.push({ id, error: String(err) }); }
  }
  return json({ fetched: results.length, timedOut, results, elapsedMs: Date.now() - started });
});
