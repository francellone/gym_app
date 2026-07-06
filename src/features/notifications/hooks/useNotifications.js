/**
 * useNotifications
 *
 * Hook que gestiona las notificaciones del usuario logueado:
 *  - Carga inicial desde Supabase
 *  - Suscripción Realtime para recibir nuevas en tiempo real
 *  - Marcar como leída(s)
 *  - Conteo de no leídas
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import i18n from '@/i18n'
import { resolveNotificationText } from '../utils/resolveNotificationText'

const PAGE_SIZE = 30

// Tipos de notif que necesitan datos del plan que el trigger NO guarda en el
// payload, así que los resolvemos client-side (cubre también las notifs
// viejas, sin migración):
//  - plan_type  → deep-link correcto (entrenamiento vs evaluación)
//  - plan_title → texto i18n del alumno (resolveNotificationText)
const PLAN_LINKED_TYPES = new Set(['plan_assigned', 'plan_updated', 'plan_expiring'])

function needsPlanEnrichment(n) {
  return (
    PLAN_LINKED_TYPES.has(n.type) && n.data?.plan_id && (!n.data?.plan_type || !n.data?.plan_title)
  )
}

async function enrichWithPlanType(notifs) {
  const planIds = [...new Set(notifs.filter(needsPlanEnrichment).map((n) => n.data.plan_id))]
  if (planIds.length === 0) return notifs

  const { data: plans } = await supabase
    .from('plans')
    .select('id, plan_type, title')
    .in('id', planIds)
  const byId = new Map((plans || []).map((p) => [p.id, p]))

  return notifs.map((n) => {
    if (!needsPlanEnrichment(n)) return n
    const plan = byId.get(n.data.plan_id)
    return {
      ...n,
      data: {
        ...n.data,
        plan_type: n.data.plan_type ?? plan?.plan_type ?? null,
        plan_title: n.data.plan_title ?? plan?.title ?? null,
      },
    }
  })
}

export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const channelRef = useRef(null)

  // ── Cargar notificaciones ──────────────────────────────────
  const load = useCallback(async () => {
    if (!userId) return

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (!error && data) {
      const enriched = await enrichWithPlanType(data)
      setNotifications(enriched)
      setUnreadCount(enriched.filter((n) => !n.read).length)
    }
    setLoading(false)
  }, [userId])

  // ── Marcar una como leída ─────────────────────────────────
  // Nota técnica: el snapshot para rollback se captura desde el closure
  // (state al momento de llamar markAsRead), NO desde dentro del updater
  // de setState. El patrón viejo (capturar prev dentro del updater) era
  // frágil en React 18 + tests con act: el updater puede ejecutarse
  // diferido, dejando el snapshot undefined cuando el rollback corre.
  // Ver `useNotifications.test.jsx` para el caso que lo expuso.
  const markAsRead = useCallback(
    async (notificationId) => {
      const prevNotifications = notifications
      const prevUnread = unreadCount

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .eq('user_id', userId)

      if (error) {
        console.error('[useNotifications] markAsRead failed:', error)
        setNotifications(prevNotifications)
        setUnreadCount(prevUnread)
      }
    },
    [userId, notifications, unreadCount]
  )

  // ── Marcar todas como leídas ──────────────────────────────
  // No-op si no hay unread (evita UPDATE innecesario). No devuelve nada.
  // Snapshot desde closure por las mismas razones que markAsRead.
  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0) return

    const prevNotifications = notifications
    const prevUnread = unreadCount

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      console.error('[useNotifications] markAllAsRead failed:', error)
      setNotifications(prevNotifications)
      setUnreadCount(prevUnread)
    }
  }, [userId, unreadCount, notifications])

  // ── Realtime ───────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return

    load()

    // Suscribirse a INSERT de nuevas notificaciones propias y a UPDATE
    // (para sincronizar entre pestañas cuando se marca como leída en otra)
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new
          // Enriquecer con plan_type/plan_title (async) para que el deep-link
          // y el texto i18n sean correctos ni bien llega; mientras resuelve,
          // igual se muestra la notif.
          enrichWithPlanType([newNotif]).then(([enriched]) => {
            setNotifications((prev) => [enriched, ...prev].slice(0, PAGE_SIZE))

            // Mostrar notificación nativa del browser si la pestaña no está
            // activa — con el texto resuelto en el idioma del viewer.
            if (
              document.visibilityState !== 'visible' &&
              'Notification' in window &&
              Notification.permission === 'granted'
            ) {
              const { title, body } = resolveNotificationText(enriched, i18n.t)
              new Notification(title, {
                body: body || '',
                icon: '/favicon.svg',
                badge: '/favicon.svg',
              })
            }
          })
          setUnreadCount((prev) => prev + 1)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new
          setNotifications((prev) => {
            const next = prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n))
            // Recontar unread desde el state nuevo (más robusto que ±1)
            setUnreadCount(next.filter((n) => !n.read).length)
            return next
          })
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, load])

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    reload: load,
  }
}
