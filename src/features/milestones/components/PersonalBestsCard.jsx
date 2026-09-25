// ============================================================
// PersonalBestsCard — mejores marcas de la persona, vista de la coach
// ------------------------------------------------------------
// Etapa 6 celebraciones (decisión Franco 2026-09-24): la coach también
// puede anular una marca (un error de tipeo que la persona no corrigió).
// Al anularla, ese registro deja de servir de referencia para las marcas
// futuras. Panel del coach en español (doc 46). Si no hay marcas, no se
// muestra nada.
// ============================================================
import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Medal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchPersonalBests, voidPersonalBest } from '../api'

const UNIT = { weight: 'kg', reps: 'reps', seconds: 's' }
const REASON = {
  student_void: 'la anuló la persona',
  corrected: 'se corrigió el registro',
  coach_void: 'la anulaste vos',
}

function fmt(n) {
  return Number.isFinite(Number(n)) ? Number(n).toLocaleString('es-AR') : String(n ?? '')
}

export default function PersonalBestsCard({ studentId }) {
  const [rows, setRows] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setRows(await fetchPersonalBests(supabase, studentId))
    } catch (err) {
      console.warn('[marcas] no se pudieron leer:', err)
      setRows([])
    }
  }, [studentId])

  useEffect(() => {
    if (!studentId) return undefined
    let cancelled = false
    fetchPersonalBests(supabase, studentId)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err) => {
        console.warn('[marcas] no se pudieron leer:', err)
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [studentId])

  async function doVoid(id) {
    setBusyId(id)
    setError(null)
    try {
      await voidPersonalBest(supabase, id, 'coach_void')
      setConfirmId(null)
      await load()
    } catch (err) {
      console.warn('[marcas] no se pudo anular:', err)
      setError('No se pudo anular la marca. Probá de nuevo.')
    } finally {
      setBusyId(null)
    }
  }

  if (!rows || rows.length === 0) return null

  return (
    <div className="card">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
        <Medal size={15} className="text-primary-500" />
        Mejores marcas
      </h3>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => {
          const p = r.payload || {}
          const unit = UNIT[p.metric] || ''
          const voided = !!r.voided_at
          return (
            <li key={r.id} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className={`min-w-0 ${voided ? 'opacity-60' : ''}`}>
                  <p className="break-words text-sm font-medium text-gray-900">
                    {r.exercise?.name || p.exercise_name || 'Ejercicio'}
                  </p>
                  <p className="text-xs text-gray-500 tabular-nums">
                    {fmt(p.value)} {unit} · antes {fmt(p.previous_max)} {unit} ·{' '}
                    {format(parseISO(r.created_at), 'd MMM', { locale: es })}
                  </p>
                </div>
                {voided ? (
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                    Anulada{REASON[r.void_reason] ? ` · ${REASON[r.void_reason]}` : ''}
                  </span>
                ) : confirmId === r.id ? null : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(r.id)}
                    className="shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-800"
                  >
                    Anular
                  </button>
                )}
              </div>
              {confirmId === r.id && !voided && (
                <div className="mt-2 rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-700">
                    ¿Anular esta marca? Ese registro deja de contar como referencia para las marcas
                    que vengan. El registro en sí no cambia.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="btn-secondary flex-1 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => doVoid(r.id)}
                      className="btn-primary flex-1 text-xs disabled:opacity-60"
                    >
                      Anular marca
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
