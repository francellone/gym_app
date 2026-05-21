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

const PAGE_SIZE = 30

export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [loading, setLoading]             = useState(true)
  const channelRef                        = useRef(null)

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
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.read).length)
    }
    setLoading(false)
  }, [userId])

  // ── Marcar una como leída ─────────────────────────────────
  const markAsRead = useCallback(async (notificationId) => {
    // Guardar snapshot previo para poder revertir si falla el UPDATE
    let prevNotifications
    let prevUnread
    setNotifications(prev => {
      prevNotifications = prev
      return prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    })
    setUnreadCount(prev => {
      prevUnread = prev
      return Math.max(0, prev - 1)
    })

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) {
      console.error('[useNotifications] markAsRead failed:', error)
      // Revertir
      setNotifications(prevNotifications)
      setUnreadCount(prevUnread)
    }
  }, [userId])

  // ── Marcar todas como leídas ──────────────────────────────
  // No-op si no hay unread (evita UPDATE innecesario). No devuelve nada.
  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0) return

    // Guardar snapshot previo (array entero) para poder revertir
    let prevNotifications
    let prevUnread
    setNotifications(prev => {
      prevNotifications = prev
      return prev.map(n => ({ ...n, read: true }))
    })
    setUnreadCount(prev => {
      prevUnread = prev
      return 0
    })

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      console.error('[useNotifications] markAllAsRead failed:', error)
      // Revertir
      setNotifications(prevNotifications)
      setUnreadCount(prevUnread)
    }
  }, [userId, unreadCount])

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
          setNotifications(prev => [newNotif, ...prev].slice(0, PAGE_SIZE))
          setUnreadCount(prev => prev + 1)

          // Mostrar notificación nativa del browser si la pestaña no está activa
          if (
            document.visibilityState !== 'visible' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            new Notification(newNotif.title, {
              body:  newNotif.body || '',
              icon:  '/favicon.svg',
              badge: '/favicon.svg',
            })
          }
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
          setNotifications(prev => {
            const next = prev.map(n =>
              n.id === updated.id ? { ...n, ...updated } : n
            )
            // Recontar unread desde el state nuevo (más robusto que ±1)
            setUnreadCount(next.filter(n => !n.read).length)
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
