// Bargueño service worker. scripts/postbuild.py fills in the placeholders and
// writes this over JupyterLite's own service-worker.js.
//
// Two jobs:
//  1. Precache the app shell so Bargueño opens with no network.
//  2. Keep JupyterLite's /api/drive broadcast, which kernels (Pyodide, later)
//     use to reach the in-browser file system.
'use strict';

const VERSION = '__BARGENO_VERSION__';
const PRECACHE = __BARGENO_PRECACHE__;
const CACHE = `bargeno-${VERSION}`;
const RUNTIME = `${CACHE}-runtime`;
const broadcast = new BroadcastChannel('/sw-api.v1');

const scope = () => new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(PRECACHE.map((path) => new Request(new URL(path, scope()), { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('bargeno-') && key !== CACHE && key !== RUNTIME) {
          await caches.delete(key);
        }
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'bargeno:version') {
    event.source.postMessage({ type: 'bargeno:version', version: VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.endsWith('/api/service-worker-heartbeat')) {
    event.respondWith(new Response('ok'));
    return;
  }
  if (url.origin === location.origin && (url.pathname.includes('/api/drive') || url.pathname.includes('/api/stdin/'))) {
    event.respondWith(broadcastOne(request, url));
    return;
  }
  if (request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }
  event.respondWith(fromCacheOrNetwork(request, url));
});

async function fromCacheOrNetwork(request, url) {
  const key = url.pathname.endsWith('/') ? new URL('index.html', url) : url;
  const cached = await caches.match(key.href, { ignoreSearch: true });
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      const runtime = await caches.open(RUNTIME);
      await runtime.put(key.href, response.clone());
    }
    return response;
  } catch (err) {
    if (request.mode === 'navigate') {
      const shell = await caches.match(new URL('lab/index.html', scope()).href);
      if (shell) {
        return shell;
      }
    }
    if (url.pathname.includes('/api/')) {
      // JupyterLite probes optional endpoints and copes with a 404.
      return new Response('', { status: 404, statusText: 'Offline' });
    }
    throw err;
  }
}

// Ported from JupyterLite's service worker: forwards drive requests from a
// kernel worker to the page that owns the browser storage.
async function broadcastOne(request, url) {
  const message = await request.json();
  const requestId = message.requestId ?? crypto.randomUUID();
  message.requestId = requestId;
  const reply = new Promise((resolve) => {
    const listener = (event) => {
      const data = event.data;
      if (data.browsingContextId !== message.browsingContextId || data.requestId !== requestId) {
        return;
      }
      resolve(new Response(JSON.stringify(data.response)));
      broadcast.removeEventListener('message', listener);
    };
    broadcast.addEventListener('message', listener);
  });
  message.pathname = url.pathname;
  broadcast.postMessage(message);
  return await reply;
}
