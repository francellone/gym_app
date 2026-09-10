import { useEffect, useMemo, useState } from 'react'
import { Copy, GitMerge, Video, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchUsage, usageSummary } from '../exerciseUsage'

// ============================================================
// Posibles duplicados del catálogo (v46, decisión D2)
// ------------------------------------------------------------
// Los grupos salen de exercise_duplicate_candidates(): mismo nombre
// normalizado, o mismo video con distinto nombre (esos son los que un buscador
// por nombre nunca muestra juntos). En cada grupo se elige cuál queda (por
// defecto el que más historial tiene) y se fusionan los otros de a uno,
// pasando por el modal de fusión con su preview.
// ============================================================

function pickCanonical(ids, usageById, byId) {
  return [...ids].sort((a, b) => {
    const la = usageById[a]?.workout_logs || 0
    const lb = usageById[b]?.workout_logs || 0
    if (lb !== la) return lb - la
    const ca = byId[a]?.created_at || ''
    const cb = byId[b]?.created_at || ''
    return ca.localeCompare(cb)
  })[0]
}

export default function DuplicatesModal({ exercises, refreshKey, onClose, onMergeRequest }) {
  const [groups, setGroups] = useState(null)
  const [usageById, setUsageById] = useState({})
  const [canonical, setCanonical] = useState({}) // groupKey → exerciseId
  const [error, setError] = useState(null)

  const byId = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data, error: e } = await supabase.rpc('exercise_duplicate_candidates')
        if (e) throw e
        if (alive) setError(null)
        const gs = data || []
        const ids = [...new Set(gs.flatMap((g) => g.exercise_ids))]
        const usages = await Promise.all(ids.map((id) => fetchUsage(id).catch(() => null)))
        if (!alive) return
        const map = Object.fromEntries(ids.map((id, i) => [id, usages[i]]))
        setUsageById(map)
        setGroups(gs)
        setCanonical((prev) => {
          const next = { ...prev }
          for (const g of gs) {
            const key = `${g.kind}:${g.group_key}`
            if (!next[key] || !g.exercise_ids.includes(next[key])) {
              next[key] = pickCanonical(g.exercise_ids, map, byId)
            }
          }
          return next
        })
      } catch (err) {
        if (alive) setError(err.message || 'No se pudieron leer los duplicados.')
      }
    })()
    return () => {
      alive = false
    }
    // byId cambia con cada refetch del catálogo; refreshKey lo acompaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Copy size={16} className="text-indigo-500" />
            <h2 className="font-bold text-gray-900 text-sm">
              Posibles duplicados{groups ? ` (${groups.length})` : ''}
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Mismo nombre, o mismo video con distinto nombre. En cada grupo elegí cuál queda y
            fusioná los otros de a uno; antes de confirmar vas a ver el impacto.
          </p>

          {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

          {groups === null ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card animate-pulse h-20" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-gray-500 text-sm">No hay duplicados a la vista.</p>
            </div>
          ) : (
            groups.map((g) => {
              const key = `${g.kind}:${g.group_key}`
              const chosen = canonical[key]
              return (
                <div key={key} className="card space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    {g.kind === 'video' ? <Video size={13} /> : <Copy size={13} />}
                    {g.kind === 'video' ? 'Mismo video, distinto nombre' : 'Mismo nombre'}
                  </div>
                  <div className="divide-y divide-gray-100">
                    {g.exercise_ids.map((id) => {
                      const ex = byId[id]
                      if (!ex) return null
                      const u = usageById[id]
                      const parts = usageSummary(u)
                      const isChosen = chosen === id
                      return (
                        <div key={id} className="flex items-center gap-3 py-2">
                          <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="radio"
                              name={`canon-${key}`}
                              checked={isChosen}
                              onChange={() => setCanonical((p) => ({ ...p, [key]: id }))}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 break-words">
                                {ex.name}
                                {isChosen && (
                                  <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                    queda
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500">
                                {u === undefined
                                  ? 'Calculando…'
                                  : parts.length === 0
                                    ? 'Sin planes ni registros'
                                    : parts.join(' · ')}
                                {!ex.video_url && ' · sin video'}
                              </p>
                            </div>
                          </label>
                          {!isChosen && chosen && (
                            <button
                              type="button"
                              className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 py-1.5 flex-shrink-0"
                              onClick={() => onMergeRequest(ex, byId[chosen])}
                            >
                              <GitMerge size={13} />
                              Fusionar
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
