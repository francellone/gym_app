import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Columns3, Filter, Table as TableIcon, ChevronDown, ChevronUp, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  parseReps,
  displayReps,
  getDynamicSections,
  readLogReps,
  readLogWeights,
  maxWeightOfLog,
  calculateLogVolume,
  getEffectiveWeightMode,
  getLoggingWeightMode,
  getEffectiveUnilateral,
} from '@/features/plans/helpers'
import { computeProgression, repsMaxOfLog } from '@/features/progress/progression'
import {
  planWindowsFromLogs,
  planStartMarks,
  realPlanWindows,
  hasMultiplePlans,
  markIndexes,
} from '../planWindows'

// ─────────────────────────────────────────────────────────────
// Helpers locales: ahora delegan a planHelpers (que prioriza jsonb)
// ─────────────────────────────────────────────────────────────

function maxWeightOf(log) {
  return maxWeightOfLog(log)
}
function displayWeight(ex) {
  if (ex.suggested_weights) {
    const arr = parseReps(ex.suggested_weights).filter((w) => w !== '' && w != null)
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
  const weightMode = getLoggingWeightMode(
    getEffectiveWeightMode({
      log,
      planExercise: log.plan_exercise,
      exercise: log.plan_exercise?.exercise,
    })
  )
  if (weightMode === 'bodyweight') return 'BW'
  const arr = readLogWeights(log).filter((w) => w !== '' && w != null)
  if (arr.length === 0) return '—'
  const unique = [...new Set(arr.map(String))]
  return unique.length === 1 ? `${unique[0]}kg` : `${arr.join('/')}kg`
}

function displayActualReps(log) {
  if (!log) return '—'
  const arr = readLogReps(log).filter((r) => r !== '' && r != null)
  if (arr.length === 0) return '—'
  const unique = [...new Set(arr.map(String))]
  const base = unique.length === 1 ? unique[0] : arr.join('/')
  return log.unilateral ? `${base}×lado` : base
}

// Mini sparkline SVG para la columna Progreso
function Sparkline({ values, color = '#6366f1' }) {
  if (!values || values.length < 2) return null
  const w = 48,
    h = 18,
    pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - 2 * pad)
      const y = h - pad - ((v - min) / range) * (h - 2 * pad)
      return `${x},${y}`
    })
    .join(' ')
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
  { id: 'block', label: 'Bloque', group: 'plan', defaultVisible: true },
  { id: 'plan_sets', label: 'Series sugeridas', group: 'plan', defaultVisible: false },
  { id: 'plan_reps', label: 'Reps sugeridas', group: 'plan', defaultVisible: false },
  { id: 'plan_weight', label: 'Peso sugerido', group: 'plan', defaultVisible: true },
  { id: 'plan_pse', label: 'PSE sugerida', group: 'plan', defaultVisible: false },
  { id: 'last_date', label: 'Fecha última', group: 'last', defaultVisible: false },
  { id: 'last_sets', label: 'Series reales', group: 'last', defaultVisible: false },
  { id: 'last_reps', label: 'Reps reales', group: 'last', defaultVisible: false },
  { id: 'last_weight', label: 'Peso real', group: 'last', defaultVisible: false },
  { id: 'last_pse', label: 'PSE real', group: 'last', defaultVisible: false },
  { id: 'last_notes', label: 'Notas última', group: 'last', defaultVisible: false },
  { id: 'max_weight', label: 'Peso máx.', group: 'progress', defaultVisible: true },
  { id: 'progress', label: 'Progreso', group: 'progress', defaultVisible: true },
  { id: 'trend', label: 'Tendencia', group: 'progress', defaultVisible: true },
  { id: 'count', label: 'Veces', group: 'volume', defaultVisible: true },
  { id: 'volume', label: 'Volumen total', group: 'volume', defaultVisible: false },
  { id: 'avg_pse', label: 'PSE promedio', group: 'volume', defaultVisible: false },
]

const COLUMN_GROUPS = [
  { id: 'plan', label: 'Plan' },
  { id: 'last', label: 'Último registro' },
  { id: 'progress', label: 'Progresión' },
  { id: 'volume', label: 'Volumen / frecuencia' },
]

const defaultVisibleCols = () =>
  new Set(COLUMN_DEFS.filter((c) => c.defaultVisible).map((c) => c.id))

// ─────────────────────────────────────────────────────────────
// Sesiones (columnas dinámicas por fecha real)
// ─────────────────────────────────────────────────────────────
// Los planes se llaman "PLAN 2. Andrea Martinez — Andrea Martinez": para el
// rótulo de la marca alcanza con la primera parte.
function shortPlanTitle(title = '') {
  const head = String(title).split('—')[0].trim()
  return head.length > 16 ? `${head.slice(0, 15)}…` : head || 'Plan'
}

const ROW_MODES = [
  { id: 'plan', label: 'Por plan', hint: 'Qué le prescribiste en cada plan y qué cumplió' },
  {
    id: 'exercise',
    label: 'Por ejercicio',
    hint: 'Todo el historial de un ejercicio, cruzando planes',
  },
]

const SESSIONS_COUNT_OPTIONS = [
  { value: 3, label: '3' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 'all', label: 'Todas' },
]

// Campos disponibles a mostrar dentro de cada celda de sesión
const SESSION_FIELDS = [
  { id: 'date', label: 'Fecha' },
  { id: 'weight', label: 'Peso' },
  { id: 'sets_reps', label: 'Series × Reps' },
  { id: 'pse', label: 'PSE' },
  { id: 'status', label: 'Estado ⬆️😊⬇️' },
  { id: 'notes', label: 'Notas 💬' },
]

const defaultSessionFields = () => new Set(['date', 'weight', 'pse'])

// ─────────────────────────────────────────────────────────────
// Componente principal
// Props: studentId, logs (ya filtrados por período en el padre)
//        exerciseTags, tagAssignments, selectedTag (filtro etiqueta)
// ─────────────────────────────────────────────────────────────
export default function StudentProgressTableView({
  studentId,
  logs,
  exerciseTags = [],
  tagAssignments = [],
  selectedTag = '',
}) {
  const [planExercises, setPlanExercises] = useState([])
  const [plansInPeriod, setPlansInPeriod] = useState([])
  const [loadingPlan, setLoadingPlan] = useState(false)

  // Cómo se arma cada fila:
  //   'plan'     → un ejercicio de cada plan que se solape con el período
  //   'exercise' → un ejercicio del catálogo con todo su historial, cruzando planes
  const [rowMode, setRowMode] = useState('plan')

  // Visualización / filtros
  const [visibleCols, setVisibleCols] = useState(defaultVisibleCols())
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [showOnlyWithLogs, setShowOnlyWithLogs] = useState(false)
  const [groupBySection, setGroupBySection] = useState(true)
  const [collapsedSections, setCollapsedSections] = useState(new Set())

  // Sesiones dinámicas
  const [sessionsCount, setSessionsCount] = useState(3)
  const [sessionsCountTouched, setSessionsCountTouched] = useState(false)
  const [sessionFields, setSessionFields] = useState(defaultSessionFields())
  const [showFieldsPicker, setShowFieldsPicker] = useState(false)

  // Modal de notas
  const [activeNote, setActiveNote] = useState(null) // { key, text }

  // ── Planes que tocó el alumno en el período ────────────────
  // Los registros ya vienen filtrados por fecha desde el padre, así que de
  // ellos sale qué planes hay que traer. Antes esto pedía solo la asignación
  // activa y el plan anterior no tenía dónde pintarse: los registros viejos
  // llegaban y se descartaban en silencio.
  const planIdsInLogs = useMemo(() => {
    const set = new Set()
    for (const l of logs) if (l.plan_id) set.add(l.plan_id)
    return [...set].sort()
  }, [logs])
  const planIdsKey = planIdsInLogs.join(',')

  useEffect(() => {
    let cancelled = false
    async function loadPlanData() {
      setLoadingPlan(true)
      try {
        const { data: assigns, error: assignErr } = await supabase
          .from('plan_assignments')
          .select('plan_id, active')
          .eq('student_id', studentId)
        if (assignErr) throw assignErr
        const activeIds = new Set((assigns || []).filter((a) => a.active).map((a) => a.plan_id))
        // El plan vigente entra aunque todavía no tenga registros, para que se
        // vea lo prescrito; los planes anteriores entran por sus registros.
        const planIds = [...new Set([...planIdsInLogs, ...activeIds])].filter(Boolean)
        if (cancelled) return

        if (planIds.length === 0) {
          setPlansInPeriod([])
          setPlanExercises([])
          return
        }

        // Se piden por id y no por la asignación: un plan cuya asignación se
        // borró igual tiene registros que hay que mostrar.
        const { data: planRows, error: planErr } = await supabase
          .from('plans')
          .select('id, title, sessions_per_week, has_activation')
          .in('id', planIds)
        if (planErr) throw planErr
        if (cancelled) return
        setPlansInPeriod((planRows || []).map((p) => ({ ...p, active: activeIds.has(p.id) })))
        const { data: pex } = await supabase
          .from('plan_exercises')
          .select(
            `
            id, plan_id, section, block_label, order_index,
            suggested_sets, suggested_reps, suggested_weight, suggested_weights,
            suggested_pse, rest_time, extra_notes,
            weight_mode, unilateral,
            exercise:exercises!exercise_id(id, name, muscle_group, default_weight_mode, default_unilateral)
          `
          )
          .in('plan_id', planIds)
          .order('order_index', { ascending: true })
        if (cancelled) return
        setPlanExercises(pex || [])
      } catch (err) {
        console.error('[StudentProgressTableView]', err)
        if (!cancelled) {
          setPlansInPeriod([])
          setPlanExercises([])
        }
      } finally {
        if (!cancelled) setLoadingPlan(false)
      }
    }
    loadPlanData()
    return () => {
      cancelled = true
    }
    // planIdsKey y no planIdsInLogs: el array se recrea en cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, planIdsKey])

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
      const exId = log.exercise_id || log.plan_exercise?.exercise?.id
      if (!exId || !log.logged_date) continue
      if (!map.has(exId)) map.set(exId, new Map())
      // Mismo criterio que el índice por plan_exercise: gana el último. Si un
      // ejercicio se registró dos veces el mismo día (dos secciones, o dos
      // planes en la misma fecha) la celda avisa con "·N".
      map.get(exId).set(log.logged_date, log)
    }
    return map
  }, [logs])

  // Cuántos registros hay del mismo ejercicio en un mismo día (modo por
  // ejercicio): la celda muestra uno, pero las métricas cuentan todos.
  const logCountByExerciseAndDate = useMemo(() => {
    const map = new Map()
    for (const log of logs) {
      const exId = log.exercise_id || log.plan_exercise?.exercise?.id
      if (!exId || !log.logged_date) continue
      const key = `${exId}|${log.logged_date}`
      map.set(key, (map.get(key) || 0) + 1)
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

  // ── Ventanas de plan dentro del período (para agrupar y para el corte) ──
  const planWindows = useMemo(() => planWindowsFromLogs(logs), [logs])
  const multiPlan = useMemo(() => hasMultiplePlans(planWindows), [planWindows])
  const startMarks = useMemo(() => planStartMarks(planWindows), [planWindows])
  const windowByPlan = useMemo(() => {
    const m = new Map()
    for (const w of planWindows) m.set(w.planId, w)
    return m
  }, [planWindows])

  // ── Fechas de sesión únicas, ordenadas asc, limitadas a N ──
  const allSessionDates = useMemo(() => {
    const dates = new Set(logs.map((l) => l.logged_date).filter(Boolean))
    const sorted = [...dates].sort() // ascendente: más viejo primero → izquierda
    // Con varios planes en el período, mostrar solo las últimas 3 sesiones
    // esconde el cambio de plan (y buena parte del plan anterior): salvo que
    // la coach elija otra cosa, se muestran todas.
    const effective = !sessionsCountTouched && multiPlan ? 'all' : sessionsCount
    if (effective === 'all') return sorted
    return sorted.slice(-Number(effective)) // N más recientes
  }, [logs, sessionsCount, sessionsCountTouched, multiPlan])

  // ── Filas: una por plan_exercise ───────────────────────────
  const activePlanIds = useMemo(
    () => new Set(plansInPeriod.filter((p) => p.active).map((p) => p.id)),
    [plansInPeriod]
  )

  // Métricas de una fila. La usan los dos modos: por plan recibe los registros
  // de ese ejercicio del plan, por ejercicio recibe todo su historial del período.
  const buildRow = useCallback((pex, exLogs, overrides = {}) => {
    {
      const exerciseId = pex.exercise?.id

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

      // Volumen total — usa calculateLogVolume si tenemos el modo efectivo;
      // si no, cae al cálculo legacy series×reps×peso.
      let volume = 0
      for (const l of exLogs) {
        // El log puede no tener plan_exercise embebido (los logs del padre
        // suelen venir con menos joins). Heredamos del pex actual de la fila.
        const planEx = l.plan_exercise || pex
        const weightMode = getLoggingWeightMode(
          getEffectiveWeightMode({
            log: l,
            planExercise: planEx,
            exercise: planEx?.exercise || pex.exercise,
          })
        )
        const unilateral = getEffectiveUnilateral({
          log: l,
          planExercise: planEx,
          exercise: planEx?.exercise || pex.exercise,
        })
        // Bodyweight con peso corporal lo dejamos fuera de esta tabla
        // (la tabla no recibe weight_kg del alumno; el detalle BW va al
        // gráfico de volumen). Usamos null como body para que devuelva
        // null en BW y lo omitamos.
        const v = calculateLogVolume(l, null, { weightMode, unilateral })
        if (v !== null && v > 0) volume += v
      }

      // PSE promedio
      const pseVals = exLogs.map((l) => l.perceived_difficulty).filter((v) => v != null)
      const avgPse =
        pseVals.length > 0
          ? Math.round((pseVals.reduce((a, b) => a + b, 0) / pseVals.length) * 10) / 10
          : null

      // Progreso %: misma definición que el gráfico (promedio de la primera
      // semana vs la última — ver features/progress/progression.js). Antes era
      // primer log vs último log, frágil a un día atípico en las puntas y
      // dependiente del filtro de período. Peso si hay datos de peso; si no,
      // reps (ejercicios de peso corporal).
      const weightValues = exLogs.map((l) => maxWeightOf(l)).filter((w) => w > 0)
      const weightPts = exLogs
        .map((l) => ({ date: l.logged_date, value: maxWeightOf(l) }))
        .filter((pt) => pt.value > 0)
      let progressPct = null
      let progressColor = 'text-gray-400'
      let progressMetric = 'Peso'

      let prog = computeProgression(weightPts)
      if (!prog) {
        prog = computeProgression(
          exLogs.map((l) => ({ date: l.logged_date, value: repsMaxOfLog(l) }))
        )
        if (prog) progressMetric = 'Reps'
      }
      if (prog) {
        progressPct = prog.pct
        progressColor =
          prog.pct > 0 ? 'text-green-600' : prog.pct < 0 ? 'text-red-500' : 'text-gray-500'
      }

      const sparklineValues =
        weightValues.length >= 2 ? weightValues : exLogs.map(repsMaxOfLog).filter((r) => r > 0)

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
        ...overrides,
      }
    }
  }, [])

  // Modo "por plan": una fila por ejercicio de cada plan del período.
  // Solo los registros de ESE ejercicio de ESE plan. Antes, si el ejercicio del
  // plan vigente no tenía registros, la fila se rellenaba con los del mismo
  // ejercicio de otro plan sin avisar (y desaparecían apenas había uno propio).
  const rows = useMemo(
    () => planExercises.map((pex) => buildRow(pex, logsByPlanExercise.get(pex.id) || [])),
    [planExercises, logsByPlanExercise, buildRow]
  )

  // Modo "por ejercicio": una fila por ejercicio del catálogo, con todo su
  // historial del período aunque venga de planes distintos. Se apoya en
  // workout_logs.exercise_id (v41), que sobrevive al borrado del plan.
  const exerciseRows = useMemo(() => {
    const byExercise = new Map()
    for (const log of logs) {
      const exId = log.exercise_id || log.plan_exercise?.exercise?.id
      if (!exId) continue
      if (!byExercise.has(exId)) byExercise.set(exId, [])
      byExercise.get(exId).push(log)
    }

    // Prescripción de referencia: la del plan vigente si el ejercicio sigue ahí;
    // si no, la del plan más reciente en el que estuvo. El orden sale de las
    // ventanas de plan (fecha real de entrenamiento), no del orden en que la
    // base devolvió los plan_exercises.
    const rank = new Map(planWindows.map((w, i) => [w.planId, i]))
    const rankOf = (planId) =>
      activePlanIds.has(planId) ? Number.MAX_SAFE_INTEGER : (rank.get(planId) ?? -1)
    const pexByExercise = new Map()
    for (const pex of planExercises) {
      const exId = pex.exercise?.id
      if (!exId) continue
      const prev = pexByExercise.get(exId)
      if (!prev || rankOf(pex.plan_id) > rankOf(prev.plan_id)) pexByExercise.set(exId, pex)
    }

    const out = []
    for (const [exId, exLogs] of byExercise) {
      const sorted = [...exLogs].sort((a, b) =>
        (a.logged_date || '').localeCompare(b.logged_date || '')
      )
      const pex = pexByExercise.get(exId)
      const planIds = [...new Set(sorted.map((l) => l.plan_id).filter(Boolean))]
      const name =
        sorted.find((l) => l.exercise?.name)?.exercise?.name ||
        pex?.exercise?.name ||
        sorted.find((l) => l.plan_exercise?.exercise?.name)?.plan_exercise?.exercise?.name ||
        'Ejercicio eliminado del plan'
      const base = pex || {
        id: `ex-${exId}`,
        plan_id: null,
        section: null,
        block_label: '',
        exercise: { id: exId, name },
      }
      const inCurrentPlan = pex ? activePlanIds.has(pex.plan_id) : false
      out.push(
        buildRow(base, sorted, {
          id: `ex-${exId}`,
          exerciseId: exId,
          planId: null,
          section: null,
          exerciseName: name,
          planIds,
          inCurrentPlan,
          // De qué plan sale la prescripción que muestra la fila: si el
          // ejercicio pasó por varios, decirlo en vez de mostrar un número
          // suelto sin dueño.
          prescriptionPlanId: pex?.plan_id || null,
          prescriptionIsCurrent: inCurrentPlan,
        })
      )
    }
    return out.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName, 'es'))
  }, [logs, planExercises, activePlanIds, planWindows, buildRow])

  // Si los ejercicios del plan fueron borrados pero los registros conservan su
  // ejercicio (v41), la vista por plan no tiene nada que mostrar: se usa la
  // otra en lugar de dejar la tabla vacía.
  const planViewUnavailable = planExercises.length === 0 && exerciseRows.length > 0
  const effectiveRowMode = planViewUnavailable ? 'exercise' : rowMode

  // ── Filtro "solo con logs" + filtro por etiqueta ──────────
  const filteredRows = useMemo(() => {
    let result = effectiveRowMode === 'exercise' ? exerciseRows : rows
    if (showOnlyWithLogs) result = result.filter((r) => r.hasLogs)
    if (selectedTag) {
      result = result.filter(
        (r) =>
          r.exerciseId &&
          tagAssignments.some((ta) => ta.exercise_id === r.exerciseId && ta.tag_id === selectedTag)
      )
    }
    return result
  }, [rows, exerciseRows, effectiveRowMode, showOnlyWithLogs, selectedTag, tagAssignments])

  // Planes ordenados como se leen: primero el más viejo del período, y el
  // vigente sin registros al final.
  const orderedPlans = useMemo(() => {
    const order = new Map(planWindows.map((w, i) => [w.planId, i]))
    return [...plansInPeriod].sort((a, b) => {
      const ia = order.has(a.id) ? order.get(a.id) : Number.MAX_SAFE_INTEGER
      const ib = order.has(b.id) ? order.get(b.id) : Number.MAX_SAFE_INTEGER
      if (ia !== ib) return ia - ib
      return (a.title || '').localeCompare(b.title || '', 'es')
    })
  }, [plansInPeriod, planWindows])

  // ── Agrupación por sección ─────────────────────────────────
  const groupedRows = useMemo(() => {
    if (!groupBySection || effectiveRowMode === 'exercise') return null
    const groups = []
    for (const plan of orderedPlans) {
      const sections = getDynamicSections(plan.sessions_per_week, plan.has_activation)
      const win = windowByPlan.get(plan.id)
      for (const s of sections) {
        const rowsInSection = filteredRows.filter((r) => r.planId === plan.id && r.section === s.id)
        if (rowsInSection.length === 0) continue
        groups.push({
          key: `${plan.id}:${s.id}`,
          planTitle: plan.title,
          planActive: plan.active,
          planFrom: win?.from || null,
          planTo: win?.to || null,
          sectionLabel: s.label,
          rows: rowsInSection,
        })
      }
    }
    const known = new Set()
    for (const g of groups) for (const r of g.rows) known.add(r.id)
    const orphans = filteredRows.filter((r) => !known.has(r.id))
    if (orphans.length > 0)
      groups.push({ key: 'orphans', planTitle: '', sectionLabel: 'Otros', rows: orphans })
    return groups
  }, [filteredRows, orderedPlans, windowByPlan, groupBySection, effectiveRowMode])

  const toggleCol = (colId) =>
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(colId)) next.delete(colId)
      else next.add(colId)
      return next
    })

  const toggleSection = (key) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Columna donde arranca cada plan: ahí va la marca. Incluye el primero, así
  // en un período con un solo plan también se ve dónde empieza.
  const markCols = useMemo(
    () => markIndexes(allSessionDates, startMarks),
    [allSessionDates, startMarks]
  )
  const planTitleById = useMemo(() => {
    const m = new Map()
    for (const p of plansInPeriod) m.set(p.id, p.title)
    return m
  }, [plansInPeriod])
  // El borde separa dos planes; en la primera columna no hay nada que separar,
  // pero el rótulo va igual.
  const cutClass = (i) =>
    markCols.has(i) && i > 0 ? 'border-l-2 border-dashed border-amber-400' : ''

  // Un plan que arrancó antes de la primera columna visible no tiene marca: si
  // el recorte de sesiones se comió alguna, hay que avisarlo.
  const marksHidden = useMemo(() => startMarks.length - markCols.size, [startMarks, markCols])

  const isCol = (id) => visibleCols.has(id)
  const isField = (id) => sessionFields.has(id)

  // Lookup de log por fila + fecha
  // En modo por plan, cada celda muestra SOLO el registro de ese ejercicio de
  // ese plan. El cruce entre planes vive en el modo por ejercicio, donde la
  // fila lo dice.
  const getLogForDate = useCallback(
    (row, date) =>
      effectiveRowMode === 'exercise'
        ? (logsByExerciseAndDate.get(row.exerciseId)?.get(date) ?? null)
        : (logsByExAndDate.get(row.id)?.get(date) ?? null),
    [logsByExAndDate, logsByExerciseAndDate, effectiveRowMode]
  )

  // Abrir/cerrar modal de nota
  const handleNoteClick = (e, key, text) => {
    e.stopPropagation()
    setActiveNote((prev) => (prev?.key === key ? null : { key, text }))
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
    const repsMaxOfLog = (l) => {
      const arr = readLogReps(l)
        .map((r) => parseFloat(r))
        .filter((n) => !isNaN(n))
      return arr.length > 0 ? Math.max(...arr) : 0
    }
    const currR = repsMaxOfLog(log)
    const prevR = repsMaxOfLog(prevLog)
    if (currR > prevR) return { emoji: '⬆️', color: 'text-green-600' }
    if (currR < prevR) return { emoji: '⬇️', color: 'text-red-500' }
    return { emoji: '😊', color: 'text-gray-400' }
  }

  // ── Conteo de columnas (para colSpan) ─────────────────────
  const visibleColCount =
    1 /* ejercicio */ +
    (effectiveRowMode === 'exercise' ? 1 /* planes */ : 0) +
    COLUMN_DEFS.filter((c) => isCol(c.id) && !(effectiveRowMode === 'exercise' && c.id === 'block'))
      .length +
    allSessionDates.length

  // ── Header de la tabla ─────────────────────────────────────
  const renderHeader = () => (
    <tr className="text-[11px] uppercase tracking-wider text-gray-500 bg-gray-50">
      <th className="text-left font-semibold px-2 py-2 sticky left-0 bg-gray-50 z-10 min-w-[140px]">
        Ejercicio
      </th>
      {effectiveRowMode === 'exercise' && (
        <th className="text-left font-semibold px-2 py-2 min-w-[90px]">Planes</th>
      )}
      {isCol('block') && effectiveRowMode !== 'exercise' && (
        <th className="text-left font-semibold px-2 py-2">Bloque</th>
      )}
      {isCol('plan_sets') && <th className="text-right font-semibold px-2 py-2">Series</th>}
      {isCol('plan_reps') && <th className="text-right font-semibold px-2 py-2">Reps</th>}
      {isCol('plan_weight') && <th className="text-right font-semibold px-2 py-2">Peso sug.</th>}
      {isCol('plan_pse') && <th className="text-right font-semibold px-2 py-2">PSE sug.</th>}
      {isCol('last_date') && <th className="text-center font-semibold px-2 py-2">Fecha últ.</th>}
      {isCol('last_sets') && <th className="text-right font-semibold px-2 py-2">Series real.</th>}
      {isCol('last_reps') && <th className="text-right font-semibold px-2 py-2">Reps real.</th>}
      {isCol('last_weight') && <th className="text-right font-semibold px-2 py-2">Peso real</th>}
      {isCol('last_pse') && <th className="text-right font-semibold px-2 py-2">PSE real</th>}
      {isCol('last_notes') && (
        <th className="text-left font-semibold px-2 py-2 min-w-[140px]">Notas últ.</th>
      )}

      {/* Columnas dinámicas: una por fecha real de sesión */}
      {allSessionDates.map((date, i) => {
        const blockLabel = sessionDateInfo.get(date) || ''
        const isLatest = i === allSessionDates.length - 1
        return (
          <th
            key={`sh-${date}`}
            className={`text-center font-semibold px-2 py-2 min-w-[82px] border-l border-gray-100 ${
              isLatest ? 'bg-primary-50 text-primary-700' : ''
            } ${cutClass(i)}`}
            title={
              markCols.has(i)
                ? `Acá arranca ${planTitleById.get(markCols.get(i)) || 'otro plan'}`
                : undefined
            }
          >
            <div className="flex flex-col items-center leading-none gap-[3px]">
              {markCols.has(i) && (
                <span className="text-[8px] font-bold text-amber-600 tracking-wide">
                  ▸ {shortPlanTitle(planTitleById.get(markCols.get(i)))}
                </span>
              )}
              <span>{format(parseISO(date), 'dd/MM')}</span>
              {blockLabel && (
                <span
                  className={`text-[9px] font-normal tracking-wide ${isLatest ? 'text-primary-400' : 'text-gray-400'}`}
                >
                  {blockLabel}
                </span>
              )}
            </div>
          </th>
        )
      })}

      {isCol('max_weight') && <th className="text-right font-semibold px-2 py-2">Peso máx.</th>}
      {isCol('progress') && (
        <th
          className="text-right font-semibold px-2 py-2 min-w-[96px]"
          title="Promedio de la primera semana vs la última del período (con menos de 2 semanas: primer vs último registro)"
        >
          Progreso
        </th>
      )}
      {isCol('trend') && <th className="text-center font-semibold px-2 py-2">Tend.</th>}
      {isCol('count') && <th className="text-right font-semibold px-2 py-2">Veces</th>}
      {isCol('volume') && <th className="text-right font-semibold px-2 py-2">Volumen</th>}
      {isCol('avg_pse') && <th className="text-right font-semibold px-2 py-2">PSE prom.</th>}
    </tr>
  )

  // Badge de PSE con color según nivel
  const pseBadge = (v) =>
    v == null ? null : v >= 8 ? (
      <span className="badge bg-red-100 text-red-700">{v}</span>
    ) : v >= 5 ? (
      <span className="badge bg-yellow-100 text-yellow-700">{v}</span>
    ) : (
      <span className="badge bg-green-100 text-green-700">{v}</span>
    )

  // Celda de sesión
  const renderSessionCell = (
    log,
    prevLog,
    highlight,
    noteKey,
    extraClass = '',
    sameDayCount = 0
  ) => {
    const bg = highlight ? 'bg-primary-50/40' : ''
    if (!log) {
      return (
        <td
          className={`px-2 py-2 text-center text-gray-300 border-l border-gray-100 ${bg} ${extraClass}`}
        >
          —
        </td>
      )
    }
    const hasNotes = !!(log.notes && log.notes.trim())
    const status = isField('status') ? getStatusEmoji(log, prevLog) : null

    return (
      <td className={`px-2 py-2 text-center border-l border-gray-100 ${bg} ${extraClass}`}>
        <div className="flex flex-col items-center gap-0.5 leading-tight">
          {sameDayCount > 1 && (
            <span
              className="text-[9px] text-amber-600 font-semibold"
              title={`${sameDayCount} registros de este ejercicio ese día; la celda muestra el último y los totales los cuentan a todos`}
            >
              ·{sameDayCount}
            </span>
          )}
          {isField('date') && (
            <span className="text-[10px] text-gray-400">
              {log.logged_date ? format(parseISO(log.logged_date), 'dd/MM') : ''}
            </span>
          )}
          {isField('weight') && (
            <span className="text-sm font-semibold text-gray-900">{displayActualWeight(log)}</span>
          )}
          {isField('sets_reps') && (
            <span className="text-[11px] text-gray-600">
              {log.actual_sets ?? '—'}×{displayActualReps(log)}
            </span>
          )}
          {isField('pse') &&
            (log.perceived_difficulty != null ? (
              pseBadge(log.perceived_difficulty)
            ) : (
              <span className="text-[10px] text-gray-300">PSE —</span>
            ))}
          {isField('status') && status && (
            <span className={`text-[11px] leading-none ${status.color}`}>{status.emoji}</span>
          )}
          {isField('notes') &&
            (hasNotes ? (
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
            ))}
        </div>
      </td>
    )
  }

  const renderRow = (r) => {
    const trendColor =
      r.trend === '↑'
        ? 'text-green-600'
        : r.trend === '↓'
          ? 'text-red-600'
          : r.trend === '='
            ? 'text-gray-500'
            : 'text-gray-400'

    return (
      <tr key={r.id} className="border-t border-gray-100 text-sm hover:bg-gray-50">
        {/* Ejercicio (sticky) */}
        <td className="px-2 py-2 sticky left-0 bg-white z-[1] min-w-[140px]">
          <div className="font-medium text-gray-900 truncate max-w-[200px]" title={r.exerciseName}>
            {r.exerciseName}
          </div>
          {r.muscleGroup && <div className="text-[10px] text-gray-400">{r.muscleGroup}</div>}
        </td>

        {/* En modo por ejercicio: en cuántos planes estuvo */}
        {effectiveRowMode === 'exercise' && (
          <td className="px-2 py-2">
            {r.planIds?.length > 1 ? (
              <span
                className="badge bg-amber-100 text-amber-700"
                title="Este ejercicio tiene historial en más de un plan"
              >
                {r.planIds.length} planes
              </span>
            ) : r.inCurrentPlan ? (
              <span className="badge bg-primary-100 text-primary-700">Vigente</span>
            ) : (
              <span className="badge bg-gray-100 text-gray-500">Anterior</span>
            )}
          </td>
        )}

        {/* Columnas estáticas del plan */}
        {isCol('block') && effectiveRowMode !== 'exercise' && (
          <td className="px-2 py-2">
            {r.block_label ? (
              <span className="badge bg-primary-100 text-primary-700">{r.block_label}</span>
            ) : (
              <span className="text-gray-300">—</span>
            )}
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
          <td className="px-2 py-2 text-right text-gray-700">
            {r.suggested_weightStr}
            {effectiveRowMode === 'exercise' &&
              r.planIds?.length > 1 &&
              r.suggested_weightStr !== '—' && (
                <span
                  className="text-[9px] text-amber-600 align-super ml-0.5"
                  title={
                    r.prescriptionIsCurrent
                      ? 'Prescripción del plan vigente; en los planes anteriores pudo ser otra'
                      : 'Prescripción del último plan en el que estuvo este ejercicio'
                  }
                >
                  ●
                </span>
              )}
          </td>
        )}
        {isCol('plan_pse') && (
          <td className="px-2 py-2 text-right text-gray-700">{r.suggested_pse || '—'}</td>
        )}

        {/* Último registro */}
        {isCol('last_date') && (
          <td className="px-2 py-2 text-center text-gray-700">
            {r.recentLogs[0]?.logged_date ? (
              format(parseISO(r.recentLogs[0].logged_date), 'dd/MM/yy')
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </td>
        )}
        {isCol('last_sets') && (
          <td className="px-2 py-2 text-right text-gray-700">
            {r.recentLogs[0]?.actual_sets ?? <span className="text-gray-300">—</span>}
          </td>
        )}
        {isCol('last_reps') && (
          <td className="px-2 py-2 text-right text-gray-700">
            {r.recentLogs[0] ? (
              displayActualReps(r.recentLogs[0])
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </td>
        )}
        {isCol('last_weight') && (
          <td className="px-2 py-2 text-right text-gray-700">
            {r.recentLogs[0] ? (
              displayActualWeight(r.recentLogs[0])
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </td>
        )}
        {isCol('last_pse') && (
          <td className="px-2 py-2 text-right">
            {r.recentLogs[0]?.perceived_difficulty != null ? (
              pseBadge(r.recentLogs[0].perceived_difficulty)
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </td>
        )}
        {isCol('last_notes') && (
          <td className="px-2 py-2 text-left max-w-[200px]">
            {r.recentLogs[0]?.notes ? (
              <button
                className="text-left text-xs italic text-gray-600 hover:text-primary-600 transition-colors cursor-pointer w-full"
                onClick={(e) => handleNoteClick(e, `last-${r.id}`, r.recentLogs[0].notes)}
              >
                <span className="line-clamp-2">💬 {r.recentLogs[0].notes}</span>
              </button>
            ) : (
              <span className="text-gray-300 text-xs not-italic">—</span>
            )}
          </td>
        )}

        {/* Columnas dinámicas por fecha real */}
        {allSessionDates.map((date, i) => {
          const log = getLogForDate(r, date)
          const isLatest = i === allSessionDates.length - 1
          // Log previo: la fecha anterior en la que este ejercicio fue entrenado
          const prevDate =
            i > 0
              ? allSessionDates
                  .slice(0, i)
                  .reverse()
                  .find((d) => getLogForDate(r, d) != null)
              : null
          const prevLog = prevDate ? getLogForDate(r, prevDate) : null
          const noteKey = `${r.id}-${date}`
          return (
            <Fragment key={`sc-${r.id}-${date}`}>
              {renderSessionCell(
                log,
                prevLog,
                isLatest,
                noteKey,
                cutClass(i),
                effectiveRowMode === 'exercise'
                  ? logCountByExerciseAndDate.get(`${r.exerciseId}|${date}`) || 0
                  : 0
              )}
            </Fragment>
          )
        })}

        {/* Peso máx */}
        {isCol('max_weight') && (
          <td className="px-2 py-2 text-right text-primary-600 font-semibold">
            {r.maxWeight != null ? (
              `${r.maxWeight}kg`
            ) : (
              <span className="text-gray-300 font-normal">—</span>
            )}
          </td>
        )}

        {/* Progreso % + sparkline */}
        {isCol('progress') && (
          <td className="px-2 py-2 text-right">
            {r.progressPct != null ? (
              <div className="flex flex-col items-end gap-0.5">
                <span className={`text-sm font-semibold ${r.progressColor}`}>
                  {r.progressPct > 0 ? '+' : ''}
                  {r.progressPct}%
                  <span className="text-[9px] font-normal text-gray-400 ml-0.5">
                    {r.progressMetric}
                  </span>
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
        {isCol('count') && <td className="px-2 py-2 text-right text-gray-700">{r.count}</td>}
        {isCol('volume') && (
          <td className="px-2 py-2 text-right text-gray-700">
            {r.volume > 0 ? r.volume.toLocaleString('es-AR') : '—'}
          </td>
        )}
        {isCol('avg_pse') && <td className="px-2 py-2 text-right">{pseBadge(r.avgPse) || '—'}</td>}
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

  if (planExercises.length === 0 && exerciseRows.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-400">
        <TableIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">
          {plansInPeriod.length === 0
            ? 'No hay planes con registros en este período'
            : 'Los planes del período no tienen ejercicios cargados'}
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
            onClick={(e) => e.stopPropagation()}
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

      {/* ── Cómo se arma cada fila ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {ROW_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setRowMode(m.id)}
              disabled={planViewUnavailable && m.id === 'plan'}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                effectiveRowMode === m.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              } ${planViewUnavailable && m.id === 'plan' ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={
                planViewUnavailable && m.id === 'plan'
                  ? 'Los ejercicios de este plan ya no existen: solo queda el historial por ejercicio'
                  : m.hint
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-gray-400">
          {effectiveRowMode === 'exercise'
            ? 'Historial completo de cada ejercicio, cruzando planes. Solo lo entrenado.'
            : 'Cada plan con su prescripción, agrupado por sección'}
        </span>
        {realPlanWindows(planWindows).length > 1 && (
          <span className="text-[11px] text-amber-600 font-medium ml-auto">
            {realPlanWindows(planWindows).length} planes en el período
          </span>
        )}
      </div>

      {/* ── Selector de cantidad de sesiones ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Sesiones:</span>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {SESSIONS_COUNT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setSessionsCount(opt.value)
                setSessionsCountTouched(true)
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                (!sessionsCountTouched && multiPlan ? 'all' : sessionsCount) === opt.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowFieldsPicker((v) => !v)}
          className="btn-secondary flex items-center gap-1.5 text-xs py-1 px-2.5"
        >
          Mostrar por sesión ({sessionFields.size})
          {showFieldsPicker ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {marksHidden > 0 && (
        <p className="text-[11px] text-amber-600">
          Hay {marksHidden === 1 ? 'un plan que arranca' : `${marksHidden} planes que arrancan`}{' '}
          antes de la primera sesión que se está mostrando. Poné “Todas” en Sesiones para verlo.
        </p>
      )}

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
            {SESSION_FIELDS.map((f) => {
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
                    onChange={() =>
                      setSessionFields((prev) => {
                        const next = new Set(prev)
                        if (next.has(f.id)) next.delete(f.id)
                        else next.add(f.id)
                        return next
                      })
                    }
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
          onClick={() => setShowColumnPicker((v) => !v)}
          className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
        >
          <Columns3 size={13} />
          Columnas ({visibleCols.size})
        </button>
        {/* En modo por ejercicio no aplican: las filas salen de los registros
            (todas tienen) y no hay secciones que agrupar. */}
        {effectiveRowMode !== 'exercise' && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyWithLogs}
                onChange={(e) => setShowOnlyWithLogs(e.target.checked)}
                className="rounded"
              />
              Solo con registros
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={groupBySection}
                onChange={(e) => setGroupBySection(e.target.checked)}
                className="rounded"
              />
              Agrupar por sección
            </label>
          </>
        )}
        <div className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
          <Filter size={12} />
          {filteredRows.length} ejercicio{filteredRows.length !== 1 ? 's' : ''}
          {selectedTag && (
            <span className="ml-1 text-primary-500 font-medium">
              · {exerciseTags.find((t) => t.id === selectedTag)?.name}
            </span>
          )}
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
                onClick={() => setVisibleCols(new Set(COLUMN_DEFS.map((c) => c.id)))}
              >
                Todas
              </button>
              <span className="text-gray-300">·</span>
              <button
                className="text-xs text-primary-600 hover:underline"
                onClick={() => setVisibleCols(defaultVisibleCols())}
              >
                Por defecto
              </button>
              <span className="text-gray-300">·</span>
              <button
                className="text-xs text-gray-500 hover:underline"
                onClick={() => setVisibleCols(new Set())}
              >
                Ninguna
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COLUMN_GROUPS.map((group) => (
              <div key={group.id}>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {COLUMN_DEFS.filter((c) => c.group === group.id).map((c) => (
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
              {groupBySection && groupedRows
                ? groupedRows.map((group) => {
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
                              {isCollapsed ? (
                                <ChevronDown size={14} className="text-gray-400" />
                              ) : (
                                <ChevronUp size={14} className="text-gray-400" />
                              )}
                              <span>{group.sectionLabel}</span>
                              {group.planTitle && orderedPlans.length > 1 && (
                                <span className="text-gray-400 font-normal">
                                  · {group.planTitle}
                                </span>
                              )}
                              {group.planFrom && (
                                <span className="text-[10px] text-gray-400 font-normal">
                                  {format(parseISO(group.planFrom), 'dd/MM')} –{' '}
                                  {format(parseISO(group.planTo), 'dd/MM')}
                                </span>
                              )}
                              {orderedPlans.length > 1 && (
                                <span
                                  className={`badge text-[10px] ${
                                    group.planActive
                                      ? 'bg-primary-100 text-primary-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {group.planActive ? 'vigente' : 'anterior'}
                                </span>
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
                : filteredRows.map(renderRow)}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Leyenda tendencia ── */}
      {isCol('trend') && (
        <div className="flex items-center gap-3 text-[11px] text-gray-400 justify-end">
          <span>
            <span className="text-green-600 font-bold">↑</span> mejora
          </span>
          <span>
            <span className="text-red-600 font-bold">↓</span> baja
          </span>
          <span>
            <span className="text-gray-500 font-bold">=</span> igual
          </span>
          <span>
            <span className="font-bold">·</span> sin previo
          </span>
        </div>
      )}
    </div>
  )
}
