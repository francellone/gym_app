import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  readLogReps,
  readLogWeights,
  blockTypeLabel,
  blockTypeIcon,
} from '@/features/plans/helpers'
import { blockRowName, blockPrescriptionSummary, displayBlockLogMain } from '../blockRowsLogic'

// PSE con color según nivel (compartido por las dos tarjetas)
function PseBadge({ value }) {
  if (!value) return null
  return (
    <span
      className={`badge mt-1 ${
        value >= 8
          ? 'bg-red-100 text-red-700'
          : value >= 5
            ? 'bg-yellow-100 text-yellow-700'
            : 'bg-green-100 text-green-700'
      }`}
    >
      PSE {value}
    </span>
  )
}

// v53 — tarjeta de un registro de bloque (aeróbico / circuito)
function BlockLogCard({ log }) {
  const block = log.block || { title: log.block_title, block_type: log.block_type }
  const type = log.block_type || block.block_type
  const name = blockRowName({ ...block, block_type: type }, log.exercise?.name || null)
  const prescription = blockPrescriptionSummary({ ...block, block_type: type })
  return (
    <div className="card bg-sky-50/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm text-gray-900 truncate">
              <span className="mr-1" aria-hidden>
                {blockTypeIcon(type)}
              </span>
              {name}
            </p>
            <span
              className={`badge text-xs ${
                type === 'aerobic' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'
              }`}
            >
              {blockTypeLabel(type)}
            </span>
            {log.logged_late && (
              <span className="badge bg-orange-100 text-orange-600 text-xs">Registrado tarde</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {[displayBlockLogMain(log), prescription && `plan: ${prescription}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {log.notes && <p className="text-xs text-gray-400 mt-1 italic truncate">"{log.notes}"</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-500">{format(parseISO(log.logged_date), 'dd/MM/yy')}</p>
          <PseBadge value={log.perceived_difficulty} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// StudentLogsTab — visualización de logs recientes del alumno
// Props: logs (workout_logs), blockLogs (workout_block_logs, v53)
// Se intercalan por fecha, más reciente primero.
// ─────────────────────────────────────────────────────────────
export default function StudentLogsTab({ logs, blockLogs = [] }) {
  const items = useMemo(() => {
    const all = [
      ...logs.map((l) => ({ kind: 'exercise', log: l })),
      ...blockLogs.map((b) => ({ kind: 'block', log: b })),
    ]
    return all.sort((a, b) => {
      const d = (b.log.logged_date || '').localeCompare(a.log.logged_date || '')
      if (d !== 0) return d
      return (b.log.created_at || '').localeCompare(a.log.created_at || '')
    })
  }, [logs, blockLogs])

  if (items.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-400">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Sin registros aún</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map(({ kind, log }) =>
        kind === 'block' ? (
          <BlockLogCard key={`blk-${log.id}`} log={log} />
        ) : (
          <div key={log.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {log.plan_exercise?.exercise?.name || 'Ejercicio'}
                  </p>
                  {log.logged_late && (
                    <span className="badge bg-orange-100 text-orange-600 text-xs">
                      Registrado tarde
                    </span>
                  )}
                </div>
                {(() => {
                  const reps = readLogReps(log).filter((r) => r != null && r !== '')
                  const weights = readLogWeights(log).filter((w) => w != null && w !== '')
                  const repsDisplay =
                    reps.length > 0
                      ? `${reps.join(',')} ${log.reps_unit && log.reps_unit !== 'reps' ? log.reps_unit : 'reps'}${log.unilateral ? '/lado' : ''}`
                      : null
                  const wDisplay = weights.length > 0 ? `${weights.join(',')}kg` : null
                  const modeDisplay =
                    log.weight_mode === 'bodyweight'
                      ? 'sin peso'
                      : log.weight_mode === 'barbell_only'
                        ? 'solo barra'
                        : null
                  return (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[
                        log.actual_sets && `${log.actual_sets} series`,
                        repsDisplay,
                        wDisplay,
                        !wDisplay && modeDisplay,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )
                })()}
                {log.notes && (
                  <p className="text-xs text-gray-400 mt-1 italic truncate">"{log.notes}"</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-500">
                  {format(parseISO(log.logged_date), 'dd/MM/yy')}
                </p>
                <PseBadge value={log.perceived_difficulty} />
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}
