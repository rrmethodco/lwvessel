import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
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
function itemOf(o, key) { return (o && typeof o === "object" && o[key] && typeof o[key] === "object" && !Array.isArray(o[key])) ? o[key] : o; }
function dig(o, path){ let c=o; for(const s of path.split('.')){ if(c==null||typeof c!=='object') return undefined; c=c[s]; } return c===''?undefined:c; }
const firstDef=(...v)=>{ for(const x of v) if(x!==null&&x!==undefined&&x!=='') return x; };
const iso = (s) => { if (!s) return null; const d = new Date(String(s)); return isNaN(d.getTime()) ? null : d.toISOString(); };
const dOnly = (s) => { if (!s) return null; const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; const d=new Date(String(s)); return isNaN(d.getTime())?null:d.toISOString().slice(0,10); };
const nm = (o) => o ? [o.first_name, o.last_name].filter(Boolean).join(" ").trim() || null : null;
const num=(v)=> (v===null||v===undefined||v==='')?null:(typeof v==='number'?v:parseFloat(String(v).replace(/[$,]/g,''))||null);
function evStart(e){ const s=firstDef(e.event_start_iso8601,e.event_date_iso8601,e.event_start,e.event_date,e.start_date); return dOnly(s)||''; }
async function page(token, loc, status, pg){
  for(let r=0;r<=3;r++){
    const u=`/v1/events/search.json?location_id=${loc}&status=${status}&order=event_start&sort_direction=desc&page=${pg}`;
    const res=await fetch(TS_BASE+u,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
    if(res.status===429){ await new Promise(x=>setTimeout(x,1200*(r+1))); continue; }
    if(res.status<200||res.status>=300) return {rows:[],total:0};
    const j=await res.json().catch(()=>null);
    return {rows:((j&&j.results)||[]).map(e=>itemOf(e,'event')), total:(j&&j.total_pages)||1};
  }
  return {rows:[],total:0};
}
Deno.serve(async (req) => {
  const started = Date.now();
  const url = new URL(req.url); const body = await req.json().catch(() => ({}));
  const qp = (k, d) => url.searchParams.get(k) ?? body[k] ?? d;
  if ((url.searchParams.get("secret") || body.secret) !== SECRET) return json({ error: "forbidden" }, 403);
  const loc = String(qp('loc','17784')).trim();
  const supa = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const statuses=String(qp('statuses','DEFINITE,CLOSED,TENTATIVE')).split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);

  // reset=true clears this location's cursors so the next run starts from page 1.
  if (String(qp('reset','')) === 'true') {
    await supa.from('ts_scan_cursor').delete().eq('loc', loc);
    return json({ loc, reset: true });
  }

  const token = await getToken(); if (!token) return json({ tokenError: true });
  const FLOOR = String(qp('floor','2026-01-01'));

  // Page the lead ids. PostgREST caps a single select at 1000 rows, which silently
  // truncated the match set for any venue with more leads than that.
  const wanted = new Set();
  const PAGE = 1000;
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supa.from('ts_lead_report').select('lead_id')
      .eq('location_id', Number(loc)).range(off, off + PAGE - 1);
    if (error || !data || !data.length) break;
    for (const r of data) wanted.add(String(r.lead_id));
    if (data.length < PAGE) break;
  }

  // Resume point per (loc, status). Without this each tick restarted at page 1 and
  // re-read the same early pages until the budget expired, so later pages were never seen.
  const cursors = {};
  {
    const { data } = await supa.from('ts_scan_cursor').select('status,next_page,done').eq('loc', loc);
    for (const c of (data || [])) cursors[String(c.status).toUpperCase()] = c;
  }

  const capPages=parseInt(String(qp('cap','200')),10);
  const budgetMs=parseInt(String(qp('budgetMs','85000')),10);
  const maxUpdates=parseInt(String(qp('maxUpdates','700')),10);
  const onlyMissing = String(qp('onlyMissing','')) === 'true';
  const matched=new Map();
  const scan={}; let timedOut=false;

  for(const st of statuses){
    const cur = cursors[st] || { next_page: 1, done: false };
    if (cur.done) { scan[st] = { done: true, skipped: true }; continue; }
    if (Date.now()-started > budgetMs) { timedOut=true; scan[st]={deferred:true, from:cur.next_page}; continue; }

    const startPage = Math.max(1, Number(cur.next_page) || 1);
    let seen=0, stop=false, total=capPages, p=startPage, reason='';
    const handle=(rows)=>{ let pmax=''; for(const e of rows){ seen++; const d=evStart(e); if(d>pmax)pmax=d; const lid=String(firstDef(dig(e,'lead.id'),dig(e,'lead_id'))??''); if(!lid||!wanted.has(lid)) continue; if(!matched.has(lid)) matched.set(lid,{e,status:st}); } return pmax; };

    let pagesTotal = 0;
    while(true){
      if (Date.now()-started > budgetMs) { timedOut=true; reason='budget'; break; }
      if (matched.size >= maxUpdates) { reason='maxUpdates'; break; }
      const pr = await page(token, loc, st, p);
      if (p === startPage) { pagesTotal = pr.total; total = Math.min(pr.total, capPages); }
      if (!pr.rows.length) { stop=true; reason='empty'; break; }
      const mx = handle(pr.rows);
      p++;
      if (mx && mx < FLOOR) { stop=true; reason='floor'; break; }
      if (p > total) { stop=true; reason='lastPage'; break; }
    }

    // Persist where to pick up. Finished statuses reset to page 1 so a later
    // re-open (reset=true) starts clean.
    const done = stop;
    await supa.from('ts_scan_cursor').upsert({
      loc, status: st, next_page: done ? 1 : p, done, updated_at: new Date().toISOString(),
    }, { onConflict: 'loc,status' });
    scan[st]={ pagesTotal, from:startPage, nextPage: done ? 1 : p, scanned:seen, done, reason };
    if (reason === 'maxUpdates') break;
  }

  let updated=0; const errors=[];
  for(const [lid, {e, status}] of matched){
    if(onlyMissing){ const {data:cur}=await supa.from('ts_lead_report').select('event_status').eq('lead_id',Number(lid)).maybeSingle(); if(cur&&cur.event_status) continue; }
    const bk = (e.booking && typeof e.booking==='object') ? e.booking : {};
    const sc = e.status_changes || e.status_history || null;
    const mkt = bk.market_segment;
    const upd={
      event_id: firstDef(e.id,e.event_id) ?? null,
      event_status: String(e.status||status).toUpperCase(),
      booking_status: bk.status||null,
      booking_owner: nm(bk.owner),
      booking_creator: nm(bk.creator),
      booking_created_at: iso(bk.created_at),
      tentative_date: dOnly(bk.tentative_date),
      definite_date: dOnly(bk.definite_date),
      lost_date: dOnly(bk.lost_date),
      grand_total: num(firstDef(bk.total_event_grand_total, bk.total_grand_total, e.grand_total)),
      fb_min: num(bk.total_food_and_beverage_min),
      guest_count_ev: firstDef(e.guaranteed_guest_count, e.guest_count) ?? null,
      market_segment: (mkt&&typeof mkt==='object')?(mkt.name||null):(mkt||null),
      event_type_ev: (e.event_type&&typeof e.event_type==='object')?(e.event_type.name||null):(e.event_type||null),
      status_timeline: sc,
      enriched: true,
    };
    const { error } = await supa.from('ts_lead_report').update(upd).eq('lead_id', Number(lid));
    if(error) errors.push(error.message); else updated++;
  }
  const allDone = statuses.every(st => scan[st] && (scan[st].done || scan[st].skipped));
  return json({ loc, floor:FLOOR, wantedLeads: wanted.size, matchedLeads: matched.size, updated, timedOut, allDone, scan, elapsedMs: Date.now()-started, errors: errors.slice(0,3) });
});
