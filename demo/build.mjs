// Builds the single-file HELIX demo: the real SPA + a fully in-browser
// backend (the same server modules, ported) in one self-contained HTML file.
//
//   node demo/build.mjs                → demo/helix-demo.html (standalone)
//   node demo/build.mjs --artifact OUT → bodyless variant for hosted pages
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Server modules become plain script code: drop import lines, strip `export`.
function port(module) {
  return read(module)
    .split('\n')
    .filter((l) => !/^import\s/.test(l))
    .join('\n')
    .replace(/^export\s+/gm, '');
}

// The SPA, with two demo patches (everything else is handled by the fetch
// shim and link interceptor). Each patch asserts its anchor still exists so
// upstream edits can't silently break the demo.
function patchedApp() {
  let app = read('public/app.js');
  const patches = [
    // 1. the editor preview iframe cannot load via the fetch shim — use srcdoc
    [
      'src="/api/sites/${site.id}/preview" style=',
      'style=',
    ],
    [
      'const refresh = () => { frame.src = `/api/sites/${site.id}/preview?t=${Date.now()}`; };',
      'const refresh = () => { frame.srcdoc = HX.previewHTML(site.id); };\n  refresh();',
    ],
  ];
  for (const [from, to] of patches) {
    if (!app.includes(from)) throw new Error(`demo patch anchor missing in app.js: ${from}`);
    app = app.replace(from, to);
  }
  return app;
}

const glue = `
// ---------- demo glue: fetch shim + link handling ----------
const _fetch = window.fetch.bind(window);
window.fetch = async (input, opts = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('/api/')) {
    const u = new URL(url, location.href);
    let body = {};
    if (opts.body) { try { body = JSON.parse(opts.body); } catch { /* non-JSON */ } }
    const r = await HX.handle((opts.method || 'GET').toUpperCase(), u.pathname, Object.fromEntries(u.searchParams), body);
    if (r.html !== undefined) return new Response(r.html, { status: r.status, headers: { 'content-type': 'text/html' } });
    return new Response(JSON.stringify(r.data), { status: r.status, headers: { 'content-type': 'application/json' } });
  }
  return _fetch(input, opts);
};

function openSiteOverlay(slug) {
  HX.recordView(slug, '/sites/' + slug);
  const back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;z-index:200;background:#0a0d16;display:flex;flex-direction:column';
  back.innerHTML =
    '<div style="padding:9px 16px;display:flex;justify-content:space-between;align-items:center;background:#141928;border-bottom:1px solid #232b42;color:#e9edf7;font:600 13px system-ui">' +
    '<span>🌐 /sites/' + slug + ' — this page is served live by HELIX</span>' +
    '<button style="background:#1a2033;border:1px solid #232b42;color:#e9edf7;border-radius:8px;padding:5px 14px;font:600 13px system-ui;cursor:pointer">✕ Close</button></div>' +
    '<iframe style="flex:1;border:none;background:#fff"></iframe>';
  back.querySelector('button').onclick = () => back.remove();
  back.querySelector('iframe').srcdoc = HX.previewHTML(slug);
  document.body.appendChild(back);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (href.startsWith('/sites/')) {
    e.preventDefault();
    openSiteOverlay(href.split('/')[2]);
  } else if (href === '/api/export') {
    e.preventDefault();
    downloadBlob(new Blob([HX.exportJSON()], { type: 'application/json' }), 'helix-export.json');
  } else if (href.startsWith('/api/sites/') && href.endsWith('/export')) {
    e.preventDefault();
    const id = href.split('/')[3];
    const out = HX.exportZip(id);
    if (out) downloadBlob(new Blob([out.zip], { type: 'application/zip' }), out.filename);
  }
}, true);

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const tmp = document.createElement('a');
  tmp.href = url; tmp.download = filename;
  document.body.appendChild(tmp); tmp.click(); tmp.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
`;

const js = [
  "const HX = (() => {\n'use strict';",
  port('server/helpers.js'),
  port('server/offline.js'),
  port('server/powerups.js'),
  port('server/sites.js'),
  port('server/seo.js'),
  port('server/integrations.js'),
  port('server/agent.js'),
  port('server/zip.js'),
  port('server/export-site.js'),
  read('demo/browser-backend.js'),
  '})();',
  glue,
  patchedApp(),
].join('\n\n');

const banner = `
  <div id="demo-banner">
    <span><b>⬢ HELIX interactive demo</b> — the full app running entirely in your browser (offline engine). Your data stays on this device.</span>
    <span class="demo-note">The installable version adds real AI providers, live site hosting &amp; URL audits — see the README.</span>
  </div>`;

const bannerCSS = `
#demo-banner{flex:none;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;
  padding:8px 16px;background:linear-gradient(90deg,#1d2440,#161c30);border-bottom:1px solid var(--border);font-size:12px;color:var(--muted)}
#demo-banner b{color:var(--text)}
#demo-banner .demo-note{color:var(--dim)}
@media (max-width:860px){#demo-banner .demo-note{display:none}}
`;

const content = `<title>HELIX — Interactive Demo</title>
<style>
${read('public/styles.css')}
${bannerCSS}
</style>
${banner}
<div class="mobile-top">
  <button id="menuBtn" aria-label="Open menu">☰</button>
  <span class="brand">⬢ HELIX</span>
</div>
<div id="app">
  <aside class="sidebar" id="sidebar"></aside>
  <div id="backdrop"></div>
  <main class="main" id="main"></main>
</div>
<script>
${js}
</script>
`;

const artifactIdx = process.argv.indexOf('--artifact');
if (artifactIdx !== -1) {
  const out = process.argv[artifactIdx + 1];
  fs.writeFileSync(out, content);
  console.log(`artifact variant → ${out} (${(content.length / 1024).toFixed(0)} KB)`);
} else {
  const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${content.slice(0, content.indexOf('</style>') + 8)}\n</head>\n<body>\n${content.slice(content.indexOf('</style>') + 8)}\n</body>\n</html>\n`;
  const out = path.join(root, 'demo', 'helix-demo.html');
  fs.writeFileSync(out, html);
  console.log(`standalone demo → demo/helix-demo.html (${(html.length / 1024).toFixed(0)} KB)`);
}
