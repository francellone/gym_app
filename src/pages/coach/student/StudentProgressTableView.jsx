import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Columns3, Filter, Table as TableIcon, ChevronDown, ChevronUp } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  parseReps,
  displayReps,
  getDynamicSections,
} from '../../../utils/planHelpers'

// ─────────────────────────────────────────────────────────────
// Helpers locales de la tabla
// ─────────────────────────────────────────────────────────────

// Máximo numérico en un string de pesos (array JSON o valor único)
function maxWeightOf(log) {
  if (log.actual_weights) {
    try {
      const arr = JSON.parse(log.actual_weights)
      if (Array.isArray(arr) && arr.length > 0) {
        const nums = arr.map(w => parseFloat(w || 0)).filter(n => !isNaN(n))
        if (nums.length > 0) return Math.max(...nums)
      }
      const n = parseFloat(log.actual_weights)
      if (!isNaN(n)) return n
    } catch {
      const n = parseFloat(log.actual_weights)
      if (!isNaN(n)) return n
    }
  }
  return parseFloat(log.actual_weight) || 0
}

// Promedio numérico de pesos del log
function avgWeightOf(log) {
  if (log.actual_weights) {
    try {
      const arr = JSON.parse(log.actual_weights)
      if (Array.isArray(arr) && arr.length > 0) {
        const nums = arr.map(w => parseFloat(w || 0)).filter(n => !isNaN(n))
        if (nums.length > 0) return nums.reduce((a, b) => a + b, 0) / nums.length
      }
      const n = parseFloat(log.actual_weights)
      if (!isNaN(n)) return n
    } catch {
      const n = parseFloat(log.actual_weights)
      if (!isNaN(n)) return n
    }
  }
  return parseFloat(log.actual_weight) || 0
}

// Representar peso sugerido (array o valor único) como texto
function displayWeight(ex) {
  if (ex.suggested_weights) {
    const arr = parseReps(ex.suggested_weights).filter(w => w !== '' && w != null)
    if (arr.length > 0) {
      const unique = [...new Set(arr)]
      return unique.length === 1 ? `${unique[0]}kg` : `${arr.join('/')}kg`
    }
  }
  if (ex.suggested_weight) {
    const raw = String(ex.suggested_weight)
    return /kg/i.test(raw) ? raw : `${raw}kg`
  }
  return '—'
}

// Representar peso real del log (array o único) como texto
function displayActualWeight(log) {
  if (!log) return '—'
  if (log.actual_weights) {
    try {
      const arr = JSON.parse(log.actual_weights)
      if (Array.isArray(arr) && arr.length > 0) {
        const filtered = arr.filter(w => w !== '' && w != null)
        if (filtered.length === 0) return '—'
        const unique = [...new Set(filtered)]
        return unique.length === 1 ? `${unique[0]}kg` : `${filtered.join('/')}kg`
      }
      if (arr != null && arr !== '') return `${arr}kg`
    } catch {
      if (log.actual_weights) return `${log.actual_weights}kg`
    }
  }
  if (log.actual_weight) return `${log.actual_weight}kg`
  return '—'
}

// ─────────────────────────────────────────────────────────────
// Definición de columnas disponibles (columnas "estáticas").
// Las sesiones recientes son columnas dinámicas, se configuran aparte.
// ─────────────────────────────────────────────────────────────
const COLUMN_DEFS = [
  { id: 'block',       label: 'Bloque',          group: 'plan',     defaultVisible: true  },
  { id: 'plan_sets',   label: 'Series sugeridas',group: 'plan',     defaultVisible: false },
  { id: 'plan_reps',   label: 'Reps sugeridas',  group: 'plan',     defaultVisible: false },
  { id: 'plan_weight', label: 'Peso sugerido',   group: 'plan',     defaultVisible: true  },
  { id: 'plan_pse',    label: 'PSE sugerida',    group: 'plan',     defaultVisible: false },
  { id: 'max_weight',  label: 'Peso máx.',       group: 'progress', defaultVisible: true  },
  { id: 'trend',       label: 'Tendencia',       group: 'progress', defaultVisible: true  },
  { id: 'count',       label: 'Veces',           group: 'volume',   defaultVisible: true  },
  { id: 'volume',      label: 'Volumen total',   group: 'volume',   defaultVisible: false },
  { id: 'avg_pse',     label: 'PSE promedio',    group: 'volume',   defaultVisible: false },
]

const COLUMN_GROUPS = [
  { id: 'plan',     label: 'Plan'       },
  { id: 'progress', label: 'Progresión' },
  { id: 'volume',   label: 'Volumen / frecuencia' },
]

const defaultVisibleCols = () =>
  new Set(COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.id))

// ─────────────────────────────────────────────────────────────
// Sesiones recientes (columnas dinámicas)
// ─────────────────────────────────────────────────────────────
const SESSIONS_COUNT_OPTIONS = [
  { value: 3,     label: '3'     },
  { value: 5,     label: '5'     },
  { value: 10,    label: '10'    },
  { value: 'all', label: 'Todas' },
]

// Campos disponibles a mostrar en cada celda de sesión
const SESSION_FIELDS = [
  { id: 'date',      label: 'Fecha'        },
  { id: 'weight',    label: 'Peso'         },
  { id: 'sets_reps', label: 'Series × Reps'},
  { id: 'pse',       label: 'PSE'          },
  { id: 'notes',     label: 'Notas'        },
]

const defaultSessionFields = () => new Set(['date', 'weight', 'pse'])

// Etiqueta de la columna según su posición (0 = más reciente)
function sessionHeaderLabel(index) {
  if (index === 0) return 'Última'
  return `−${index}`
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// Props:
//   studentId
//   logs        - progressLogs ya filtrados por período en el padre
//   dateFrom    - Date | null (para indicar visualmente)
//   dateTo      - Date | null
// ─────────────────────────────────────────────────────────────
export default function StudentProgressTableView({ studentId, logs }) {
  const [planExercises, setPlanExercises] = useState([])
  const [activePlans, setActivePlans] = useState([])
  const [loadingPlan, setLoadingPlan] = useState(false)

  // Filtros/visualización
  const [visibleCols, setVisibleCols] = useState(defaultVisibleCols())
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [showOnlyWithLogs, setShowOnlyWithLogs] = useState(false)
  const [groupBySection, setGroupBySection] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState(new Set())

  // Sesiones recientes (columnas dinámicas)
  const [sessionsCount, setSessionsCount] = useState(3) // 3 | 5 | 10 | 'all'
  const [sessionFields, setSessionFields] = useState(defaultSessionFields())
  const [showFieldsPicker, setShowFieldsPicker] = useState(false)

  // ── Cargar plan_exercises de los planes activos del alumno ─
  useEffect(() => {
    let cancelled = false
    async function loadPlanData() {
      setLoadingPlan(true)
      try {
        // Planes activos del alumno
        const { data: assigns } = await supabase
          .from('plan_assignments')
          .select('plan:plans!plan_id(id, title, sessions_per_week, has_activation)')
          .eq('student_id', studentId)
          .eq('active', true)
        const plans = (assigns || []).map(a => a.plan).filter(Boolean)
        if (cancelled) return
        setActivePlans(plans)

        if (plans.length === 0) {
          setPlanExercises([])
          return
        }

        const planIds = plans.map(p => p.id)
        const { data: pex } = await supabase
          .from('plan_exercises')
          .select(`
            id, plan_id, section, block_label, order_index,
            suggested_sets, suggested_reps, suggested_weight, suggested_weights,
            suggested_pse, rest_time, extra_notes,
            exercise:exercises!exercise_id(id, name, muscle_group)
          `)
          .in('plan_id', planIds)
          .order('order_index', { ascending: true })
        if (cancelled) return
        setPlanExercises(pex || [])
      } catch (err) {
        console.error('[StudentProgressTableView]', err)
      } finally {
        if (!cancelled) setLoadingPlan(false)
      }
    }
    loadPlanData()
    return () => { cancelled = true }
  }, [studentId])

  // ── Índice de logs por plan_exercise_id ────────────────────
  const logsByPlanExercise = useMemo(() => {
    const map = new Map()
    for (const log of logs) {
      const pid = log.plan_exercise_id
      if (!pid) continue
      if (!map.has(pid)) map.set(pid, [])
      map.get(pid).push(log)
    }
    // Orden por fecha ascendente (más viejo primero) para tendencia
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.logged_date || '').localeCompare(b.logged_date || ''))
    }
    return map
  }, [logs])

  // ── También índice por exercise_id (fallback cuando el plan_exercise
  //    cambió pero el ejercicio es el mismo — p.ej. planes anteriores) ──
  const logsByExerciseId = useMemo(() => {
    const map = new Map()
    for (const log of logs) {
      const exId = log.plan_exercise?.exercise?.id
      if (!exId) continue
      if (!map.has(exId)) map.set(exId, [])
      map.get(exId).push(log)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.logged_date || '').localeCompare(b.logged_date || ''))
    }
    return map
  }, [logs])

  // ── Filas: una por plan_exercise ───────────────────────────
  const rows = useMemo(() => {
    return planExercises.map(pex => {
      const exerciseId = pex.exercise?.id
      // Prioriza logs del mismo plan_exercise; si no hay, cae a logs del ejercicio
      const exLogs =
        logsByPlanExercise.get(pex.id) ||
        (exerciseId ? logsByExerciseId.get(exerciseId) : null) ||
        []

      const lastLog = exLogs.length > 0 ? exLogs[exLogs.length - 1] : null
      const prevLog = exLogs.length > 1 ? exLogs[exLogs.length - 2] : null

      // Métricas
      const maxWeight = exLogs.reduce((mx, l) => Math.max(mx, maxWeightOf(l)), 0)
      const lastWeightNum = lastLog ? maxWeightOf(lastLog) : 0
      const prevWeightNum = prevLog ? maxWeightOf(prevLog) : 0
      let trend = '—'
      if (lastLog && prevLog && prevWeightNum > 0) {
        if (lastWeightNum > prevWeightNum) trend = '↑'
        else if (lastWeightNum < prevWeightNum) trend = '↓'
        else trend = '='
      } else if (lastLog && !prevLog) {
        trend = '·'
      }

      // Volumen total
      let volume = 0
      for (const l of exLogs) {
        const sets = parseFloat(l.actual_sets) || 0
        const reps = parseFloat(l.actual_reps) || 0
        const w = avgWeightOf(l)
        if (sets > 0 && reps > 0 && w > 0) {
          volume += sets * reps * w
        }
      }

      // PSE promedio
      const pseVals = exLogs.map(l => l.perceived_difficulty).filter(v => v != null)
      const avgPse = pseVals.length > 0
        ? Math.round((pseVals.reduce((a, b) => a + b, 0) / pseVals.length) * 10) / 10
        : null

      // Logs ordenados de más reciente a más antiguo (para columnas de sesiones)
      const recentLogs = [...exLogs].reverse()

      return {
        id: pex.id,
        planId: pex.plan_id,
        section: pex.section,
        block_label: pex.block_label || '',
        exerciseName: pex.exercise?.name || 'Sin ejercicio',
        muscleGroup: pex.exercise?.muscle_group || '',
        // Plan
        suggested_sets: pex.suggested_sets,
        suggested_reps: pex.suggested_reps,
        suggested_weightStr: displayWeight(pex),
        suggested_pse: pex.suggested_pse,
        // Sesiones recientes (más reciente primero)
        recentLogs,
        // Progresión
        maxWeight: maxWeight > 0 ? maxWeight : null,
        trend,
        // Volumen
        count: exLogs.length,
        volume: Math.round(volume),
        avgPse,
        // Meta
        hasLogs: exLogs.length > 0,
      }
    })
  }, [planExercises, logsByPlanExercise, logsByExerciseId])

  // ── Filtro "solo con logs" ─────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!showOnlyWithLogs) return rows
    return rows.filter(r => r.hasLogs)
  }, [rows, showOnlyWithLogs])

  // ── Cantidad efectiva de columnas de sesión ────────────────
  // Si el usuario eligió 'all', usa el máximo de logs entre las filas visibles.
  // Si eligió un número, respeta ese número aunque algunas celdas queden vacías.
  const effectiveSessionsCount = useMemo(() => {
    if (sessionsCount === 'all') {
      return filteredRows.reduce((mx, r) => Math.max(mx, r.recentLogs.length), 0)
    }
    return Number(sessionsCount) || 3
  }, [filteredRows, sessionsCount])

  // ── Agrupación por sección (por plan y por sección) ────────
  const groupedRows = useMemo(() => {
    if (!groupBySection) return null
    // Generar secciones dinámicas de cada plan activo
    const groups = []
    for (const plan of activePlans) {
      const sections = getDynamicSections(plan.sessions_per_week, plan.has_activation)
      for (const s of sections) {
        const rowsInSection = filteredRows.filter(
          r => r.planId === plan.id && r.section === s.id
        )
        if (rowsInSection.length === 0) continue
        groups.push({
          key: `${plan.id}:${s.id}`,
          planTitle: plan.title,
          sectionLabel: s.label,
          rows: rowsInSection,
        })
      }
    }
    // Filas "huérfanas" (sección desconocida)
    const known = new Set()
    for (const g of groups) for (const r of g.rows) known.add(r.id)
    const orphans = filteredRows.filter(r => !known.has(r.id))
    if (orphans.length > 0) {
      groups.push({
        key: 'orphans',
        planTitle: '',
        sectionLabel: 'Otros',
        rows: orphans,
      })
    }
    return groups
  }, [filteredRows, activePlans, groupBySection])

  const toggleCol = colId => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(colId)) next.delete(colId)
      else next.add(colId)
      return next
    })
  }

  const toggleSection = key => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isCol = id => visibleCols.has(id)
  const isField = id => sessionFields.has(id)

  // ── Render cabecera de la tabla ────────────────────────────
  const renderHeader = () => (
    <tr className="text-[11px] uppercase tracking-wider text-gray-500 bg-gray-50">
      <th className="text-left font-semibold px-2 py-2 sticky left-0 bg-gray-50 z-10 min-w-[140px]">
        Ejercicio
      </th>
      {isCol('block') && <th className="text-left font-semibold px-2 py-2">Bloque</th>}
      {isCol('plan_sets') && <th className="text-right font-semibold px-2 py-2">Series</th>}
      {isCol('plan_reps') && <th className="text-right font-semibold px-2 py-2">Reps</th>}
      {isCol('plan_weight') && <th className="text-right font-semibold px-2 py-2">Peso sug.</th>}
      {isCol('plan_pse') && <th className="text-right font-semibold px-2 py-2">PSE sug.</th>}
      {/* Columnas dinámicas de sesiones recientes */}
      {Array.from({ length: effectiveSessionsCount }, (_, i) => (
        <th
          key={`sh-${i}`}
          className={`text-center font-semibold px-2 py-2 min-w-[78px] border-l border-gray-100 ${
            i === 0 ? 'bg-primary-50 text-primary-700' : ''
          }`}
        >
          {sessionHeaderLabel(i)}
        </th>
      ))}
      {isCol('max_weight') && <th className="text-right font-semibold px-2 py-2">Peso máx.</th>}
      {isCol('trend') && <th className="text-center font-semibold px-2 py-2">Tend.</th>}
      {isCol('count') && <th className="text-right font-semibold px-2 py-2">Veces</th>}
      {isCol('volume') && <th className="text-right font-semibold px-2 py-2">Volumen</th>}
      {isCol('avg_pse') && <th className="text-right font-semibold px-2 py-2">PSE prom.</th>}
    </tr>
  )

  // Badge de PSE con colores según nivel
  const pseBadge = v =>
    v == null ? null :
    v >= 8 ? <span className="badge bg-red-100 text-red-700">{v}</span> :
    v >= 5 ? <span className="badge bg-yellow-100 text-yellow-700">{v}</span> :
    <span className="badge bg-green-100 text-green-700">{v}</span>

  // Celda de sesión: renderiza los campos elegidos por el coach.
  // log = null significa "no hay sesión en esa posición"
  const renderSessionCell = (log, highlight) => {
    const bgHighlight = highlight ? 'bg-primary-50/40' : ''
    if (!log) {
      return (
        <td className={`px-2 py-2 text-center text-gray-300 border-l border-gray-100 ${bgHighlight}`}>
          —
        </td>
      )
    }
    const hasNotes = !!(log.notes && log.notes.trim())
    return (
      <td className={`px-2 py-2 text-center border-l border-gray-100 ${bgHighlight}`}>
        <div className="flex flex-col items-center gap-0.5 leading-tight">
          {isField('date') && (
            <span className="text-[10px] text-gray-400">
              {log.logged_date ? format(parseISO(log.logged_date), 'dd/MM') : ''}
            </span>
          )}
          {isField('weight') && (
            <span className="text-sm font-semibold text-gray-900">
              {displayActualWeight(log)}
            </span>
          )}
          {isField('sets_reps') && (
            <span className="text-[11px] text-gray-600">
              {(log.actual_sets ?? '—')}×{(log.actual_reps ?? '—')}
            </span>
          )}
          {isField('pse') && (
            log.perceived_difficulty != null
              ? pseBadge(log.perceived_difficulty)
              : <span className="text-[10px] text-gray-300">PSE —</span>
          )}
          {isField('notes') && (
            hasNotes
              ? <span
                  className="text-[10px] italic text-gray-500 max-w-[120px] truncate"
                  title={log.notes}
                >💬 {log.notes}</span>
              : <span className="text-[10px] text-gray-300">—</span>
          )}
        </div>
      </td>
    )
  }

  const renderRow = r => {
    const trendColor =
      r.trend === '↑' ? 'text-green-600' :
      r.trend === '↓' ? 'text-red-600' :
      r.trend === '=' ? 'text-gray-500' :
      'text-gray-400'

    return (
      <tr key={r.id} className="border-t border-gray-100 text-sm hover:bg-gray-50">
        <td className="px-2 py-2 sticky left-0 bg-white z-[1] min-w-[140px]">
          <div className="font-medium text-gray-900 truncate max-w-[200px]" title={r.exerciseName}>
            {r.exerciseName}
          </div>
          {r.muscleGroup && (
            <div className="text-[10px] text-gray-400">{r.muscleGroup}</div>
          )}
        </td>
        {isCol('block') && (
          <td className="px-2 py-2">
            {r.block_label
              ? <span className="badge bg-primary-100 text-primary-700">{r.block_label}</span>
              : <span className="text-gray-300">—</span>}
          </td>
        )}
        {isCol('plan_sets') && (
          <td className="px-2 py-2 text-right text-gray-700">{r.suggested_sets ?? '—'}</td>
        )}
        {isCol('plan_reps') && (
          <td className="px-2 py-2 text-right text-gray-700">
            {r.suggested_reps ? displayReps(r.suggested_reps) : '—'}
          </td>
        )}
        {isCol('plan_weight') && (
          <td className="px-2 py-2 text-right text-gray-700">{r.suggested_weightStr}</td>
        )}
        {isCol('plan_pse') && (
          <td className="px-2 py-2 text-right text-gray-700">{r.suggested_pse || '—'}</td>
        )}
        {/* Columnas dinámicas de sesiones: la 0 (última) queda resaltada */}
        {Array.from({ length: effectiveSessionsCount }, (_, i) =>
          <Fragment key={`sc-${r.id}-${i}`}>
            {renderSessionCell(r.recentLogs[i] || null, i === 0)}
          </Fragment>
        )}
        {isCol('max_weight') && (
          <td className="px-2 py-2 text-right text-primary-600 font-semibold">
            {r.maxWeight != null ? `${r.maxWeight}kg` : <span className="text-gray-300 font-normal">—</span>}
          </td>
        )}
        {isCol('trend') && (
          <td className={`px-2 py-2 text-center font-bold ${trendColor}`}>{r.trend}</td>
        )}
        {isCol('count') && (
          <td className="px-2 py-2 text-right text-gray-700">{r.count}</td>
        )}
        {isCol('volume') && (
          <td className="px-2 py-2 text-right text-gray-700">
            {r.volume > 0 ? r.volume.toLocaleString('es-AR') : '—'}
          </td>
        )}
        {isCol('avg_pse') && (
          <td className="px-2 py-2 text-right">{pseBadge(r.avgPse) || '—'}</td>
        )}
      </tr>
    )
  }

  // ── Conteo de columnas (para colspan del encabezado de grupo) ─
  const visibleColCount =
    1 /* ejercicio */ +
    COLUMN_DEFS.filter(c => isCol(c.id)).length +
    effectiveSessionsCount

  // ── Render ─────────────────────────────────────────────────
  if (loadingPlan) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (planExercises.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-400">
        <TableIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">
          {activePlans.length === 0
            ? 'El alumno no tiene planes activos asignados'
            : 'Los planes activos no tienen ejercicios cargados'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Selector de cantidad de sesiones ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Sesiones:</span>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {SESSIONS_COUNT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSessionsCount(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                sessionsCount === opt.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowFieldsPicker(v => !v)}
          className="btn-secondary flex items-center gap-1.5 text-xs py-1 px-2.5"
        >
          Mostrar por sesión ({sessionFields.size})
          {showFieldsPicker ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* ── Picker de campos por celda ── */}
      {showFieldsPicker && (
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-900">
              ¿Qué mostrar en cada sesión?
            </p>
            <button
              className="text-xs text-primary-600 hover:underline"
              onClick={() => setSessionFields(defaultSessionFields())}
            >Por defecto</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SESSION_FIELDS.map(f => {
              const active = isField(f.id)
              return (
                <label
                  key={f.id}
                  className={`text-xs px-2 py-1 rounded-lg cursor-pointer border transition-colors ${
                    active
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={active}
                    onChange={() => {
                      setSessionFields(prev => {
                        const next = new Set(prev)
                        if (next.has(f.id)) next.delete(f.id)
                        else next.add(f.id)
                        return next
                      })
                    }}
                  />
                  {f.label}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Controles generales de tabla ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowColumnPicker(v => !v)}
          className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
        >
          <Columns3 size={13} />
          Columnas ({visibleCols.size})
        </button>
        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyWithLogs}
            onChange={e => setShowOnlyWithLogs(e.target.checked)}
            className="rounded"
          />
          Solo con registros
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={groupBySection}
            onChange={e => setGroupBySection(e.target.checked)}
            className="rounded"
          />
          Agrupar por sección
        </label>
        <div className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
          <Filter size={12} />
          {filteredRows.length} ejercicios
        </div>
      </div>

      {/* ── Picker de columnas ── */}
      {showColumnPicker && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Columnas visibles</p>
            <div className="flex gap-1">
              <button
                className="text-xs text-primary-600 hover:underline"
                onClick={() => setVisibleCols(new Set(COLUMN_DEFS.map(c => c.id)))}
              >Todas</button>
              <span className="text-gray-300">·</span>
              <button
                className="text-xs text-primary-600 hover:underline"
                onClick={() => setVisibleCols(defaultVisibleCols())}
              >Por defecto</button>
              <span className="text-gray-300">·</span>
              <button
                className="text-xs text-gray-500 hover:underline"
                onClick={() => setVisibleCols(new Set())}
              >Ninguna</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COLUMN_GROUPS.map(group => (
              <div key={group.id}>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {COLUMN_DEFS.filter(c => c.group === group.id).map(c => (
                    <label
                      key={c.id}
                      className={`text-xs px-2 py-1 rounded-lg cursor-pointer border transition-colors ${
                        isCol(c.id)
                          ? 'bg-primary-50 border-primary-300 text-primary-700'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isCol(c.id)}
                        onChange={() => toggleCol(c.id)}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabla ── */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>{renderHeader()}</thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={visibleColCount} className="text-center py-8 text-sm text-gray-400">
                    Sin ejercicios para mostrar con los filtros actuales
                  </td>
                </tr>
              )}
              {groupBySection && groupedRows ? (
                groupedRows.map(group => {
                  const isCollapsed = collapsedSections.has(group.key)
                  return (
                    <Fragment key={group.key}>
                      <tr
                        className="bg-gray-100 cursor-pointer"
                        onClick={() => toggleSection(group.key)}
                      >
                        <td
                          colSpan={visibleColCount}
                          className="px-2 py-1.5 text-xs font-semibold text-gray-700"
                        >
                          <div className="flex items-center gap-2">
                            {isCollapsed
                              ? <ChevronDown size={14} className="text-gray-400" />
                              : <ChevronUp size={14} className="text-gray-400" />}
                            <span>{group.sectionLabel}</span>
                            {group.planTitle && activePlans.length > 1 && (
                              <span className="text-gray-400 font-normal">· {group.planTitle}</span>
                            )}
                            <span className="ml-auto text-gray-400 font-normal">
                              {group.rows.length}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed && group.rows.map(renderRow)}
                    </Fragment>
                  )
                })
              ) : (
                filteredRows.map(renderRow)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Leyenda tendencia ── */}
      {isCol('trend') && (
        <div className="flex items-center gap-3 text-[11px] text-gray-400 justify-end">
          <span><span className="text-green-600 font-bold">↑</span> mejora</span>
          <span><span className="text-red-600 font-bold">↓</span> baja</span>
          <span><span className="text-gray-500 font-bold">=</span> igual</span>
          <span><span className="font-bold">·</span> sin previo</span>
        </div>
      )}
    </div>
  )
}
