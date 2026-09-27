/**
 * StudentNotesTab
 *
 * Tab "Notas" en StudentDetailPage. Solo coach (Fase A).
 *
 * Responsabilidades:
 *   - useAuth() para obtener coach_id
 *   - Llamar getOrCreateThread(coachId, studentId) al montar
 *   - Loading / error state mientras se resuelve el threadId
 *   - Delegar render a <NotesPanel viewerRole="coach" />
 *
 * Props:
 *   studentId — UUID del alumno (del URL /coach/students/:id)
 */

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/AuthContext'
import { getOrCreateThreadForStudent } from '../api'
import NotesPanel from '../components/NotesPanel'

export default function StudentNotesTab({ studentId }) {
  const { profile } = useAuth()
  const { t } = useTranslation()
  const [threadId, setThreadId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!profile?.id || !studentId) return
      // Guard: este tab es exclusivo del coach. Si por algún motivo
      // se monta para un usuario sin rol coach, evitamos llamar la
      // RPC (RLS la rechazaría con 42501 ruidoso) y mostramos un
      // mensaje claro.
      if (profile.role !== 'coach') {
        if (!cancelled) {
          setError(t('coach.notes.tab.coachOnly'))
          setThreadId(null)
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        // Multi-coach (v31): pasamos profile.id del coach logueado.
        // El RPC del back valida que el alumno esté asignado a este
        // coach (o que no tenga coach todavía).
        const { data, error: err } = await getOrCreateThreadForStudent(studentId, profile.id)
        if (cancelled) return
        if (err) {
          setError(err.message || t('coach.notes.tab.openError'))
          setThreadId(null)
        } else if (!data) {
          setError(t('coach.notes.tab.fetchError'))
          setThreadId(null)
        } else {
          setThreadId(data)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || t('coach.notes.tab.unexpectedError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // t fuera de deps: el texto del error no justifica re-abrir el hilo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role, studentId])

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="card flex items-center justify-center py-10">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────
  if (error || !threadId) {
    return (
      <div className="card bg-red-50 border-red-200">
        <div className="flex items-start gap-2 text-red-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">{t('coach.notes.tab.errorTitle')}</p>
            <p className="text-xs text-red-600 mt-0.5">
              {error || t('coach.notes.tab.unavailable')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Panel ──────────────────────────────────────────────────
  return <NotesPanel threadId={threadId} viewerRole="coach" authorId={profile?.id} />
}
