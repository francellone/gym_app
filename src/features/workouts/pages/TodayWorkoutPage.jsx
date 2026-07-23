import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { dateLocale } from '@/i18n/dateLocale'
import { Dumbbell, Calendar, AlertTriangle, Clock, UserCog, Info, ChevronDown } from 'lucide-react'
import {
  DAY_SECTION_IDS,
  SECTION_LABELS,
  groupExercisesIntoBlocks,
  suggestNextDay,
} from '@/features/plans/helpers'
import {
  postPSEDayNote,
  fetchSingleMirrorBodies,
  postWorkoutLogNote,
  postWorkoutBlockLogNote,
  getStudentThread,
} from '@/features/notes/api'
import { buildSaveWorkoutLogArgs, extractNoteBody } from '../api'
import { cleanupStaleDrafts } from '../draftStorage'
import { saveActiveDay, resolveActiveDay } from '../activeDayStorage'
import BlockRenderer from '../components/BlockRenderer'
import {
  fetchPrescriptionHistory,
  groupHistoryByExercise,
} from '@/features/plans/prescriptionHistory'
import DailyPSEModal from '../components/DailyPSEModal'
import WellbeingCard from '../components/WellbeingCard'
import DayActivitiesCard from '@/features/activities/components/DayActivitiesCard'
import SaveErrorBanner from '../components/SaveErrorBanner'
import ExerciseChatDrawer from '../components/ExerciseChatDrawer'
import useSaveErrorBanner from '../hooks/useSaveErrorBanner'
import { pseColor, isSectionCompleted } from '../helpers'
import WellbeingModal from '@/features/wellbeing/components/WellbeingModal'
import { computeDayTallies, formatTallyForDisplay } from '@/features/students/dayTalliesLogic'
import {
  pickLastLogPerExercise,
  pickLastBlockLogPerBlock,
  pickLastCoachNotePerExercise,
  countNotesByExercise,
  groupNotesByExercise,
} from '../exerciseHistoryLogic'

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
  const { t } = useTranslation()
  const { profile } = useAuth()
  // v33 — modo coach ("registrar por alumno"): la misma página montada en
  // /coach/students/:id/workout. `studentId` es el dueño de los datos;
  // `profile` sigue siendo el usuario logueado (autor de los registros).
  // El back garantiza la autoría real: save_workout_log deriva
  // logged_by/source de auth.uid(), y las RLS de sessions/block_logs exigen
  // source='coach' + logged_by=auth.uid() para inserts de coach.
  const { id: routeStudentId } = useParams()
  const coachMode = Boolean(routeStudentId)
  const studentId = routeStudentId || profile?.id
  const [studentName, setStudentName] = useState('')
  // Label de día traducida para display (la constante DAY_SHORT_LABELS se
  // mantiene para los textos que van a la DB, ej. prefijo de notas PSE).
  const dayShortLabel = (id) =>
    t('workout.dayShort', { letter: (id?.split('_')[1] || '').toUpperCase() })
  // Label de sección traducida para display (la constante SECTION_LABELS se
  // mantiene para textos canónicos que van a la DB, ej. prefijo de notas PSE).
  const sectionLabel = (id) =>
    t(`workout.sections.${id}`, { defaultValue: SECTION_LABELS[id] || '' })
  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState(null)
  // Descripción del plan (texto libre que carga el coach) — colapsable en el
  // header. Arranca cerrada para no empujar los ejercicios cada día.
  const [showPlanDesc, setShowPlanDesc] = useState(false)
  const [planExercises, setPlanExercises] = useState([])
  const [planBlocks, setPlanBlocks] = useState([])
  const [logs, setLogs] = useState({})
  const [blockLogs, setBlockLogs] = useState({})
  const [session, setSession] = useState(null)
  // Q2 — workout_logs recientes del plan (cualquier fecha). Usado para
  // computar las tildes "Día A ✓✓◐" debajo de cada selector de día.
  // Se popula desde recentLogsRes que ya se trae para la sugerencia
  // del día inicial.
  const [recentLogs, setRecentLogs] = useState([])
  // Q1 — workout_logs recientes COMPLETOS del plan (con actual_weights_jsonb,
  // actual_reps_jsonb, perceived_difficulty) para mostrar "Última vez" en
  // el header de cada card. recentLogs (Q2) trae solo 3 columnas; este
  // dataset trae todo lo necesario para `formatLastLogSummary`.
  const [recentExerciseLogs, setRecentExerciseLogs] = useState([])
  // Q1 — workout_block_logs recientes del plan (aerobic + circuit).
  const [recentBlockLogs, setRecentBlockLogs] = useState([])
  // doc 48 — último cambio de objetivo del coach por plan_exercise.id (ventana
  // reciente). Alimenta el cartel "Tu coach ajustó el objetivo" en el card.
  const [prescriptionByEx, setPrescriptionByEx] = useState({})
  // Q1 — notas tipo `exercise` del thread del alumno (ambos lados, shared).
  // Se usan para: última nota coach (preview), conteo badge 💬N, y como
  // cache pasada al drawer para evitar re-fetch.
  const [exerciseNotes, setExerciseNotes] = useState([])
  // Q1 — id del thread del alumno (1:1 con su coach). Se resuelve una sola
  // vez en fetchWorkout. Necesario para que el drawer pueda hacer fetch
  // si no hay cache.
  const [threadId, setThreadId] = useState(null)
  // Q1 — drawer del chat del ejercicio: null cerrado, sino { exerciseId,
  // exerciseName }.
  const [chatDrawer, setChatDrawer] = useState(null)
  // activeDay arranca null: se setea automáticamente al "siguiente día lógico" en la primera carga.
  const [activeDay, setActiveDay] = useState(null)
  // PSE modal por día: null | 'day_a' | 'day_b' | ...
  const [showPSEForDay, setShowPSEForDay] = useState(null)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
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
    if (studentId) fetchWorkout()
  }, [profile, studentId, selectedDate])

  // F4 (doc 23) — cleanup oportunista de drafts huérfanos al boot.
  // Barre: drafts de otros alumnos (cambio de cuenta en mismo browser),
  // drafts con loggedDate más viejos que 7d, envelopes corruptos o de
  // versión vieja. Corre una vez por carga, costo despreciable.
  useEffect(() => {
    // En modo coach NO corremos el cleanup: barre drafts "de otros alumnos",
    // y el coach navega entre fichas de varios alumnos en el mismo browser.
    if (!studentId || coachMode) return
    cleanupStaleDrafts({ studentId })
  }, [studentId, coachMode])

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
      // Modo coach: resolver el nombre del alumno para el banner del header.
      if (coachMode && !studentName) {
        const { data: studentProfile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', studentId)
          .maybeSingle()
        setStudentName(studentProfile?.name || '')
      }

      const { data: allActiveAssignments } = await supabase
        .from('plan_assignments')
        .select('*, plan:plans!plan_id(*)')
        .eq('student_id', studentId)
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
        recentExerciseLogsRes,
        recentBlockLogsRes,
        threadRes,
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
          .eq('student_id', studentId)
          .eq('plan_id', assignData.plan_id)
          .eq('logged_date', selectedDate),
        supabase
          .from('workout_block_logs')
          .select('*')
          .eq('student_id', studentId)
          .eq('plan_id', assignData.plan_id)
          .eq('logged_date', selectedDate),
        supabase
          .from('workout_sessions')
          .select('*')
          .eq('student_id', studentId)
          .eq('plan_id', assignData.plan_id)
          .eq('logged_date', selectedDate)
          .maybeSingle(),
        supabase
          .from('wellbeing_logs')
          .select('*')
          .eq('user_id', studentId)
          .eq('date', selectedDate)
          .maybeSingle(),
        // Logs recientes (cualquier fecha) para sugerir el día siguiente al último entrenado
        // y para computar las tildes Q2. Antes se limitaba a 80; ahora se trae lo necesario
        // para que las tildes cubran todo el plan (límite alto para evitar paginado).
        supabase
          .from('workout_logs')
          .select('logged_date, plan_exercise_id, completed')
          .eq('student_id', studentId)
          .eq('plan_id', assignData.plan_id)
          .order('logged_date', { ascending: false })
          .limit(500),
        // Q1 — logs completos para mostrar "Última vez" por ejercicio.
        // Excluimos la fecha actual: queremos histórico, no reflejo del
        // log que el alumno acaba de cargar (esa info se ve en el header
        // del propio card en formato "✓ 3s · Xkg · PSE Y").
        //
        // doc 49: CROSS-PLAN. NO filtramos por plan_id: la "última vez" del
        // ejercicio debe arrastrar el historial de planes anteriores (mismo
        // exercise_id de catálogo). Embebemos exercise_id vía join para que el
        // reductor pueda agrupar logs de plan_exercises que NO están en el
        // plan activo.
        supabase
          .from('workout_logs')
          .select(
            'id, plan_exercise_id, logged_date, actual_sets, actual_weight, actual_weights, actual_weights_jsonb, actual_reps, actual_reps_jsonb, perceived_difficulty, completed, created_at, plan_exercise:plan_exercises!plan_exercise_id(exercise_id)'
          )
          .eq('student_id', studentId)
          .eq('completed', true)
          .lt('logged_date', selectedDate)
          .order('logged_date', { ascending: false })
          .order('id', { ascending: false })
          .limit(300),
        // Q1 — block_logs históricos para aerobic/circuit "Última vez".
        supabase
          .from('workout_block_logs')
          .select(
            'id, plan_block_id, logged_date, actual_minutes, actual_rounds, perceived_difficulty, completed, created_at'
          )
          .eq('student_id', studentId)
          .eq('plan_id', assignData.plan_id)
          .eq('completed', true)
          .lt('logged_date', selectedDate)
          .order('logged_date', { ascending: false })
          .order('id', { ascending: false })
          .limit(200),
        // Q1 — thread del alumno (1:1 con su coach). Lo necesitamos para
        // filtrar `notes` y para pasarle el threadId al drawer.
        getStudentThread(studentId),
      ])

      setPlanExercises(exercisesRes.data || [])
      setPlanBlocks(blocksRes.data || [])
      setRecentLogs(recentLogsRes.data || [])
      setRecentExerciseLogs(recentExerciseLogsRes.data || [])
      setRecentBlockLogs(recentBlockLogsRes.data || [])

      // doc 48 — cambios de objetivo del coach (último por ejercicio). Solo
      // mostramos los recientes (≤ 21 días) para que el cartel sea relevante
      // al bloque de entrenamiento actual y no quede "pegado" para siempre.
      try {
        const prescRows = await fetchPrescriptionHistory(supabase, assignData.plan_id)
        const groupedPresc = groupHistoryByExercise(prescRows) // ya viene desc por fecha
        const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000
        const latestPresc = {}
        for (const peId of Object.keys(groupedPresc)) {
          const latest = groupedPresc[peId][0]
          if (latest?.changed_at && new Date(latest.changed_at).getTime() >= cutoff) {
            latestPresc[peId] = latest
          }
        }
        setPrescriptionByEx(latestPresc)
      } catch {
        setPrescriptionByEx({})
      }

      // Q1 — resolver threadId del alumno y fetchear las notas tipo
      // 'exercise' del thread. La query del thread la hacemos en paralelo
      // con todo lo demás; las notas dependen del threadId y por eso van
      // en un fetch separado en serie. Tolerante a errores: si no hay
      // thread (alumno sin coach todavía), el preview Q1 simplemente
      // queda sin notas.
      const resolvedThreadId = threadRes?.data?.id || null
      setThreadId(resolvedThreadId)
      if (resolvedThreadId) {
        const { data: notesData } = await supabase
          .from('notes')
          .select(
            'id, thread_id, author_id, author_role, body, visibility, context_type, context_id, exercise_id, parent_note_id, tags, note_date, created_at, updated_at, deleted_at'
          )
          .eq('thread_id', resolvedThreadId)
          // doc 52: criterio = tener exercise_id (no context_type). Las notas
          // cargadas entrenando son context_type='workout_log' con exercise_id;
          // antes quedaban afuera del preview/badge/chat del ejercicio.
          .not('exercise_id', 'is', null)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(500)
        setExerciseNotes(notesData || [])
      } else {
        setExerciseNotes([])
      }

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
        // Opción B: restaurar el día que el alumno tenía abierto (mismo día,
        // reciente); si no aplica, sugerir el "siguiente día lógico".
        const restoredDay = resolveActiveDay({
          studentId,
          loggedDate: selectedDate,
          availableDays: activeDaysLocal,
        })
        const suggested =
          restoredDay ||
          suggestNextDay(activeDaysLocal, recentLogsRes.data || [], exSection, todayStr)
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
      .eq('student_id', studentId)
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
          student_id: studentId,
          plan_id: assignment.plan_id,
          logged_date: selectedDate,
          logged_late: !isToday,
          // v33 — autoría: quién cargó realmente. La RLS de coach exige
          // source='coach' + logged_by=auth.uid() en el with_check.
          logged_by: profile.id,
          source: coachMode ? 'coach' : 'student',
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
    // El wellbeing es subjetivo del alumno: en modo coach no aplica el aviso.
    if (coachMode) return
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
        showSaveError(t('errors.sessionStartFailed'), err)
        throw err
      }
    }

    // Aviso de wellbeing pendiente al primer registro del día (no bloqueante)
    maybeFireWellbeingStartAviso()

    // El armado de los rpcArgs vive en `../api.js` desde el Tier 3.2 (21/05 PM):
    // - Documenta la firma de la RPC (16 params) en un solo lugar
    // - Filtra keys internas con prefijo "_" (como _noteBody) que no deben
    //   llegar a la RPC pero sí se usan más abajo para postWorkoutLogNote.
    // - Testeable con vitest sin necesidad de Supabase ni del render.
    const _noteBody = extractNoteBody(data)
    const rpcArgs = buildSaveWorkoutLogArgs({
      profile,
      studentId,
      assignment,
      planExerciseId,
      selectedDate,
      isToday,
      data,
      existingLog,
    })

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
        studentId,
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
    // v33: .select() para detectar deletes silenciosos por RLS (0 filas).
    // El coach solo puede borrar registros con source='coach'; los del
    // alumno no se tocan.
    const { data: deleted, error } = await supabase
      .from('workout_logs')
      .delete()
      .eq('id', existingLog.id)
      .select('id')
    if (error) throw error
    if (!deleted?.length) {
      const err = new Error('Registro no eliminado (sin permiso)')
      showSaveError(t('errors.deleteNoPermission'), err)
      throw err
    }
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
        showSaveError(t('errors.sessionStartFailed'), err)
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
          student_id: studentId,
          plan_id: assignment.plan_id,
          plan_block_id: planBlockId,
          logged_date: selectedDate,
          logged_late: !isToday,
          // v33 — autoría (ver comentario en upsertSession)
          logged_by: profile.id,
          source: coachMode ? 'coach' : 'student',
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
        studentId,
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
    // v33: mismo patrón que deleteLog — detectar 0 filas por RLS.
    const { data: deleted, error } = await supabase
      .from('workout_block_logs')
      .delete()
      .eq('id', existing.id)
      .select('id')
    if (error) throw error
    if (!deleted?.length) {
      const err = new Error('Registro no eliminado (sin permiso)')
      showSaveError(t('errors.deleteNoPermission'), err)
      throw err
    }
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

  // Q2 — tallies por día del plan (Día A ✓✓◐) usando los logs recientes
  // del plan que ya cargamos para sugerir el día inicial. Cap 500 logs.
  // v29 (plan 29): pasamos planBlocks + recentBlockLogs para que los
  // bloques aerobic/circuit cuenten en el denominador (antes el TABATA
  // del Día B nunca llegaba a "entero" aunque el alumno lo completara).
  const dayTallies = useMemo(
    () =>
      computeDayTallies({
        logs: recentLogs,
        planExercises,
        blockLogs: recentBlockLogs,
        planBlocks,
      }),
    [recentLogs, planExercises, recentBlockLogs, planBlocks]
  )

  // Q1 — maps derivados para el preview "Última vez" + chat.
  // Todos por exercise_id global (no por plan_exercise_id) según
  // decisión Franco 23/05.
  const lastLogByExercise = useMemo(
    () =>
      pickLastLogPerExercise(recentExerciseLogs, planExercises, {
        excludeDate: selectedDate,
      }),
    [recentExerciseLogs, planExercises, selectedDate]
  )
  const lastBlockLogByBlock = useMemo(
    () =>
      pickLastBlockLogPerBlock(recentBlockLogs, {
        excludeDate: selectedDate,
      }),
    [recentBlockLogs, selectedDate]
  )
  const lastCoachNoteByExercise = useMemo(
    () => pickLastCoachNotePerExercise(exerciseNotes),
    [exerciseNotes]
  )
  const noteCountByExercise = useMemo(() => countNotesByExercise(exerciseNotes), [exerciseNotes])
  // Cache de notas agrupadas por ejercicio: lo pasamos al drawer para
  // evitar fetch extra (las notas ya vinieron en fetchWorkout).
  const notesByExercise = useMemo(() => groupNotesByExercise(exerciseNotes), [exerciseNotes])

  // Q1 — handler para abrir el drawer desde cualquier card.
  // Lo memoizamos para no recrear el callback en cada render.
  const openChatDrawer = useMemo(() => {
    return (exerciseId, exerciseName) => {
      if (!exerciseId) return
      setChatDrawer({ exerciseId, exerciseName: exerciseName || '' })
    }
  }, [])

  // Si el día activo ya no existe (cambió el plan), ir al primero disponible.
  // Importante: si activeDay todavía es null, NO setearlo acá — lo hace fetchWorkout con suggestNextDay.
  useEffect(() => {
    if (activeDay !== null && activeDays.length > 0 && !activeDays.includes(activeDay)) {
      setActiveDay(activeDays[0])
    }
  }, [activeDays, activeDay])

  // Opción B: persistir el día activo (por alumno + fecha) para restaurarlo
  // tras la recarga en frío de iOS. Solo después de la init (dayInitializedRef),
  // para no pisar con null antes de que fetchWorkout resuelva el día.
  useEffect(() => {
    if (!studentId || !activeDay || !dayInitializedRef.current) return
    saveActiveDay({ studentId, dayId: activeDay, loggedDate: selectedDate })
  }, [studentId, activeDay, selectedDate])

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
      if (effortNotes && effortNotes.trim() && studentId && session?.logged_date) {
        const dayLabel = DAY_SHORT_LABELS[day] || SECTION_LABELS[day] || 'Día'
        const { error: noteErr } = await postPSEDayNote({
          studentId,
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
      showSaveError(t('errors.dayPseSaveFailed'), err)
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
        <h2 className="text-lg font-bold text-gray-900 mb-2">{t('workout.noPlanTitle')}</h2>
        <p className="text-gray-500 text-sm">{t('workout.noPlanBody')}</p>
      </div>
    )

  const hasMultipleDays = activeDays.length > 1
  const activationStrengthMap = strengthIndexMap('activation')
  const activeDayStrengthMap = strengthIndexMap(activeDay)

  return (
    <>
      {/* Modal Wellbeing — se abre al tocar la WellbeingCard. v34: también en
          modo coach, con userId={studentId} (dueño del dato). La autoría real
          y la regla "el coach no pisa el wellbeing del alumno" las garantiza
          la RPC save_wellbeing_log (deriva source/logged_by de auth.uid()). */}
      {showWellbeing && (
        <WellbeingModal
          userId={studentId}
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
          dayLabel={
            DAY_SHORT_LABELS[showPSEForDay]
              ? dayShortLabel(showPSEForDay)
              : sectionLabel(showPSEForDay) || t('workout.day')
          }
          currentEffort={borgPerDay[showPSEForDay] ?? null}
          onSave={(effort, notes) => saveDayPSE(showPSEForDay, effort, notes)}
          onClose={() => {
            pseTriggeredRef.current[showPSEForDay] = true
            setShowPSEForDay(null)
          }}
        />
      )}

      {/* Q1 — Drawer del chat del ejercicio (read-only V1) */}
      {chatDrawer && (
        <ExerciseChatDrawer
          open={true}
          onClose={() => setChatDrawer(null)}
          exerciseId={chatDrawer.exerciseId}
          exerciseName={chatDrawer.exerciseName}
          threadId={threadId}
          currentUserId={profile?.id}
          notesCache={notesByExercise}
        />
      )}

      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary-600 to-primary-700 px-5 pt-12 pb-6">
          {/* v33 — banner de modo coach: deja claro que todo lo que se
              registre queda en la cuenta del alumno, con autoría coach. */}
          {coachMode && (
            <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 mb-3">
              <UserCog size={16} className="text-white flex-shrink-0" />
              <p className="text-white text-xs font-semibold">
                {t('workout.coachModeBanner', { name: studentName || '…' })}
              </p>
            </div>
          )}
          <p className="text-primary-200 text-sm capitalize">
            {format(parseISO(selectedDate), t('dates.fullDate'), { locale: dateLocale() })}
          </p>
          <h1 className="text-xl font-bold text-white mt-1">{assignment.plan?.title}</h1>

          {/* Descripción del plan — colapsable. Solo se muestra si el coach
              cargó texto. Es texto libre: se renderiza tal cual (no se
              traduce), respetando saltos de línea con whitespace-pre-line. */}
          {assignment.plan?.description?.trim() && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowPlanDesc((v) => !v)}
                aria-expanded={showPlanDesc}
                className="flex items-center gap-1 text-primary-200 text-xs font-medium hover:text-white transition-colors"
              >
                <Info size={12} className="flex-shrink-0" />
                {t('workout.planDescriptionToggle')}
                <ChevronDown
                  size={12}
                  className={`flex-shrink-0 transition-transform ${showPlanDesc ? 'rotate-180' : ''}`}
                />
              </button>
              {showPlanDesc && (
                <p className="text-primary-100 text-xs mt-1.5 leading-relaxed whitespace-pre-line">
                  {assignment.plan.description}
                </p>
              )}
            </div>
          )}

          {/* Timestamps */}
          {session?.started_at && (
            <div className="flex items-center gap-3 mt-2 text-primary-200 text-xs">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {t('workout.startTime', { time: format(new Date(session.started_at), 'HH:mm') })}
              </span>
              {session.finished_at && (
                <>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {t('workout.endTime', { time: format(new Date(session.finished_at), 'HH:mm') })}
                  </span>
                  <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5 font-semibold text-white">
                    {t('workout.minutesShort', {
                      value: Math.round(
                        (new Date(session.finished_at) - new Date(session.started_at)) / 60000
                      ),
                    })}
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
                    <span className="text-primary-200 text-xs">{dayShortLabel(id)}:</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${pseColor(borgPerDay[id])}`}
                    >
                      {t('workout.pseValue', { value: borgPerDay[id] })}
                    </span>
                    <button
                      onClick={() => setShowPSEForDay(id)}
                      className="text-primary-300 text-xs underline"
                    >
                      {t('workout.edit')}
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-primary-200 text-xs">
                {t('workout.unitsProgress', { completed: completedCount, total: totalCount })}
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
              <span className="badge bg-orange-100 text-orange-700 text-xs">
                {t('workout.editingPast')}
              </span>
            )}
          </div>

          {/* Selector de día (tabs) — dinámico 2..7
              Q2: debajo del label sumamos las tildes históricas del plan
              (Día A ✓✓◐) para que el alumno vea cuántas veces ya hizo
              cada día y elija con criterio. */}
          {hasMultipleDays && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
              {activeDays.map((id) => {
                const isDone = dayDoneMap[id]
                const hasPSE = borgPerDay[id] !== undefined
                const tally = dayTallies[id]
                const tallyDisplay = formatTallyForDisplay(tally)
                const hasParcial = tally && tally.parcial > 0
                return (
                  <button
                    key={id}
                    onClick={() => setActiveDay(id)}
                    className={`flex-1 min-w-[70px] py-2 text-sm font-medium rounded-lg transition-all flex flex-col items-center justify-center gap-0.5 ${
                      activeDay === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {dayShortLabel(id)}
                      {isDone && (
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${hasPSE ? 'bg-green-400' : 'bg-orange-400'}`}
                        />
                      )}
                    </span>
                    {tallyDisplay && (
                      <span
                        className={`text-[10px] tracking-wider leading-none ${
                          hasParcial ? 'text-amber-600' : 'text-primary-600'
                        }`}
                      >
                        {tallyDisplay}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Wellbeing diario — siempre visible como módulo. v34: también en
              modo coach. La card es de solo lectura si el registro lo cargó el
              alumno (dato subjetivo); editable si no existe o lo cargó el coach.
              La RPC save_wellbeing_log es el backstop real de esa regla. */}
          <WellbeingCard
            wellbeing={wellbeing}
            isToday={isToday}
            coachMode={coachMode}
            onOpen={() => setShowWellbeing(true)}
          />

          {/* Actividades extra del día (fútbol, yoga, etc.) — visible
              también en días de descanso, no depende de la sesión.
              En modo coach carga con source='coach' (patrón existente). */}
          <DayActivitiesCard
            studentId={studentId}
            userId={profile.id}
            date={selectedDate}
            source={coachMode ? 'coach' : 'student'}
            canEdit={true}
          />

          {/* Aviso pasivo: aparece la primera vez que el alumno guarda datos
              sin haber cargado el wellbeing. Se auto-cierra a los ~6s y
              nunca bloquea la pantalla. */}
          {showWellbeingStartAviso && !wellbeing && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 flex-1 leading-relaxed">
                <strong>{t('workout.wellbeingReminderTitle')}</strong>{' '}
                {t('workout.wellbeingReminderBody')}
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
                {SECTION_EMOJIS.activation} {sectionLabel('activation')}
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
                    lastLogByExercise={lastLogByExercise}
                    lastBlockLogByBlock={lastBlockLogByBlock}
                    lastCoachNoteByExercise={lastCoachNoteByExercise}
                    noteCountByExercise={noteCountByExercise}
                    onOpenChat={openChatDrawer}
                    studentId={studentId || null}
                    loggedDate={selectedDate}
                    prescriptionByEx={prescriptionByEx}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Día activo */}
          {(blocksBySection[activeDay] || []).length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">
                {SECTION_EMOJIS[activeDay] || '🏋️'} {sectionLabel(activeDay) || t('workout.day')}
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
                    lastLogByExercise={lastLogByExercise}
                    lastBlockLogByBlock={lastBlockLogByBlock}
                    lastCoachNoteByExercise={lastCoachNoteByExercise}
                    noteCountByExercise={noteCountByExercise}
                    onOpenChat={openChatDrawer}
                    studentId={studentId || null}
                    loggedDate={selectedDate}
                    prescriptionByEx={prescriptionByEx}
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
                    ? t('workout.workoutComplete')
                    : t('workout.dayCompletedBanner', { day: dayShortLabel(id) })}
                </p>
                {/* Aviso pasivo de wellbeing al cerrar el día (sin botón) */}
                {isFinalBanner && isToday && !wellbeing && (
                  <p className="text-white/90 text-xs mt-1.5">
                    {t('workout.wellbeingNotLoggedToday')}
                  </p>
                )}
                {borgPerDay[id] !== undefined ? (
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${pseColor(borgPerDay[id])}`}
                    >
                      {t('workout.pseValue', { value: borgPerDay[id] })}
                    </span>
                    <button
                      onClick={() => setShowPSEForDay(id)}
                      className="text-white/70 text-xs underline"
                    >
                      {t('workout.edit')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowPSEForDay(id)}
                    className="mt-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-4 py-1.5 rounded-xl transition"
                  >
                    {t('workout.logEffortForDay', { day: dayShortLabel(id) })}
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
