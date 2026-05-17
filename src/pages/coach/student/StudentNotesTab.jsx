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
import { useAuth } from '../../../contexts/AuthContext'
import { getOrCreateThread } from '../../../lib/notes'
import NotesPanel from '../../../components/notes/NotesPanel'

export default function StudentNotesTab({ studentId }) {
  const { profile } = useAuth()
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
          setError('Solo el coach puede abrir este panel.')
          setThreadId(null)
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await getOrCreateThread(profile.id, studentId)
        if (cancelled) return
        if (err) {
          setError(err.message || 'No se pudo abrir el hilo de notas.')
          setThreadId(null)
        } else if (!data) {
          setError('No se pudo obtener el hilo de notas.')
          setThreadId(null)
        } else {
          setThreadId(data)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Error inesperado al abrir el hilo.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
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
            <p className="font-medium">No pudimos abrir las notas</p>
            <p className="text-xs text-red-600 mt-0.5">
              {error || 'Hilo no disponible.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Panel ──────────────────────────────────────────────────
  return (
    <NotesPanel
      threadId={threadId}
      viewerRole="coach"
      authorId={profile?.id}
    />
  )
}
