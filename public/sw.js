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
self.addEventListener('push', (event) => {
  let payload = {}

  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { title: 'GymCoach', body: event.data?.text() ?? '' }
  }

  const {
    title = 'GymCoach',
    body  = '',
    icon  = '/favicon.svg',
    badge = '/favicon.svg',
    data  = {},
  } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data,
      vibrate:   [100, 50, 100],
      timestamp: Date.now(),
    })
  )
})

// ── Click en la notificación → abrir la app ───────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const notifData = event.notification.data ?? {}

  // Construir la URL de destino según el tipo de notificación
  let targetUrl = '/'
  const type = notifData.type

  if (type === 'plan_assigned' || type === 'plan_expiring') {
    targetUrl = notifData.plan_id
      ? `/student/workout`
      : '/student'
  } else if (type === 'activity_update' || type === 'session_completed') {
    targetUrl = notifData.student_id
      ? `/coach/students/${notifData.student_id}`
      : '/coach'
  } else if (type === 'stagnation_alert') {
    targetUrl = notifData.student_id
      ? `/coach/students/${notifData.student_id}`
      : '/coach/students'
  } else if (type === 'weekly_summary') {
    targetUrl = notifData.student_id ? '/coach' : '/student/progress'
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Si ya hay una ventana abierta, enfocarla y navegar
        for (const client of clients) {
          if ('focus' in client) {
            client.focus()
            client.postMessage({ type: 'NAVIGATE', url: targetUrl })
            return
          }
        }
        // Si no hay ventana, abrir una nueva
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
      })
  )
})
