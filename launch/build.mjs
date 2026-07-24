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

const out = path.join(root, 'launch', 'site', 'app.html');
fs.writeFileSync(out, html);
console.log(`launch app → launch/site/app.html (${(html.length / 1024).toFixed(0)} KB, PWA tags injected)`);
