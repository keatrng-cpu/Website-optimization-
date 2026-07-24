// Refreshes launch/site/app.html from the built demo and injects the PWA tags
// (manifest + theme-color) that make the hosted app installable.
//   node demo/build.mjs && node launch/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(root, 'demo', 'helix-demo.html'), 'utf8');

const PWA_TAGS = [
  '<meta name="theme-color" content="#0a0d16">',
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/icon.svg">',
].join('\n');
const anchor = '<meta name="viewport" content="width=device-width, initial-scale=1">';
if (!html.includes(anchor)) throw new Error('viewport anchor missing in demo html');
html = html.replace(anchor, anchor + '\n' + PWA_TAGS);

// The hosted app is the product's free tier, not a demo — retitle and swap
// the banner copy. Anchors are asserted so demo edits can't silently break this.
const swaps = [
  ['<title>HELIX — Interactive Demo</title>', '<title>HELIX — Your AI Business Team</title>'],
  [
    '<span><b>⬢ HELIX interactive demo</b> — the full app running entirely in your browser (offline engine). Your data stays on this device.</span>',
    '<span><b>⬢ HELIX Free</b> — the full app, running privately in your browser. Your data stays on this device.</span>',
  ],
  [
    '<span class="demo-note">The installable version adds real AI providers, live site hosting &amp; URL audits — see the README.</span>',
    '<span class="demo-note"><a href="/#pricing" style="color:inherit">Go Pro → managed AI, hosted sites on your domain &amp; live data feeds</a></span>',
  ],
];
for (const [from, to] of swaps) {
  if (!html.includes(from)) throw new Error(`launch banner anchor missing: ${from.slice(0, 60)}`);
  html = html.replace(from, to);
}

const out = path.join(root, 'launch', 'site', 'app.html');
fs.writeFileSync(out, html);
console.log(`launch app → launch/site/app.html (${(html.length / 1024).toFixed(0)} KB, PWA tags injected)`);
