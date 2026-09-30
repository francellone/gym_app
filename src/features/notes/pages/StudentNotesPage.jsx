/**
 * NotesPage (persona que entrena)
 *
 * v67: cada persona puede tener dos hilos.
 *   - Sin coach: solo su hilo personal (notas y comentarios de entrenamiento
 *     que solo ella ve).
 *   - Con coach: dos pestañas, "Con tu coach" (el chat de siempre) y
 *     "Privadas" (su hilo personal). Los comentarios de ejercicios van
 *     siempre al hilo de la coach; acá la persona elige dónde escribe una
 *     nota suelta según la pestaña en la que está.
 * Los hilos se resuelven con getStudentThread (RPC my_note_thread), que los
 * crea si faltan.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2, Lock, MessageSquare } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { getStudentThread } from '../api'
import NotesPanel from '../components/NotesPanel'

export default function NotesPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const hasCoach = Boolean(profile?.coach_id) && profile?.coach_id !== profile?.id
  const [tab, setTab] = useState('coach')
  const isPrivate = !hasCoach || tab === 'private'
  const [thread, setThread] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!profile?.id) return
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await getStudentThread(profile.id, { private: isPrivate })
        if (cancelled) return
        if (err) {
          setError(err.message || t('notes.openThreadError'))
          setThread(null)
        } else if (!data) {
          setError(t('notes.threadNotInitialized'))
          setThread(null)
        } else {
          setThread(data)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || t('notes.unexpectedThreadError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [profile?.id, isPrivate, t])

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center">
          <MessageSquare size={18} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">
            {hasCoach ? t('notes.pageTitle') : t('notes.pageTitlePersonal')}
          </h1>
          <p className="text-xs text-gray-500">
            {hasCoach ? t('notes.pageSubtitle') : t('notes.pageSubtitlePersonal')}
          </p>
        </div>
      </div>

      {hasCoach && (
        <div role="tablist" className="flex gap-1 p-1 rounded-xl bg-gray-100">
          {[
            { key: 'coach', label: t('notes.tabCoach'), Icon: MessageSquare },
            { key: 'private', label: t('notes.tabPrivate'), Icon: Lock },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${
                tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}

      {hasCoach && tab === 'private' && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Lock size={12} aria-hidden="true" />
          {t('notes.privateHint')}
        </p>
      )}

      {loading && (
        <div className="card flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      )}

      {!loading && error && (
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-start gap-2 text-red-700 text-sm">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <p className="flex-1">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && thread && (
        <NotesPanel
          key={thread.id}
          threadId={thread.id}
          viewerRole="student"
          authorId={profile?.id}
          studentId={profile?.id}
          personal={isPrivate}
        />
      )}
    </div>
  )
}
