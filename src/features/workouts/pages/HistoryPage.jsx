import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Clock, ChevronDown, ChevronUp, CheckCircle2, Circle } from 'lucide-react'
import { readLogReps, readLogWeights } from '@/features/plans/helpers'
import { fetchSingleMirrorBodies } from '@/features/notes/api'

function SessionGroup({ date, logs, session }) {
  const [expanded, setExpanded] = useState(false)
  const completedCount = logs.filter((l) => l.completed).length

  const sessionDuration = (() => {
    if (!session?.started_at || !session?.finished_at) return null
    const mins = Math.round((new Date(session.finished_at) - new Date(session.started_at)) / 60000)
    return mins > 0 ? mins : null
  })()

  return (
    <div className="card overflow-hidden">
      <button className="w-full flex items-center gap-3" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 text-left">
          <p className="font-semibold text-sm text-gray-900 capitalize">
            {format(parseISO(date), "EEEE d 'de' MMMM", { locale: es })}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap">
            <span>
              {completedCount}/{logs.length} ejercicios completados
            </span>
            {sessionDuration !== null && (
              <>
                <span className="text-gray-300">·</span>
                <span className="inline-flex items-center gap-0.5 text-primary-500 font-medium">
                  <Clock size={10} />
                  {sessionDuration} min
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1">
            {logs.slice(0, 4).map((log, i) => (
              <div
                key={i}
                className={`w-5 h-5 rounded-full border-2 border-white ${
                  log.completed ? 'bg-green-400' : 'bg-gray-200'
                }`}
              />
            ))}
            {logs.length > 4 && (
              <div className="w-5 h-5 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center">
                <span className="text-xs text-gray-500">+{logs.length - 4}</span>
              </div>
            )}
          </div>
          {expanded ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          {session?.started_at && session?.finished_at && sessionDuration !== null && (
            <div className="flex items-center gap-3 text-xs text-gray-400 pb-2 border-b border-gray-50">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {format(new Date(session.started_at), 'HH:mm')} →{' '}
                {format(new Date(session.finished_at), 'HH:mm')}
              </span>
              <span className="font-medium text-primary-500">{sessionDuration} min</span>
            </div>
          )}
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2.5">
              {log.completed ? (
                <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {log.plan_exercise?.exercise?.name || 'Ejercicio'}
                </p>
                {(() => {
                  const reps = readLogReps(log).filter((r) => r != null && r !== '')
                  const weights = readLogWeights(log).filter((w) => w != null && w !== '')
                  const repsDisplay =
                    reps.length > 0 ? `× ${reps.join(',')}${log.unilateral ? '/lado' : ''}` : null
                  const wDisplay = weights.length > 0 ? `${weights.join(',')}kg` : null
                  const modeDisplay =
                    log.weight_mode === 'bodyweight'
                      ? 'BW'
                      : log.weight_mode === 'barbell_only'
                        ? 'solo barra'
                        : null
                  return (
                    <p className="text-xs text-gray-500">
                      {[
                        log.actual_sets && `${log.actual_sets} series`,
                        repsDisplay,
                        wDisplay,
                        !wDisplay && modeDisplay,
                        log.perceived_difficulty && `PSE ${log.perceived_difficulty}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )
                })()}
                {log.notes && (
                  <p className="text-xs text-gray-400 mt-0.5 italic truncate">"{log.notes}"</p>
                )}
              </div>
              {log.plan_exercise?.block_label && (
                <span className="badge bg-gray-100 text-gray-500 flex-shrink-0 text-xs">
                  {log.plan_exercise.block_label}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HistoryPage() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState([])
  const [sessions, setSessions] = useState({}) // keyed by logged_date
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  useEffect(() => {
    if (profile?.id) fetchLogs()
  }, [profile, page])

  async function fetchLogs() {
    const { data, error } = await supabase
      .from('workout_logs')
      .select(
        `
        *,
        plan_exercise:plan_exercises!plan_exercise_id(
          block_label, section,
          exercise:exercises!exercise_id(name)
        )
      `
      )
      .eq('student_id', profile.id)
      .order('logged_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (!error && data) {
      // Round 2a: traer body de notas mirror (context_type='workout_log')
      // y reemplazar log.notes con el panel. La columna workout_logs.notes
      // sigue viva como compat; en round 2b se dropea.
      const logIds = data.map((l) => l.id)
      const bodiesMap = await fetchSingleMirrorBodies({
        contextType: 'workout_log',
        contextIds: logIds,
      })
      const dataWithMirror = data.map((l) => ({
        ...l,
        notes: bodiesMap.get(l.id) ?? l.notes ?? null,
      }))

      const newLogs = page === 0 ? dataWithMirror : [...logs, ...dataWithMirror]
      setLogs(newLogs)

      // Fetch workout_sessions for the dates visible in this page
      const dates = [...new Set(data.map((l) => l.logged_date))]
      if (dates.length > 0) {
        const { data: sessData } = await supabase
          .from('workout_sessions')
          .select('logged_date, started_at, finished_at, plan_id')
          .eq('student_id', profile.id)
          .in('logged_date', dates)

        if (sessData) {
          // Index by date; if multiple sessions per date, prefer the one with finished_at
          const sessMap = { ...sessions }
          sessData.forEach((s) => {
            if (!sessMap[s.logged_date] || s.finished_at) {
              sessMap[s.logged_date] = s
            }
          })
          setSessions(sessMap)
        }
      }
    }
    setLoading(false)
  }

  // Group logs by date
  const groupedLogs = {}
  logs.forEach((log) => {
    const date = log.logged_date
    if (!groupedLogs[date]) groupedLogs[date] = []
    groupedLogs[date].push(log)
  })

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 pt-12 pb-4">
        <h1 className="text-xl font-bold text-gray-900">Historial</h1>
        <p className="text-sm text-gray-500 mt-0.5">Todos tus entrenamientos</p>
      </div>

      <div className="px-4 py-4 space-y-3">
        {loading && page === 0 ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : Object.keys(groupedLogs).length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Sin historial aún</p>
            <p className="text-gray-400 text-sm mt-1">Acá verás todos tus entrenamientos</p>
          </div>
        ) : (
          <>
            {Object.entries(groupedLogs).map(([date, dateLogs]) => (
              <SessionGroup
                key={date}
                date={date}
                logs={dateLogs}
                session={sessions[date] || null}
              />
            ))}

            {logs.length >= (page + 1) * PAGE_SIZE && (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary w-full text-sm"
              >
                Cargar más
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
