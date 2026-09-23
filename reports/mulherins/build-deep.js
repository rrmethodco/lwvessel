#!/usr/bin/env node
// Builds the interactive deep-analysis dashboard by injecting deep.json
// into deep-dashboard.template.html at the DATA marker.
// Usage: node build-deep.js  ->  writes mulherins-deep-dashboard.html
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const tpl = fs.readFileSync(path.join(dir, 'deep-dashboard.template.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'deep.json'), 'utf8'));
const marker = '/*__DATA__*/[]';
if (!tpl.includes(marker)) { console.error('DATA marker not found in template'); process.exit(1); }
const out = tpl.replace(marker, JSON.stringify(data));
fs.writeFileSync(path.join(dir, 'mulherins-deep-dashboard.html'), out);
const booked = data.filter(r => ['DEFINITE','CLOSED'].includes(r.event_status)).length;
console.log(`deep dashboard built: ${data.length} inquiries, ${booked} booked -> mulherins-deep-dashboard.html`);
