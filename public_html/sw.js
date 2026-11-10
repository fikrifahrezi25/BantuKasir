// BantuKasir Service Worker - Offline Support
// Version: 1.0.0

const CACHE_VERSION = 'bantukasir-v1.0.0';
const CACHE_NAME = `${CACHE_VERSION}-static`;
const DATA_CACHE_NAME = `${CACHE_VERSION}-data`;
const IMAGE_CACHE_NAME = `${CACHE_VERSION}-images`;
const MAX_IMAGE_CACHE = 50; // Batas cache foto produk

// File yang di-cache saat install (app shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/laporan.html',
  '/manifest.json',
  '/offline-db.js',
  '/offline-sync.js',
  '/offline-features.js',
  '/pwa-install.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-192x192-maskable.png',
  '/icons/icon-512x512-maskable.png'
];

// Event: Install - cache app shell
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Event: Activate - cleanup old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old cache versions
          if (cacheName !== CACHE_NAME && 
              cacheName !== DATA_CACHE_NAME && 
              cacheName !== IMAGE_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Event: Fetch - handle requests with cache strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests (POST/PUT/DELETE tidak di-cache)
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Skip auth endpoints
  if (url.pathname.includes('/api/auth/')) {
    return;
  }
  
  // Skip AI endpoints (tidak di-cache)
  if (url.pathname.includes('/api/voice-order') || 
      url.pathname.includes('/api/insight')) {
    return;
  }
  
  // Strategy 1: Cache-first for static assets (app shell, fonts, icons)
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }
  
  // Strategy 2: Cache with network fallback for images (Unsplash, etc)
  if (isImage(url)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }
  
  // Strategy 3: Network-first with cache fallback for API data
  if (isAPIRequest(url)) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }
  
  // Default: network-first
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});

// Event: Message - handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLIENTS_CLAIM') {
    console.log('[SW] Received CLIENTS_CLAIM message');
    self.clients.claim();
  }
});

// ===== CACHE STRATEGIES =====

// Cache-first: Check cache, fallback to network
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  if (cached) {
    // Return from cache
    return cached;
  }
  
  // Fetch from network and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[SW] Cache-first fetch failed:', error);
    throw error;
  }
}

// Cache-first for images with limit
async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      // Limit image cache size
      const keys = await cache.keys();
      if (keys.length >= MAX_IMAGE_CACHE) {
        // Delete oldest (first) entry
        await cache.delete(keys[0]);
      }
      
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('[SW] Image fetch failed:', error);
    // Return placeholder or throw
    throw error;
  }
}

// Network-first with cache fallback for API
async function networkFirstWithCache(request) {
  const cache = await caches.open(DATA_CACHE_NAME);
  
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      // Update cache with fresh data
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    // Network failed, try cache
    const cached = await cache.match(request);
    
    if (cached) {
      // Add header to indicate stale data
      const headers = new Headers(cached.headers);
      headers.append('X-From-Cache', 'true');
      
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: headers
      });
    }
    
    throw error;
  }
}

// ===== HELPER FUNCTIONS =====

function isStaticAsset(url) {
  const staticExtensions = ['.html', '.css', '.js', '.json', '.svg', '.woff', '.woff2'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) ||
         url.pathname.includes('/icons/') ||
         url.pathname === '/' ||
         url.pathname === '/dashboard';
}

function isImage(url) {
  return url.pathname.match(/\.(jpg|jpeg|png|gif|webp|ico)$/i) ||
         url.hostname.includes('unsplash.com') ||
         url.hostname.includes('images.unsplash.com');
}

function isAPIRequest(url) {
  return url.pathname.startsWith('/api/') &&
         !url.pathname.includes('/api/auth/') &&
         !url.pathname.includes('/api/voice-order') &&
         !url.pathname.includes('/api/insight');
}

// Background Sync - akan digunakan untuk sync queue
self.addEventListener('sync', event => {
  console.log('[SW] Sync event:', event.tag);
  
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncTransactions());
  }
});

async function syncTransactions() {
  console.log('[SW] Starting transaction sync...');
  
  // Notify all clients to start sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_TRANSACTIONS',
      timestamp: Date.now()
    });
  });
}

console.log('[SW] Service worker loaded:', CACHE_VERSION);
