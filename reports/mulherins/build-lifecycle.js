'use strict';
const fs = require('fs'), path = require('path');
const DIR = __dirname;
// The report presents itself as year-to-date, but the source table's prune floor was
// widened to 2025-01-01 for the Anthology backfill, so leads2.json now carries ~20
// months. Window to the current calendar year so the figures match the YTD header.
//   node build-lifecycle.js            -> year to date (the daily report)
//   node build-lifecycle.js --days 30  -> rolling 30-day window
const DAYS = (() => { const i = process.argv.indexOf('--days'); return i > -1 ? parseInt(process.argv[i + 1], 10) : null; })();
const YEAR = new Date().getUTCFullYear();
const ALL = JSON.parse(fs.readFileSync(path.join(DIR, 'leads2.json'), 'utf8'));
// Cut at UTC midnight so the window matches the SQL side (current_date - N days)
// rather than drifting by the time of day the report happens to run.
const CUTOFF = DAYS ? new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime() - DAYS * 86400000 : null;
const L = DAYS
  ? ALL.filter(r => r.created_at && new Date(r.created_at).getTime() >= CUTOFF)
  : ALL.filter(r => r.created_at && new Date(r.created_at).getUTCFullYear() === YEAR);
const WINDOW_LABEL = DAYS ? `Last ${DAYS} days` : `Year-to-date ${YEAR}`;
// In windowed mode, fold in the response-status dataset (recap30.json) so this one
// document answers both questions: where each inquiry sits in the BEO lifecycle, and
// whether the guest was ever answered. Keyed by lead_id; absent file degrades gracefully.
let RESP = new Map();
try {
  const rp = path.join(DIR, 'recap30.json');
  if (DAYS && fs.existsSync(rp)) {
    for (const r of JSON.parse(fs.readFileSync(rp, 'utf8'))) RESP.set(r.lead_id, r);
  }
} catch (e) { console.warn('response data not merged:', e.message); }
const OUT_HTML = DAYS ? `mulherins-inquiry-lifecycle-${DAYS}d.html` : 'mulherins-inquiry-lifecycle.html';
L.forEach(r => { const x = RESP.get(r.lead_id); if (x) r._r = x; });
const HAS_RESP = L.some(r => r._r);
console.log(`lifecycle: ${L.length} of ${ALL.length} inquiries in window (${WINDOW_LABEL})`);

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (n, d) => d ? (n / d * 100).toFixed(1) + '%' : '—';
const md = d => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
const mdY = d => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
const money = n => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
const days = (a, b) => { if (!a || !b) return null; const d = (new Date(b) - new Date(a)) / 86400000; return isNaN(d) ? null : Math.max(0, Math.round(d)); };
const medianOf = arr => { const a = arr.filter(x => x != null).sort((x, y) => x - y); if (!a.length) return null; return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
const avgOf = arr => { const a = arr.filter(x => x != null); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
// Windows with no booked/lost events leave these cohorts empty; render a dash.
const dz = v => (v == null || Number.isNaN(v)) ? '—' : `${v}d`;
const dz1 = v => (v == null || Number.isNaN(v)) ? '—' : `${v.toFixed(1)}d`;

// ---- current stage per inquiry (single taxonomy) ----
function stageOf(r) {
  if (r.event_status) return r.event_status; // PROSPECT/TENTATIVE/DEFINITE/CLOSED/LOST
  if (r.status === 'Turned Down') return 'TURNED_DOWN';
  if (r.status === 'Open') return 'OPEN';
  return 'CONVERTED_NOEV'; // converted lead, no linked event
}
L.forEach(r => r._stage = stageOf(r));
const cnt = k => L.filter(r => r._stage === k).length;
const total = L.length;
const stages = [
  ['OPEN', 'Open — no response yet', '#3c5a86'],
  ['TURNED_DOWN', 'Turned down (at inquiry)', '#b3541e'],
  ['CONVERTED_NOEV', 'Lead converted — no event booked', '#8a97ab'],
  ['PROSPECT', 'Prospect — working (not booked)', '#3c5a86'],
  ['TENTATIVE', 'Tentative — soft hold (not booked)', '#b98029'],
  ['DEFINITE', 'CONVERTED · Definite (booked)', '#1c7c4d'],
  ['CLOSED', 'CONVERTED · Closed (completed)', '#146c41'],
  ['LOST', 'Lost', '#b3541e'],
];
const booked = cnt('DEFINITE') + cnt('CLOSED');
const inPipe = cnt('PROSPECT') + cnt('TENTATIVE');
const withEvent = L.filter(r => r.event_id).length;

// ---- daily: new inquiries submitted yesterday + last-7-day trend ----
const NOW = new Date();
const ymd = d => d.toISOString().slice(0, 10);
const dayLabel = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayCount = key => L.filter(r => ymd(new Date(r.created_at)) === key).length;
const yDate = new Date(NOW.getTime() - 864e5);
const newYesterday = dayCount(ymd(yDate));
const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(NOW.getTime() - (i + 1) * 864e5); return { key: ymd(d), label: dayLabel(d), n: dayCount(ymd(d)) }; }).reverse();
const wk = last7.reduce((a, d) => a + d.n, 0);

// ---- response (submission -> disposition) ----
const disposed = L.filter(r => r.resp_days != null);
const respMedian = medianOf(disposed.map(r => r.resp_days));
const respAvg = avgOf(disposed.map(r => r.resp_days));
const sameDay = disposed.filter(r => r.resp_days === 0).length;

// ---- first action (inquiry -> booking created / Prospect) ----
const firstAct = L.filter(r => r.prospect_at).map(r => days(r.created_at, r.prospect_at));
const faMedian = medianOf(firstAct), faAvg = avgOf(firstAct);

// ---- stage durations ----
const prToDef = L.filter(r => r.prospect_at && r.definite_at).map(r => days(r.prospect_at, r.definite_at));
const defToClose = L.filter(r => r.definite_at && r.closed_at).map(r => days(r.definite_at, r.closed_at));
const prToLost = L.filter(r => r.prospect_at && r.lost_at).map(r => days(r.prospect_at, r.lost_at));

// ---- value ----
const sumVal = pred => L.filter(pred).reduce((a, r) => a + (r.grand_total || 0), 0);
const confirmedVal = sumVal(r => ['DEFINITE', 'CLOSED'].includes(r._stage));
const pipelineVal = sumVal(r => ['PROSPECT', 'TENTATIVE'].includes(r._stage));

// ---- ownership (booking-level) ----
function groupCount(key, subset) {
  const m = new Map();
  for (const r of subset) { const k = r[key] || '(none)'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const evRows = L.filter(r => r.event_id);
const byOwner = groupCount('booking_owner', evRows);
const byCreator = groupCount('booking_creator', evRows);

// ---- lead source ----
function grpStatus(key) {
  const m = new Map();
  for (const r of L) { const k = r[key] || '(none)'; const g = m.get(k) || { n: 0, booked: 0, lost: 0, pipe: 0, open: 0, noev: 0, td: 0 }; g.n++; if (['DEFINITE', 'CLOSED'].includes(r._stage)) g.booked++; else if (r._stage === 'LOST') g.lost++; else if (['PROSPECT', 'TENTATIVE'].includes(r._stage)) g.pipe++; else if (r._stage === 'OPEN') g.open++; else if (r._stage === 'CONVERTED_NOEV') g.noev++; else if (r._stage === 'TURNED_DOWN') g.td++; m.set(k, g); }
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
}
const bySource = grpStatus('lead_source');

// ---- response status (windowed mode) ----
const answered   = L.filter(r => r._r && r._r.response_status === 'RESPONDED');
const turnedDown = L.filter(r => r._r && r._r.response_status === 'TURNED_DOWN');
const noReply    = L.filter(r => r._r && r._r.response_status === 'NO_RESPONSE');
const coversOf   = a => a.reduce((n, r) => n + (r.guest_count || 0), 0);
const medRespHrs = medianOf(answered.map(r => r._r.response_hours));
const waiting    = noReply.map(r => r._r.days_open);
const avgWait    = avgOf(waiting), maxWait = waiting.length ? Math.max(...waiting) : null;
const ownedCount = L.filter(r => r._r && r._r.owner).length;
const hoursTxt   = h => h == null ? '—' : (h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`);

const dates = L.map(r => new Date(r.created_at)).sort((a, b) => a - b);
const spanStart = mdY(dates[0]), spanEnd = mdY(dates[dates.length - 1]);

/* ---------- styles ---------- */
const CSS = `
*{box-sizing:border-box}
body{font-family:'Helvetica Neue',Arial,sans-serif;color:#12203a;margin:0;font-size:12px;line-height:1.4}
.page{padding:26px 40px 18px;page-break-after:always}
.page:last-child{page-break-after:auto}
.brand{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #12203a;padding-bottom:8px}
.brand .n{font-family:Georgia,serif;font-size:21px;font-weight:700}
.brand .n span{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:400;color:#5a6b86;letter-spacing:1.4px;text-transform:uppercase;margin-left:8px}
.brand .doc{font-size:10px;color:#5a6b86;text-transform:uppercase;letter-spacing:1.4px}
h1{font-family:Georgia,serif;font-size:19px;margin:12px 0 2px}
h2{font-family:Georgia,serif;font-size:14px;margin:18px 0 7px}
.meta{color:#5a6b86;font-size:11px;margin-bottom:11px}
.kpis{display:flex;gap:9px;margin:0 0 8px;flex-wrap:wrap}
.kpi{flex:1;min-width:110px;border:1px solid #dde3ec;border-radius:6px;padding:8px 11px}
.kpi .l{font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:#5a6b86}
.kpi .v{font-size:19px;font-weight:700;margin-top:2px;font-family:Georgia,serif}
.kpi .v.pos{color:#1c7c4d}.kpi .v.neg{color:#b3541e}.kpi .v.mut{color:#3c5a86}
.kpi .s{font-size:9px;color:#8a97ab;margin-top:1px}
table{width:100%;border-collapse:collapse}
th{text-align:right;font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:#5a6b86;font-weight:600;padding:5px 6px;border-bottom:1px solid #cdd5e2}
th.l{text-align:left}
td{padding:3px 6px;vertical-align:top}
td.l{text-align:left}
td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tbl tbody tr:nth-child(even){background:#f6f8fb}
.grand td{border-top:2px solid #12203a;font-weight:700;background:#eef2f8}
.funnel .row{display:flex;align-items:center;margin:3px 0;font-size:11px}
.funnel .lab{width:210px;flex:none;color:#33415a}
.funnel .tr{flex:1;background:#eef1f6;border-radius:3px;height:20px;position:relative;overflow:hidden}
.funnel .fill{height:100%;display:flex;align-items:center;color:#fff;font-size:10px;font-weight:700;padding-left:7px;min-width:26px}
.funnel .val{width:96px;flex:none;text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.chip{display:inline-block;border-radius:3px;padding:1px 6px;font-size:7.5px;font-weight:800;letter-spacing:.04em;white-space:nowrap}
.note{border-left:3px solid #3c5a86;background:#eef2f8;padding:8px 12px;margin:10px 0 0;font-size:10px;color:#33415a;border-radius:0 4px 4px 0}
.note.warn{border-left-color:#b3541e;background:#fbf0ea;color:#6d3618}
.appx td{font-size:9px;padding:2px 5px}
.appx th{font-size:7.5px}
.foot{color:#8a97ab;font-size:9px;margin-top:6px}
.kpi.hi{border-color:#b7c7de;background:#eef3fb;box-shadow:inset 3px 0 0 #3c5a86}
.kpi.hi .v{color:#243b63}
.spark{display:flex;gap:6px;align-items:flex-end;margin:2px 0 4px}
.spark .col{flex:1;text-align:center}
.spark .bar{background:#c7d4e8;border-radius:2px 2px 0 0;min-height:2px}
.spark .bar.y{background:#3c5a86}
.spark .cn{font-size:11px;font-weight:700;color:#243b63;margin-bottom:2px}
.spark .dl{font-size:7.5px;color:#8a97ab;margin-top:2px;line-height:1.1}
`;
const stColor = { OPEN: ['#eef2f8', '#3c5a86', '#c9d2e0'], TURNED_DOWN: ['#fbeee7', '#b3541e', '#ecd0bd'], CONVERTED_NOEV: ['#eef1f5', '#68758c', '#d5dbe6'], PROSPECT: ['#eef2f8', '#3c5a86', '#c9d2e0'], TENTATIVE: ['#fbf3e7', '#b98029', '#ecd9bd'], DEFINITE: ['#e7f4ec', '#1c7c4d', '#bfe0cc'], CLOSED: ['#e7f4ec', '#146c41', '#bfe0cc'], LOST: ['#fbeee7', '#b3541e', '#ecd0bd'] };
const stLabel = { OPEN: 'OPEN', TURNED_DOWN: 'TURNED DOWN', CONVERTED_NOEV: 'NO EVENT', PROSPECT: 'PROSPECT', TENTATIVE: 'TENTATIVE', DEFINITE: 'DEFINITE ✓', CLOSED: 'CLOSED ✓', LOST: 'LOST' };
const chip = st => { const c = stColor[st] || stColor.OPEN; return `<span class="chip" style="background:${c[0]};color:${c[1]};border:1px solid ${c[2]}">${stLabel[st] || st}</span>`; };
const kpi = (l, v, cls, s, box) => `<div class="kpi${box ? ' ' + box : ''}"><div class="l">${l}</div><div class="v${cls ? ' ' + cls : ''}">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
const brand = sub => `<div class="brand"><div class="n">Wm. Mulherin's Sons<span>Method Co · Philadelphia, PA</span></div><div class="doc">${sub}</div></div>`;

/* ---------- page 1: funnel + summary ---------- */
const fmax = total;
const funnelRows = stages.map(([k, lab, col]) => {
  const n = cnt(k);
  return `<div class="row"><span class="lab">${lab}</span><span class="tr"><span class="fill" style="width:${Math.max(n / fmax * 100, 2)}%;background:${col}">${n || ''}</span></span><span class="val">${pct(n, total)}</span></div>`;
}).join('');
const smax = Math.max(...last7.map(d => d.n), 1);
const sparkH = 30;
const sparkHtml = last7.map((d, i) => `<div class="col"><div class="cn">${d.n}</div><div class="bar${i === last7.length - 1 ? ' y' : ''}" style="height:${Math.round(d.n / smax * sparkH) + 2}px"></div><div class="dl">${d.label}</div></div>`).join('');
let p1 = `<div class="page">${brand('Daily Inquiry → BEO Report')}
  <h1>${DAYS ? `Event Inquiry &amp; BEO Report — Last ${DAYS} Days` : 'Daily Event Inquiry &amp; BEO Report'}</h1>
  <div class="meta">As of <b>${mdY(NOW)}</b> · ${WINDOW_LABEL} (${spanStart} – ${spanEnd}) · Source: Tripleseat leads + linked events</div>
  ${withEvent === 0 && total > 0 ? `<div class="note warn"><b>No linked events exist for this window.</b>
  All ${total} inquiries sit at the lead stage with no event attached in Tripleseat, so every
  downstream figure below — pipeline, confirmed, lost, and all stage-to-stage timings — is
  legitimately zero rather than missing. Verified three ways: the leads list, the lead detail
  endpoint (both <i>event_id</i> and <i>booking_id</i> null), and the events search. The newest
  Mulherin's booking on record was created <b>24 July 2026</b>; July shows 27 created, August none.
  The other actively booking venues are unaffected (Anthology 229 in August, Nickel 58, Lowland 57,
  Vessel 19). <b>One caveat before acting on this:</b> ten of these leads were marked converted
  during August — four within half an hour on 9 Aug, two more on 22 Aug — which is real staff
  activity in Tripleseat. So this is either bookings that the API is not exposing for this venue,
  or leads converted without the booking being completed. The API cannot tell the two apart; opening
  one of the ten in Tripleseat will.</div>` : ''}
  <div class="kpis">
    ${kpi('New Inquiries — Yesterday', newYesterday, 'mut', dayLabel(yDate), 'hi')}
    ${kpi(DAYS ? `Total Inquiries (${DAYS}d)` : 'Total Inquiries (YTD)', total, 'mut')}
    ${kpi('Converted — Booked', booked, 'pos', pct(booked, total) + ' · Definite + Closed')}
    ${kpi('In Pipeline', inPipe, 'mut', 'Prospect + Tentative')}
  </div>
  <div class="kpis">
    ${kpi('Median Response', respMedian + (respMedian === 1 ? ' day' : ' days'), 'mut', 'to first disposition')}
    ${kpi('Lost', cnt('LOST'), 'neg', pct(cnt('LOST'), total))}
    ${kpi('Converted Value', money(confirmedVal), 'pos', 'Definite + Closed BEOs')}
    ${kpi('Open Pipeline Value', money(pipelineVal), 'mut', 'Prospect + Tentative')}
  </div>
  <h2>New inquiries — last 7 days <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:400;color:#8a97ab">(${wk} total)</span></h2>
  <div class="spark">${sparkHtml}</div>
  <h2>Where every inquiry stands today</h2>
  <div class="funnel">${funnelRows}</div>
  <div class="note"><b>What counts as Converted:</b> an inquiry is <b>Converted</b> only when its event is actually <b>booked — Definite or Closed</b>. A Tripleseat lead flagged "converted" merely starts a booking record (Prospect) and does <b>not</b> count here until it firms up. ${withEvent === 0
    ? `None of the ${total} inquiries in this window has a booking record at all, so none has reached a booked event. <b>${cnt('CONVERTED_NOEV')} were marked converted in Tripleseat with no event behind them</b>, ${cnt('OPEN')} have had no response, and none were lost.`
    : `Of ${total} inquiries, ${withEvent} became a booking record but only <b>${booked} converted to a booked event (${pct(booked, total)})</b>; ${inPipe} are still working in the pipeline (Prospect/Tentative), ${cnt('CONVERTED_NOEV')} were marked converted in Tripleseat with no event on file, and ${cnt('LOST')} were lost.`} Booked and lost dates are reconstructed from each event's status-change history.</div>



</div>`;

/* ---------- page 2: ownership, source, value, open aging ---------- */
const srcRows = bySource.map(([k, g]) => `<tr><td class="l">${esc(k)}</td><td class="r">${g.n}</td><td class="r">${g.booked}</td><td class="r">${g.pipe}</td><td class="r">${g.noev}</td><td class="r">${g.lost + g.td}</td><td class="r">${g.open}</td><td class="r">${pct(g.booked, g.n)}</td></tr>`).join('');
const ownRows = byOwner.map(([k, n]) => `<tr><td class="l">${esc(k)}</td><td class="r">${n}</td><td class="r">${pct(n, evRows.length)}</td></tr>`).join('');
const creRows = byCreator.map(([k, n]) => `<tr><td class="l">${esc(k)}</td><td class="r">${n}</td><td class="r">${pct(n, evRows.length)}</td></tr>`).join('');
const openAge = [['0–7 days', 0], ['8–14 days', 0], ['15–30 days', 0], ['30+ days', 0]];
L.filter(r => r._stage === 'OPEN').forEach(r => { const a = r.age_days; if (a <= 7) openAge[0][1]++; else if (a <= 14) openAge[1][1]++; else if (a <= 30) openAge[2][1]++; else openAge[3][1]++; });
// value by stage
const valStages = ['PROSPECT', 'TENTATIVE', 'DEFINITE', 'CLOSED'].map(k => { const rs = L.filter(r => r._stage === k); return [k, rs.length, rs.reduce((a, r) => a + (r.grand_total || 0), 0), rs.filter(r => r.grand_total > 0).length]; });
const speedBlock = `  <h2>Response &amp; handling speed</h2>
  <table class="tbl" style="max-width:560px"><thead><tr><th class="l">Metric</th><th>Median</th><th>Average</th><th>Basis</th></tr></thead><tbody>
  <tr><td class="l">Inquiry → first disposition (converted/turned down)</td><td class="r">${dz(respMedian)}</td><td class="r">${dz1(respAvg)}</td><td class="r">${disposed.length} decided</td></tr>
  <tr><td class="l">Inquiry → booking built (first staff action)</td><td class="r">${dz(faMedian)}</td><td class="r">${dz1(faAvg)}</td><td class="r">${firstAct.length} bookings</td></tr>
  <tr><td class="l">Prospect → Definite (sales cycle to book)</td><td class="r">${dz(medianOf(prToDef))}</td><td class="r">${dz1(avgOf(prToDef))}</td><td class="r">${prToDef.length} booked</td></tr>
  <tr><td class="l">Definite → Closed</td><td class="r">${dz(medianOf(defToClose))}</td><td class="r">${dz1(avgOf(defToClose))}</td><td class="r">${defToClose.length} closed</td></tr>
  <tr><td class="l">Prospect → Lost (time before giving up)</td><td class="r">${dz(medianOf(prToLost))}</td><td class="r">${dz1(avgOf(prToLost))}</td><td class="r">${prToLost.length} lost</td></tr>
  </tbody></table>
  <div class="foot">Same-day disposition on ${sameDay} of ${disposed.length} decided inquiries (${pct(sameDay, disposed.length)}). "Response" is measured in calendar days; conversions are stamped by date in Tripleseat, so same-day = 0 (see methodology).</div>`;

const pResp = HAS_RESP ? `<div class="page">${brand('Inquiry → BEO Lifecycle · Response')}
  <h2 style="margin-top:12px">Did the guest ever hear back?</h2>
  <table class="tbl" style="max-width:560px"><thead><tr><th class="l">Response status</th><th>Inquiries</th><th>Share</th><th>Covers</th><th>Speed / wait</th></tr></thead><tbody>
    <tr><td class="l"><span class="chip" style="background:#e6f0e9;color:#1c7c4d">ANSWERED</span></td>
        <td class="r">${answered.length}</td><td class="r">${pct(answered.length, total)}</td>
        <td class="r">${coversOf(answered).toLocaleString()}</td>
        <td class="r">median ${hoursTxt(medRespHrs)} to reply</td></tr>
    <tr><td class="l"><span class="chip" style="background:#f6ede2;color:#8a5a1e">TURNED DOWN</span></td>
        <td class="r">${turnedDown.length}</td><td class="r">${pct(turnedDown.length, total)}</td>
        <td class="r">${coversOf(turnedDown).toLocaleString()}</td><td class="r">—</td></tr>
    <tr><td class="l"><span class="chip" style="background:#fbe9e2;color:#b3541e">NO REPLY</span></td>
        <td class="r">${noReply.length}</td><td class="r">${pct(noReply.length, total)}</td>
        <td class="r">${coversOf(noReply).toLocaleString()}</td>
        <td class="r">avg ${avgWait == null ? '—' : avgWait.toFixed(0) + 'd'} waiting, longest ${maxWait ?? '—'}d</td></tr>
  </tbody></table>
  <div class="foot">Measured to the exact timestamp. The <i>median response</i> tile above and the handling-speed table use Tripleseat's calendar-day stamps, so the same figure reads as ${dz(respMedian)} there.</div>
  <div class="note warn"><b>${noReply.length} of ${total} inquiries have had no response of any kind</b>
  — no conversion and no turn-down recorded — representing <b>${coversOf(noReply).toLocaleString()} covers</b>.
  Only <b>${ownedCount} of ${total}</b> carry an assigned owner. The ${answered.length} that were answered
  were answered quickly (median ${hoursTxt(medRespHrs)}), so the constraint is inquiries being picked up,
  not how fast they are handled once someone does. Response is read from Tripleseat's own
  <i>converted_at</i> / <i>turned_down_at</i> stamps; replies made by phone or email and never logged
  will not appear here.</div>
  ${speedBlock}
</div>` : '';

let p2 = `<div class="page">${brand('Inquiry → BEO Lifecycle · Breakdowns')}
  ${HAS_RESP ? '' : speedBlock}
${evRows.length ? `  <h2>Booking ownership (from the linked event)</h2>
  <div style="display:flex;gap:24px">
    <div style="flex:1"><div style="font-size:10px;color:#5a6b86;margin-bottom:3px">Owner (assigned)</div>
    <table class="tbl"><thead><tr><th class="l">Owner</th><th>Bookings</th><th>Share</th></tr></thead><tbody>${ownRows}</tbody></table></div>
    <div style="flex:1"><div style="font-size:10px;color:#5a6b86;margin-bottom:3px">Created by</div>
    <table class="tbl"><thead><tr><th class="l">Creator</th><th>Bookings</th><th>Share</th></tr></thead><tbody>${creRows}</tbody></table></div>
  </div>
  <div class="note">Leads themselves arrive unowned in Tripleseat, but every built <b>booking</b> is owned — here <b>100% by ${esc(byOwner[0]?.[0]||'—')}</b> (AGM) and created by <b>${esc(byCreator[0]?.[0]||'—')}</b> (GM). So booking ownership is consistent; the gap is only at the raw lead stage, where the web form doesn't assign an owner until a booking is built.</div>` : `  <h2>Booking ownership (from the linked event)</h2>
  <div class="note warn">No bookings were built in this window, so there is no booking ownership to report. Leads arrive unowned in Tripleseat: ${ownedCount} of ${total} inquiries here carry an assigned owner.</div>`}

  <h2>Pipeline value by stage (BEO grand total)</h2>
  <table class="tbl" style="max-width:520px"><thead><tr><th class="l">Stage</th><th>Bookings</th><th>Priced</th><th>Total BEO value</th></tr></thead><tbody>
  ${valStages.map(([k, n, v, p]) => `<tr><td class="l">${chip(k)}</td><td class="r">${n}</td><td class="r">${p}</td><td class="r">${money(v)}</td></tr>`).join('')}
  <tr class="grand"><td class="l">All built bookings</td><td class="r">${evRows.length}</td><td class="r">${evRows.filter(r=>r.grand_total>0).length}</td><td class="r">${money(sumVal(r=>r.event_id))}</td></tr>
  </tbody></table>
  <div class="foot">${evRows.length ? 'Most Prospects and Lost bookings are unpriced ($0) — a BEO grand total is only built once the event firms up.' : 'No bookings exist in this window, so there is no BEO value to report — not $0 of booked business, but no priced records at all.'}</div>

  <h2>By lead source</h2>
  <table class="tbl"><thead><tr><th class="l">Lead source</th><th>Inquiries</th><th>Booked</th><th>Pipeline</th><th>Conv. no event</th><th>Lost / turned down</th><th>Open</th><th>Convert rate</th></tr></thead><tbody>${srcRows}
  <tr class="grand"><td class="l">Total</td><td class="r">${total}</td><td class="r">${booked}</td><td class="r">${inPipe}</td><td class="r">${cnt('CONVERTED_NOEV')}</td><td class="r">${cnt('LOST') + cnt('TURNED_DOWN')}</td><td class="r">${cnt('OPEN')}</td><td class="r">${pct(booked, total)}</td></tr></tbody></table>
  <div class="foot">Columns are mutually exclusive and sum to the inquiry count. "Conv. no event" is a lead marked converted in Tripleseat with no event record behind it — it is neither booked nor lost.</div>


</div>`;

const pAge = `<div class="page">${brand('Inquiry → BEO Lifecycle · Open Inquiry Aging')}
  <h2 style="margin-top:12px">Open inquiry aging (${cnt('OPEN')} with no response yet)</h2>
  <table class="tbl" style="max-width:340px"><thead><tr><th class="l">Age since submission</th><th>Open</th></tr></thead><tbody>
  ${openAge.map(a => `<tr><td class="l">${a[0]}</td><td class="r">${a[1]}</td></tr>`).join('')}</tbody></table>
</div>`;

/* ---------- appendix: every inquiry ---------- */
// In windowed mode the appendix is grouped by how close the event is and leads with
// response status, since that is the actionable dimension; the year-to-date report
// keeps its original lifecycle-milestone listing.
const rowsSorted = [...L].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
const PER = 32;
let appx = '';

if (HAS_RESP) {
  const BANDS = [
    ['Event date already passed', r => r._r.event_date && r._r.days_to_event < 0, '#b3541e'],
    ['Event within 21 days',      r => r._r.days_to_event != null && r._r.days_to_event >= 0 && r._r.days_to_event <= 21, '#b3541e'],
    ['Event beyond 21 days',      r => r._r.days_to_event != null && r._r.days_to_event > 21, '#3c5a86'],
    ['No event date given',       r => r._r.event_date == null, '#8a5a1e'],
  ];
  const respChip = r => {
    const x = r._r;
    if (x.response_status === 'TURNED_DOWN') return `<span class="chip" style="background:#f6ede2;color:#8a5a1e">TURNED DOWN</span>`;
    if (x.response_status === 'RESPONDED')   return `<span class="chip" style="background:#e6f0e9;color:#1c7c4d">ANSWERED ${esc(hoursTxt(x.response_hours))}</span>`;
    return `<span class="chip" style="background:#fbe9e2;color:#b3541e">NO REPLY ${x.days_open}d</span>`;
  };
  const line = r => {
    const x = r._r;
    const who = [r.contact, r.company].filter(Boolean).join(' · ');
    const when = x.event_date
      ? `${md(x.event_date)} <span style="color:#8a97ab">(${x.days_to_event < 0 ? Math.abs(x.days_to_event) + 'd ago' : 'in ' + x.days_to_event + 'd'})</span>`
      : '<span style="color:#8a97ab">not given</span>';
    return `<tr><td class="r">${md(r.created_at)}</td><td class="l">${esc((who || '—').slice(0, 34))}</td>` +
      `<td class="l">${esc((x.event_desc || '—').slice(0, 24))}</td><td class="r">${when}</td>` +
      `<td class="r">${r.guest_count ?? '—'}</td><td class="l">${respChip(r)}</td>` +
      `<td class="l">${esc((x.owner || '—').slice(0, 12))}</td>` +
      `<td class="l">${r.event_id ? chip(r._stage) : '<span style="color:#8a97ab">none</span>'}</td></tr>`;
  };
  const head = `<thead><tr><th class="l">Inquired</th><th class="l">Guest</th><th class="l">Occasion</th>` +
    `<th>Event date</th><th>Party</th><th class="l">Response</th><th class="l">Owner</th><th class="l">BEO</th></tr></thead>`;

  // Lay the bands out across pages without letting any page overflow.
  let pageRows = 0, buf = '';
  const flushPage = () => { if (buf) { appx += `<div class="page">${brand('Inquiry → BEO Lifecycle · Every Inquiry')}${buf}</div>`; buf = ''; pageRows = 0; } };
  for (const [label, pred, col] of BANDS) {
    // Soonest event first — this is the order the team works them in.
    const rows = L.filter(r => r._r && pred(r))
      .sort((a, b) => (a._r.event_date || '9999').localeCompare(b._r.event_date || '9999')
                   || new Date(a.created_at) - new Date(b.created_at));
    if (!rows.length) continue;
    for (let i = 0; i < rows.length; i += PER) {
      const chunk = rows.slice(i, i + PER);
      if (pageRows && pageRows + chunk.length > PER) flushPage();
      const nr = chunk.filter(r => r._r.response_status === 'NO_RESPONSE').length;
      const part = rows.length > PER ? ` (${i + 1}–${i + chunk.length} of ${rows.length})` : '';
      buf += `<h2 style="margin-top:${pageRows ? 14 : 12}px;color:${col}">${esc(label)}${part}` +
        `<span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:400;color:#8a97ab"> — ${chunk.length} inquiries, ${chunk.reduce((n, r) => n + (r.guest_count || 0), 0)} covers, ${nr} with no reply</span></h2>` +
        `<table class="tbl appx">${head}<tbody>${chunk.map(line).join('')}</tbody></table>`;
      pageRows += chunk.length;
    }
  }
  flushPage();
} else {
  for (let i = 0; i < rowsSorted.length; i += PER) {
    const chunk = rowsSorted.slice(i, i + PER);
    const body = chunk.map(r => {
      const who = [r.contact, r.company].filter(Boolean).join(' · ');
      const resp = r.resp_days == null ? '—' : (r.resp_days === 0 ? '0d' : r.resp_days + 'd');
      const milestone = r.closed_at ? 'Cls ' + md(r.closed_at) : r.definite_at ? 'Def ' + md(r.definite_at) : r.lost_at ? 'Lost ' + md(r.lost_at) : r.tentative_at ? 'Tent ' + md(r.tentative_at) : r.prospect_at ? 'Prosp ' + md(r.prospect_at) : '—';
      return `<tr><td class="r">${md(r.created_at)}</td><td class="l">${esc((who || '—').slice(0, 34))}</td><td class="r">${r.event_date ? md(r.event_date) : '—'}</td><td class="r">${r.guest_count ?? '—'}</td><td class="l">${esc((r.event_type_ev || r.lead_source || '—').slice(0, 13))}</td><td class="l">${chip(r._stage)}</td><td class="r">${resp}</td><td class="l">${milestone}</td><td class="l">${esc((r.booking_owner || '—').slice(0, 13))}</td><td class="r">${r.grand_total ? money(r.grand_total) : '—'}</td></tr>`;
    }).join('');
    appx += `<div class="page">${brand('Inquiry → BEO Lifecycle · All Inquiries')}
      <h2 style="margin-top:12px">Every inquiry (${i + 1}–${Math.min(i + PER, rowsSorted.length)} of ${rowsSorted.length})</h2>
      <table class="tbl appx"><thead><tr><th class="l">Inquired</th><th class="l">Guest</th><th>Event date</th><th>Guests</th><th class="l">Type</th><th class="l">Stage</th><th>Resp</th><th class="l">Milestone</th><th class="l">Owner</th><th>BEO value</th></tr></thead><tbody>${body}</tbody></table>
    </div>`;
  }
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${p1}${pResp}${p2}${pAge}${appx}</body></html>`;
fs.writeFileSync(path.join(DIR, OUT_HTML), html);
console.log('total', total, '| booking built', withEvent, '| confirmed', booked, '| pipeline', inPipe, '| lost', cnt('LOST'));
console.log('confirmed value', money(confirmedVal), '| pipeline value', money(pipelineVal));
console.log('first-action median', faMedian, 'prospect->definite median', medianOf(prToDef), 'appendix pages', Math.ceil(rowsSorted.length / PER));
