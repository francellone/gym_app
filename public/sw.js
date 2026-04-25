/**
 * Service Worker — GymCoach
 *
 * Maneja eventos push del servidor para mostrar notificaciones
 * nativas del sistema operativo, incluso con la app cerrada.
 *
 * Registro: se hace automáticamente desde main.jsx
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

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
