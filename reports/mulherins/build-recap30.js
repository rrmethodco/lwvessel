'use strict';
// Builds the 30-day private event inquiry recap for Wm. Mulherin's Sons.
// Usage: node build-recap30.js  ->  mulherins-recap-30d.html
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const R = JSON.parse(fs.readFileSync(path.join(DIR, 'recap30.json'), 'utf8'));
const TODAY = new Date('2026-08-29T00:00:00Z');

const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const mdY = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}) : '—';
const md  = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}) : '—';

// Triage by how close the event is — the only thing that makes one of these urgent.
function tier(r){
  if (r.event_date == null) return 'NODATE';
  const d = r.days_to_event;
  if (d < 0)  return 'PASSED';
  if (d <= 21) return 'HOT';
  if (d <= 60) return 'WARM';
  return 'PLAN';
}
R.forEach(r => r._tier = tier(r));
const of = t => R.filter(r => r._tier === t);
const covers = a => a.reduce((s,r) => s + (r.guest_count || 0), 0);

const TIER = {
  PASSED:{lab:'Event date passed', cls:'s3', note:'inquiry never worked; the date has come and gone'},
  HOT:   {lab:'Within 21 days',    cls:'s3', note:'needs an answer today'},
  WARM:  {lab:'22 – 60 days',      cls:'s2', note:'firm up now'},
  PLAN:  {lab:'Beyond 60 days',    cls:'s1', note:'plan and hold'},
  NODATE:{lab:'No date given',     cls:'s1', note:'qualify the date first'},
};
const ORDER = ['PASSED','HOT','WARM','PLAN','NODATE'];

const built = R.filter(r => r.booking_id).length;
const totalCovers = covers(R);

const row = r => {
  const who = [r.contact, r.company].filter(Boolean).join(' · ');
  const dte = r.days_to_event;
  const when = r.event_date
    ? `${md(r.event_date)}${dte != null ? ` <span class="dim">(${dte < 0 ? Math.abs(dte)+'d ago' : 'in '+dte+'d'})</span>` : ''}`
    : '<span class="dim">not given</span>';
  const stage = r.booking_id
    ? `<span class="chip s1">${esc(r.event_status || 'BOOKED')}</span>`
    : `<span class="chip s3">NO BEO</span>`;
  return `<tr>
    <td class="r">${md(r.inquired)}</td>
    <td class="l"><span class="who">${esc((who || '—').slice(0,40))}</span></td>
    <td class="l">${esc((r.event_desc || '—').slice(0,30))}</td>
    <td class="r">${when}</td>
    <td class="r">${r.guest_count ?? '—'}</td>
    <td class="l">${esc(r.lead_status || '—')}</td>
    <td class="l">${stage}</td>
    <td class="r">${r.days_open}d</td>
  </tr>`;
};

const section = t => {
  const rows = of(t); if (!rows.length) return '';
  const m = TIER[t];
  return `<div class="panel">
    <div class="secthead">
      <span class="chip ${m.cls}">${esc(m.lab)}</span>
      <span class="sectmeta">${rows.length} ${rows.length===1?'inquiry':'inquiries'} · ${covers(rows)} covers · ${esc(m.note)}</span>
    </div>
    <table><thead><tr>
      <th>Inquired</th><th>Guest</th><th>Occasion</th><th>Event date</th>
      <th>Party</th><th>Lead</th><th>BEO</th><th>Open</th>
    </tr></thead><tbody>${rows.map(row).join('')}</tbody></table>
  </div>`;
};

const kpi = (label, value, sub, cls='') =>
  `<div class="card ${cls}"><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="sub">${esc(sub)}</div></div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Wm. Mulherin's Sons — 30-Day Inquiry Recap</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#0C1526;--surface:#101E36;--surface-2:#0E1A2E;--border:#1E3050;--border-soft:#172741;
--divider:#15243D;--text:#E2EAF6;--text-2:#8A9AB0;--text-3:#6B849E;--accent:#4187D4;
--accent-soft:rgba(65,135,212,.14);--slate:#6D84AD;--up:#5A8F6B;--down:#B4533C;
--down-soft:rgba(180,83,60,.14);--serif:'Cormorant Garamond',Georgia,serif;
--ui:'DM Sans',system-ui,sans-serif;--mono:'DM Mono',ui-monospace,monospace;}
@page{size:Letter;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--ui);
-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:8.5in;min-height:11in;padding:.55in .6in .5in;background:var(--bg);
position:relative;page-break-after:always;overflow:hidden}
.page:last-child{page-break-after:auto}
.page::before{content:'';position:absolute;inset:0;pointer-events:none;
background:radial-gradient(700px 380px at 80% -12%,rgba(65,135,212,.07),transparent 70%)}
.page>*{position:relative}
.eyebrow{font-family:var(--mono);font-size:9px;letter-spacing:.22em;text-transform:uppercase;
color:var(--accent);margin:0 0 8px}
h1{font-family:var(--serif);font-weight:300;font-size:40px;line-height:1.06;margin:0 0 12px;letter-spacing:-.015em}
h1 em{font-style:italic;color:var(--slate)}
h2{font-family:var(--serif);font-weight:300;font-size:24px;margin:0 0 8px;letter-spacing:-.01em}
h2 em{font-style:italic;color:var(--slate)}
p{font-size:12px;line-height:1.55;color:var(--text-2);margin:0 0 10px;max-width:66ch}
p strong{color:var(--text);font-weight:600}
.lede{font-size:13.5px;color:var(--text);max-width:60ch;line-height:1.55}
.meta{font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-3)}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:0 0 16px}
.card{border:1px solid var(--border);border-radius:11px;padding:14px 15px;
background:linear-gradient(180deg,var(--surface),var(--surface-2))}
.card .label{font-family:var(--mono);font-size:8px;letter-spacing:.16em;text-transform:uppercase;
color:var(--text-3);margin-bottom:8px}
.card .value{font-family:var(--serif);font-weight:300;font-size:30px;line-height:1;letter-spacing:-.015em}
.card .sub{font-size:10px;color:var(--text-3);margin-top:6px;line-height:1.35}
.card.bad .value{color:#d98a72}
.panel{border:1px solid var(--border);border-radius:11px;padding:15px 16px;margin-bottom:13px;
background:linear-gradient(180deg,var(--surface),var(--surface-2))}
.panel.flag{border-color:#5d3a2d;background:linear-gradient(180deg,rgba(180,83,60,.10),var(--surface-2))}
.secthead{display:flex;align-items:baseline;gap:10px;margin-bottom:9px}
.sectmeta{font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)}
table{width:100%;border-collapse:collapse;font-size:10.5px}
th,td{text-align:right;padding:5px 6px;border-bottom:1px solid var(--divider);vertical-align:top}
th:first-child,td:first-child{text-align:left}
th:nth-child(2),td:nth-child(2),th:nth-child(3),td:nth-child(3),
th:nth-child(6),td:nth-child(6),th:nth-child(7),td:nth-child(7){text-align:left}
th{font-family:var(--ui);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;
color:var(--text-3);font-weight:600}
td{font-family:var(--mono);color:var(--text);font-variant-numeric:tabular-nums}
td.l{font-family:var(--ui)}
.who{font-weight:600;color:var(--text)}
.dim{color:var(--text-3)}
.chip{font-family:var(--mono);font-size:7.5px;letter-spacing:.09em;text-transform:uppercase;
padding:2px 6px;border-radius:4px;display:inline-block;white-space:nowrap}
.chip.s3{background:var(--down-soft);color:#e6a08c;border:1px solid var(--down)}
.chip.s2{background:rgba(197,164,110,.14);color:#d8c19e;border:1px solid #8a7a55}
.chip.s1{background:var(--accent-soft);color:#8fb4dd;border:1px solid var(--accent)}
.foot{position:absolute;left:.6in;right:.6in;bottom:.3in;display:flex;justify-content:space-between;
font-family:var(--mono);font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-3);
border-top:1px solid var(--border-soft);padding-top:7px}
.rec{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--divider)}
.rec:last-child{border-bottom:none}
.rec .num{font-family:var(--serif);font-size:23px;font-weight:300;color:var(--slate);width:22px;flex:none;line-height:1}
.rec h3{font-family:var(--ui);font-size:11.5px;font-weight:600;margin:0 0 4px;color:var(--text)}
.rec p{margin:0;font-size:11px;line-height:1.5}
</style></head><body>

<div class="page">
  <p class="meta">Wm. Mulherin's Sons &nbsp;·&nbsp; Philadelphia &nbsp;·&nbsp; Private Events</p>
  <div style="height:.5in"></div>
  <p class="eyebrow">30-day inquiry recap</p>
  <h1>Where Every Inquiry<br><em>Actually</em> Stands</h1>
  <p class="lede">All 47 private event inquiries received between 30 July and 27 August 2026,
  and the status of each one in Tripleseat as of this morning.</p>

  <div style="height:.32in"></div>
  <div class="cards">
    ${kpi('Inquiries','47','30 Jul – 27 Aug')}
    ${kpi('Covers requested', totalCovers.toLocaleString(), 'avg party of 36')}
    ${kpi('BEOs built', String(built), 'of 47 inquiries','bad')}
    ${kpi('Avg days open','16','since inquiry received')}
  </div>

  <div class="panel flag">
    <p class="eyebrow">Read this first</p>
    <p style="margin:0;color:var(--text)"><strong>Not one of these 47 inquiries has a booking built
    in Tripleseat.</strong> The last Mulherin's booking of any kind was created on
    <strong>24 July 2026</strong> — five weeks ago. July saw 27 bookings created; August has none.
    Every other Method Co. venue has been booking normally through this week
    (Anthology 223 in August, Lowland 57, Nickel 56, Vessel 18), so this is specific to
    Mulherin's, not a systems problem.</p>
  </div>

  <p>The inquiries themselves are healthy and still arriving — 47 in 30 days, 1,534 covers,
  an average party of 36, from 44 distinct guests. Ten have been marked Converted at the lead
  level, but no event or BEO exists behind any of them, so there is nothing holding a date,
  a room, or a minimum.</p>

  <p>What follows is every inquiry, grouped by how close its event date is. Six have already
  come and gone unworked. Nine more land inside the next three weeks.</p>

  <div class="foot"><span>Source · Tripleseat API, location 17784</span><span>Generated 29 Aug 2026</span></div>
</div>

<div class="page">
  <p class="eyebrow">The book</p>
  <h2>Every Inquiry, by <em>Urgency</em></h2>
  <p style="margin-bottom:14px">Ordered by event date within each band. "BEO" shows whether an event
  record exists in Tripleseat — every one currently reads NO BEO.</p>
  ${section('PASSED')}
  ${section('HOT')}
  <div class="foot"><span>Wm. Mulherin's Sons · 30-day inquiry recap</span><span>2</span></div>
</div>

<div class="page">
  <p class="eyebrow">The book, continued</p>
  <h2>Still <em>Winnable</em></h2>
  ${section('WARM')}
  <div class="foot"><span>Wm. Mulherin's Sons · 30-day inquiry recap</span><span>3</span></div>
</div>

<div class="page">
  <p class="eyebrow">The book, continued</p>
  <h2>Longer <em>Horizon</em></h2>
  ${section('PLAN')}
  ${section('NODATE')}
  <div class="foot"><span>Wm. Mulherin's Sons · 30-day inquiry recap</span><span>4</span></div>
</div>

<div class="page">
  <p class="eyebrow">What to do</p>
  <h2>Recommended <em>Actions</em></h2>
  <p style="margin-bottom:14px">In order. The first is not a sales task.</p>
  <div class="panel">
    <div class="rec"><div class="num">1</div><div>
      <h3>Establish why no booking has been created since 24 July.</h3>
      <p>Five weeks with zero bookings, at a venue that created 27 in July, is either a staffing
      gap, a change in how the team is working, or a Tripleseat access problem. Everything below
      depends on the answer, and nothing in the data can settle it.</p></div></div>
    <div class="rec"><div class="num">2</div><div>
      <h3>Work the nine inquiries inside 21 days today.</h3>
      <p>These have live dates and no held space. They are the only items here where a day of
      delay reliably costs the booking.</p></div></div>
    <div class="rec"><div class="num">3</div><div>
      <h3>Close out the six whose date has passed.</h3>
      <p>Mark them lost with a real reason so they stop inflating the open pipeline — and so the
      loss taxonomy shows why. Two were business dinners for 12–20 that would have been easy wins.</p></div></div>
    <div class="rec"><div class="num">4</div><div>
      <h3>Build BEOs for the ten already marked Converted.</h3>
      <p>These guests have been told yes at the lead level with nothing behind it. No date is held
      and no minimum is contracted, so the venue carries the risk of a double-book.</p></div></div>
    <div class="rec"><div class="num">5</div><div>
      <h3>Set an alert on booking creation, not just inquiry volume.</h3>
      <p>A five-week gap went unnoticed because the daily report tracks inquiries arriving, not
      bookings being built. One threshold check would have surfaced this in week one.</p></div></div>
  </div>
  <p style="margin-top:4px"><strong>A note on what this can and cannot see.</strong> This reflects
  what exists in Tripleseat. If the team has been corresponding with these guests by phone or email
  without building the booking, that work is real but invisible here — and the dates still are not held.</p>
  <div class="foot"><span>Wm. Mulherin's Sons · 30-day inquiry recap</span><span>5</span></div>
</div>

</body></html>`;

fs.writeFileSync(path.join(DIR,'mulherins-recap-30d.html'), html);
console.log(`recap: ${R.length} inquiries | ${totalCovers} covers | BEOs built ${built}`);
ORDER.forEach(t => console.log(`  ${t}: ${of(t).length} (${covers(of(t))} covers)`));
