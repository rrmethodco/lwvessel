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

// ============================================================================
//  IMPORT: pull a venue's Tripleseat events into the app's beo_events table.
//  The app renders events from beo_events (venue-scoped) — it does NOT read
//  Tripleseat live — so this is what actually populates a venue's Events tab.
// ============================================================================

// First non-empty (non-null / non-blank) value among candidate keys on `obj`.
function pick(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return undefined;
}
// Nested value at a dot-path (e.g. "account.name"), if present.
function dig(obj: any, path: string): any {
  let cur = obj;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[seg];
  }
  return (cur === "" ? undefined : cur);
}
function firstDefined(...vals: any[]): any {
  for (const v of vals) if (v !== null && v !== undefined && v !== "") return v;
  return undefined;
}
// Tripleseat wraps each collection item under a singular key
// (e.g. { location: {...} }, { event: {...} }). Descend into that wrapper when
// present so field access works on the real record.
function itemOf(o: any, key: string): any {
  if (o && typeof o === "object" && o[key] && typeof o[key] === "object" && !Array.isArray(o[key])) return o[key];
  return o;
}
function toNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}
// 'YYYY-MM-DD' from an ISO datetime / date string.
function toDatePart(v: any): string {
  if (!v) return "";
  const s = String(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}
// 'H:MM AM/PM' from an ISO datetime, else pass through a already-formatted time.
function toTime(v: any): string {
  if (!v) return "";
  const s = String(v);
  const dt = s.match(/\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})/);
  let hh: number, mm: string;
  if (dt) { hh = +dt[1]; mm = dt[2]; }
  else {
    const t = s.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
    if (!t) return "";
    hh = +t[1]; mm = t[2];
    if (t[3]) return `${((hh % 12) || 12)}:${mm} ${t[3].toUpperCase()}`;
  }
  const ap = hh < 12 ? "AM" : "PM";
  let h12 = hh % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${mm} ${ap}`;
}

// Resolve a venue -> Tripleseat location. Matches the configured location name
// (venues.config.tripleseatLocation, else branding.name, else the venue id)
// against /v1/locations.json, case-insensitively.
async function resolveLocation(token: string, wanted: string) {
  const r = await fetch(`${TS_BASE}/v1/locations.json`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const status = r.status;
  const j = await r.json().catch(() => null);
  const rawArr = unwrap(j) || [];
  const arr = rawArr.map((l: any) => itemOf(l, "location"));
  const norm = (s: any) => String(s ?? "").trim().toLowerCase();
  const want = norm(wanted);
  const all = arr.map((l: any) => ({
    id: firstDefined(l.id, l.location_id, l.uid),
    name: firstDefined(l.name, l.location_name, l.title, l.display_name, l.label),
  }));
  const hit = all.find((l: any) => norm(l.name) === want) || all.find((l: any) => want.length > 2 && norm(l.name).includes(want));
  // Keep a raw first item so we can see the true field shape if matching fails.
  return { matched: hit || null, locations: all, status, rawSample: rawArr[0] ?? null };
}

// Map one Tripleseat event (list row merged with detail) to a beo_events payload.
// Only high-confidence "envelope" fields are set; line items / COGS need the
// venue menu and are left empty for a first import (revenue totals still show).
function mapEvent(src: any, venueName: string): { extId: string; payload: any } {
  const extId = String(firstDefined(dig(src, "id"), dig(src, "event_id"), dig(src, "uid")));
  const rawName = firstDefined(pick(src, ["name", "event_name", "title"]), `Event ${extId}`);
  const start = firstDefined(pick(src, ["event_start", "start_date", "event_date", "date", "start_time"]), dig(src, "event_start_at"));
  const end = firstDefined(pick(src, ["event_end", "end_date", "end_time"]), dig(src, "event_end_at"));
  const statusRaw = firstDefined(pick(src, ["status", "event_status", "status_name"]), dig(src, "status.name"));
  const guests = toNum(firstDefined(
    pick(src, ["guest_count", "expected_headcount", "final_headcount", "actual_headcount", "headcount", "guests", "expected_count", "guaranteed_count"]),
  ));
  const total = toNum(firstDefined(
    pick(src, ["grand_total", "total", "total_amount", "revenue_total", "gross_total"]),
    dig(src, "financials.grand_total"), dig(src, "financials.total"), dig(src, "totals.grand_total"),
  ));
  const deposit = toNum(firstDefined(
    pick(src, ["deposit", "deposit_total", "deposit_amount"]),
    dig(src, "financials.deposit"), dig(src, "financials.deposit_total"),
  ));
  const company = firstDefined(
    pick(src, ["account_name"]), dig(src, "account.name"),
    [dig(src, "contact.first_name"), dig(src, "contact.last_name")].filter(Boolean).join(" ") || undefined,
    pick(src, ["contact_name"]),
  );
  const salesperson = firstDefined(
    pick(src, ["salesperson", "sales_person", "owner_name", "manager_name", "user_name"]),
    dig(src, "owner.name"), dig(src, "manager.name"), dig(src, "user.name"),
    [dig(src, "owner.first_name"), dig(src, "owner.last_name")].filter(Boolean).join(" ") || undefined,
  );
  const evType = firstDefined(pick(src, ["event_type", "event_type_name", "type_name", "type"]), dig(src, "event_type.name"));
  const market = firstDefined(pick(src, ["market_segment", "market_segment_name", "market"]), dig(src, "market_segment.name"));
  const leadSource = firstDefined(pick(src, ["lead_source", "lead_source_name", "source", "referral_source"]), dig(src, "lead_source.name"));
  const inq = firstDefined(pick(src, ["inquiry_date", "created_at", "created", "created_on"]), dig(src, "lead.created_at"));

  const payload: any = {
    tab: String(rawName),
    name: `${rawName} — ${venueName}`,
    evDate: toDatePart(start),
    startTime: toTime(start),
    endTime: toTime(end),
    guests: guests != null ? guests : 50,
    status: statusRaw ? String(statusRaw).trim().toUpperCase() : "",
    evType: evType ? String(evType) : "",
    market: market ? String(market) : "",
    company: company ? String(company) : "",
    salesperson: salesperson ? String(salesperson) : "",
    leadSource: leadSource ? String(leadSource) : "Tripleseat inquiry",
    inqDate: toDatePart(inq),
    tsTotal: total,
    deposit: deposit != null ? deposit : 0,
  };
  return { extId, payload };
}

// Fetch a bounded set of events for a location. Server-side location filtering
// (param name varies) is best-effort; we ALSO filter client-side by matching the
// event's own location to the target id/name, so a wrong/ignored filter param
// can never import another location's events.
async function fetchLocationEvents(token: string, locId: any, locName: string, maxPages: number) {
  const per = 100;
  const attempts = [
    (p: number) => `/v1/events.json?location_id=${locId}&per_page=${per}&page=${p}`,
    (p: number) => `/v1/events.json?location_ids[]=${locId}&per_page=${per}&page=${p}`,
    (p: number) => `/v1/events.json?per_page=${per}&page=${p}`,
  ];
  const norm = (s: any) => String(s ?? "").trim().toLowerCase();
  const wantId = String(locId), wantName = norm(locName);
  const matchesLoc = (e: any) => {
    const eid = firstDefined(dig(e, "location_id"), dig(e, "location.id"));
    const enm = firstDefined(dig(e, "location_name"), dig(e, "location.name"), dig(e, "location"));
    if (eid != null && String(eid) === wantId) return true;
    if (enm != null && norm(enm) === wantName) return true;
    // If the event carries no location info at all, keep it only when we trusted
    // a server-side filter (attempt 0/1); attempt 2 is unfiltered, so drop it.
    return eid == null && enm == null;
  };

  for (let a = 0; a < attempts.length; a++) {
    const build = attempts[a];
    // Probe page 1 to see if this param shape is accepted.
    const first = await fetch(`${TS_BASE}${build(1)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (first.status < 200 || first.status >= 300) continue;
    const j1 = await first.json().catch(() => null);
    const arr1 = unwrap(j1) || [];
    // Pull remaining pages in parallel (bounded).
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, maxPages - 1) }, (_, i) => i + 2).map(async (p) => {
        const r = await fetch(`${TS_BASE}${build(p)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
        if (r.status < 200 || r.status >= 300) return [] as any[];
        const j = await r.json().catch(() => null);
        return unwrap(j) || [];
      }),
    );
    // Unwrap the per-item { event: {...} } wrapper Tripleseat uses.
    const all = [arr1, ...rest].flat().map((e) => itemOf(e, "event"));
    // Dedupe by event id — guards against Tripleseat ignoring the `page` param
    // and returning the same page repeatedly (which would also break the upsert).
    const seen = new Set<string>();
    const uniq = all.filter((e) => {
      const id = String(firstDefined(dig(e, "id"), dig(e, "event_id"), ""));
      if (!id || seen.has(id)) return false;
      seen.add(id); return true;
    });
    const matched = uniq.filter(matchesLoc);
    const truncated = arr1.length === per && rest.length > 0 && rest[rest.length - 1].length === per;
    return { events: matched, rawCount: all.length, uniqueCount: uniq.length, param: a === 0 ? "location_id" : a === 1 ? "location_ids[]" : "none(client-filtered)", truncated };
  }
  return { events: [] as any[], rawCount: 0, uniqueCount: 0, param: "none", truncated: false };
}

// Simple concurrency-capped map (Tripleseat detail fetches — avoid N+1 blowups).
async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function runImport(token: string, venue: string, opts: { commit: boolean; maxEvents: number }, gateEmail: string) {
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supaUrl, svcKey);

  // Venue -> desired Tripleseat location name.
  const { data: vrow } = await svc.from("venues").select("name, config").eq("id", venue).maybeSingle();
  const cfg: any = vrow?.config || {};
  const venueName = firstDefined(cfg?.branding?.name, vrow?.name, venue);
  const wantedLoc = firstDefined(cfg?.tripleseatLocation, cfg?.branding?.name, vrow?.name, venue);

  const loc = await resolveLocation(token, wantedLoc);
  const result: Record<string, unknown> = {
    venue, venueName, wantedLocation: wantedLoc,
    locationStatus: loc.status,
    matchedLocation: loc.matched,
    locationsAvailable: loc.locations,
    rawLocationSample: loc.rawSample,
    commit: opts.commit,
  };
  if (!loc.matched || loc.matched.id == null) {
    result.error = `No Tripleseat location matched "${wantedLoc}". See locationsAvailable.`;
    return result;
  }

  const fetched = await fetchLocationEvents(token, loc.matched.id, loc.matched.name, 15);
  result.locationFilterParam = fetched.param;
  result.eventsFound = fetched.events.length;
  result.rawEventsScanned = fetched.rawCount;
  result.truncated = fetched.truncated;

  // Enrich with per-event detail (financials, guest count) — all events on
  // commit, a small sample on preview — concurrency-capped to avoid timeouts.
  const list = fetched.events.slice(0, opts.maxEvents);
  const detailCount = opts.commit ? list.length : Math.min(3, list.length);
  const enriched = await pool(list, 8, async (e, i) => {
    const id = firstDefined(dig(e, "id"), dig(e, "event_id"));
    if (i < detailCount && id != null) {
      const r = await fetch(`${TS_BASE}/v1/events/${id}.json`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (r.status >= 200 && r.status < 300) {
        const d = await r.json().catch(() => null);
        const dd = itemOf((d && (d.event || d.result || d)) || {}, "event");
        return { ...e, ...dd };
      }
    }
    return e;
  });

  const mapped = enriched.map((e) => mapEvent(e, venueName));
  result.sample = mapped.slice(0, 3).map((m, i) => ({ extId: m.extId, payload: m.payload, raw: enriched[i] }));

  // Persist a couple of raw+mapped samples for offline inspection/debugging.
  try {
    await svc.from("ts_probe").insert(
      mapped.slice(0, 3).map((m, i) => ({
        run_id: `import-${venue}`,
        label: `event:${m.extId}`,
        url: "/v1/events/{id}.json",
        status: 200,
        ok: true,
        shape: "event",
        keys: Object.keys(enriched[i] || {}),
        sample: enriched[i],
        note: `mapped=${JSON.stringify(m.payload)} · caller=${gateEmail}`,
      })),
    );
  } catch (_e) { /* best-effort debug persistence */ }

  if (!opts.commit) {
    result.note = "PREVIEW ONLY — nothing written. Re-run with commit:true to import.";
    return result;
  }

  // Upsert every mapped event (idempotent on venue+ext_id). Dedupe defensively
  // and drop any row without a usable ext_id (would break the conflict target).
  const seenIds = new Set<string>();
  const rows = mapped
    .filter((m) => m.extId && m.extId !== "undefined" && m.extId !== "null" && !seenIds.has(m.extId) && seenIds.add(m.extId))
    .map((m, i) => ({
      venue,
      ext_id: m.extId,
      source: "tripleseat",
      payload: m.payload,
      position: i,
      created_by_email: gateEmail,
      updated_by_email: gateEmail,
    }));
  let upserted = 0; const errors: string[] = [];
  // Chunk to keep each request modest.
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error, count } = await svc.from("beo_events")
      .upsert(chunk, { onConflict: "venue,ext_id", ignoreDuplicates: false, count: "exact" });
    if (error) errors.push(error.message);
    else upserted += (count ?? chunk.length);
  }
  result.imported = upserted;
  if (errors.length) result.upsertErrors = errors;
  return result;
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

  // ---- IMPORT mode: populate this venue's beo_events from Tripleseat ----
  if (mode === "import") {
    const commit = !!(body && body.commit) || url.searchParams.get("commit") === "true";
    const maxEvents = Math.max(1, Math.min(1000, +(body?.maxEvents ?? url.searchParams.get("maxEvents") ?? 500) || 500));
    try {
      const r = await runImport(token, venue, { commit, maxEvents }, gate.email);
      Object.assign(out, r);
    } catch (e) {
      out.error = String(e);
    }
    return json(out, 200);
  }

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
