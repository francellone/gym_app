/**
 * NotificationBell
 *
 * Campana con badge de no leídas + panel dropdown con lista de notificaciones.
 * Se puede usar tanto en el layout del coach (sidebar) como en el del alumno (header).
 *
 * Props:
 *   userId    string  — id del usuario autenticado
 *   theme     'dark' | 'light'  — 'dark' para el sidebar del coach, 'light' para el alumno
 */

import { useState, useRef, useEffect } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import {
  Bell, BellDot, CheckCheck, Dumbbell, Calendar,
  AlertTriangle, UserCheck, TrendingUp, MessageSquare, X
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Ícono y color por tipo de notificación ────────────────────
const TYPE_CONFIG = {
  plan_assigned: {
    Icon:  Dumbbell,
    color: 'text-blue-500',
    bg:    'bg-blue-50',
  },
  activity_update: {
    Icon:  UserCheck,
    color: 'text-green-500',
    bg:    'bg-green-50',
  },
  session_completed: {
    Icon:  CheckCheck,
    color: 'text-emerald-500',
    bg:    'bg-emerald-50',
  },
  plan_expiring: {
    Icon:  Calendar,
    color: 'text-amber-500',
    bg:    'bg-amber-50',
  },
  stagnation_alert: {
    Icon:  AlertTriangle,
    color: 'text-red-500',
    bg:    'bg-red-50',
  },
  coach_comment: {
    Icon:  MessageSquare,
    color: 'text-purple-500',
    bg:    'bg-purple-50',
  },
  weekly_summary: {
    Icon:  TrendingUp,
    color: 'text-indigo-500',
    bg:    'bg-indigo-50',
  },
}

function NotificationItem({ notification, onRead }) {
  const cfg   = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.activity_update
  const { Icon, color, bg } = cfg

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: es,
  })

  return (
    <button
      onClick={() => !notification.read && onRead(notification.id)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors
        hover:bg-gray-50 ${!notification.read ? 'bg-blue-50/30' : ''}`}
    >
      {/* Ícono */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${bg}`}>
        <Icon size={15} className={color} />
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${notification.read ? 'text-gray-600' : 'text-gray-900 font-semibold'}`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="text-[11px] text-gray-300 mt-1">{timeAgo}</p>
      </div>

      {/* Punto de no leída */}
      {!notification.read && (
        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
      )}
    </button>
  )
}

export default function NotificationBell({ userId, theme = 'dark' }) {
  const [open, setOpen] = useState(false)
  const panelRef        = useRef(null)
  const buttonRef       = useRef(null)

  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
  } = useNotifications(userId)

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        panelRef.current  && !panelRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Estilos según tema
  const btnBase = theme === 'dark'
    ? 'text-slate-400 hover:bg-white/8 hover:text-slate-200'
    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'

  return (
    <div className="relative">
      {/* Botón campana */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(prev => !prev)}
        className={`relative p-2 rounded-lg transition-colors ${btnBase}`}
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} nuevas)` : ''}`}
      >
        {unreadCount > 0 ? <BellDot size={18} /> : <Bell size={18} />}

        {/* Badge contador */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5
                           bg-red-500 text-white text-[10px] font-bold rounded-full
                           flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel dropdown */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100
                     z-50 overflow-hidden flex flex-col"
          style={{ maxHeight: '420px' }}
        >
          {/* Header del panel */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">Notificaciones</span>
              {unreadCount > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors
                             flex items-center gap-1 font-medium"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck size={14} />
                  <span className="hidden sm:inline">Marcar todo</span>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <Bell size={20} className="text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600">Sin notificaciones</p>
                <p className="text-xs text-gray-400 mt-1">
                  Acá vas a ver la actividad importante
                </p>
              </div>
            ) : (
              notifications.map(n => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={markAsRead}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
              <p className="text-[11px] text-gray-400 text-center">
                Mostrando las últimas {notifications.length} notificaciones
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
