'use strict';
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const A = JSON.parse(fs.readFileSync(path.join(DIR, 'chase.json'), 'utf8'));
const TODAY = new Date('2026-08-20T00:00:00Z');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mdY = d => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
const md = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
const money = n => n == null ? null : '$' + Math.round(n).toLocaleString('en-US');
const phoneFmt = p => { if (!p) return ''; const d = String(p).replace(/\D/g, ''); return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : String(p); };

function bucketOf(r) {
  if (r.event_status === 'PROSPECT') return 'PROSPECT';
  if (r.event_status === 'TENTATIVE') return 'TENTATIVE';
  if (r.event_status == null && r.status === 'Converted') return 'NO_EVENT';
  if (r.status === 'Open') return 'OPEN';
  return 'OTHER';
}
function action(b) {
  return { OPEN: 'Respond — no reply logged yet', NO_EVENT: 'Build the BEO / confirm the event', PROSPECT: 'Follow up — advance to Definite', TENTATIVE: 'Close the hold → Definite' }[b] || 'Follow up';
}
function tierOf(dte) {
  if (dte == null) return 'NODATE';
  if (dte < 0) return 'EXPIRED';
  if (dte <= 21) return 'HOT';
  if (dte <= 60) return 'WARM';
  if (dte <= 120) return 'PLAN';
  return 'LATER';
}
A.forEach(r => { r._b = bucketOf(r); r._tier = tierOf(r.days_to_event); r._gst = r.guest_count_ev ?? r.guest_count; });

const live = A.filter(r => ['HOT', 'WARM', 'PLAN', 'LATER'].includes(r._tier)).sort((a, b) => a.days_to_event - b.days_to_event || b.days_stalled - a.days_stalled);
const noDate = A.filter(r => r._tier === 'NODATE').sort((a, b) => b.days_stalled - a.days_stalled);
const expired = A.filter(r => r._tier === 'EXPIRED').sort((a, b) => a.days_to_event - b.days_to_event);
const tierCount = t => live.filter(r => r._tier === t).length;
const hot = live.filter(r => r._tier === 'HOT');

const bChip = { OPEN: ['#eef2f8', '#3c5a86', '#c9d2e0'], NO_EVENT: ['#eef1f5', '#68758c', '#d5dbe6'], PROSPECT: ['#eef2f8', '#3c5a86', '#c9d2e0'], TENTATIVE: ['#fbf3e7', '#b98029', '#ecd9bd'] };
const bLabel = { OPEN: 'OPEN', NO_EVENT: 'NO EVENT', PROSPECT: 'PROSPECT', TENTATIVE: 'TENTATIVE' };
const chip = b => { const c = bChip[b] || bChip.OPEN; return `<span class="chip" style="background:${c[0]};color:${c[1]};border:1px solid ${c[2]}">${bLabel[b] || b}</span>`; };
const tierChip = t => { const c = { HOT: ['#fbe9e7', '#b3261e', '#f0c4bd'], WARM: ['#fbf1e2', '#b5701a', '#eed9b8'], PLAN: ['#eaf2ec', '#2f7d4f', '#c8e0d0'], LATER: ['#eef1f6', '#5a6b86', '#d3dae6'] }[t] || ['#eef1f6', '#5a6b86', '#d3dae6']; return `<span class="chip" style="background:${c[0]};color:${c[1]};border:1px solid ${c[2]}">${t}</span>`; };
const dueTxt = dte => dte == null ? '—' : dte === 0 ? 'today' : dte < 0 ? `${-dte}d ago` : `in ${dte}d`;

const CSS = `
*{box-sizing:border-box}
body{font-family:'Helvetica Neue',Arial,sans-serif;color:#12203a;margin:0;font-size:12px;line-height:1.4}
.page{padding:26px 38px 18px;page-break-after:always}
.page:last-child{page-break-after:auto}
.brand{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #12203a;padding-bottom:8px}
.brand .n{font-family:Georgia,serif;font-size:20px;font-weight:700}
.brand .n span{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:400;color:#5a6b86;letter-spacing:1.3px;text-transform:uppercase;margin-left:8px}
.brand .doc{font-size:10px;color:#5a6b86;text-transform:uppercase;letter-spacing:1.3px}
h1{font-family:Georgia,serif;font-size:19px;margin:12px 0 2px}
h2{font-family:Georgia,serif;font-size:14px;margin:16px 0 6px}
.meta{color:#5a6b86;font-size:11px;margin-bottom:11px}
.kpis{display:flex;gap:9px;margin:0 0 10px;flex-wrap:wrap}
.kpi{flex:1;min-width:104px;border:1px solid #dde3ec;border-radius:6px;padding:8px 11px}
.kpi .l{font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;color:#5a6b86}
.kpi .v{font-size:19px;font-weight:700;margin-top:2px;font-family:Georgia,serif}
.kpi .v.hot{color:#b3261e}.kpi .v.pos{color:#1c7c4d}.kpi .v.mut{color:#3c5a86}
.kpi .s{font-size:9px;color:#8a97ab;margin-top:1px}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:#5a6b86;font-weight:600;padding:5px 6px;border-bottom:1px solid #cdd5e2}
th.r{text-align:right}
td{padding:3px 6px;vertical-align:top;font-size:9.5px}
td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tbl tbody tr{border-bottom:1px solid #eef1f5}
.tbl tbody tr:nth-child(even){background:#f7f9fc}
.chip{display:inline-block;border-radius:3px;padding:1px 6px;font-size:7.5px;font-weight:800;letter-spacing:.03em;white-space:nowrap}
.who{font-weight:600;color:#12203a}
.sub{color:#7a879c;font-size:8.5px}
.ci{font-variant-numeric:tabular-nums;color:#33415a;font-size:9px;white-space:nowrap}
.act{color:#33415a;font-size:9px}
.note{border-left:3px solid #b3261e;background:#fbeeec;padding:8px 12px;margin:8px 0 12px;font-size:10px;color:#7a2a22;border-radius:0 4px 4px 0}
.note.blue{border-color:#3c5a86;background:#eef2f8;color:#33415a}
.foot{color:#8a97ab;font-size:9px;margin-top:6px}
.hotcard{border:1px solid #f0c4bd;border-left:4px solid #b3261e;border-radius:5px;padding:8px 12px;margin:6px 0;display:flex;justify-content:space-between;gap:12px}
.hotcard .L{flex:1}
.hotcard .who{font-size:12px}
.hotcard .R{text-align:right;white-space:nowrap}
`;

const brand = sub => `<div class="brand"><div class="n">Wm. Mulherin's Sons<span>Method Co · Philadelphia, PA</span></div><div class="doc">${sub}</div></div>`;
const kpi = (l, v, cls, s) => `<div class="kpi"><div class="l">${l}</div><div class="v${cls ? ' ' + cls : ''}">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
const contactCell = r => { const who = esc(r.contact || '—'); const co = r.company ? `<div class="sub">${esc(r.company)}</div>` : ''; return `<div class="who">${who}</div>${co}`; };
const ciCell = r => { const ph = r.phone ? phoneFmt(r.phone) : ''; const em = r.email ? esc(r.email) : ''; return `${ph ? `<div class="ci">${ph}</div>` : ''}${em ? `<div class="sub">${em.slice(0, 30)}</div>` : ''}` || '—'; };

/* page 1: summary + HOT featured */
const hotCards = hot.map(r => `<div class="hotcard"><div class="L"><span class="who">${esc(r.contact || '—')}</span> ${chip(r._b)} <span class="sub">${r.company ? esc(r.company) + ' · ' : ''}${r._gst ? r._gst + ' guests' : ''}${r.event_type_ev ? ' · ' + esc(r.event_type_ev) : ''}</span><div class="act">→ ${action(r._b)}${r.booking_owner ? ' · owner ' + esc(r.booking_owner) : ' · <b>no owner</b>'}</div></div><div class="R"><div style="font-weight:700;color:#b3261e">${md(r.event_date)} · ${dueTxt(r.days_to_event)}</div><div class="ci">${r.phone ? phoneFmt(r.phone) : ''}</div><div class="sub">${r.email ? esc(r.email).slice(0,30) : ''}</div></div></div>`).join('');

let p1 = `<div class="page">${brand('Stalled-Prospect Chase List · Live Pipeline')}
  <h1>Chase List — Un-booked Pipeline</h1>
  <div class="meta">Open &amp; winnable inquiries (year-to-date ${TODAY.getFullYear()}) · Generated ${mdY(TODAY)} · Prioritized by event date</div>
  <div class="kpis">
    ${kpi('Live to Chase', live.length + noDate.length, 'mut', 'not booked, still open')}
    ${kpi('🔴 Hot (≤21 days)', tierCount('HOT'), 'hot', 'event imminent')}
    ${kpi('🟠 Warm (22–60d)', tierCount('WARM'), '', 'firm up soon')}
    ${kpi('Expired unbooked', expired.length, '', 'event date passed')}
  </div>
  <div class="note"><b>Act this week:</b> ${hot.length} inquiries have an event <b>within 21 days</b> and are not yet booked. Each is a live booking at risk — call/email today and push to Definite or build the BEO. Full contact details below.</div>
  <h2>🔴 Hot — event within 21 days</h2>
  ${hotCards || '<div class="foot">None within 21 days.</div>'}
</div>`;

/* full table pages, grouped by tier */
function rowHtml(r) {
  return `<tr>
    <td>${tierChip(r._tier)}</td>
    <td class="r">${md(r.event_date)}<div class="sub">${dueTxt(r.days_to_event)}</div></td>
    <td>${contactCell(r)}</td>
    <td>${ciCell(r)}</td>
    <td class="r">${r._gst ?? '—'}</td>
    <td>${chip(r._b)}</td>
    <td class="r">${r.days_stalled}d</td>
    <td class="act">${action(r._b)}</td>
  </tr>`;
}
const header = `<thead><tr><th>Priority</th><th class="r">Event date</th><th>Contact / Company</th><th>Phone / Email</th><th class="r">Gst</th><th>Stage</th><th class="r">Stalled</th><th>Next action</th></tr></thead>`;
const allList = [...live, ...noDate];
const PER = 26;
let tablePages = '';
for (let i = 0; i < allList.length; i += PER) {
  const chunk = allList.slice(i, i + PER);
  tablePages += `<div class="page">${brand('Stalled-Prospect Chase List · Full List')}
    <h2 style="margin-top:12px">Full chase list (${i + 1}–${Math.min(i + PER, allList.length)} of ${allList.length}) — soonest event first</h2>
    <table class="tbl">${header}<tbody>${chunk.map(rowHtml).join('')}</tbody></table>
    <div class="foot">Stalled = days since the booking/inquiry was created with no booking. Owner is Abby Perlman where a booking exists; "no owner" = raw lead not yet worked.</div>
  </div>`;
}

/* expired page */
let expiredPage = '';
if (expired.length) {
  const rows = expired.map(r => `<tr><td class="r">${md(r.event_date)}<div class="sub">${-r.days_to_event}d ago</div></td><td>${contactCell(r)}</td><td>${ciCell(r)}</td><td class="r">${r._gst ?? '—'}</td><td>${chip(r._b)}</td></tr>`).join('');
  expiredPage = `<div class="page">${brand('Stalled-Prospect Chase List · Expired')}
    <h2 style="margin-top:12px">Expired without booking — event date already passed (${expired.length})</h2>
    <div class="note blue">These inquiries never reached Definite/Closed and their event date has now passed. Not chaseable, but worth a quick look for patterns (source, guest size, response time) and to close them out in Tripleseat.</div>
    <table class="tbl"><thead><tr><th class="r">Event date</th><th>Contact / Company</th><th>Phone / Email</th><th class="r">Gst</th><th>Stage</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${p1}${tablePages}${expiredPage}</body></html>`;
fs.writeFileSync(path.join(DIR, 'mulherins-chase-list.html'), html);
console.log('live', live.length, 'noDate', noDate.length, 'expired', expired.length, '| hot', tierCount('HOT'), 'warm', tierCount('WARM'), 'plan', tierCount('PLAN'), 'later', tierCount('LATER'));
