/**
 * NotificationBell
 *
 * Campana con badge de no leídas + panel dropdown con lista de notificaciones.
 * Se puede usar tanto en el layout del coach (sidebar) como en el del alumno (header).
 *
 * Props:
 *   userId     string  — id del usuario autenticado
 *   theme      'dark' | 'light'  — 'dark' para el sidebar del coach, 'light' para el alumno
 *   placement  'bottom-right' | 'right'  — cómo posicionar el panel relativo al botón.
 *              'bottom-right' (default): cuelga debajo del botón, alineado a la derecha.
 *                Apto para headers full-width (student y coach mobile).
 *              'right': se proyecta hacia la derecha del botón, alineado arriba.
 *                Apto para sidebars angostos (coach desktop) donde 'bottom-right'
 *                haría que el panel se salga por la izquierda del viewport.
 */

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { resolveNotificationText } from '../utils/resolveNotificationText'
import {
  Bell,
  BellDot,
  CheckCheck,
  Dumbbell,
  Calendar,
  AlertTriangle,
  UserCheck,
  TrendingUp,
  MessageSquare,
  X,
  ClipboardCheck,
  RefreshCw,
  UserCog,
  CalendarCheck,
  Trophy,
  Undo2,
  HelpCircle,
  UserPlus,
  UserX,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { dateLocale } from '@/i18n/dateLocale'

// ── Ícono y color por tipo de notificación ────────────────────
// Identidad (2026-09-27, aprobado por Franco): cinco tonos con significado,
// no un color por tipo.
//   verde    salió bien (sesión, semana, plan terminado, formulario)
//   ámbar    conviene mirarlo (plan por vencer, estancamiento, marca anulada)
//   ciruela  evaluaciones
//   durazno  novedades del plan y mensajes
//   gris     informativo
const TYPE_CONFIG = {
  plan_assigned: {
    Icon: Dumbbell,
    color: 'text-primary-700',
    bg: 'bg-durazno-100',
  },
  activity_update: {
    Icon: UserCheck,
    color: 'text-texto2',
    bg: 'bg-gray-100',
  },
  session_completed: {
    Icon: CheckCheck,
    color: 'text-green-600',
    bg: 'bg-green-100',
  },
  plan_expiring: {
    Icon: Calendar,
    color: 'text-amber-600',
    bg: 'bg-amber-100',
  },
  stagnation_alert: {
    Icon: AlertTriangle,
    color: 'text-amber-600',
    bg: 'bg-amber-100',
  },
  coach_comment: {
    Icon: MessageSquare,
    color: 'text-primary-700',
    bg: 'bg-durazno-100',
  },
  student_note: {
    Icon: MessageSquare,
    color: 'text-primary-700',
    bg: 'bg-durazno-100',
  },
  weekly_summary: {
    Icon: TrendingUp,
    color: 'text-texto2',
    bg: 'bg-gray-100',
  },
  form_submitted: {
    Icon: ClipboardCheck,
    color: 'text-green-600',
    bg: 'bg-green-100',
  },
  evaluation_completed: {
    Icon: ClipboardCheck,
    color: 'text-ciruela-600',
    bg: 'bg-ciruela-100',
  },
  plan_updated: {
    Icon: RefreshCw,
    color: 'text-primary-700',
    bg: 'bg-durazno-100',
  },
  profile_change: {
    Icon: UserCog,
    color: 'text-texto2',
    bg: 'bg-gray-100',
  }, // v55: avisos informativos de hitos (la celebración es de la persona)
  week_completed: {
    Icon: CalendarCheck,
    color: 'text-green-600',
    bg: 'bg-green-100',
  },
  plan_completed: {
    Icon: Trophy,
    color: 'text-green-600',
    bg: 'bg-green-100',
  },
  // v59: la persona no supo cómo hacer un ejercicio → el plan necesita
  // explicación. Ámbar: conviene mirarlo.
  exercise_unclear: {
    Icon: HelpCircle,
    color: 'text-amber-600',
    bg: 'bg-amber-100',
  },
  // v65: vínculo persona ↔ coach
  coach_link_request: {
    Icon: UserPlus,
    color: 'text-primary-700',
    bg: 'bg-durazno-100',
  },
  coach_link_accepted: {
    Icon: UserCheck,
    color: 'text-green-600',
    bg: 'bg-green-100',
  },
  coach_link_rejected: {
    Icon: UserX,
    color: 'text-texto2',
    bg: 'bg-gray-100',
  },
  // v72: catálogo compartido de ejercicios
  catalog_access_request: {
    Icon: UserPlus,
    color: 'text-primary-700',
    bg: 'bg-durazno-100',
  },
  catalog_access_approved: {
    Icon: UserCheck,
    color: 'text-green-600',
    bg: 'bg-green-100',
  },
  catalog_access_denied: {
    Icon: UserX,
    color: 'text-texto2',
    bg: 'bg-gray-100',
  },
  personal_best_voided: {
    Icon: Undo2,
    color: 'text-amber-600',
    bg: 'bg-amber-100',
  },
}

/**
 * Destino de navegación al clickear una notificación.
 * Devuelve `null` cuando el tipo no tiene destino definido (sólo se marca como leída).
 *
 * El payload (`notification.data`) viene poblado por los triggers/RPCs del back.
 * `plan_type` (para plan_assigned/plan_updated) lo inyecta `useNotifications`
 * client-side, ya que el trigger no lo guarda. Todo se deriva en el front,
 * sin migración SQL.
 *
 * Cobertura (B2 + audit 2026-05-30): cada tipo va a donde corresponde según su
 * recipiente (coach o alumno), verificado contra los payloads reales en DB y
 * las rutas de App.jsx.
 *   ALUMNO:
 *     - coach_comment           → panel de notas (Q3)
 *     - plan_assigned/updated    → workout de hoy (training) o la eval (B2)
 *     - weekly_summary           → progreso
 *   COACH:
 *     - student_note             → perfil del alumno, tab Notas (Q3)
 *     - profile_change           → perfil del alumno, tab Historial (Q6)
 *     - activity_update/session_completed/week_completed/plan_completed → perfil del alumno
 *     - personal_best_voided     → perfil del alumno, tab Progreso (v55)
 *     - exercise_unclear         → perfil del alumno, tab Progreso (v59)
 *     - stagnation_alert         → perfil del alumno, tab Progreso (Anto 13a)
 *     - plan_expiring/form_submitted → perfil del alumno
 *   Sin destino (alerta interna): schema_health_alert.
 */
export function getNotificationTargetUrl(notification) {
  const data = notification.data || {}
  switch (notification.type) {
    // ── Notificaciones al ALUMNO ──────────────────────────────
    case 'coach_comment':
      return '/student/notes'
    case 'plan_assigned':
    case 'plan_updated':
      // Evaluación → abre esa evaluación; entrenamiento → workout de hoy.
      // plan_type lo resuelve useNotifications. Si por algún motivo no llegó
      // y es una eval, el plan_id igual permite abrirla; si no, va a workout.
      if (data.plan_type === 'evaluation' && data.plan_id) {
        return `/student/eval/${data.plan_id}`
      }
      return '/student/workout'
    case 'weekly_summary':
      return '/student/progress'
    case 'coach_link_accepted':
    case 'coach_link_rejected':
      return '/student'

    // ── Notificaciones al COACH ───────────────────────────────
    case 'coach_link_request':
      // v65: la lista de personas muestra los pedidos pendientes arriba.
      return '/coach/students'
    // v72: pedidos y respuestas del catálogo viven en Ejercicios
    case 'catalog_access_request':
    case 'catalog_access_approved':
    case 'catalog_access_denied':
      return '/coach/exercises'
    case 'student_note':
      return data.student_id ? `/coach/students/${data.student_id}?tab=notas` : null
    case 'profile_change':
      // tab info = estado actual; history = el diff (audit log).
      return data.student_id ? `/coach/students/${data.student_id}?tab=history` : null
    case 'activity_update':
    case 'session_completed':
    case 'week_completed':
    case 'plan_completed':
      return data.student_id ? `/coach/students/${data.student_id}` : null
    case 'personal_best_voided':
    case 'exercise_unclear':
      // v59: en Progreso la celda del omitido muestra el motivo y la nota.
      return data.student_id ? `/coach/students/${data.student_id}?tab=progress` : null
    case 'evaluation_completed':
      // F1: el alumno cumplió una evaluación → perfil del alumno, tab
      // Evaluaciones (donde el coach ve el resultado cargado).
      return data.student_id ? `/coach/students/${data.student_id}?tab=evaluaciones` : null
    case 'stagnation_alert':
      // Anto (decisión 13a): que lleve al progreso del alumno, no a un chat.
      return data.student_id ? `/coach/students/${data.student_id}?tab=progress` : null
    case 'plan_expiring':
    case 'form_submitted':
      return data.student_id ? `/coach/students/${data.student_id}` : null

    // ── Sin destino (alertas internas/dev) ────────────────────
    case 'schema_health_alert':
    default:
      return null
  }
}

function NotificationItem({ notification, onRead, onNavigate, highlightAsUnread }) {
  const { t } = useTranslation()
  const cfg = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.activity_update
  const { Icon, color, bg } = cfg

  // Title/body en el idioma del viewer (tipos al alumno se resuelven por
  // type+payload desde los locales; el resto usa el texto guardado en BD).
  const { title, body } = resolveNotificationText(notification, t)

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: dateLocale(),
  })

  // `highlightAsUnread` permite mantener el destacado visual aunque la notif
  // ya esté marcada como leída en BD (caso: marcadas al abrir el panel).
  const showAsUnread = highlightAsUnread || !notification.read

  const targetUrl = getNotificationTargetUrl(notification)

  return (
    <button
      onClick={() => {
        if (!notification.read) onRead(notification.id)
        if (targetUrl) onNavigate(targetUrl)
      }}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors
        hover:bg-durazno-50`}
    >
      {/* Ícono */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${bg}`}
      >
        <Icon size={15} className={color} />
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-snug ${showAsUnread ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}
        >
          {title}
        </p>
        {body && (
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed line-clamp-2">{body}</p>
        )}
        <p className="text-[11px] text-gray-300 mt-1">{timeAgo}</p>
      </div>

      {/* Punto de no leída */}
      {showAsUnread && (
        <div
          className="w-2 h-2 rounded-full bg-primary-600 flex-shrink-0 mt-2"
          aria-hidden="true"
        />
      )}
    </button>
  )
}

export default function NotificationBell({ userId, theme = 'dark', placement = 'bottom-right' }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // Set de IDs que estaban unread cuando se abrió el panel.
  // Sirve para mantener el destacado visual mientras el panel está abierto,
  // aunque markAllAsRead las haya marcado como leídas en BD.
  const [wasUnreadAtOpen, setWasUnreadAtOpen] = useState(() => new Set())
  const panelRef = useRef(null)
  const buttonRef = useRef(null)
  const navigate = useNavigate()

  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } =
    useNotifications(userId)

  // Cierra el panel y navega al destino de la notificación.
  function handleNavigate(url) {
    setOpen(false)
    navigate(url)
  }

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Al abrir el panel: snapshot de unread + marcar todas como leídas.
  // Deps deliberadamente solo [open] para que dispare exactamente una vez por
  // apertura (no quiero re-correr cuando cambian notifications/unreadCount/markAllAsRead).

  useEffect(() => {
    if (open) {
      // Capturar IDs unread ANTES de marcar, para mantener el highlight visual
      const unreadIds = new Set(notifications.filter((n) => !n.read).map((n) => n.id))
      setWasUnreadAtOpen(unreadIds)
      if (unreadCount > 0) markAllAsRead()
    } else {
      // Al cerrar, limpiar el snapshot
      setWasUnreadAtOpen(new Set())
    }
  }, [open])

  // Estilos según tema
  const btnBase =
    theme === 'dark'
      ? 'text-slate-400 hover:bg-white/8 hover:text-slate-200'
      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'

  // Posicionamiento del panel según placement
  const panelPosition =
    placement === 'right'
      ? 'left-full ml-3 bottom-0' // a la derecha del botón, alineado abajo (sidebar coach)
      : 'right-0 mt-2' // default: debajo del botón, alineado a la derecha

  return (
    <div className="relative">
      {/* Botón campana */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        className={`relative p-2 rounded-lg transition-colors ${btnBase}`}
        aria-label={
          unreadCount > 0
            ? t('notifications.bellAriaUnread', { count: unreadCount })
            : t('notifications.bellAria')
        }
      >
        {unreadCount > 0 ? <BellDot size={18} /> : <Bell size={18} />}

        {/* Badge contador */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5
                           bg-primary-700 text-white text-[10px] font-bold rounded-full
                           flex items-center justify-center leading-none"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel dropdown */}
      {open && (
        <div
          ref={panelRef}
          className={`absolute ${panelPosition} w-80 bg-white rounded-2xl shadow-xl border border-gray-100
                     z-50 overflow-hidden flex flex-col`}
          style={{ maxHeight: '420px' }}
        >
          {/* Header del panel */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">
                {t('notifications.title')}
              </span>
              {unreadCount > 0 && (
                <span className="bg-durazno-100 text-primary-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 text-xs text-primary-700 hover:bg-durazno-50 rounded-lg transition-colors
                             flex items-center gap-1 font-medium"
                  title={t('notifications.markAllTitle')}
                >
                  <CheckCheck size={14} />
                  <span className="hidden sm:inline">{t('notifications.markAll')}</span>
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
                <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <Bell size={20} className="text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600">{t('notifications.emptyTitle')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('notifications.emptyBody')}</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={markAsRead}
                  onNavigate={handleNavigate}
                  highlightAsUnread={wasUnreadAtOpen.has(n.id)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
              <p className="text-[11px] text-gray-400 text-center">
                {t('notifications.showingLast', { count: notifications.length })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
