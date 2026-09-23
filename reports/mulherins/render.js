'use strict';
// Render an HTML file to a Letter-size PDF using the pre-installed Chromium.
// Usage: NODE_PATH="$(npm root -g)" node render.js <input.html> <output.pdf>
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

function findChromium() {
  // Env may pin a version dir like /opt/pw-browsers/chromium-1194 — auto-detect it.
  const base = '/opt/pw-browsers';
  try {
    const dir = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
    if (dir) {
      const p = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch (_e) { /* fall through */ }
  return undefined; // let Playwright resolve its default
}

(async () => {
  const input = process.argv[2], output = process.argv[3];
  if (!input || !output) { console.error('usage: node render.js <input.html> <output.pdf>'); process.exit(1); }
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(input), { waitUntil: 'networkidle' });
  await page.pdf({ path: output, format: 'Letter', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await browser.close();
  const buf = fs.readFileSync(output);
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`wrote ${output} (${buf.length} bytes, ${pages} pages)`);
})();
