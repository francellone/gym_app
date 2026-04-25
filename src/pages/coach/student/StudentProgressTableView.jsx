import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Columns3, Filter, Table as TableIcon, ChevronDown, ChevronUp, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  parseReps,
  displayReps,
  getDynamicSections,
} from '../../../utils/planHelpers'

// ─────────────────────────────────────────────────────────────
// Helpers locales
// ─────────────────────────────────────────────────────────────

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

// Mini sparkline SVG para la columna Progreso
function Sparkline({ values, color = '#6366f1' }) {
  if (!values || values.length < 2) return null
  const w = 48, h = 18, pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad)
    const y = h - pad - ((v - min) / range) * (h - 2 * pad)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block opacity-80">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────
// Definición de columnas estáticas disponibles
// ─────────────────────────────────────────────────────────────
const COLUMN_DEFS = [
  { id: 'block',       label: 'Bloque',            group: 'plan',     defaultVisible: true  },
  { id: 'plan_sets',   label: 'Series sugeridas',  group: 'plan',     defaultVisible: false },
  { id: 'plan_reps',   label: 'Reps sugeridas',    group: 'plan',     defaultVisible: false },
  { id: 'plan_weight', label: 'Peso sugerido',     group: 'plan',     defaultVisible: true  },
  { id: 'plan_pse',    label: 'PSE sugerida',      group: 'plan',     defaultVisible: false },
  { id: 'last_date',   label: 'Fecha última',      group: 'last',     defaultVisible: false },
  { id: 'last_sets',   label: 'Series reales',     group: 'last',     defaultVisible: false },
  { id: 'last_reps',   label: 'Reps reales',       group: 'last',     defaultVisible: false },
  { id: 'last_weight', label: 'Peso real',         group: 'last',     defaultVisible: false },
  { id: 'last_pse',    label: 'PSE real',          group: 'last',     defaultVisible: false },
  { id: 'last_notes',  label: 'Notas última',      group: 'last',     defaultVisible: false },
  { id: 'max_weight',  label: 'Peso máx.',         group: 'progress', defaultVisible: true  },
  { id: 'progress',    label: 'Progreso',          group: 'progress', defaultVisible: true  },
  { id: 'trend',       label: 'Tendencia',         group: 'progress', defaultVisible: true  },
  { id: 'count',       label: 'Veces',             group: 'volume',   defaultVisible: true  },
  { id: 'volume',      label: 'Volumen total',     group: 'volume',   defaultVisible: false },
  { id: 'avg_pse',     label: 'PSE promedio',      group: 'volume',   defaultVisible: false },
]

const COLUMN_GROUPS = [
  { id: 'plan',     label: 'Plan'               },
  { id: 'last',     label: 'Último registro'    },
  { id: 'progress', label: 'Progresión'         },
  { id: 'volume',   label: 'Volumen / frecuencia' },
]

const defaultVisibleCols = () =>
  new Set(COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.id))

// ─────────────────────────────────────────────────────────────
// Sesiones (columnas dinámicas por fecha real)
// ─────────────────────────────────────────────────────────────
const SESSIONS_COUNT_OPTIONS = [
  { value: 3,     label: '3'     },
  { value: 5,     label: '5'     },
  { value: 10,    label: '10'    },
  { value: 'all', label: 'Todas' },
]

// Campos disponibles a mostrar dentro de cada celda de sesión
const SESSION_FIELDS = [
  { id: 'date',      label: 'Fecha'         },
  { id: 'weight',    label: 'Peso'          },
  { id: 'sets_reps', label: 'Series × Reps' },
  { id: 'pse',       label: 'PSE'           },
  { id: 'status',    label: 'Estado ⬆️😊⬇️'  },
  { id: 'notes',     label: 'Notas 💬'      },
]

const defaultSessionFields = () => new Set(['date', 'weight', 'pse'])

// ─────────────────────────────────────────────────────────────
// Componente principal
// Props: studentId, logs (ya filtrados por período en el padre)
// ─────────────────────────────────────────────────────────────
export default function StudentProgressTableView({ studentId, logs }) {
  const [planExercises, setPlanExercises] = useState([])
  const [activePlans, setActivePlans] = useState([])
  const [loadingPlan, setLoadingPlan] = useState(false)

  // Visualización / filtros
  const [visibleCols, setVisibleCols] = useState(defaultVisibleCols())
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [showOnlyWithLogs, setShowOnlyWithLogs] = useState(false)
  const [groupBySection, setGroupBySection] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState(new Set())

  // Sesiones dinámicas
  const [sessionsCount, setSessionsCount] = useState(3)
  const [sessionFields, setSessionFields] = useState(defaultSessionFields())
  const [showFieldsPicker, setShowFieldsPicker] = useState(false)

  // Modal de notas
  const [activeNote, setActiveNote] = useState(null) // { key, text }

  // ── Cargar plan_exercises de los planes activos ────────────
  useEffect(() => {
    let cancelled = false
    async function loadPlanData() {
      setLoadingPlan(true)
      try {
        const { data: assigns } = await supabase
          .from('plan_assignments')
          .select('plan:plans!plan_id(id, title, sessions_per_week, has_activation)')
          .eq('student_id', studentId)
          .eq('active', true)
        const plans = (assigns || []).map(a => a.plan).filter(Boolean)
        if (cancelled) return
        setActivePlans(plans)

        if (plans.length === 0) { setPlanExercises([]); return }

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

  // ── Índices de logs ────────────────────────────────────────

  // pex_id → pex (para lookup de block_label)
  const pexById = useMemo(() => {
    const map = new Map()
    for (const pex of planExercises) map.set(pex.id, pex)
    return map
  }, [planExercises])

  // plan_exercise_id → logs[] ordenados por fecha asc
  const logsByPlanExercise = useMemo(() => {
    const map = new Map()
    for (const log of logs) {
      const pid = log.plan_exercise_id
      if (!pid) continue
      if (!map.has(pid)) map.set(pid, [])
      map.get(pid).push(log)
    }
    for (const arr of map.values())
      arr.sort((a, b) => (a.logged_date || '').localeCompare(b.logged_date || ''))
    return map
  }, [logs])

  // exercise_id → logs[] ordenados por fecha asc (fallback)
  const logsByExerciseId = useMemo(() => {
    const map = new Map()
    for (const log of logs) {
      const exId = log.plan_exercise?.exercise?.id
      if (!exId) continue
      if (!map.has(exId)) map.set(exId, [])
      map.get(exId).push(log)
    }
    for (const arr of map.values())
      arr.sort((a, b) => (a.logged_date || '').localeCompare(b.logged_date || ''))
    return map
  }, [logs])

  // plan_exercise_id → date → log  (lookup rápido por fecha)
  const logsByExAndDate = useMemo(() => {
    const map = new Map()
    for (const log of logs) {
      if (!log.plan_exercise_id || !log.logged_date) continue
      if (!map.has(log.plan_exercise_id)) map.set(log.plan_exercise_id, new Map())
      map.get(log.plan_exercise_id).set(log.logged_date, log)
    }
    return map
  }, [logs])

  // exercise_id → date → log  (fallback)
  const logsByExerciseAndDate = useMemo(() => {
    const map = new Map()
    for (const log of logs) {
      const exId = log.plan_exercise?.exercise?.id
      if (!exId || !log.logged_date) continue
      if (!map.has(exId)) map.set(exId, new Map())
      if (!map.get(exId).has(log.logged_date))
        map.get(exId).set(log.logged_date, log)
    }
    return map
  }, [logs])

  // ── Fecha real de cada sesión → block_label para el header ─
  const sessionDateInfo = useMemo(() => {
    // Para cada fecha, tomamos el primer block_label disponible entre todos los logs
    const dateToBlock = new Map()
    for (const log of logs) {
      if (!log.logged_date || dateToBlock.has(log.logged_date)) continue
      const pex = pexById.get(log.plan_exercise_id)
      if (pex?.block_label) dateToBlock.set(log.logged_date, pex.block_label)
    }
    return dateToBlock
  }, [logs, pexById])

  // ── Fechas de sesión únicas, ordenadas asc, limitadas a N ──
  const allSessionDates = useMemo(() => {
    const dates = new Set(logs.map(l => l.logged_date).filter(Boolean))
    const sorted = [...dates].sort() // ascendente: más viejo primero → izquierda
    if (sessionsCount === 'all') return sorted
    return sorted.slice(-Number(sessionsCount)) // N más recientes
  }, [logs, sessionsCount])

  // ── Filas: una por plan_exercise ───────────────────────────
  const rows = useMemo(() => {
    return planExercises.map(pex => {
      const exerciseId = pex.exercise?.id
      const exLogs =
        logsByPlanExercise.get(pex.id) ||
        (exerciseId ? logsByExerciseId.get(exerciseId) : null) ||
        []

      const lastLog = exLogs.length > 0 ? exLogs[exLogs.length - 1] : null
      const prevLog = exLogs.length > 1 ? exLogs[exLogs.length - 2] : null

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
        if (sets > 0 && reps > 0 && w > 0) volume += sets * reps * w
      }

      // PSE promedio
      const pseVals = exLogs.map(l => l.perceived_difficulty).filter(v => v != null)
      const avgPse = pseVals.length > 0
        ? Math.round((pseVals.reduce((a, b) => a + b, 0) / pseVals.length) * 10) / 10
        : null

      // Progreso %: primer log vs último log (peso o reps)
      const weightValues = exLogs.map(l => maxWeightOf(l)).filter(w => w > 0)
      let progressPct = null
      let progressColor = 'text-gray-400'
      let progressMetric = 'Peso'

      if (weightValues.length >= 2) {
        const pct = Math.round(((weightValues[weightValues.length - 1] - weightValues[0]) / weightValues[0]) * 100)
        progressPct = pct
        progressColor = pct > 0 ? 'text-green-600' : pct < 0 ? 'text-red-500' : 'text-gray-500'
        progressMetric = 'Peso'
      } else {
        // Fallback: reps
        const repValues = exLogs.map(l => parseFloat(l.actual_reps) || 0).filter(r => r > 0)
        if (repValues.length >= 2) {
          const pct = Math.round(((repValues[repValues.length - 1] - repValues[0]) / repValues[0]) * 100)
          progressPct = pct
          progressColor = pct > 0 ? 'text-green-600' : pct < 0 ? 'text-red-500' : 'text-gray-500'
          progressMetric = 'Reps'
        }
      }

      const sparklineValues = weightValues.length >= 2
        ? weightValues
        : exLogs.map(l => parseFloat(l.actual_reps) || 0).filter(r => r > 0)

      const recentLogs = [...exLogs].reverse() // más reciente primero

      return {
        id: pex.id,
        exerciseId,
        planId: pex.plan_id,
        section: pex.section,
        block_label: pex.block_label || '',
        exerciseName: pex.exercise?.name || 'Sin ejercicio',
        muscleGroup: pex.exercise?.muscle_group || '',
        suggested_sets: pex.suggested_sets,
        suggested_reps: pex.suggested_reps,
        suggested_weightStr: displayWeight(pex),
        suggested_pse: pex.suggested_pse,
        recentLogs,
        sparklineValues,
        maxWeight: maxWeight > 0 ? maxWeight : null,
        trend,
        count: exLogs.length,
        volume: Math.round(volume),
        avgPse,
        progressPct,
        progressColor,
        progressMetric,
        hasLogs: exLogs.length > 0,
      }
    })
  }, [planExercises, logsByPlanExercise, logsByExerciseId])

  // ── Filtro "solo con logs" ─────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!showOnlyWithLogs) return rows
    return rows.filter(r => r.hasLogs)
  }, [rows, showOnlyWithLogs])

  // ── Agrupación por sección ─────────────────────────────────
  const groupedRows = useMemo(() => {
    if (!groupBySection) return null
    const groups = []
    for (const plan of activePlans) {
      const sections = getDynamicSections(plan.sessions_per_week, plan.has_activation)
      for (const s of sections) {
        const rowsInSection = filteredRows.filter(
          r => r.planId === plan.id && r.section === s.id
        )
        if (rowsInSection.length === 0) continue
        groups.push({ key: `${plan.id}:${s.id}`, planTitle: plan.title, sectionLabel: s.label, rows: rowsInSection })
      }
    }
    const known = new Set()
    for (const g of groups) for (const r of g.rows) known.add(r.id)
    const orphans = filteredRows.filter(r => !known.has(r.id))
    if (orphans.length > 0)
      groups.push({ key: 'orphans', planTitle: '', sectionLabel: 'Otros', rows: orphans })
    return groups
  }, [filteredRows, activePlans, groupBySection])

  const toggleCol = colId => setVisibleCols(prev => {
    const next = new Set(prev)
    if (next.has(colId)) next.delete(colId)
    else next.add(colId)
    return next
  })

  const toggleSection = key => setCollapsedSections(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const isCol = id => visibleCols.has(id)
  const isField = id => sessionFields.has(id)

  // Lookup de log por fila + fecha
  const getLogForDate = useCallback((row, date) =>
    logsByExAndDate.get(row.id)?.get(date)
    ?? logsByExerciseAndDate.get(row.exerciseId)?.get(date)
    ?? null,
    [logsByExAndDate, logsByExerciseAndDate]
  )

  // Abrir/cerrar modal de nota
  const handleNoteClick = (e, key, text) => {
    e.stopPropagation()
    setActiveNote(prev => prev?.key === key ? null : { key, text })
  }

  // Emoji de estado comparando log actual con el anterior
  const getStatusEmoji = (log, prevLog) => {
    if (!log || !prevLog) return null
    const curr = maxWeightOf(log)
    const prev = maxWeightOf(prevLog)
    if (curr > 0 && prev > 0) {
      if (curr > prev) return { emoji: '⬆️', color: 'text-green-600' }
      if (curr < prev) return { emoji: '⬇️', color: 'text-red-500' }
      return { emoji: '😊', color: 'text-gray-400' }
    }
    const currR = parseFloat(log.actual_reps) || 0
    const prevR = parseFloat(prevLog.actual_reps) || 0
    if (currR > prevR) return { emoji: '⬆️', color: 'text-green-600' }
    if (currR < prevR) return { emoji: '⬇️', color: 'text-red-500' }
    return { emoji: '😊', color: 'text-gray-400' }
  }

  // ── Conteo de columnas (para colSpan) ─────────────────────
  const visibleColCount =
    1 /* ejercicio */ +
    COLUMN_DEFS.filter(c => isCol(c.id)).length +
    allSessionDates.length

  // ── Header de la tabla ─────────────────────────────────────
  const renderHeader = () => (
    <tr className="text-[11px] uppercase tracking-wider text-gray-500 bg-gray-50">
      <th className="text-left font-semibold px-2 py-2 sticky left-0 bg-gray-50 z-10 min-w-[140px]">
        Ejercicio
      </th>
      {isCol('block')       && <th className="text-left font-semibold px-2 py-2">Bloque</th>}
      {isCol('plan_sets')   && <th className="text-right font-semibold px-2 py-2">Series</th>}
      {isCol('plan_reps')   && <th className="text-right font-semibold px-2 py-2">Reps</th>}
      {isCol('plan_weight') && <th className="text-right font-semibold px-2 py-2">Peso sug.</th>}
      {isCol('plan_pse')    && <th className="text-right font-semibold px-2 py-2">PSE sug.</th>}
      {isCol('last_date')   && <th className="text-center font-semibold px-2 py-2">Fecha últ.</th>}
      {isCol('last_sets')   && <th className="text-right font-semibold px-2 py-2">Series real.</th>}
      {isCol('last_reps')   && <th className="text-right font-semibold px-2 py-2">Reps real.</th>}
      {isCol('last_weight') && <th className="text-right font-semibold px-2 py-2">Peso real</th>}
      {isCol('last_pse')    && <th className="text-right font-semibold px-2 py-2">PSE real</th>}
      {isCol('last_notes')  && <th className="text-left font-semibold px-2 py-2 min-w-[140px]">Notas últ.</th>}

      {/* Columnas dinámicas: una por fecha real de sesión */}
      {allSessionDates.map((date, i) => {
        const blockLabel = sessionDateInfo.get(date) || ''
        const isLatest = i === allSessionDates.length - 1
        return (
          <th
            key={`sh-${date}`}
            className={`text-center font-semibold px-2 py-2 min-w-[82px] border-l border-gray-100 ${
              isLatest ? 'bg-primary-50 text-primary-700' : ''
            }`}
          >
            <div className="flex flex-col items-center leading-none gap-[3px]">
              <span>{format(parseISO(date), 'dd/MM')}</span>
              {blockLabel && (
                <span className={`text-[9px] font-normal tracking-wide ${isLatest ? 'text-primary-400' : 'text-gray-400'}`}>
                  {blockLabel}
                </span>
              )}
            </div>
          </th>
        )
      })}

      {isCol('max_weight') && <th className="text-right font-semibold px-2 py-2">Peso máx.</th>}
      {isCol('progress')   && <th className="text-right font-semibold px-2 py-2 min-w-[96px]">Progreso</th>}
      {isCol('trend')      && <th className="text-center font-semibold px-2 py-2">Tend.</th>}
      {isCol('count')      && <th className="text-right font-semibold px-2 py-2">Veces</th>}
      {isCol('volume')     && <th className="text-right font-semibold px-2 py-2">Volumen</th>}
      {isCol('avg_pse')    && <th className="text-right font-semibold px-2 py-2">PSE prom.</th>}
    </tr>
  )

  // Badge de PSE con color según nivel
  const pseBadge = v =>
    v == null ? null :
    v >= 8 ? <span className="badge bg-red-100 text-red-700">{v}</span> :
    v >= 5 ? <span className="badge bg-yellow-100 text-yellow-700">{v}</span> :
    <span className="badge bg-green-100 text-green-700">{v}</span>

  // Celda de sesión
  const renderSessionCell = (log, prevLog, highlight, noteKey) => {
    const bg = highlight ? 'bg-primary-50/40' : ''
    if (!log) {
      return (
        <td className={`px-2 py-2 text-center text-gray-300 border-l border-gray-100 ${bg}`}>
          —
        </td>
      )
    }
    const hasNotes = !!(log.notes && log.notes.trim())
    const status = isField('status') ? getStatusEmoji(log, prevLog) : null

    return (
      <td className={`px-2 py-2 text-center border-l border-gray-100 ${bg}`}>
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
              {log.actual_sets ?? '—'}×{log.actual_reps ?? '—'}
            </span>
          )}
          {isField('pse') && (
            log.perceived_difficulty != null
              ? pseBadge(log.perceived_difficulty)
              : <span className="text-[10px] text-gray-300">PSE —</span>
          )}
          {isField('status') && status && (
            <span className={`text-[11px] leading-none ${status.color}`}>{status.emoji}</span>
          )}
          {isField('notes') && (
            hasNotes ? (
              <button
                className={`text-[13px] leading-none cursor-pointer transition-opacity ${
                  activeNote?.key === noteKey ? 'opacity-100' : 'opacity-50 hover:opacity-100'
                }`}
                onClick={(e) => handleNoteClick(e, noteKey, log.notes)}
                title="Ver nota"
                aria-label="Ver nota completa"
              >
                💬
              </button>
            ) : (
              <span className="text-[10px] text-gray-200">—</span>
            )
          )}
        </div>
      </td>
    )
  }

  const renderRow = r => {
    const trendColor =
      r.trend === '↑' ? 'text-green-600' :
      r.trend === '↓' ? 'text-red-600' :
      r.trend === '=' ? 'text-gray-500' : 'text-gray-400'

    return (
      <tr key={r.id} className="border-t border-gray-100 text-sm hover:bg-gray-50">
        {/* Ejercicio (sticky) */}
        <td className="px-2 py-2 sticky left-0 bg-white z-[1] min-w-[140px]">
          <div className="font-medium text-gray-900 truncate max-w-[200px]" title={r.exerciseName}>
            {r.exerciseName}
          </div>
          {r.muscleGroup && <div className="text-[10px] text-gray-400">{r.muscleGroup}</div>}
        </td>

        {/* Columnas estáticas del plan */}
        {isCol('block') && (
          <td className="px-2 py-2">
            {r.block_label
              ? <span className="badge bg-primary-100 text-primary-700">{r.block_label}</span>
              : <span className="text-gray-300">—</span>}
          </td>
        )}
        {isCol('plan_sets')   && <td className="px-2 py-2 text-right text-gray-700">{r.suggested_sets ?? '—'}</td>}
        {isCol('plan_reps')   && (
          <td className="px-2 py-2 text-right text-gray-700">
            {r.suggested_reps ? displayReps(r.suggested_reps) : '—'}
          </td>
        )}
        {isCol('plan_weight') && <td className="px-2 py-2 text-right text-gray-700">{r.suggested_weightStr}</td>}
        {isCol('plan_pse')    && <td className="px-2 py-2 text-right text-gray-700">{r.suggested_pse || '—'}</td>}

        {/* Último registro */}
        {isCol('last_date') && (
          <td className="px-2 py-2 text-center text-gray-700">
            {r.recentLogs[0]?.logged_date
              ? format(parseISO(r.recentLogs[0].logged_date), 'dd/MM/yy')
              : <span className="text-gray-300">—</span>}
          </td>
        )}
        {isCol('last_sets') && (
          <td className="px-2 py-2 text-right text-gray-700">
            {r.recentLogs[0]?.actual_sets ?? <span className="text-gray-300">—</span>}
          </td>
        )}
        {isCol('last_reps') && (
          <td className="px-2 py-2 text-right text-gray-700">
            {r.recentLogs[0]?.actual_reps ?? <span className="text-gray-300">—</span>}
          </td>
        )}
        {isCol('last_weight') && (
          <td className="px-2 py-2 text-right text-gray-700">
            {r.recentLogs[0] ? displayActualWeight(r.recentLogs[0]) : <span className="text-gray-300">—</span>}
          </td>
        )}
        {isCol('last_pse') && (
          <td className="px-2 py-2 text-right">
            {r.recentLogs[0]?.perceived_difficulty != null
              ? pseBadge(r.recentLogs[0].perceived_difficulty)
              : <span className="text-gray-300">—</span>}
          </td>
        )}
        {isCol('last_notes') && (
          <td className="px-2 py-2 text-left text-gray-600 text-xs italic max-w-[200px]">
            {r.recentLogs[0]?.notes
              ? <span className="line-clamp-2" title={r.recentLogs[0].notes}>💬 {r.recentLogs[0].notes}</span>
              : <span className="text-gray-300 not-italic">—</span>}
          </td>
        )}

        {/* Columnas dinámicas por fecha real */}
        {allSessionDates.map((date, i) => {
          const log = getLogForDate(r, date)
          const isLatest = i === allSessionDates.length - 1
          // Log previo: la fecha anterior en la que este ejercicio fue entrenado
          const prevDate = i > 0
            ? allSessionDates.slice(0, i).reverse().find(d => getLogForDate(r, d) != null)
            : null
          const prevLog = prevDate ? getLogForDate(r, prevDate) : null
          const noteKey = `${r.id}-${date}`
          return (
            <Fragment key={`sc-${r.id}-${date}`}>
              {renderSessionCell(log, prevLog, isLatest, noteKey)}
            </Fragment>
          )
        })}

        {/* Peso máx */}
        {isCol('max_weight') && (
          <td className="px-2 py-2 text-right text-primary-600 font-semibold">
            {r.maxWeight != null ? `${r.maxWeight}kg` : <span className="text-gray-300 font-normal">—</span>}
          </td>
        )}

        {/* Progreso % + sparkline */}
        {isCol('progress') && (
          <td className="px-2 py-2 text-right">
            {r.progressPct != null ? (
              <div className="flex flex-col items-end gap-0.5">
                <span className={`text-sm font-semibold ${r.progressColor}`}>
                  {r.progressPct > 0 ? '+' : ''}{r.progressPct}%
                  <span className="text-[9px] font-normal text-gray-400 ml-0.5">{r.progressMetric}</span>
                </span>
                <Sparkline
                  values={r.sparklineValues}
                  color={r.progressPct > 0 ? '#16a34a' : r.progressPct < 0 ? '#ef4444' : '#9ca3af'}
                />
              </div>
            ) : (
              <span className="text-gray-300">—</span>
            )}
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

  // ── Loading / vacío ────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* ── Modal de nota completa ── */}
      {activeNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setActiveNote(null)}
        >
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative bg-white shadow-2xl rounded-2xl p-4 max-w-sm w-full border border-gray-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0 mt-0.5">💬</span>
              <p className="text-sm text-gray-800 flex-1 leading-relaxed whitespace-pre-wrap">
                {activeNote.text}
              </p>
              <button
                onClick={() => setActiveNote(null)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-700 ml-1"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

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
            <p className="text-xs font-semibold text-gray-900">¿Qué mostrar en cada sesión?</p>
            <button
              className="text-xs text-primary-600 hover:underline"
              onClick={() => setSessionFields(defaultSessionFields())}
            >
              Por defecto
            </button>
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
                    onChange={() => setSessionFields(prev => {
                      const next = new Set(prev)
                      if (next.has(f.id)) next.delete(f.id)
                      else next.add(f.id)
                      return next
                    })}
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
              <button className="text-xs text-primary-600 hover:underline"
                onClick={() => setVisibleCols(new Set(COLUMN_DEFS.map(c => c.id)))}>Todas</button>
              <span className="text-gray-300">·</span>
              <button className="text-xs text-primary-600 hover:underline"
                onClick={() => setVisibleCols(defaultVisibleCols())}>Por defecto</button>
              <span className="text-gray-300">·</span>
              <button className="text-xs text-gray-500 hover:underline"
                onClick={() => setVisibleCols(new Set())}>Ninguna</button>
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
                      <input type="checkbox" className="sr-only" checked={isCol(c.id)} onChange={() => toggleCol(c.id)} />
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
                      <tr className="bg-gray-100 cursor-pointer" onClick={() => toggleSection(group.key)}>
                        <td colSpan={visibleColCount} className="px-2 py-1.5 text-xs font-semibold text-gray-700">
                          <div className="flex items-center gap-2">
                            {isCollapsed
                              ? <ChevronDown size={14} className="text-gray-400" />
                              : <ChevronUp size={14} className="text-gray-400" />}
                            <span>{group.sectionLabel}</span>
                            {group.planTitle && activePlans.length > 1 && (
                              <span className="text-gray-400 font-normal">· {group.planTitle}</span>
                            )}
                            <span className="ml-auto text-gray-400 font-normal">{group.rows.length}</span>
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
