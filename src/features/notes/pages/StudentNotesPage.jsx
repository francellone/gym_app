/**
 * NotesPage (alumno) — Fase B
 *
 * Página dedicada para que el alumno vea/escriba notas hacia su coach.
 * Usa `getStudentThread` (el alumno NO puede crear threads vía RPC, así
 * que confiamos en que el backfill 8.1 de v24 le creó uno).
 *
 * Render:
 *   - Header simple
 *   - <NotesPanel viewerRole="student" /> con composer habilitado
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2, MessageSquare } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { getStudentThread } from '../api'
import NotesPanel from '../components/NotesPanel'

export default function NotesPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
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
        const { data, error: err } = await getStudentThread(profile.id)
        if (cancelled) return
        if (err) {
          setError(err.message || t('notes.openThreadError'))
          setThread(null)
        } else if (!data) {
          // No debería pasar tras el backfill, pero por las dudas.
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
  }, [profile?.id])

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center">
          <MessageSquare size={18} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{t('notes.pageTitle')}</h1>
          <p className="text-xs text-gray-500">{t('notes.pageSubtitle')}</p>
        </div>
      </div>

      {/* Estados */}
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
          threadId={thread.id}
          viewerRole="student"
          authorId={profile?.id}
          studentId={profile?.id}
        />
      )}
    </div>
  )
}
