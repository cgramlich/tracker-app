/* Priority Captain service worker - app shell offline (Phase 1).
   ===========================================================================
   Ported from the MenuCaptain worker, adapted for one crucial difference:
   THIS APP IS SERVED FROM A SUBPATH (https://cgramlich.github.io/tracker-app/),
   not a domain root. So the shell key and every scope check are derived from
   the worker's own location instead of hard-coded "/".

   The rule that matters most: never trap the user on a stale build.
   - The app document is NETWORK-FIRST, so an online launch always gets the
     freshest index.html and the in-app updater keeps working untouched.
   - The updater's own check fetches the doc WITH a query string
     (index.html?_=...); that is deliberately NOT intercepted, so it always
     hits the real network.
   - Cache names are tied to VERSION and `activate` deletes everything else,
     so each deploy rolls the cache cleanly.
   - Bump VERSION in lockstep with APP_VERSION in index.html - changing these
     bytes is what makes the browser install the new worker.
*/

const VERSION      = "1.21.0";                  // keep in lockstep with APP_VERSION
const SHELL_CACHE  = "pc-shell-" + VERSION;
const ASSET_CACHE  = "pc-assets-" + VERSION;
const DATA_CACHE   = "pc-data-v1";              // user collections; UN-versioned so it
                                                // survives app updates
// Subpath-safe: resolves to "/tracker-app/" (or "/" if ever served from a root).
const SHELL_URL    = new URL("./", self.location).pathname;

// Primed on install so even the very first offline open works.
const CRITICAL_ASSETS = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // allSettled so one CDN hiccup can't fail the whole install.
    const assets = await caches.open(ASSET_CACHE);
    await Promise.allSettled(CRITICAL_ASSETS.map((u) => assets.add(u)));
    try {
      const shell = await caches.open(SHELL_CACHE);
      const r = await fetch(SHELL_URL, { cache: "no-store" });
      if (r && r.ok) await shell.put(SHELL_URL, r.clone());
    } catch (e) { /* offline at install - fill on the first online load */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Lets the app force a full cache wipe (used right before applying an update).
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === "clearCache" || (data && data.type === "clearCache")) {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    })());
  }
});

function isImmutableAsset(url) {
  if (url.hostname === "cdnjs.cloudflare.com") return true;      // versioned libs
  if (url.hostname === "fonts.googleapis.com") return true;      // font css
  if (url.hostname === "fonts.gstatic.com") return true;         // font files
  if (url.origin === self.location.origin &&
      /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(url.pathname)) return true;  // our icons
  return false;
}

async function shellNetworkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(SHELL_URL, fresh.clone());   // canonical key, no ?query pollution
    return fresh;
  } catch (e) {
    const cached = await cache.match(SHELL_URL);
    return cached || Response.error();
  }
}

// Network-first for user collections, with a short timeout so a flaky connection
// falls back to the last saved copy instead of hanging. Only race the timeout when
// there IS a cached copy - otherwise (e.g. a cold backend) wait for the real answer.
async function dataNetworkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(req);
  try {
    const fresh = cached
      ? await Promise.race([
          fetch(req),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
        ])
      : await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    if (cached) return cached;
    throw e;                                   // no cache -> surface the real error
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && (fresh.ok || fresh.type === "opaque")) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;             // never cache writes
  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  const isAppDoc = url.origin === self.location.origin &&
                   (url.pathname === SHELL_URL || url.pathname === SHELL_URL + "index.html");

  // App document: network-first. A navigation always counts; a plain (query-less)
  // GET counts too. The updater's check is a query'd non-navigation fetch, so it
  // falls through to the real network and version detection is never masked.
  if (isAppDoc && (req.mode === "navigate" || !url.search)) {
    event.respondWith(shellNetworkFirst(req));
    return;
  }

  // User collections -> keep the last good copy for offline reads.
  if (url.pathname.indexOf("/api/collection/") !== -1) {
    event.respondWith(dataNetworkFirst(req));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }
  // Everything else (AI relay, calendar API, auth) -> default network, never cached.
});
