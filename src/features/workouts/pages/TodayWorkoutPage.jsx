import { useEffect, useMemo, useState, useRef } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dumbbell, Calendar, AlertTriangle, Clock } from 'lucide-react'
import {
  borgColor,
  DAY_SECTION_IDS,
  SECTION_LABELS,
  groupExercisesIntoBlocks,
  blockDisplayTitle,
  suggestNextDay,
} from '@/features/plans/helpers'
import {
  postPSEDayNote,
  fetchSingleMirrorBodies,
  postWorkoutLogNote,
  postWorkoutBlockLogNote,
} from '@/features/notes/api'
import BlockRenderer from '../components/BlockRenderer'
import ValidationWarning from '../components/ValidationWarning'
import DailyPSEModal from '../components/DailyPSEModal'
import WellbeingCard from '../components/WellbeingCard'
import SaveErrorBanner from '../components/SaveErrorBanner'
import useSaveErrorBanner from '../hooks/useSaveErrorBanner'
import { pseColor, isSectionCompleted } from '../helpers'
import WellbeingModal from '@/features/wellbeing/components/WellbeingModal'

// ============================================================
// Constantes
// ============================================================
// PSE_OPTIONS, PSE_SHORT y pseColor viven en `../helpers` desde el 21/05.

// Labels cortas para días (tabs y modal)
const DAY_SHORT_LABELS = {
  day_a: 'Día A',
  day_b: 'Día B',
  day_c: 'Día C',
  day_d: 'Día D',
  day_e: 'Día E',
  day_f: 'Día F',
  day_g: 'Día G',
}

// Emojis para el header de sección
const SECTION_EMOJIS = {
  activation: '🔥',
  day_a: '💪',
  day_b: '🏋️',
  day_c: '🏃',
  day_d: '🎯',
  day_e: '⚡',
  day_f: '🔱',
  day_g: '🧘',
}

// parseSuggestedWeight, ExerciseCard y pseColor viven en
// `../components/ExerciseCard` y `../helpers` desde el 21/05.

// BlockRenderer, isBlockCompleted y isSectionCompleted viven en
// `../components/BlockRenderer` y `../helpers` desde el 21/05.

// ============================================================
// Página principal
// ============================================================
export default function TodayWorkoutPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState(null)
  const [planExercises, setPlanExercises] = useState([])
  const [planBlocks, setPlanBlocks] = useState([])
  const [logs, setLogs] = useState({})
  const [blockLogs, setBlockLogs] = useState({})
  const [session, setSession] = useState(null)
  // activeDay arranca null: se setea automáticamente al "siguiente día lógico" en la primera carga.
  const [activeDay, setActiveDay] = useState(null)
  // PSE modal por día: null | 'day_a' | 'day_b' | ...
  const [showPSEForDay, setShowPSEForDay] = useState(null)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const sessionStartRef = useRef(null)
  // Evitar disparar el modal varias veces en el mismo render
  const pseTriggeredRef = useRef({})
  // Evita re-aplicar el "día sugerido" cada vez que cambia la fecha o se refetchea.
  const dayInitializedRef = useRef(false)
  // Wellbeing
  const [wellbeing, setWellbeing] = useState(null)
  const [showWellbeing, setShowWellbeing] = useState(false)
  // Aviso pasivo (no bloqueante) cuando el alumno empieza a registrar datos
  // sin haber cargado el wellbeing del día. Se muestra una sola vez por día.
  const [showWellbeingStartAviso, setShowWellbeingStartAviso] = useState(false)
  const wellbeingStartAvisoFiredRef = useRef(false)

  // Aviso de error al guardar (PSE, inicio de sesión, etc.). Se setea desde
  // los catch de saveLog / saveBlockLog / saveDayPSE.
  //
  // Diferencia entre errores recuperables y no recuperables (handoff 9.1):
  //   - Recuperable (network / 503 / JWT expirado): auto-close 6s.
  //   - No recuperable (CHECK constraint, RLS, FK, validación back):
  //     banner PERSISTE hasta que el alumno apriete "Entendido".
  //
  // Reemplaza el console.error silencioso previo que dejaba al alumno con la
  // impresión de haber guardado cuando en realidad el back rechazó la operación.
  // Banner de error de save — extraído al hook useSaveErrorBanner (21/05).
  // Renombrado en los callers: showSaveErrorAviso → showSaveError.
  const {
    banner: saveErrorAviso,
    show: showSaveError,
    dismiss: dismissSaveError,
  } = useSaveErrorBanner()

  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (profile?.id) fetchWorkout()
  }, [profile, selectedDate])

  // Al cambiar de fecha, resetear los triggers de PSE y de aviso de wellbeing
  useEffect(() => {
    pseTriggeredRef.current = {}
    wellbeingStartAvisoFiredRef.current = false
    setShowWellbeingStartAviso(false)
  }, [selectedDate])

  // started_at ya NO se registra al abrir la página.
  // Se registra cuando el alumno guarda su primer ejercicio o bloque (saveLog / saveBlockLog).

  async function fetchWorkout() {
    setLoading(true)
    try {
      const { data: allActiveAssignments } = await supabase
        .from('plan_assignments')
        .select('*, plan:plans!plan_id(*)')
        .eq('student_id', profile.id)
        .eq('active', true)
        .order('created_at', { ascending: false })

      // Solo tomar planes de entrenamiento, ignorar evaluaciones
      const assignData = (allActiveAssignments || []).find(
        (a) => !a.plan?.plan_type || a.plan?.plan_type === 'training'
      )

      if (!assignData) {
        setLoading(false)
        return
      }
      setAssignment(assignData)

      const [
        exercisesRes,
        blocksRes,
        logsRes,
        blockLogsRes,
        sessionRes,
        wellbeingRes,
        recentLogsRes,
      ] = await Promise.all([
        supabase
          .from('plan_exercises')
          .select('*, exercise:exercises!exercise_id(*)')
          .eq('plan_id', assignData.plan_id)
          .order('order_index'),
        supabase
          .from('plan_blocks')
          .select('*')
          .eq('plan_id', assignData.plan_id)
          .order('order_index'),
        supabase
          .from('workout_logs')
          .select('*')
          .eq('student_id', profile.id)
          .eq('plan_id', assignData.plan_id)
          .eq('logged_date', selectedDate),
        supabase
          .from('workout_block_logs')
          .select('*')
          .eq('student_id', profile.id)
          .eq('plan_id', assignData.plan_id)
          .eq('logged_date', selectedDate),
        supabase
          .from('workout_sessions')
          .select('*')
          .eq('student_id', profile.id)
          .eq('plan_id', assignData.plan_id)
          .eq('logged_date', selectedDate)
          .maybeSingle(),
        supabase
          .from('wellbeing_logs')
          .select('*')
          .eq('user_id', profile.id)
          .eq('date', selectedDate)
          .maybeSingle(),
        // Logs recientes (cualquier fecha) para sugerir el día siguiente al último entrenado.
        // Solo se usa en la primera carga; queries siguientes se descartan vía dayInitializedRef.
        supabase
          .from('workout_logs')
          .select('logged_date, plan_exercise_id')
          .eq('student_id', profile.id)
          .eq('plan_id', assignData.plan_id)
          .order('logged_date', { ascending: false })
          .limit(80),
      ])

      setPlanExercises(exercisesRes.data || [])
      setPlanBlocks(blocksRes.data || [])

      // Sugerir el día siguiente al último entrenado (solo en la primera carga).
      if (!dayInitializedRef.current) {
        const allBlocks = groupExercisesIntoBlocks(exercisesRes.data || [], blocksRes.data || [])
        const sectionsWithContent = new Set(allBlocks.map((b) => b.section).filter(Boolean))
        const activeDaysLocal = DAY_SECTION_IDS.filter((id) => sectionsWithContent.has(id))
        const exSection = {}
        for (const ex of exercisesRes.data || []) {
          exSection[ex.id] = ex.section
        }
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const suggested = suggestNextDay(
          activeDaysLocal,
          recentLogsRes.data || [],
          exSection,
          todayStr
        )
        if (suggested) {
          setActiveDay(suggested)
          dayInitializedRef.current = true
        }
      }

      // Round 2a: mergear body de notas mirror sobre el log antes de
      // armar el mapa, para que la textarea muestre la versión panel
      // (que en round 2b será la fuente única tras dropear workout_logs.notes).
      const rawLogs = logsRes.data || []
      const logIds = rawLogs.map((l) => l.id)
      const bodiesMap = await fetchSingleMirrorBodies({
        contextType: 'workout_log',
        contextIds: logIds,
      })
      const logsMap = {}
      rawLogs.forEach((log) => {
        logsMap[log.plan_exercise_id] = {
          ...log,
          notes: bodiesMap.get(log.id) ?? log.notes ?? '',
        }
      })
      setLogs(logsMap)

      // Mismo patrón que workout_logs: enrich blockLogs con el body
      // desde notes (fuente única tras drop de workout_block_logs.notes en v26d).
      const rawBlockLogs = blockLogsRes.data || []
      const blockLogIds = rawBlockLogs.map((bl) => bl.id)
      const blockBodiesMap = await fetchSingleMirrorBodies({
        contextType: 'workout_block_log',
        contextIds: blockLogIds,
      })
      const blockLogsMap = {}
      rawBlockLogs.forEach((bl) => {
        blockLogsMap[bl.plan_block_id] = { ...bl, notes: blockBodiesMap.get(bl.id) ?? '' }
      })
      setBlockLogs(blockLogsMap)

      setSession(sessionRes.data)

      // Wellbeing: cargar el estado del día.
      // Importante: NO abrir el modal automáticamente — el alumno lo abre desde
      // la WellbeingCard. Los avisos pasivos al primer save y al terminar
      // el entrenamiento se encargan de recordárselo.
      setWellbeing(wellbeingRes.data || null)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Crea o actualiza la workout_session para (student, plan, logged_date).
  // IMPORTANTE: si la session no existe, la crea con los datos pasados
  // (típicamente { started_at }). Cumple el contrato del back:
  //   - constraint `sessions_finished_requires_started`: nunca insertar
  //     finished_at sin started_at. Los callers que solo pasan
  //     finished_at deben asegurar que la session ya existe con
  //     started_at (lo hacen saveLog/saveBlockLog antes de saveDayPSE).
  //   - trigger `trg_workout_sessions_block_evaluations`: el plan no
  //     puede ser eval. Filtrado río arriba en fetchAssignment.
  //
  // Tira el error a quien la llame: el catch silencioso previo dejaba
  // al alumno sin feedback cuando el back rechazaba la operación.
  async function upsertSession(data) {
    if (!assignment) return
    const { data: existing, error: selErr } = await supabase
      .from('workout_sessions')
      .select('id, started_at')
      .eq('student_id', profile.id)
      .eq('plan_id', assignment.plan_id)
      .eq('logged_date', selectedDate)
      .maybeSingle()
    if (selErr) throw selErr

    if (existing) {
      // started_at nunca se sobreescribe: si el registro ya existe, ese valor se preserva
      const { started_at: _ignore, ...safeData } = data

      // finished_at solo se guarda si es estrictamente posterior al started_at original
      // Esto evita duraciones negativas por sesiones cruzadas entre días
      if (safeData.finished_at && existing.started_at) {
        if (new Date(safeData.finished_at) <= new Date(existing.started_at)) {
          delete safeData.finished_at
        }
      }

      const { data: updated, error: updErr } = await supabase
        .from('workout_sessions')
        .update(safeData)
        .eq('id', existing.id)
        .select()
        .single()
      if (updErr) throw updErr
      setSession(updated)
    } else {
      const { data: created, error: insErr } = await supabase
        .from('workout_sessions')
        .insert({
          student_id: profile.id,
          plan_id: assignment.plan_id,
          logged_date: selectedDate,
          logged_late: !isToday,
          ...data,
        })
        .select()
        .single()
      if (insErr) throw insErr
      setSession(created)
    }
  }

  // Dispara el aviso pasivo de wellbeing una sola vez cuando el alumno
  // está cargando datos del día y aún no completó el wellbeing.
  function maybeFireWellbeingStartAviso() {
    if (isToday && !wellbeing && !wellbeingStartAvisoFiredRef.current) {
      wellbeingStartAvisoFiredRef.current = true
      setShowWellbeingStartAviso(true)
      setTimeout(() => setShowWellbeingStartAviso(false), 6000)
    }
  }

  // Guarda un workout_log vía RPC save_workout_log.
  // Nota importante: la RPC ya hace doble escritura interna a las columnas
  // viejas (actual_reps, actual_weights, actual_weight) en formato JSON limpio,
  // así que el front no necesita doblar nada.
  //
  // El `data` viene de buildSaveData() con todos los p_* listos.
  async function saveLog(planExerciseId, data) {
    const existingLog = logs[planExerciseId]

    // Garantizar workout_session antes de la escritura (idem que antes,
    // ver comentario original). started_at representa "el alumno está
    // cargando ahora", coherente con el backfill del back.
    if (assignment && !session?.started_at) {
      try {
        await upsertSession({ started_at: new Date().toISOString() })
      } catch (err) {
        console.error('saveLog: upsertSession error:', err)
        showSaveError('No pudimos registrar el inicio de la sesión. Intentá guardar de nuevo.', err)
        throw err
      }
    }

    // Aviso de wellbeing pendiente al primer registro del día (no bloqueante)
    maybeFireWellbeingStartAviso()

    // Extraemos el body de la nota del data ANTES de armar los rpcArgs:
    // el ExerciseCard (strength) y CircuitBlockRunCard meten el texto del
    // alumno en _noteBody. Underscore-prefijado para que no se confunda
    // con los p_* que sí van a la RPC.
    const { _noteBody, ...rpcData } = data || {}

    // Llamada a la RPC. Si existingLog → UPDATE (p_log_id), sino INSERT.
    const rpcArgs = {
      p_log_id: existingLog?.id ?? null,
      p_student_id: profile.id,
      p_plan_id: assignment.plan_id,
      p_plan_exercise_id: planExerciseId,
      p_logged_date: selectedDate,
      p_logged_late: !isToday,
      ...rpcData, // p_reps, p_weights, p_weight_mode, p_unilateral, p_reps_unit,
      // p_actual_sets, p_perceived_difficulty, p_notes=null, p_completed
    }

    const { data: returnedId, error } = await supabase.rpc('save_workout_log', rpcArgs)
    if (error) {
      console.error('saveLog: rpc save_workout_log error:', error)
      // El helper clasifica por código (23514 / 23503 / 42501 / etc.) y
      // arma mensaje + persistencia. CHECK violations quedan visibles
      // hasta que el alumno las lea (handoff 9.1).
      showSaveError(error)
      throw error
    }

    // Refetch del log completo (la RPC devuelve solo el uuid)
    const logId = existingLog?.id ?? returnedId
    if (logId) {
      // Round 2b (handoff m26→m27): la columna workout_logs.notes se dropeó.
      // Persistimos el body del alumno como mirror en public.notes via
      // postWorkoutLogNote. Si _noteBody viene vacío y existía mirror,
      // la función hace soft-delete automáticamente.
      const { error: noteErr } = await postWorkoutLogNote({
        studentId: profile.id,
        logId,
        body: _noteBody || '',
      })
      if (noteErr) {
        console.warn('[saveLog] no se pudo guardar la nota del log en el panel:', noteErr)
      }

      const { data: fullLog } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('id', logId)
        .single()
      if (fullLog) {
        // Leemos el body desde el mirror del panel (fuente única post v26d).
        const bodiesMap = await fetchSingleMirrorBodies({
          contextType: 'workout_log',
          contextIds: [logId],
        })
        fullLog.notes = bodiesMap.get(logId) ?? ''
        setLogs((prev) => ({ ...prev, [planExerciseId]: fullLog }))
      }
    }
  }

  async function deleteLog(planExerciseId) {
    const existingLog = logs[planExerciseId]
    if (!existingLog) return
    const { error } = await supabase.from('workout_logs').delete().eq('id', existingLog.id)
    if (error) throw error
    setLogs((prev) => {
      const next = { ...prev }
      delete next[planExerciseId]
      return next
    })
  }

  async function saveBlockLog(planBlockId, data) {
    // Bloques virtuales (legacy sin block_id en DB) no se persisten
    if (typeof planBlockId === 'string' && planBlockId.startsWith('virtual-')) {
      console.warn('Intento de guardar log de bloque virtual, ignorado:', planBlockId)
      return
    }

    // Garantizar workout_session también para bloques retroactivos (idem
    // saveLog). Ver comentario allí: el back exige started_at antes que
    // cualquier finished_at, y dejar workout_block_logs huérfanos rompe
    // las mismas métricas que workout_logs huérfanos.
    if (assignment && !session?.started_at) {
      try {
        await upsertSession({ started_at: new Date().toISOString() })
      } catch (err) {
        console.error('saveBlockLog: upsertSession error:', err)
        showSaveError('No pudimos registrar el inicio de la sesión. Intentá guardar de nuevo.', err)
        throw err
      }
    }

    // Aviso de wellbeing pendiente al primer registro del día (no bloqueante)
    maybeFireWellbeingStartAviso()

    // La columna workout_block_logs.notes se dropeó en v26d.
    // Extraemos `notes` del data y la persistimos como mirror en el panel
    // después del save exitoso, igual que hace saveLog para workout_logs.
    const { notes: bodyForPanel, ...dataForDb } = data || {}

    const existing = blockLogs[planBlockId]
    let result
    if (existing) {
      result = await supabase
        .from('workout_block_logs')
        .update({ ...dataForDb, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('workout_block_logs')
        .insert({
          ...dataForDb,
          student_id: profile.id,
          plan_id: assignment.plan_id,
          plan_block_id: planBlockId,
          logged_date: selectedDate,
          logged_late: !isToday,
        })
        .select()
        .single()
    }
    if (result.error) {
      console.error('saveBlockLog: workout_block_logs error:', result.error)
      // El helper decide si persiste o auto-cierra según el código.
      showSaveError(result.error)
      throw result.error
    }

    // Persistir la nota del bloque al panel (round 2b: fuente única tras
    // dropear workout_block_logs.notes). Si bodyForPanel viene vacío y
    // existía mirror, la función hace soft-delete.
    const blockLogId = result.data?.id
    if (blockLogId) {
      const { error: noteErr } = await postWorkoutBlockLogNote({
        studentId: profile.id,
        blockLogId,
        body: bodyForPanel || '',
      })
      if (noteErr) {
        console.warn('[saveBlockLog] no se pudo guardar la nota del bloque en el panel:', noteErr)
      }
    }

    // Enriquecer el blockLog con el body para que el componente lo muestre sin reload
    const enrichedBlockLog = { ...result.data, notes: bodyForPanel || '' }
    setBlockLogs((prev) => ({ ...prev, [planBlockId]: enrichedBlockLog }))
  }

  async function deleteBlockLog(planBlockId) {
    const existing = blockLogs[planBlockId]
    if (!existing) return
    const { error } = await supabase.from('workout_block_logs').delete().eq('id', existing.id)
    if (error) throw error
    setBlockLogs((prev) => {
      const next = { ...prev }
      delete next[planBlockId]
      return next
    })
  }

  // ====================================================
  // Agrupar bloques con sus ejercicios y por sección
  // ====================================================
  const blocksBySection = useMemo(() => {
    const all = groupExercisesIntoBlocks(planExercises, planBlocks)
    const bySection = {}
    for (const b of all) {
      if (!b.section) continue
      if (!bySection[b.section]) bySection[b.section] = []
      bySection[b.section].push(b)
    }
    Object.values(bySection).forEach((arr) =>
      arr.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    )
    return bySection
  }, [planExercises, planBlocks])

  // Días que tienen contenido (incluye activación como sección aparte)
  const activeDays = useMemo(
    () => DAY_SECTION_IDS.filter((id) => (blocksBySection[id] || []).length > 0),
    [blocksBySection]
  )

  // Si el día activo ya no existe (cambió el plan), ir al primero disponible.
  // Importante: si activeDay todavía es null, NO setearlo acá — lo hace fetchWorkout con suggestNextDay.
  useEffect(() => {
    if (activeDay !== null && activeDays.length > 0 && !activeDays.includes(activeDay)) {
      setActiveDay(activeDays[0])
    }
  }, [activeDays, activeDay])

  // Índice de strength por sección (para numeración "Fuerza 2")
  function strengthIndexMap(sectionId) {
    const blocks = blocksBySection[sectionId] || []
    let idx = 0
    const map = {}
    for (const b of blocks) {
      if (b.block_type === 'strength') {
        map[b.id] = idx
        idx += 1
      }
    }
    return map
  }

  // Guardar PSE del día. Borg/efforto va a `borg_per_day` (jsonb en
  // workout_sessions); la observación textual va al panel de notas
  // (Fase D step 2, v26b) — antes se guardaba como key `${day}_notes`
  // dentro del mismo jsonb y quedaba enterrada sin que nadie la leyera.
  async function saveDayPSE(day, effortScale, effortNotes) {
    const currentPerDay = session?.borg_per_day || {}
    const newPerDay = {
      ...currentPerDay,
      [day]: effortScale,
      // (legacy removido) — la observación va al panel via postPSEDayNote
    }
    // finished_at se marca siempre que el alumno cierre el PSE del día que entrenó.
    // En la práctica una sesión = un día calendario = un día del plan, así que tratar
    // de esperar al "último día del plan" dejaba sin hora de fin a los planes con
    // varios días (day_a, day_b, ...). upsertSession ya valida que finished_at sea
    // estrictamente posterior al started_at original, así que es seguro escribirlo
    // siempre (incluso al editar el PSE más tarde).
    //
    // Defensa adicional: si por alguna razón no existe session todavía
    // (caso raro tras los fixes de saveLog/saveBlockLog), insertamos
    // started_at = now() para cumplir la constraint del back que exige
    // started_at antes que cualquier finished_at.
    const payload = {
      borg_per_day: newPerDay,
      finished_at: new Date().toISOString(),
    }
    if (!session?.started_at) {
      payload.started_at = new Date().toISOString()
    }
    try {
      await upsertSession(payload)

      // Si el alumno escribió observación del día, publicarla en el panel
      // como nota libre con note_date = la fecha de la sesión + prefijo
      // del día (ej: "[Día A] me sentí bien"). El error del posteo no
      // rompe el flujo: el PSE/scale ya se guardó.
      if (effortNotes && effortNotes.trim() && profile?.id && session?.logged_date) {
        const dayLabel = DAY_SHORT_LABELS[day] || SECTION_LABELS[day] || 'Día'
        const { error: noteErr } = await postPSEDayNote({
          studentId: profile.id,
          sessionLoggedDate: session.logged_date,
          dayLabel,
          body: effortNotes,
        })
        if (noteErr) {
          console.warn('[saveDayPSE] no se pudo publicar la nota en el panel:', noteErr)
        }
      }

      pseTriggeredRef.current[day] = true
      setShowPSEForDay(null)
    } catch (err) {
      console.error('saveDayPSE error:', err)
      showSaveError('No pudimos guardar tu PSE del día. Probá de nuevo en un momento.', err)
      // No cerramos el modal: dejamos que el alumno reintente sin perder lo que cargó.
    }
  }

  // Activación completa (si no hay activación, se considera completa)
  const activationBlocks = blocksBySection.activation || []
  const activationDone =
    activationBlocks.length === 0 || isSectionCompleted(activationBlocks, logs, blockLogs)

  // Mapa día → completado (requiere activación + todos los bloques del día)
  const dayDoneMap = useMemo(() => {
    const m = {}
    for (const id of activeDays) {
      const sectionDone = isSectionCompleted(blocksBySection[id] || [], logs, blockLogs)
      // El primer día exige también que activación esté completa
      const gate = id === activeDays[0] ? activationDone : true
      m[id] = sectionDone && gate
    }
    return m
  }, [activeDays, blocksBySection, logs, blockLogs, activationDone])

  // PSE guardados en la sesión
  const borgPerDay = session?.borg_per_day || {}

  // Totales para progress bar (cuenta unidades: ejercicios de fuerza + bloques aero/circuito)
  const { completedCount, totalCount } = useMemo(() => {
    let done = 0,
      total = 0
    for (const section of Object.keys(blocksBySection)) {
      for (const block of blocksBySection[section]) {
        if (block.block_type === 'strength') {
          const exs = block.plan_exercises || []
          total += exs.length
          done += exs.filter((ex) => logs[ex.id]?.completed).length
        } else {
          total += 1
          if (blockLogs[block.id]?.completed) done += 1
        }
      }
    }
    return { completedCount: done, totalCount: total }
  }, [blocksBySection, logs, blockLogs])

  // Disparar modal PSE cuando se completa un día (dinámico)
  useEffect(() => {
    if (loading || showPSEForDay !== null) return
    for (const id of activeDays) {
      if (dayDoneMap[id] && borgPerDay[id] === undefined && !pseTriggeredRef.current[id]) {
        pseTriggeredRef.current[id] = true
        setShowPSEForDay(id)
        return
      }
    }
  }, [loading, dayDoneMap, borgPerDay, activeDays, showPSEForDay])

  // Fecha máxima permitida: hoy
  const maxDate = format(new Date(), 'yyyy-MM-dd')

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )

  if (!assignment)
    return (
      <div className="max-w-lg mx-auto px-4 pt-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Dumbbell className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Sin plan asignado</h2>
        <p className="text-gray-500 text-sm">
          Tu coach todavía no te asignó un plan de entrenamiento.
        </p>
      </div>
    )

  const hasMultipleDays = activeDays.length > 1
  const activationStrengthMap = strengthIndexMap('activation')
  const activeDayStrengthMap = strengthIndexMap(activeDay)

  return (
    <>
      {/* Modal Wellbeing — aparece al abrir el entrenamiento si no se llenó hoy */}
      {showWellbeing && (
        <WellbeingModal
          userId={profile.id}
          date={selectedDate}
          onSave={(data) => {
            setWellbeing(data)
            setShowWellbeing(false)
          }}
          onSkip={() => setShowWellbeing(false)}
        />
      )}

      {/* Modal PSE del día activo */}
      {showPSEForDay && (
        <DailyPSEModal
          dayLabel={DAY_SHORT_LABELS[showPSEForDay] || SECTION_LABELS[showPSEForDay] || 'Día'}
          currentEffort={borgPerDay[showPSEForDay] ?? null}
          onSave={(effort, notes) => saveDayPSE(showPSEForDay, effort, notes)}
          onClose={() => {
            pseTriggeredRef.current[showPSEForDay] = true
            setShowPSEForDay(null)
          }}
        />
      )}

      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary-600 to-primary-700 px-5 pt-12 pb-6">
          <p className="text-primary-200 text-sm capitalize">
            {format(parseISO(selectedDate), "EEEE d 'de' MMMM", { locale: es })}
          </p>
          <h1 className="text-xl font-bold text-white mt-1">{assignment.plan?.title}</h1>

          {/* Timestamps */}
          {session?.started_at && (
            <div className="flex items-center gap-3 mt-2 text-primary-200 text-xs">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                Inicio: {format(new Date(session.started_at), 'HH:mm')}
              </span>
              {session.finished_at && (
                <>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    Fin: {format(new Date(session.finished_at), 'HH:mm')}
                  </span>
                  <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5 font-semibold text-white">
                    {Math.round(
                      (new Date(session.finished_at) - new Date(session.started_at)) / 60000
                    )}{' '}
                    min
                  </span>
                </>
              )}
            </div>
          )}

          {/* PSE por día registrado */}
          {activeDays.some((id) => borgPerDay[id] !== undefined) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {activeDays
                .filter((id) => borgPerDay[id] !== undefined)
                .map((id) => (
                  <div key={id} className="flex items-center gap-1.5">
                    <span className="text-primary-200 text-xs">{DAY_SHORT_LABELS[id]}:</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${pseColor(borgPerDay[id])}`}
                    >
                      PSE {borgPerDay[id]}
                    </span>
                    <button
                      onClick={() => setShowPSEForDay(id)}
                      className="text-primary-300 text-xs underline"
                    >
                      Editar
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-primary-200 text-xs">
                {completedCount} / {totalCount} unidades
              </span>
              <span className="text-primary-200 text-xs">
                {Math.round((completedCount / Math.max(totalCount, 1)) * 100)}%
              </span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${(completedCount / Math.max(totalCount, 1)) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Selector de fecha */}
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400 flex-shrink-0" />
            <input
              type="date"
              className="input text-sm flex-1"
              value={selectedDate}
              max={maxDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            />
            {!isToday && (
              <span className="badge bg-orange-100 text-orange-700 text-xs">Editando pasado</span>
            )}
          </div>

          {/* Selector de día (tabs) — dinámico 2..7 */}
          {hasMultipleDays && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
              {activeDays.map((id) => {
                const isDone = dayDoneMap[id]
                const hasPSE = borgPerDay[id] !== undefined
                return (
                  <button
                    key={id}
                    onClick={() => setActiveDay(id)}
                    className={`flex-1 min-w-[70px] py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      activeDay === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    {DAY_SHORT_LABELS[id]}
                    {isDone && (
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${hasPSE ? 'bg-green-400' : 'bg-orange-400'}`}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Wellbeing diario — siempre visible como módulo */}
          <WellbeingCard
            wellbeing={wellbeing}
            isToday={isToday}
            onOpen={() => setShowWellbeing(true)}
          />

          {/* Aviso pasivo: aparece la primera vez que el alumno guarda datos
              sin haber cargado el wellbeing. Se auto-cierra a los ~6s y
              nunca bloquea la pantalla. */}
          {showWellbeingStartAviso && !wellbeing && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 flex-1 leading-relaxed">
                <strong>Recordá:</strong> aún no cargaste tu wellbeing de hoy. Podés hacerlo desde
                la tarjeta de arriba cuando quieras.
              </p>
            </div>
          )}

          {/* Aviso de error al guardar — UI extraída a SaveErrorBanner (21/05).
              Diferencia entre errores recuperables (auto-close 6s) y persistentes
              (requieren "Entendido") manejada por el hook + componente. */}
          <SaveErrorBanner banner={saveErrorAviso} onDismiss={dismissSaveError} />

          {/* Activación */}
          {activationBlocks.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">
                {SECTION_EMOJIS.activation} {SECTION_LABELS.activation}
              </h2>
              <div className="space-y-2">
                {activationBlocks.map((block) => (
                  <BlockRenderer
                    key={block.id}
                    block={block}
                    strengthIndexInSection={activationStrengthMap[block.id] ?? 0}
                    logs={logs}
                    blockLog={blockLogs[block.id]}
                    saveLog={saveLog}
                    deleteLog={deleteLog}
                    saveBlockLog={saveBlockLog}
                    deleteBlockLog={deleteBlockLog}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Día activo */}
          {(blocksBySection[activeDay] || []).length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">
                {SECTION_EMOJIS[activeDay] || '🏋️'} {SECTION_LABELS[activeDay] || 'Día'}
              </h2>
              <div className="space-y-2">
                {(blocksBySection[activeDay] || []).map((block) => (
                  <BlockRenderer
                    key={block.id}
                    block={block}
                    strengthIndexInSection={activeDayStrengthMap[block.id] ?? 0}
                    logs={logs}
                    blockLog={blockLogs[block.id]}
                    saveLog={saveLog}
                    deleteLog={deleteLog}
                    saveBlockLog={saveBlockLog}
                    deleteBlockLog={deleteBlockLog}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Banner de completado por día (dinámico) */}
          {activeDays.map((id) => {
            if (!dayDoneMap[id]) return null
            const isLast = id === activeDays[activeDays.length - 1]
            const showAll = activeDays.every((d) => dayDoneMap[d])
            const isFinalBanner = isLast && showAll
            return (
              <div
                key={id}
                className={`card text-center py-4 ${
                  isFinalBanner
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600'
                }`}
              >
                <p className="text-white font-bold">
                  {isFinalBanner
                    ? '🎉 ¡Entrenamiento completo!'
                    : `✅ ${DAY_SHORT_LABELS[id]} completado`}
                </p>
                {/* Aviso pasivo de wellbeing al cerrar el día (sin botón) */}
                {isFinalBanner && isToday && !wellbeing && (
                  <p className="text-white/90 text-xs mt-1.5">⚠️ No cargaste tu wellbeing de hoy</p>
                )}
                {borgPerDay[id] !== undefined ? (
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${pseColor(borgPerDay[id])}`}
                    >
                      PSE {borgPerDay[id]}
                    </span>
                    <button
                      onClick={() => setShowPSEForDay(id)}
                      className="text-white/70 text-xs underline"
                    >
                      Editar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowPSEForDay(id)}
                    className="mt-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-4 py-1.5 rounded-xl transition"
                  >
                    Registrar esfuerzo {DAY_SHORT_LABELS[id]}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
