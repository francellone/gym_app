/**
 * Service Worker — GymCoach
 *
 * Dos responsabilidades:
 *   1. Push del servidor → notificaciones nativas (aunque la app esté cerrada).
 *   2. Caché del app-shell → reabrir rápido + tolerancia offline básica,
 *      SIN quedar pegado en una versión vieja tras un deploy.
 *
 * Estrategia de caché (clave para que los deploys sean "seguros"):
 *   - Navegación / HTML  → network-first. Estando online SIEMPRE traés el
 *     último index.html (que referencia los JS/CSS hasheados nuevos). Solo
 *     caés a caché si estás sin conexión. Esto evita el problema clásico de
 *     iOS de servir el bundle viejo de la PWA instalada.
 *   - Assets same-origin (JS/CSS/img/fuentes, hasheados por Vite = inmutables)
 *     → cache-first, así el reabrir es instantáneo.
 *   - Cross-origin (ej. Supabase / API / auth) → NO se toca: siempre a la red.
 *
 * Registro: automático desde main.jsx. main.jsx además recarga una vez cuando
 * un SW nuevo toma control (controllerchange), para aplicar deploys nuevos.
 */

// Subir esta versión para purgar la caché (cambios de lógica del SW).
const CACHE_VERSION = 'v1'
const CACHE_NAME = `gymcoach-shell-${CACHE_VERSION}`

// Shell mínimo con rutas estables (no hasheadas) que precacheamos en install.
const PRECACHE_URLS = ['/', '/index.html', '/manifest.json', '/favicon.svg']

// ── Install: precache + activar de inmediato ──────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // tolerante: si alguna URL falla, no rompemos el install.
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  )
  self.skipWaiting()
})

// ── Activate: borrar cachés viejas + tomar control ────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('gymcoach-shell-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

// ── Fetch: estrategia de caché ────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request

  // Solo GET same-origin. Nada de POST ni cross-origin (Supabase/API/auth):
  // esos van SIEMPRE a la red, sin cachearse (datos dinámicos + sesión).
  if (req.method !== 'GET') return
  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (url.origin !== self.location.origin) return

  const accept = req.headers.get('accept') || ''
  const isNavigation = req.mode === 'navigate' || accept.includes('text/html')

  if (isNavigation) {
    // HTML → network-first (freshness). Cae a caché solo si estás offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
          return res
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('/index.html'))
        )
    )
    return
  }

  // Assets estáticos → cache-first (instantáneo), se cachean al vuelo.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        // Solo cacheamos respuestas propias y OK (evita opacas/errores).
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
        }
        return res
      })
    })
  )
})

// ── Recibir push del servidor ─────────────────────────────────
// El payload lo arma la edge function `send-push`:
//   { title, body, url, tag, type, id, countBody }
// `countBody` es el texto a usar cuando hay más de un aviso del mismo tag
// ("{{count}} mensajes nuevos"), ya en el idioma de quien lo recibe.
// `url` es /n/<id del aviso>: la app resuelve el destino real con la misma
// lógica que la campana, así acá no hay un mapeo de tipos que mantener.
// Los avisos se muestran de a uno: si llegan varios juntos (el servidor
// despacha en tanda), cada uno tiene que ver al anterior ya en pantalla para
// poder contarlo.
let pushQueue = Promise.resolve()

async function showPush(payload) {
  const { title = 'GymCoach', body = '', url = '/', tag, type, id, countBody } = payload

  const options = {
    body,
    icon: '/icon-192.png',
    data: { url, type, id, count: 1 },
    vibrate: [100, 50, 100],
    timestamp: Date.now(),
  }
  // Mismo tag = el aviso nuevo reemplaza al anterior (varias notas seguidas
  // de la misma persona no apilan avisos), pero vuelve a sonar.
  if (tag) {
    options.tag = tag
    options.renotify = true
    // Si el anterior sigue en pantalla, este dice cuántos son en vez de
    // mostrar solo el último texto. La cuenta vuelve a 1 cuando la persona
    // abre o descarta el aviso.
    try {
      const shown = await self.registration.getNotifications({ tag })
      if (shown.length > 0) {
        options.data.count = Math.max(...shown.map((n) => n.data?.count ?? 1)) + 1
      }
    } catch {
      /* sin getNotifications: se muestra el último, como antes */
    }
    if (options.data.count > 1 && countBody) {
      options.body = countBody.replace('{{count}}', String(options.data.count))
    }
  }

  await self.registration.showNotification(title, options)
}

self.addEventListener('push', (event) => {
  let payload = {}

  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { title: 'GymCoach', body: event.data?.text() ?? '' }
  }

  pushQueue = pushQueue.catch(() => {}).then(() => showPush(payload))
  event.waitUntil(pushQueue)
})

// ── Click en la notificación → abrir la app ───────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Si ya hay una ventana abierta, enfocarla y navegar (main.jsx escucha
      // el mensaje NAVIGATE).
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl })
          return client.focus()
        }
      }
      // Si no hay ventana, abrir una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
