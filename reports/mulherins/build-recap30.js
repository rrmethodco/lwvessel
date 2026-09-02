'use strict';
// 30-day private event inquiry recap for Wm. Mulherin's Sons, focused on response status:
// who got an answer, how fast, and who is still waiting.
// Usage: node build-recap30.js  ->  mulherins-recap-30d.html
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const R = JSON.parse(fs.readFileSync(path.join(DIR, 'recap30.json'), 'utf8'));

const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const mdY = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}) : '—';
const md  = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}) : '—';
const hrs = h => h == null ? '—' : (h < 48 ? `${Math.round(h)}h` : `${Math.round(h/24)}d`);

const covers = a => a.reduce((s,r) => s + (r.guest_count || 0), 0);
const responded  = R.filter(r => r.response_status === 'RESPONDED');
const turned     = R.filter(r => r.response_status === 'TURNED_DOWN');
const noResponse = R.filter(r => r.response_status === 'NO_RESPONSE');
const med = a => { const x=a.filter(v=>v!=null).sort((p,q)=>p-q); return x.length ? (x.length%2 ? x[(x.length-1)/2] : (x[x.length/2-1]+x[x.length/2])/2) : null; };
const medResp = med(responded.map(r => r.response_hours));

// Urgency bands, by how close the event is.
const BANDS = [
  ['PASSED', 'Event date already passed', 's3', r => r.event_date && r.days_to_event < 0],
  ['HOT',    'Event within 21 days',      's3', r => r.days_to_event != null && r.days_to_event >= 0 && r.days_to_event <= 21],
  ['LATER',  'Event beyond 21 days',      's1', r => r.days_to_event != null && r.days_to_event > 21],
  ['NODATE', 'No event date given',       's2', r => r.event_date == null],
];

const statusCell = r => {
  if (r.response_status === 'TURNED_DOWN') return `<span class="chip s2">Turned down</span>`;
  if (r.response_status === 'RESPONDED')
    return `<span class="chip ok">Answered ${esc(hrs(r.response_hours))}</span>`;
  return `<span class="chip s3">No reply · ${r.days_open}d</span>`;
};

const row = r => {
  const who = [r.contact, r.company].filter(Boolean).join(' · ');
  const when = r.event_date
    ? `${md(r.event_date)} <span class="dim">(${r.days_to_event < 0 ? Math.abs(r.days_to_event)+'d ago' : 'in '+r.days_to_event+'d'})</span>`
    : '<span class="dim">not given</span>';
  return `<tr>
    <td class="r">${md(r.inquired)}</td>
    <td class="l"><span class="who">${esc((who || '—').slice(0,38))}</span></td>
    <td class="l">${esc((r.event_desc || '—').slice(0,26))}</td>
    <td class="r">${when}</td>
    <td class="r">${r.guest_count ?? '—'}</td>
    <td class="l">${statusCell(r)}</td>
    <td class="l">${esc(r.owner || '—')}</td>
    <td class="l">${r.event_id ? '<span class="chip s1">BEO</span>' : '<span class="dim">none</span>'}</td>
  </tr>`;
};

// slice lets a long band continue onto a second page without overflowing.
const band = ([key, label, cls, pred], slice) => {
  let rows = R.filter(pred); if (!rows.length) return '';
  const whole = rows.length;
  if (slice) rows = rows.slice(slice[0], slice[1]);
  if (!rows.length) return '';
  const part = slice ? ` <span class="dim">(${slice[0]+1}–${slice[0]+rows.length} of ${whole})</span>` : '';
  const nr = rows.filter(r => r.response_status === 'NO_RESPONSE').length;
  return `<div class="panel">
    <div class="secthead"><span class="chip ${cls}">${esc(label)}</span>
      <span class="sectmeta">${rows.length} ${rows.length===1?'inquiry':'inquiries'}${part} · ${covers(rows)} covers · ${nr} with no reply</span></div>
    <table><thead><tr><th>Inquired</th><th>Guest</th><th>Occasion</th><th>Event date</th>
      <th>Party</th><th>Response</th><th>Owner</th><th>BEO</th></tr></thead>
      <tbody>${rows.map(row).join('')}</tbody></table>
  </div>`;
};

const kpi = (l,v,s,c='') => `<div class="card ${c}"><div class="label">${esc(l)}</div><div class="value">${v}</div><div class="sub">${esc(s)}</div></div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Wm. Mulherin's Sons — 30-Day Inquiry Status</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#0C1526;--surface:#101E36;--surface-2:#0E1A2E;--border:#1E3050;--border-soft:#172741;
--divider:#15243D;--text:#E2EAF6;--text-2:#8A9AB0;--text-3:#6B849E;--accent:#4187D4;
--accent-soft:rgba(65,135,212,.14);--slate:#6D84AD;--up:#5A8F6B;--up-soft:rgba(90,143,107,.16);
--down:#B4533C;--down-soft:rgba(180,83,60,.14);--serif:'Cormorant Garamond',Georgia,serif;
--ui:'DM Sans',system-ui,sans-serif;--mono:'DM Mono',ui-monospace,monospace}
@page{size:Letter;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--ui);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:8.5in;min-height:11in;padding:.55in .6in .5in;background:var(--bg);position:relative;page-break-after:always;overflow:hidden}
.page:last-child{page-break-after:auto}
.page::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(700px 380px at 80% -12%,rgba(65,135,212,.07),transparent 70%)}
.page>*{position:relative}
.eyebrow{font-family:var(--mono);font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);margin:0 0 8px}
h1{font-family:var(--serif);font-weight:300;font-size:40px;line-height:1.06;margin:0 0 12px;letter-spacing:-.015em}
h1 em,h2 em{font-style:italic;color:var(--slate)}
h2{font-family:var(--serif);font-weight:300;font-size:24px;margin:0 0 8px;letter-spacing:-.01em}
p{font-size:12px;line-height:1.55;color:var(--text-2);margin:0 0 10px;max-width:66ch}
p strong{color:var(--text);font-weight:600}
.lede{font-size:13.5px;color:var(--text);max-width:60ch;line-height:1.55}
.meta{font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-3)}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:0 0 16px}
.card{border:1px solid var(--border);border-radius:11px;padding:14px 15px;background:linear-gradient(180deg,var(--surface),var(--surface-2))}
.card .label{font-family:var(--mono);font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px}
.card .value{font-family:var(--serif);font-weight:300;font-size:30px;line-height:1;letter-spacing:-.015em}
.card .sub{font-size:10px;color:var(--text-3);margin-top:6px;line-height:1.35}
.card.bad .value{color:#d98a72}.card.good .value{color:#7fb18d}
.panel{border:1px solid var(--border);border-radius:11px;padding:15px 16px;margin-bottom:13px;background:linear-gradient(180deg,var(--surface),var(--surface-2))}
.panel.flag{border-color:#5d3a2d;background:linear-gradient(180deg,rgba(180,83,60,.10),var(--surface-2))}
.secthead{display:flex;align-items:baseline;gap:10px;margin-bottom:9px}
.sectmeta{font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)}
table{width:100%;border-collapse:collapse;font-size:10.5px}
th,td{text-align:right;padding:5px 6px;border-bottom:1px solid var(--divider);vertical-align:top}
th:first-child,td:first-child{text-align:left}
th:nth-child(2),td:nth-child(2),th:nth-child(3),td:nth-child(3),
th:nth-child(6),td:nth-child(6),th:nth-child(7),td:nth-child(7),
th:nth-child(8),td:nth-child(8){text-align:left}
th{font-family:var(--ui);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);font-weight:600}
td{font-family:var(--mono);color:var(--text);font-variant-numeric:tabular-nums}
td.l{font-family:var(--ui)}
.who{font-weight:600;color:var(--text)}.dim{color:var(--text-3)}
.chip{font-family:var(--mono);font-size:7.5px;letter-spacing:.09em;text-transform:uppercase;padding:2px 6px;border-radius:4px;display:inline-block;white-space:nowrap}
.chip.s3{background:var(--down-soft);color:#e6a08c;border:1px solid var(--down)}
.chip.s2{background:rgba(197,164,110,.14);color:#d8c19e;border:1px solid #8a7a55}
.chip.s1{background:var(--accent-soft);color:#8fb4dd;border:1px solid var(--accent)}
.chip.ok{background:var(--up-soft);color:#8fc4a1;border:1px solid var(--up)}
.foot{position:absolute;left:.6in;right:.6in;bottom:.3in;display:flex;justify-content:space-between;font-family:var(--mono);font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-3);border-top:1px solid var(--border-soft);padding-top:7px}
</style></head><body>

<div class="page">
  <p class="meta">Wm. Mulherin's Sons &nbsp;·&nbsp; Philadelphia &nbsp;·&nbsp; Private Events</p>
  <div style="height:.45in"></div>
  <p class="eyebrow">30-day inquiry status</p>
  <h1>Every Inquiry, and<br>Whether Anyone <em>Replied</em></h1>
  <p class="lede">All 47 private event inquiries submitted between 30 July and 27 August 2026,
  with the response status of each one as recorded in Tripleseat.</p>

  <div style="height:.3in"></div>
  <div class="cards">
    ${kpi('Inquiries','47','30 Jul – 27 Aug')}
    ${kpi('No reply at all', String(noResponse.length), `${covers(noResponse).toLocaleString()} covers unanswered`,'bad')}
    ${kpi('Answered', String(responded.length), `median ${hrs(medResp)} to reply`,'good')}
    ${kpi('Assigned an owner','4','of 47 inquiries','bad')}
  </div>

  <div class="panel flag">
    <p class="eyebrow">The finding</p>
    <p style="margin:0;color:var(--text)"><strong>37 of 47 inquiries have had no response of any
    kind.</strong> They have been waiting an average of <strong>16 days</strong>, the longest
    <strong>30 days</strong>, and together represent <strong>${covers(noResponse).toLocaleString()} covers</strong>.
    Only 4 of the 47 have an owner assigned. The 10 that were answered were answered promptly —
    a median of ${hrs(medResp)} — so when someone picks an inquiry up, they move quickly.
    Very few are being picked up.</p>
  </div>

  <p>Of the 10 answered, all were marked converted, but conversion here created only a contact
  record — the lead field <span class="mono">booking_lead</span> reads false on every one, and no
  event or BEO exists behind any of them. So no date is held, no room is assigned, and no minimum
  is contracted for any inquiry in this window.</p>

  <p>The pages that follow list every inquiry, grouped by how close its event date is.</p>

  <div class="foot"><span>Source · Tripleseat API, location 17784</span><span>Generated 29 Aug 2026</span></div>
</div>

<div class="page">
  <p class="eyebrow">Needs action now</p>
  <h2>Past Due and <em>Imminent</em></h2>
  <p style="margin-bottom:13px">Response shows whether the guest ever heard back, and how long it took.</p>
  ${band(BANDS[0])}
  ${band(BANDS[1])}
  <div class="foot"><span>Wm. Mulherin's Sons · 30-day inquiry status</span><span>2</span></div>
</div>

<div class="page">
  <p class="eyebrow">The rest of the book</p>
  <h2>Beyond <em>Three Weeks</em></h2>
  ${band(BANDS[2], [0, 18])}
  <div class="foot"><span>Wm. Mulherin's Sons · 30-day inquiry status</span><span>3</span></div>
</div>

<div class="page">
  <p class="eyebrow">The rest of the book, continued</p>
  <h2>Beyond Three Weeks <em>(cont.)</em></h2>
  ${band(BANDS[2], [18, 99])}
  <div class="foot"><span>Wm. Mulherin's Sons · 30-day inquiry status</span><span>4</span></div>
</div>

<div class="page">
  <p class="eyebrow">The rest of the book</p>
  <h2>No Date <em>Given</em></h2>
  ${band(BANDS[3])}
  <div class="panel">
    <p class="eyebrow">How to read this</p>
    <p style="margin:0 0 8px"><strong>Response</strong> is taken from Tripleseat's own lead record —
    <span class="mono">converted_at</span> or <span class="mono">turned_down_at</span>. "No reply"
    means neither timestamp is set, so as far as the system knows the guest has never been answered.
    If the team has replied by email or phone without recording it in Tripleseat, that work will not
    appear here.</p>
    <p style="margin:0"><strong>BEO</strong> reads none for all 47. Verified three ways: the leads
    list, the lead detail endpoint (<span class="mono">event_id</span> and
    <span class="mono">booking_id</span> both null, <span class="mono">booking_lead</span> false),
    and the events search across Prospect, Tentative, Definite and Closed. The newest Mulherin's
    booking on record was created 24 July 2026.</p>
  </div>
  <div class="foot"><span>Wm. Mulherin's Sons · 30-day inquiry status</span><span>5</span></div>
</div>

</body></html>`;

fs.writeFileSync(path.join(DIR,'mulherins-recap-30d.html'), html);
console.log(`47 inquiries | no reply ${noResponse.length} (${covers(noResponse)} covers) | answered ${responded.length} (median ${hrs(medResp)}) | turned down ${turned.length}`);
BANDS.forEach(b => console.log(`  ${b[0]}: ${R.filter(b[3]).length}`));
