import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Public app key (safe to embed) — gates calls to this function to the app.
const PUBLISHABLE = "sb_publishable_5JB6emMB86VDQWU9w9-0nA_sm4OuR4w";
const TS_BASE = "https://api.tripleseat.com";
const CORS: Record<string,string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o, null, 2), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Verify the signed-in caller and confirm they are an internal editor (admin/user).
// External (read-only) members and anonymous callers are rejected so they cannot sync Tripleseat.
async function requireEditor(req: Request): Promise<{ ok: true; email: string; role: string } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === PUBLISHABLE) return { ok: false, status: 401, error: "sign-in required" };
  const supaUrl = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || PUBLISHABLE;
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supaUrl || !svcKey) return { ok: false, status: 500, error: "server auth not configured" };
  try {
    const userClient = createClient(supaUrl, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user?.email) return { ok: false, status: 401, error: "invalid session" };
    const email = user.email.toLowerCase();
    const svc = createClient(supaUrl, svcKey);
    const { data: row } = await svc.from("app_users").select("role").eq("email", email).maybeSingle();
    const role = row?.role || "";
    if (role !== "admin" && role !== "user") {
      return { ok: false, status: 403, error: "Tripleseat sync is restricted to internal users." };
    }
    return { ok: true, email, role };
  } catch (e) {
    return { ok: false, status: 401, error: String(e) };
  }
}

async function getToken(): Promise<{ token?: string; error?: string; endpoint?: string; status?: number }> {
  const id = Deno.env.get("TRIPLESEAT_CLIENT_ID");
  const secret = Deno.env.get("TRIPLESEAT_CLIENT_SECRET");
  if (!id || !secret) return { error: "Missing TRIPLESEAT_CLIENT_ID / TRIPLESEAT_CLIENT_SECRET in Edge secrets" };
  let last: { error: string; status?: number } = { error: "no token endpoint responded" };
  for (const path of ["/oauth/token", "/oauth2/token"]) {
    try {
      const r = await fetch(TS_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
      });
      const txt = await r.text();
      let j: any = null; try { j = JSON.parse(txt); } catch { /* non-json */ }
      if (r.ok && j && j.access_token) return { token: j.access_token, endpoint: path, status: r.status };
      last = { error: `token ${r.status}: ${txt.slice(0, 300)}`, status: r.status };
    } catch (e) {
      last = { error: String(e) };
    }
  }
  return last;
}

// ---- Field-catalog helpers: enumerate every data point a payload exposes ----
// Walks an object/array to a bounded depth and records the dot-path of every
// leaf plus a compact type/example, so the probe surfaces the full shape of a
// Tripleseat record (financials, custom fields, line items, addresses, …).
function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array(${v.length})`;
  return typeof v;
}
function catalog(obj: any, cat: Record<string, string>, prefix = "", depth = 0, maxDepth = 4) {
  if (obj === null || obj === undefined) return;
  if (Array.isArray(obj)) {
    // Sample every element so we learn the union item shape (Tripleseat omits empty keys).
    if (obj.length && depth < maxDepth) for (const el of obj) catalog(el, cat, prefix + "[]", depth + 1, maxDepth);
    else if (!(prefix in cat)) cat[prefix] = typeOf(obj);
    return;
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      const v = (obj as any)[k];
      if (v && typeof v === "object" && depth < maxDepth) {
        catalog(v, cat, p, depth + 1, maxDepth);
      } else {
        if (!(p in cat)) {
          if (v !== null && typeof v !== "object") {
            const ex = String(v).slice(0, 40);
            cat[p] = ex === "" ? typeOf(v) : `${typeOf(v)}: ${ex}`;
          } else {
            cat[p] = typeOf(v);
          }
        }
      }
    }
    return;
  }
}
// Merge the field catalog across a list of records so we capture every key that
// appears on ANY record, not just the first (Tripleseat omits empty fields).
function catalogMany(arr: any[], maxDepth = 4): Record<string, string> {
  const cat: Record<string, string> = {};
  for (const rec of arr) catalog(rec, cat, "", 0, maxDepth);
  return cat;
}

function unwrap(j: any): any[] | null {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== "object") return null;
  for (const k of ["results", "events", "bookings", "accounts", "contacts", "locations", "leads", "rooms", "menus", "users", "event_documents", "documents", "data"]) {
    if (Array.isArray(j[k])) return j[k];
  }
  return null;
}

// Pull a first record id out of a list payload (id or <resource>_id).
function firstId(arr: any[] | null): string | number | null {
  if (!arr || !arr.length) return null;
  const r = arr[0];
  for (const k of ["id", "event_id", "booking_id", "account_id", "contact_id", "location_id", "lead_id", "menu_id", "room_id"]) {
    if (r && r[k] != null) return r[k];
  }
  return null;
}

// GET a Tripleseat endpoint and report status + shape + field catalog (no raw dump
// unless it fails to parse), so we can see how many data points each surface offers.
async function probe(path: string, token: string, opts: { sample?: boolean; maxDepth?: number } = {}) {
  const rec: Record<string, unknown> = { path };
  try {
    const r = await fetch(`${TS_BASE}${path}`, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    });
    rec.status = r.status;
    const txt = await r.text();
    let j: any = null; try { j = JSON.parse(txt); } catch { /* non-json */ }
    if (!j) { rec.text = txt.slice(0, 300); return rec; }
    const arr = unwrap(j);
    if (arr) {
      rec.shape = `array(${arr.length})`;
      rec.count = arr.length;
      rec.fields = catalogMany(arr, opts.maxDepth ?? 4);
      rec.fieldCount = Object.keys(rec.fields as object).length;
      rec.firstId = firstId(arr);
      if (opts.sample && arr.length) rec.sample = arr[0];
    } else {
      rec.shape = Object.keys(j);
      const c: Record<string, string> = {}; catalog(j, c, "", 0, opts.maxDepth ?? 4);
      rec.fields = c; rec.fieldCount = Object.keys(c).length;
      if (opts.sample) rec.sample = j;
    }
  } catch (e) {
    rec.error = String(e);
  }
  return rec;
}

// Try a list of candidate paths and return the probe of the first that responds
// 2xx (falling back to the last attempt) — Tripleseat 500s on unknown routes, so
// this lets us discover the real path for surfaces the naive name misses.
async function probeFirst(paths: string[], token: string, opts: { sample?: boolean; maxDepth?: number } = {}) {
  let last: Record<string, unknown> | null = null;
  const tried: string[] = [];
  for (const p of paths) {
    const rec = await probe(p, token, opts);
    tried.push(`${p} → ${rec.status ?? rec.error}`);
    last = rec;
    const st = rec.status as number | undefined;
    if (st && st >= 200 && st < 300) { rec.tried = tried; return rec; }
  }
  if (last) last.tried = tried;
  return last ?? { error: "no paths", tried };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const key = req.headers.get("apikey") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (key !== PUBLISHABLE) return json({ error: "unauthorized" }, 401);

  // Role gate: only internal editors (admin/user) may reach Tripleseat.
  const gate = await requireEditor(req);
  if (!gate.ok) return json({ error: gate.error }, gate.status);

  const url = new URL(req.url);
  let body: any = {}; try { body = await req.json(); } catch { /* no/invalid body */ }
  const mode = (body && body.mode) || url.searchParams.get("mode") || "ping";
  const venue = (body && body.venue) || url.searchParams.get("venue") || "vessel";
  const out: Record<string, unknown> = { mode, venue, ts: new Date().toISOString(), caller: gate.email };

  const t = await getToken();
  out.tokenObtained = !!t.token;
  out.tokenEndpoint = t.endpoint;
  if (!t.token) { out.error = t.error; out.tokenStatus = t.status; return json(out, 200); }
  const token = t.token;

  const coverage: Record<string, unknown> = {};
  const detail: Record<string, unknown> = {};

  // ---- 1) Core resources: list (union field catalog) + a single-record detail ----
  // The detail record is typically the richest single payload (financials, line
  // items, custom fields, documents), so we drill into the first row of each list.
  // All fetches run in parallel so the whole sweep stays well under the wall clock.
  const RESOURCES: { name: string; list: string; base: string | null; depthList: number; depthDetail: number }[] = [
    { name: "events",    list: "/v1/events.json?per_page=50",    base: "/v1/events",    depthList: 6, depthDetail: 7 },
    { name: "bookings",  list: "/v1/bookings.json?per_page=50",  base: "/v1/bookings",  depthList: 6, depthDetail: 7 },
    { name: "accounts",  list: "/v1/accounts.json?per_page=50",  base: "/v1/accounts",  depthList: 4, depthDetail: 6 },
    { name: "contacts",  list: "/v1/contacts.json?per_page=50",  base: "/v1/contacts",  depthList: 4, depthDetail: 6 },
    { name: "locations", list: "/v1/locations.json",             base: "/v1/locations", depthList: 5, depthDetail: 6 },
    { name: "leads",     list: "/v1/leads.json?per_page=50",     base: "/v1/leads",     depthList: 5, depthDetail: 6 },
    { name: "menus",     list: "/v1/menus.json?per_page=50",     base: "/v1/menus",     depthList: 5, depthDetail: 6 },
    { name: "rooms",     list: "/v1/rooms.json?per_page=50",     base: "/v1/rooms",     depthList: 4, depthDetail: 5 },
    { name: "users",     list: "/v1/users.json?per_page=50",     base: null,           depthList: 3, depthDetail: 4 },
  ];

  await Promise.all(RESOURCES.map(async (res) => {
    const listRec = await probe(res.list, token, { maxDepth: res.depthList });
    out[res.name] = listRec;
    coverage[res.name] = { status: (listRec as any).status, fields: (listRec as any).fieldCount, count: (listRec as any).count, error: (listRec as any).error };
    // Detail drill on the first id, when the resource supports a detail route.
    const id = (listRec as any).firstId;
    if (res.base && id != null) {
      const dRec = await probe(`${res.base}/${id}.json`, token, { sample: true, maxDepth: res.depthDetail });
      detail[res.name] = dRec;
      coverage[res.name + "Detail"] = { status: (dRec as any).status, fields: (dRec as any).fieldCount, error: (dRec as any).error };
    }
  }));
  out.detail = detail;

  // ---- 2) Reference surfaces: try candidate paths (Tripleseat 500s on unknown
  //         routes, so we probe the likely real endpoint names). menu_items is
  //         also captured via the menu detail below; here we try it standalone. ----
  const EXTRAS: { name: string; paths: string[]; depth?: number }[] = [
    { name: "event_documents", paths: ["/v1/event_documents.json?per_page=10", "/v1/documents.json?per_page=10"], depth: 4 },
    { name: "event_types",     paths: ["/v1/event_types.json", "/v1/booking_types.json", "/v1/event_statuses.json"] },
    { name: "lead_sources",    paths: ["/v1/lead_sources.json", "/v1/sources.json", "/v1/referral_sources.json"] },
    { name: "tax_rates",       paths: ["/v1/tax_rates.json", "/v1/taxes.json", "/v1/tax_groups.json"] },
    { name: "custom_fields",   paths: ["/v1/custom_fields.json", "/v1/event_custom_fields.json", "/v1/definitions.json"] },
    { name: "menu_items",      paths: ["/v1/menu_items.json?per_page=25"], depth: 4 },
    { name: "account_types",   paths: ["/v1/account_types.json", "/v1/market_segments.json"] },
  ];
  const extra: Record<string, unknown> = {};
  await Promise.all(EXTRAS.map(async (ex) => {
    const rec = await probeFirst(ex.paths, token, { maxDepth: ex.depth ?? 3 });
    extra[ex.name] = rec;
    coverage[ex.name] = { status: (rec as any)?.status, fields: (rec as any)?.fieldCount, error: (rec as any)?.error, tried: (rec as any)?.tried };
  }));
  out.extra = extra;

  // ---- 3) Menu detail → nested menu_items (the reliable source for item fields) ----
  const menuId = (out.menus as any)?.firstId;
  if (menuId != null) {
    const md = await probe(`/v1/menus/${menuId}.json`, token, { sample: true, maxDepth: 6 });
    out.menuDetail = md;
    coverage["menuDetail"] = { status: (md as any).status, fields: (md as any).fieldCount, error: (md as any).error };
  }

  out.coverage = coverage;
  // Grand total of enumerated data points across every reachable surface.
  out.totalDataPoints = Object.values(coverage).reduce((a: number, c: any) => a + (typeof c?.fields === "number" ? c.fields : 0), 0);

  return json(out, 200);
});
