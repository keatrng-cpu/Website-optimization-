// Tiny method + pattern router. Patterns like "/api/tasks/:id".
export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const parts = pattern.split('/').filter(Boolean);
    routes.push({ method, parts, handler });
  }

  function match(method, pathname) {
    const segs = pathname.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.method !== method || r.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(':')) {
          // malformed percent-encoding must not crash the request
          try { params[p.slice(1)] = decodeURIComponent(segs[i]); }
          catch { params[p.slice(1)] = segs[i]; }
        } else if (p !== segs[i]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }

  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    put: (p, h) => add('PUT', p, h),
    patch: (p, h) => add('PATCH', p, h),
    delete: (p, h) => add('DELETE', p, h),
    match,
  };
}

export function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        const err = new Error('payload too large');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch {
        const err = new Error('invalid JSON body');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}
