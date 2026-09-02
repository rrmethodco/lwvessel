#!/usr/bin/env node
// Builds the multi-venue portfolio dashboard by injecting deep_all.json
// into portfolio-dashboard.template.html at the DATA marker.
// Usage: node build-portfolio.js  ->  writes methodco-portfolio-dashboard.html
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const tpl = fs.readFileSync(path.join(dir, 'portfolio-dashboard.template.html'), 'utf8');
// Venues excluded from the portfolio dashboard (by Tripleseat location_id).
// The Quoin (21825), HIROKI (33578), ROOST Detroit (36626) — excluded per request.
const EXCLUDE = new Set([21825, 33578, 36626]);
const data = JSON.parse(fs.readFileSync(path.join(dir, 'deep_all.json'), 'utf8'))
  .filter(r => !EXCLUDE.has(r.venue_id));
const marker = '/*__DATA__*/[]';
if (!tpl.includes(marker)) { console.error('DATA marker not found'); process.exit(1); }
const out = tpl.replace(marker, JSON.stringify(data));
fs.writeFileSync(path.join(dir, 'methodco-portfolio-dashboard.html'), out);
const byV = {}; data.forEach(r => { const v = r.venue || '?'; byV[v] = (byV[v] || 0) + 1; });
const enr = data.filter(r => r.event_status).length;
console.log(`portfolio dashboard: ${data.length} inquiries, ${Object.keys(byV).length} venues, ${enr} enriched -> methodco-portfolio-dashboard.html`);
