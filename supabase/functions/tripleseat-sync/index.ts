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
  // Prefer the ISO-8601 fields (unambiguous) over Tripleseat's M/D/Y strings.
  const start = firstDefined(pick(src, ["event_start_iso8601", "event_date_iso8601", "start_date", "event_start", "event_date", "date", "start_time"]), dig(src, "event_start_at"));
  const end = firstDefined(pick(src, ["event_end_iso8601", "event_end", "end_date", "end_time"]), dig(src, "event_end_at"));
  const statusRaw = firstDefined(pick(src, ["status", "event_status", "status_name"]), dig(src, "status.name"));
  const guests = toNum(firstDefined(
    pick(src, ["guest_count", "expected_headcount", "final_headcount", "actual_headcount", "headcount", "guests", "expected_count", "guaranteed_count", "guaranteed_guest_count"]),
    dig(src, "forecast_event.estimated_guest_count"),
  ));
  // Tripleseat keeps the event grand_total null until priced; the summed totals
  // live on the parent booking, so fall back to those.
  const total = toNum(firstDefined(
    pick(src, ["grand_total", "total", "total_amount", "revenue_total", "gross_total", "actual_amount"]),
    dig(src, "booking.total_event_grand_total"), dig(src, "booking.total_grand_total"), dig(src, "booking.total_actual_amount"),
    dig(src, "financials.grand_total"), dig(src, "financials.total"), dig(src, "totals.grand_total"),
  ));
  const deposit = toNum(firstDefined(
    pick(src, ["deposit", "deposit_total", "deposit_amount"]),
    dig(src, "financials.deposit"), dig(src, "financials.deposit_total"),
  ));
  const rental = toNum(firstDefined(pick(src, ["rental_fee"]), dig(src, "booking.total_rental_fee")));
  const fbMin = toNum(firstDefined(pick(src, ["food_and_beverage_min"]), dig(src, "booking.total_food_and_beverage_min")));
  // Event Actual = summed revenue categories (food + beverage + rental + …) BEFORE
  // tax / service charge / admin fee — i.e. revenue excluding tax & gratuity.
  const actual = toNum(firstDefined(pick(src, ["actual_amount"]), dig(src, "booking.total_event_actual_amount"), dig(src, "booking.total_actual_amount")));
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
  // Room(s): Tripleseat attaches a `rooms` array of {name} (an event can span
  // several). Join the assigned room names so the app can show + filter by room.
  const roomsArr = pick(src, ["rooms"]);
  let room = "";
  if (Array.isArray(roomsArr)) {
    room = roomsArr
      .map((r: any) => String(firstDefined(r?.name, r?.room_name, r?.title, "") || "").trim())
      .filter(Boolean).join(", ");
  }
  if (!room) room = String(firstDefined(dig(src, "room.name"), pick(src, ["room_name", "room"]), "") || "").trim();
  const market = firstDefined(pick(src, ["market_segment", "market_segment_name", "market"]), dig(src, "market_segment.name"), dig(src, "booking.market_segment"));
  const leadSource = firstDefined(pick(src, ["lead_source", "lead_source_name", "source", "referral_source"]), dig(src, "lead_source.name"), dig(src, "booking.lead.lead_source.name"));
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
    room: room || "",
    market: market ? String(market) : "",
    company: company ? String(company) : "",
    salesperson: salesperson ? String(salesperson) : "",
    leadSource: leadSource ? String(leadSource) : "Tripleseat inquiry",
    inqDate: toDatePart(inq),
    tsTotal: total,
    deposit: deposit != null ? deposit : 0,
    rental: rental != null ? rental : 0,
  };
  if (fbMin != null) payload.fbMin = fbMin;
  // Actual revenue (ex tax & gratuity) and "Event Actual + Unmet Minimum": when
  // the actual falls short of the F&B minimum, the client is still billed the
  // minimum, so the recognised revenue is the greater of the two.
  const actualV = actual != null ? actual : 0;
  const fbmV = fbMin != null ? fbMin : 0;
  payload.tsActual = actualV;
  payload.tsActRev = Math.max(actualV, fbmV);
  return { extId, payload };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch a location's events via the SEARCH endpoint, one status at a time.
//
// Hard-won lessons (verified empirically against the live API — see the CSV
// report that has 527 real 2026 events for this location):
//  - GET /v1/events.json IGNORES location_id and every date param, and returns
//    events OLDEST-first, so paging it only ever surfaced ancient dead leads.
//  - GET /v1/events/search.json returns FULL event objects (financials, guest
//    count, booking, account — no per-event detail fetch needed) as
//    { total_pages, results: [ {event:{…}} ] }, 50 per page.
//  - It honours `status`, `order=event_start` and `sort_direction=desc`. Date
//    params are all ignored, and location_id only biases (≈60% match), so we
//    filter location + date range CLIENT-side.
//  - Ordering by event_start desc + a real status (DEFINITE/CLOSED/TENTATIVE)
//    lands directly on the 2026 bookings; the junk far-future placeholder dates
//    (2035, 2609, …) live only on PROSPECT/LOST leads, which we don't request.
//
// So: for each wanted status, page desc, keep this location's in-range events,
// and stop once a page's newest event predates `since` (everything older
// follows). Deleted/test bookings are skipped.
async function fetchLocationEventsSearch(
  token: string,
  locId: any,
  opts: { statuses: string[]; since: string | null; until: string | null; maxPagesPerStatus: number },
) {
  const wantStatuses = (opts.statuses && opts.statuses.length ? opts.statuses : ["DEFINITE", "CLOSED", "TENTATIVE"])
    .map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  const collected = new Map<string, any>();
  const pagesByStatus: Record<string, number> = {};
  let scanned = 0, truncated = false, rateLimited = false;
  const CONC = 5; // pages fetched concurrently per wave (search endpoint is ~4s/call)

  // Fetch one page, retrying through rate limits.
  const fetchPage = async (st: string, page: number): Promise<{ rows: any[]; totalPages: number }> => {
    for (let retry = 0; retry <= 3; retry++) {
      const u = `/v1/events/search.json?location_id=${locId}&status=${encodeURIComponent(st)}&order=event_start&sort_direction=desc&page=${page}`;
      const r = await fetch(`${TS_BASE}${u}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (r.status === 429) { rateLimited = true; await sleep(1200 * (retry + 1)); continue; }
      if (r.status < 200 || r.status >= 300) return { rows: [], totalPages: 0 };
      const j = await r.json().catch(() => null);
      return { rows: ((j && j.results) || []).map((e: any) => itemOf(e, "event")), totalPages: (j && j.total_pages) || 1 };
    }
    return { rows: [], totalPages: 0 };
  };

  // Collect this location's in-range events from a page; return the page's
  // newest event date (used to know when we've paged past `since`).
  const processRows = (rows: any[]): string => {
    let pageMax = "";
    for (const e of rows) {
      const d = evDateOf(e);
      if (d && d > pageMax) pageMax = d;
      if (String(firstDefined(dig(e, "location_id"), dig(e, "location.id")) ?? "") !== String(locId)) continue;
      if (firstDefined(dig(e, "deleted_at"), dig(e, "booking.deleted_at"))) continue; // skip deleted/test bookings
      if (opts.since && d && d < opts.since) continue;
      if (opts.until && d && d > opts.until) continue;
      const id = String(firstDefined(dig(e, "id"), dig(e, "event_id"), ""));
      if (id) collected.set(id, e);
    }
    return pageMax;
  };

  for (const st of wantStatuses) {
    // Page 1 tells us total_pages; every subsequent page fetched in concurrent
    // waves, stopping the wave after any page's newest event predates `since`
    // (desc order → the rest are older). We may over-read up to CONC-1 pages
    // past the boundary; those rows are simply filtered out.
    const p1 = await fetchPage(st, 1);
    scanned += p1.rows.length;
    let stop = !p1.rows.length;
    const p1Max = processRows(p1.rows);
    if (opts.since && p1Max && p1Max < opts.since) stop = true;
    pagesByStatus[st] = 1;
    const totalPages = Math.min(p1.totalPages || 1, opts.maxPagesPerStatus);
    let next = 2;
    while (!stop && next <= totalPages) {
      const batch: number[] = [];
      for (let p = next; p < next + CONC && p <= totalPages; p++) batch.push(p);
      const res = await Promise.all(batch.map((p) => fetchPage(st, p).then((r) => ({ p, ...r }))));
      res.sort((a, b) => a.p - b.p);
      for (const rr of res) {
        scanned += rr.rows.length;
        const mx = processRows(rr.rows);
        pagesByStatus[st] = Math.max(pagesByStatus[st] || 0, rr.p);
        if (!rr.rows.length) stop = true;
        if (opts.since && mx && mx < opts.since) stop = true;
      }
      next += CONC;
      if (next > opts.maxPagesPerStatus) { truncated = true; break; }
      if (!stop) await sleep(120);
    }
  }
  return { events: [...collected.values()], scanned, truncated, rateLimited, pagesByStatus, statusesQueried: wantStatuses };
}


// Status + date accessors used to filter the fetched event list before we spend
// detail fetches on events we won't import.
function evStatusOf(e: any): string {
  return String(firstDefined(pick(e, ["status", "event_status", "status_name"]), dig(e, "status.name")) || "").toUpperCase();
}
function evDateOf(e: any): string {
  const s = firstDefined(pick(e, ["event_start_iso8601", "event_date_iso8601", "start_date", "event_start", "event_date", "date"]), dig(e, "event_start_at"));
  return toDatePart(s);
}

async function runImport(token: string, venue: string, opts: { commit: boolean; maxEvents: number; statuses: string[]; since: string | null; until: string | null }, gateEmail: string) {
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

  const wantStatuses = (opts.statuses || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  // The search endpoint returns full event objects already scoped to the
  // requested status/location/date window — no per-event detail fetch needed.
  const fetched = await fetchLocationEventsSearch(token, loc.matched.id, {
    statuses: wantStatuses, since: opts.since, until: opts.until, maxPagesPerStatus: 40,
  });
  result.statusesQueried = fetched.statusesQueried;
  result.pagesByStatus = fetched.pagesByStatus;
  result.rawEventsScanned = fetched.scanned;
  result.truncated = fetched.truncated;
  result.rateLimited = fetched.rateLimited;

  const events = fetched.events;
  result.eventsAtLocation = events.length;

  // Status + date breakdown over the events we pulled (all already location- and
  // window-scoped), so the preview can report what matched.
  const statusBreakdown: Record<string, number> = {};
  let minDate: string | null = null, maxDate: string | null = null;
  for (const e of events) {
    const st = evStatusOf(e) || "(none)";
    statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
    const d = evDateOf(e);
    if (d) { if (!minDate || d < minDate) minDate = d; if (!maxDate || d > maxDate) maxDate = d; }
  }
  result.statusBreakdown = statusBreakdown;
  result.dateSpan = { min: minDate, max: maxDate };
  result.filters = { statuses: wantStatuses, since: opts.since, until: opts.until };
  result.eventsFound = events.length;

  const enriched = events.slice(0, opts.maxEvents);
  const mapped = enriched.map((e) => mapEvent(e, venueName));
  result.sample = mapped.slice(0, 3).map((m, i) => ({ extId: m.extId, payload: m.payload, raw: enriched[i] }));

  // Persist a couple of raw+mapped samples for offline inspection/debugging.
  try {
    await svc.from("ts_probe").insert(
      mapped.slice(0, 3).map((m, i) => ({
        run_id: `import-${venue}`,
        label: `event:${m.extId}`,
        url: "/v1/events/search.json",
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
    const maxEvents = Math.max(1, Math.min(10000, +(body?.maxEvents ?? url.searchParams.get("maxEvents") ?? 5000) || 5000));
    const statuses = Array.isArray(body?.statuses) ? body.statuses
      : (url.searchParams.get("statuses") ? url.searchParams.get("statuses")!.split(",") : []);
    const since = (body?.since || url.searchParams.get("since") || null) as string | null;
    const until = (body?.until || url.searchParams.get("until") || null) as string | null;
    try {
      const r = await runImport(token, venue, { commit, maxEvents, statuses, since, until }, gate.email);
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
