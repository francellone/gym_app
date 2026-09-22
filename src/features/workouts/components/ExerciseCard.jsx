import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  Info,
  PlayCircle,
  Lock,
  Trash2,
  AlertTriangle,
  RotateCcw,
  TrendingUp,
  MinusCircle,
  Pencil,
  History,
} from 'lucide-react'
import { cascadeSetValue } from '@/features/plans/seriesCascade'
import { expandPerSet, isUniformPerSet } from '@/features/plans/prescriptionRead'
import { isLogDone, isLogSkipped, isLogResolved, SKIP_REASONS } from '../completionRules'
import { PRESCRIPTION_FIELD_KEYS } from '@/features/plans/prescriptionHistory'
import {
  displayReps,
  WEIGHT_MODES_LOGGABLE,
  REPS_UNITS,
  PSE_OPTION_KEY,
  getEffectiveWeightMode,
  getLoggingWeightMode,
  getEffectiveUnilateral,
  readLogReps,
  readLogWeights,
} from '@/features/plans/helpers'
import { resolvePrescribedWeight } from '@/features/evaluations/oneRm'
import { formatShortDate } from '@/i18n/dateLocale'
import { PSE_OPTIONS, pseColor } from '../helpers'
import ValidationWarning from './ValidationWarning'
import { ExerciseHistoryHeaderLine, ExerciseHistoryBodyBlock } from './ExerciseHistoryPreview'
import { exerciseDisplay } from '@/features/exercises/exercise-display'
import useLocalStorageDraft from '../hooks/useLocalStorageDraft'
import { buildDraftKey, removeDraft } from '../draftStorage'
import { formatRelativeDate } from '../exerciseHistoryLogic'

// Campos que hacen que un borrador local sea "algo que la persona tocó".
const DRAFT_FIELDS = [
  'actual_sets',
  'actual_reps_arr',
  'actual_weights_arr',
  'perceived_difficulty',
  'notes',
  'weight_mode',
  'unilateral',
  'reps_unit',
]

// Parsear el peso sugerido del coach a número (ej: "20kg" → "20", "BW" → "")
// Helper privado de este componente.
function parseSuggestedWeight(val) {
  if (!val || val === 'None' || val === 'none') return ''
  const n = parseFloat(String(val).replace(/[^\d.]/g, ''))
  return isNaN(n) ? '' : n.toString()
}

// ============================================================
// Tarjeta de ejercicio individual (bloques de fuerza)
// ============================================================
// Renderiza un ejercicio dentro de un StrengthBlockRunCard. Maneja:
//   - v54 (2026-09-22) REGISTRO POR CONFIRMACIÓN: al expandir se muestra lo
//     prescripto en modo lectura (Serie / reps / peso) con tres salidas:
//       CONFIRMAR  "lo hice tal cual" → se despliega el PSE en la misma
//                  fila y el toque sobre el número guarda (entry_mode=confirmed)
//       AJUSTAR    "lo hice distinto" → recién ahí se abren los campos
//                  (entry_mode=edited). Adentro vive la cascada desde la
//                  serie 1 (seriesCascade.js, la misma del armador del coach)
//       NO LO HICE → motivo (choice/time/discomfort) y se guarda un log
//                  status=skipped, completed=false, sin datos de ejecución
//     Si el coach no prescribió kilos, el peso se prellena con lo último
//     que cargó la persona y la tarjeta lo dice (procedencia a la vista).
//     Ese prellenado ignora pesos no positivos: hay 31 logs viejos en cero.
//   - inputs de series/reps/peso por serie (con sugeridos del coach
//     pre-cargados y herencia de modo: log > plan_exercise > exercise)
//   - PSE 1-10, notas, modo unilateral, unidad de reps
//   - validación cliente con ValidationWarning para pesos sospechosos
//   - save / edit / delete vía callbacks del padre (onSaveLog / onDeleteLog)
//
// El payload que arma para la RPC `save_workout_log` cumple los CHECK
// constraints del back (bodyweight ⇒ weights NULL, etc.). Notas van
// aparte vía postWorkoutLogNote() en el padre (Round 2b del refactor m26:
// workout_logs.notes fue dropeada en v26d).
export default function ExerciseCard({
  planEx,
  log,
  onSaveLog,
  onDeleteLog,
  suggestedSets,
  // restScope: 'set' (suelto, pausa entre series) | 'group' (superset, la pausa
  // la muestra el pie del grupo en StrengthBlockRunCard, no acá).
  restScope = 'set',
  // Q1 — preview "Última vez" + chat del ejercicio
  lastLog = null,
  previewNote = null,
  noteCount = 0,
  onOpenChat,
  // F4 (doc 23) — draft local de lo que el alumno tipea por serie.
  // studentId + loggedDate componen la key del localStorage. Si no llegan,
  // el draft queda deshabilitado (degradación graceful — el componente
  // sigue funcionando como antes, sin autosave local).
  studentId = null,
  loggedDate = null,
  // doc 48 — último cambio de objetivo hecho por el coach para este ejercicio.
  // { changed_at, changes: { fieldKey: {old,new} }, note } | null
  prescriptionChange = null,
  // %RM (v39) — Map<exercise_id, {oneRm, date}> de esta persona. Sin él, un
  // ejercicio prescripto por % muestra el porcentaje en vez de los kilos.
  oneRmMap = null,
}) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [warning, setWarning] = useState(null)
  const [pendingData, setPendingData] = useState(null)
  const [setsLimitHit, setSetsLimitHit] = useState(false)
  // v54 — acción en curso dentro de la vista de confirmación:
  //   null | 'confirm' (PSE desplegado) | 'skip' (motivos desplegados)
  //   | 'reopen' (un omitido volvió a la vista de confirmación para cambiar)
  const [pendingAction, setPendingAction] = useState(null)

  // setsCount: cantidad sugerida por el coach (para inicialización y display)
  const setsCount = parseInt(suggestedSets || planEx.suggested_sets) || 0

  // Reps prescriptas POR SERIE, leídas como las lee el armador del coach:
  // un valor suelto ("10") es "10 en todas las series", no "10 en la serie 1"
  // (v54, ver prescriptionRead.js). `suggestedRepsRaw` sigue siendo el crudo
  // para la línea "Sugerido: 3 series × 10".
  const suggestedRepsRaw = planEx.suggested_reps
  const suggestedRepsArr = expandPerSet(suggestedRepsRaw, setsCount)
  // maxSets: tope duro (99 = sin tope cuando el coach no lo definió)
  const maxSets = setsCount || 99

  // Modo de peso y unilateral efectivos (herencia: log > plan_exercise > exercise)
  const exerciseDef = planEx.exercise || {}
  // Textos del ejercicio resueltos al idioma del que mira (fallback al canónico ES)
  const exText = exerciseDisplay(exerciseDef, i18n.language)
  // El plan puede prescribir '%RM', pero la alumna SIEMPRE registra kilos
  // reales → al loguear ese modo se comporta como 'con peso'.
  const initialWeightMode = getLoggingWeightMode(
    getEffectiveWeightMode({
      log,
      planExercise: planEx,
      exercise: exerciseDef,
    })
  )
  const initialUnilateral = getEffectiveUnilateral({
    log,
    planExercise: planEx,
    exercise: exerciseDef,
  })

  // %RM: el coach prescribió un porcentaje del máximo en vez de kilos.
  // Los kilos se DERIVAN acá (1RM de la persona × %), nunca vienen escritos en
  // el plan: así el peso sube solo cuando sube el máximo. Sin evaluación, la
  // degradación es limpia (se muestra el porcentaje, no se inventa un peso).
  // OJO: el modo se resuelve SIN el log — el log guarda 'with_weight' porque la
  // persona carga kilos reales, y eso taparía la prescripción.
  const pctPrescription = resolvePrescribedWeight({
    planExercise: planEx,
    oneRmMap,
    weightMode: getEffectiveWeightMode({ planExercise: planEx, exercise: exerciseDef }),
    today: loggedDate,
  })
  const prescribedPct1rm = pctPrescription.pct
  const derivedKg = pctPrescription.kg
  const rmReferenceName = pctPrescription.usedReference
    ? exerciseDisplay(planEx.rm_reference || {}, i18n.language).name
    : null

  // Pesos del coach por serie. Prioridad: %RM derivado → suggested_weights
  // (misma lectura que las reps: suelto = todas; array = serie a serie con
  // huecos heredando) → suggested_weight (legacy, un valor para todas).
  const coachWeightsArr = (() => {
    if (derivedKg != null) return Array.from({ length: setsCount || 1 }, () => String(derivedKg))
    const fromArray = expandPerSet(planEx.suggested_weights, setsCount)
    if (fromArray.some((w) => w !== '')) return fromArray.map(parseSuggestedWeight)
    const legacy = parseSuggestedWeight(planEx.suggested_weight)
    return Array.from({ length: setsCount || 1 }, () => legacy)
  })()

  // v54 — si el coach NO prescribió kilos, el peso se prellena con lo último
  // que cargó la persona. Solo pesos POSITIVOS: los 31 logs viejos "en cero"
  // (el workaround de "no lo hice" antes de v54) no pueden volver como
  // sugerencia. Si el último registro tiene otra cantidad de series, se
  // usa el máximo para todas.
  const lastWeightsArr = (() => {
    if (!lastLog || !isLogDone(lastLog)) return null
    const nums = readLogWeights(lastLog)
      .map((w) => parseFloat(w))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (nums.length === 0) return null
    const count = setsCount || 1
    if (nums.length === count) return nums.map((n) => String(n))
    const max = Math.max(...nums)
    return Array.from({ length: count }, () => String(max))
  })()

  const coachHasWeights = coachWeightsArr.some((w) => w !== '' && w != null)
  // De dónde sale el peso que ve la persona (para decirlo en la tarjeta).
  //   'pct1rm' | 'plan' | 'last' | null
  const weightSource =
    derivedKg != null ? 'pct1rm' : coachHasWeights ? 'plan' : lastWeightsArr ? 'last' : null
  const suggestedWeightsArr = weightSource === 'last' ? lastWeightsArr : coachWeightsArr

  // Inicializar reps con valores sugeridos si no hay log previo.
  // Prioridad: actual_reps_jsonb (nuevo) > actual_reps (legacy) > sugeridas.
  const initRepsArr = () => {
    const fromLog = log ? readLogReps(log) : []
    if (fromLog.length > 0) {
      const parsed = fromLog.map((r) => (r != null ? String(r) : ''))
      if (setsCount > 0 && parsed.length !== setsCount) {
        return Array.from({ length: setsCount }, (_, i) => parsed[i] || suggestedRepsArr[i] || '')
      }
      return parsed
    }
    return setsCount > 0
      ? Array.from({ length: setsCount }, (_, i) => suggestedRepsArr[i] || '')
      : [suggestedRepsArr[0] || '']
  }

  // Inicializar pesos por serie. Prioridad: actual_weights_jsonb > legacy > sugeridos.
  const initWeightsArr = () => {
    const fromLog = log ? readLogWeights(log) : []
    if (fromLog.length > 0) {
      const asStrings = fromLog.map((w) => (w != null && w !== '' ? String(w) : ''))
      if (setsCount > 0 && asStrings.length !== setsCount) {
        return Array.from(
          { length: setsCount },
          (_, i) => asStrings[i] || suggestedWeightsArr[i] || ''
        )
      }
      return asStrings.length > 0 ? asStrings : [suggestedWeightsArr[0] || '']
    }
    // Default: pesos sugeridos por el coach
    return setsCount > 0
      ? Array.from({ length: setsCount }, (_, i) => suggestedWeightsArr[i] || '')
      : [suggestedWeightsArr[0] || '']
  }

  // Estado "prístino" de la tarjeta: lo prescripto (o el log, si hay).
  // Se usa al montar, al desmarcar, al descartar un borrador y para saber
  // si un borrador restaurado tiene algo que valga la pena.
  function buildPristineLogData() {
    return {
      // Series: pre-rellenado con el valor sugerido por el coach
      actual_sets: log?.actual_sets?.toString() || (setsCount > 0 ? setsCount.toString() : ''),
      actual_reps_arr: initRepsArr(),
      // Pesos por serie: pre-rellenados con sugeridos del coach
      actual_weights_arr: initWeightsArr(),
      perceived_difficulty: log?.perceived_difficulty || null,
      notes: log?.notes || '',
      completed: isLogDone(log),
      // Modo de peso del log (override sobre el efectivo si el alumno lo cambia)
      weight_mode: log?.weight_mode || initialWeightMode,
      unilateral: log?.unilateral != null ? !!log.unilateral : initialUnilateral,
      reps_unit: log?.reps_unit || null,
    }
  }

  const [logData, setLogData] = useState(buildPristineLogData)

  // Sincronizar state local con el prop `log` cuando cambia (p.ej. tras un
  // save: el padre actualiza logs[exId] y nosotros re-renderizamos con un
  // nuevo log). Sin este efecto, el useState solo se evaluaba al mount y
  // el badge verde podía quedar desfasado hasta un refresh.
  useEffect(() => {
    if (!log) return
    setLogData((p) => ({
      ...p,
      actual_sets: log.actual_sets?.toString() || p.actual_sets,
      perceived_difficulty: log.perceived_difficulty ?? p.perceived_difficulty,
      notes: log.notes ?? p.notes,
      completed: isLogDone(log),
      weight_mode: log.weight_mode || p.weight_mode,
      unilateral: log.unilateral != null ? !!log.unilateral : p.unilateral,
      reps_unit: log.reps_unit || p.reps_unit,
    }))
  }, [log?.id, log?.completed, log?.status, log?.updated_at])

  // ── F4 (doc 23) — draft local en localStorage ────────────────────────
  // Construimos la key con (studentId, planExerciseId, loggedDate). Si
  // alguno falta, buildDraftKey devuelve null y el hook queda en noop.
  // El draft está deshabilitado cuando el log ya está completed: el server
  // gana, no queremos pisar un log real con un draft viejo.
  const draftKey = useMemo(
    () =>
      buildDraftKey({
        studentId,
        planExerciseId: planEx.id,
        loggedDate,
      }),
    [studentId, planEx.id, loggedDate]
  )

  // v54: tampoco para un omitido (resuelto). Antes: !log?.completed.
  const draftEnabled = !!draftKey && !isLogResolved(log)

  const { restoredAt, clearDraft } = useLocalStorageDraft({
    key: draftKey,
    value: logData,
    enabled: draftEnabled,
    onRestore: (payload) => {
      // v54: el autosave escribe un borrador de cada ejercicio aunque la
      // persona no toque nada. Si lo que vuelve es igual a lo prescripto,
      // no es un borrador: se descarta en silencio y la tarjeta arranca en
      // la vista de confirmación. Antes esto mandaba TODOS los ejercicios
      // ya abiertos al modo ajustar y la confirmación nunca aparecía.
      //
      // Un hueco en reps/pesos nunca es intencional (un input vacío guarda
      // NULL y la persona no lo ve): se rellena con la prescripción ANTES de
      // comparar. Cubre los borradores escritos con la lectura vieja
      // ("5" solo en la serie 1).
      const pristine = buildPristineLogData()
      const fillHoles = (arr, base) =>
        Array.from({ length: Math.max(arr?.length || 0, base.length) }, (_, i) => {
          const v = arr?.[i]
          return v === '' || v == null ? base[i] || '' : v
        })
      const merged = {
        ...pristine,
        ...payload,
        actual_reps_arr: fillHoles(payload?.actual_reps_arr, pristine.actual_reps_arr),
        actual_weights_arr: fillHoles(payload?.actual_weights_arr, pristine.actual_weights_arr),
        completed: false,
      }
      const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
      const untouched = DRAFT_FIELDS.every((k) => same(merged[k], pristine[k]))
      if (untouched) {
        // Se borra directo (el clearDraft del hook todavía no está en mano
        // durante el restore del primer mount).
        if (draftKey) removeDraft(draftKey)
        return
      }
      // Merge defensivo: nunca aceptamos `completed: true` desde un draft
      // (drafts son siempre parciales), ni pisamos IDs / metadata server.
      setLogData(merged)
      // Dejamos el form listo para editar, pero NO auto-expandimos la
      // tarjeta: la persona abre el que quiere y ahí ve sus datos + el hint.
      setEditing(true)
    },
  })

  // Si en algún momento el log llega completed=true (el server confirmó
  // el save), borramos el draft local para no dejar basura silenciosa.
  useEffect(() => {
    if (isLogResolved(log)) clearDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log?.completed, log?.status, log?.id])

  // Estado del hint "Recuperamos lo que estabas cargando". Se oculta
  // cuando el alumno hace cualquier cambio o lo descarta manualmente.
  const [draftHintDismissed, setDraftHintDismissed] = useState(false)
  const showDraftHint = !!restoredAt && !draftHintDismissed && !isLogResolved(log)

  const completed = logData.completed
  const isBodyweight = logData.weight_mode === 'bodyweight'
  const showWeightInputs = !isBodyweight

  // v54 — estado de la tarjeta
  const isSkipped = isLogSkipped(log) && !logData.completed
  // Vista de confirmación: no hay nada hecho, no se está ajustando, y o no
  // hay omisión o la persona pidió cambiarla.
  const showConfirmView = !completed && !editing && (!isSkipped || pendingAction === 'reopen')
  // Se puede confirmar de un toque solo si TODO lo que se guardaría está
  // a la vista: reps en todas las series y, si el ejercicio lleva peso,
  // peso en todas. Si falta el peso (primera vez sin prescripción ni
  // historial), hay que pasar por ajustar y cargarlo una vez.
  const setsForConfirm = parseInt(logData.actual_sets) || setsCount || 0
  const repsReady =
    setsForConfirm > 0 &&
    Array.from({ length: setsForConfirm }, (_, i) => logData.actual_reps_arr[i]).every(
      (r) => r !== '' && r != null
    )
  const weightsReady =
    !showWeightInputs ||
    Array.from({ length: setsForConfirm }, (_, i) => logData.actual_weights_arr[i]).every(
      (w) => w !== '' && w != null
    )
  const canConfirm = repsReady && weightsReady
  // Vista compacta si reps (y peso, si lleva) son iguales en todas las series.
  const confirmIsUniform =
    isUniformPerSet(logData.actual_reps_arr.slice(0, setsForConfirm)) &&
    (!showWeightInputs ||
      isUniformPerSet(logData.actual_weights_arr.slice(0, setsForConfirm)) ||
      logData.actual_weights_arr.slice(0, setsForConfirm).every((w) => w === '' || w == null))

  // v54: la serie 1 autocompleta a las series sincronizadas con ella (la
  // misma regla que el armador del coach, ver seriesCascade.js).
  function handleRepsChange(idx, val) {
    setLogData((p) => ({ ...p, actual_reps_arr: cascadeSetValue(p.actual_reps_arr, idx, val) }))
  }

  function handleWeightChange(idx, val) {
    setLogData((p) => ({
      ...p,
      actual_weights_arr: cascadeSetValue(p.actual_weights_arr, idx, val),
    }))
  }

  function handleSetsChange(val) {
    let n = parseInt(val) || 0

    // TOPE DURO: no puede superar el máximo definido por el coach
    if (maxSets < 99 && n > maxSets) {
      n = maxSets
      // Mostrar aviso breve sin pregunta de confirmación
      setSetsLimitHit(true)
      setTimeout(() => setSetsLimitHit(false), 2000)
    }

    const currentReps = logData.actual_reps_arr
    const currentWeights = logData.actual_weights_arr
    let newReps, newWeights
    if (n === 0) {
      newReps = ['']
      newWeights = ['']
    } else if (n > currentReps.length) {
      // Al agregar series, pre-rellenar con valores sugeridos si los hay
      newReps = [
        ...currentReps,
        ...Array.from(
          { length: n - currentReps.length },
          (_, i) => suggestedRepsArr[currentReps.length + i] || ''
        ),
      ]
      newWeights = [
        ...currentWeights,
        ...Array.from(
          { length: n - currentWeights.length },
          (_, i) => suggestedWeightsArr[currentWeights.length + i] || ''
        ),
      ]
    } else {
      newReps = currentReps.slice(0, n)
      newWeights = currentWeights.slice(0, n)
    }
    setLogData((p) => ({
      ...p,
      actual_sets: n.toString(),
      actual_reps_arr: newReps,
      actual_weights_arr: newWeights,
    }))
  }

  // Construye el payload limpio para la RPC save_workout_log.
  //
  // La RPC espera:
  //   - p_reps: jsonb array de números (POR LADO si unilateral=true)
  //   - p_weights: jsonb array de números (null si bodyweight)
  //   - p_weight_mode, p_unilateral, p_reps_unit
  //   - El back hace doble escritura interna a actual_reps / actual_weights / actual_weight
  // `entryMode`: 'confirmed' (lo hice tal cual) | 'edited' (ajusté).
  // `pseOverride`: el PSE elegido en el confirmar inline (setLogData es
  // asíncrono, así que se pasa explícito en vez de leerlo del estado).
  function buildSaveData({ entryMode = 'edited', pseOverride } = {}) {
    const pse = pseOverride !== undefined ? pseOverride : logData.perceived_difficulty
    const repsArrRaw = logData.actual_reps_arr || []
    const repsNumeric = repsArrRaw.map((r) => parseFloat(r)).map((n) => (isNaN(n) ? null : n))

    const weightsArrRaw = logData.actual_weights_arr || []
    const weightsNumeric = weightsArrRaw.map((w) => parseFloat(w)).map((n) => (isNaN(n) ? null : n))

    // Length de reps determina cuántas series tiene el log.
    // Si bodyweight, anulamos weights enteramente para satisfacer el CHECK
    // (constraint: bodyweight ⇒ actual_weights_jsonb IS NULL).
    const weightsForRpc = isBodyweight
      ? null
      : // Igualar largo de weights con reps (rellena con null si faltan)
        Array.from({ length: repsNumeric.length }, (_, i) =>
          weightsNumeric[i] != null ? weightsNumeric[i] : null
        )

    return {
      // valores que necesita la RPC
      p_reps: repsNumeric,
      p_weights: weightsForRpc,
      p_weight_mode: logData.weight_mode || 'with_weight',
      p_unilateral: !!logData.unilateral,
      p_reps_unit: logData.reps_unit || null,
      p_actual_sets: logData.actual_sets
        ? parseInt(logData.actual_sets)
        : repsNumeric.length || null,
      p_perceived_difficulty: pse || null,
      p_perceived_difficulty_label: pse ? PSE_OPTIONS.find((p) => p.value === pse)?.label : null,
      // Round 2b: el RPC ya no escribe a workout_logs.notes (la columna
      // se dropeó en v26d). Pasamos null y después del save llamamos
      // a postWorkoutLogNote() con el body para que aterrice en el panel.
      p_notes: null,
      p_completed: true,
      // v54
      p_status: 'done',
      p_skip_reason: null,
      p_entry_mode: entryMode,
      // Body del alumno para postWorkoutLogNote(). Underscore-prefijado
      // para distinguir de los p_* que van a la RPC; saveLog del padre
      // lo extrae antes de hacer rpcArgs.
      _noteBody: logData.notes || '',
    }
  }

  // v54 — payload de "no lo hice": sin datos de ejecución (NULL, nunca 0),
  // completed=false, motivo obligatorio. La RPC rechaza cualquier dato de
  // ejecución con status=skipped, así que acá no se manda nada de eso.
  function buildSkipData(reason) {
    return {
      p_reps: null,
      p_weights: null,
      p_weight_mode: logData.weight_mode || 'with_weight',
      p_unilateral: !!logData.unilateral,
      p_reps_unit: null,
      p_actual_sets: null,
      p_perceived_difficulty: null,
      p_perceived_difficulty_label: null,
      p_notes: null,
      p_completed: false,
      p_status: 'skipped',
      p_skip_reason: reason,
      p_entry_mode: null,
      _noteBody: '',
    }
  }

  // Validación cliente — devuelve un objeto { type, message } o null.
  //   type='warning' → modal de "Verificá este dato" (deja guardar igual)
  function validate(data) {
    // Falta PSE
    if (!data.p_perceived_difficulty) {
      return {
        type: 'warning',
        message: t('workout.warnMissingPse'),
      }
    }
    // Pesos demasiado altos (solo si no es BW)
    if (!isBodyweight && Array.isArray(data.p_weights)) {
      const nums = data.p_weights.filter((w) => w != null && !isNaN(w))
      if (nums.some((w) => w > 500)) {
        return {
          type: 'warning',
          message: t('workout.warnWeightTooHigh'),
        }
      }
      // Soft-warning "Solo con barra" + peso > 20kg
      if (data.p_weight_mode === 'barbell_only' && nums.some((w) => w > 20)) {
        return {
          type: 'warning',
          message: t('workout.warnBarbellHeavy'),
        }
      }
    }
    return null
  }

  async function attemptSave(entryMode = 'edited') {
    const data = buildSaveData({ entryMode })
    const warn = validate(data)
    if (warn) {
      setPendingData(data)
      setWarning(warn.message)
      return
    }
    await doSave(data)
  }

  async function doSave(data) {
    setWarning(null)
    setPendingData(null)
    setSaving(true)
    try {
      await onSaveLog(planEx.id, data)
      setLogData((p) => ({ ...p, completed: true }))
      setEditing(false)
      setPendingAction(null)
      // F4: save server exitoso → el draft local ya no tiene razón de ser.
      clearDraft()
      setDraftHintDismissed(true)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // v54 — CONFIRMAR: el toque sobre el número de PSE guarda. Las validaciones
  // de peso siguen corriendo (un prescripto de 600 kg también es un error).
  async function confirmWithPse(pse) {
    setLogData((p) => ({ ...p, perceived_difficulty: pse }))
    const data = buildSaveData({ entryMode: 'confirmed', pseOverride: pse })
    const warn = validate(data)
    if (warn) {
      setPendingData(data)
      setWarning(warn.message)
      return
    }
    await doSave(data)
  }

  // v54 — NO LO HICE: el toque sobre el motivo guarda.
  async function skipWith(reason) {
    if (!SKIP_REASONS.includes(reason)) return
    setSaving(true)
    try {
      await onSaveLog(planEx.id, buildSkipData(reason))
      setLogData((p) => ({ ...p, completed: false, perceived_difficulty: null }))
      setEditing(false)
      setPendingAction(null)
      clearDraft()
      setDraftHintDismissed(true)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDeleteLog(planEx.id)
      // F4: delete server exitoso → barrer también el draft local.
      clearDraft()
      setDraftHintDismissed(true)
      // Resetear estado local al estado inicial (sin log). El prop `log`
      // todavía puede estar en mano hasta que el padre refresque, así que
      // se arma desde la prescripción y no desde buildPristineLogData.
      setLogData({
        actual_sets: setsCount > 0 ? setsCount.toString() : '',
        actual_reps_arr:
          setsCount > 0 ? suggestedRepsArr.slice(0, setsCount) : [suggestedRepsArr[0] || ''],
        actual_weights_arr:
          setsCount > 0 ? suggestedWeightsArr.slice(0, setsCount) : [suggestedWeightsArr[0] || ''],
        perceived_difficulty: null,
        notes: '',
        completed: false,
        // Reset también la configuración a los defaults heredados
        weight_mode: initialWeightMode,
        unilateral: initialUnilateral,
        reps_unit: null,
      })
      setConfirmDelete(false)
      setEditing(false)
      setPendingAction(null)
      setExpanded(false)
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  const actualSetsCount = parseInt(logData.actual_sets) || setsCount || 1

  // F4: descartar el draft restaurado → volvemos a los valores sugeridos
  // del coach. NO toca el log server (que puede no existir aún).
  function discardDraft() {
    clearDraft()
    setDraftHintDismissed(true)
    setLogData((p) => ({ ...p, ...buildPristineLogData(), completed: p.completed }))
    setEditing(false)
  }

  return (
    <>
      {warning && (
        <ValidationWarning
          message={warning}
          onConfirm={() => doSave(pendingData)}
          onCancel={() => {
            setWarning(null)
            setPendingData(null)
          }}
        />
      )}

      {/* Modal de confirmación para desmarcar */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{t('workout.unmarkExerciseTitle')}</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  {t('workout.unmarkExerciseBody')} <strong>{exText.name}</strong>.{' '}
                  {t('workout.actionCannotBeUndone')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn-secondary flex-1 text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 text-sm bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {deleting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 size={14} />
                    {t('workout.yesUnmark')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`rounded-2xl border-2 transition-all overflow-hidden ${
          completed
            ? 'border-green-200 bg-green-50'
            : isSkipped
              ? 'border-amber-200 bg-amber-50/60'
              : 'border-gray-100 bg-white'
        }`}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 p-4 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (completed) return
              // v54: el círculo es el atajo a la vista de confirmación.
              setExpanded(true)
              setEditing(false)
              setPendingAction(isSkipped ? 'reopen' : canConfirm ? 'confirm' : null)
            }}
            className="flex-shrink-0"
            aria-label={
              completed
                ? t('workout.completedCheck')
                : isSkipped
                  ? t('workout.skippedCheck')
                  : t('workout.logWorkout')
            }
          >
            {completed ? (
              <CheckCircle2 size={24} className="text-green-500" />
            ) : isSkipped ? (
              <MinusCircle size={24} className="text-amber-500" />
            ) : (
              <Circle size={24} className="text-gray-300" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {planEx.block_label && (
                <span className="badge bg-primary-100 text-primary-700 flex-shrink-0">
                  {planEx.block_label}
                </span>
              )}
              <p
                className={`font-semibold text-sm break-words ${completed ? 'text-green-800' : 'text-gray-900'}`}
              >
                {exText.name}
              </p>
              {/* v33 — registro cargado por el coach (auditoría visible) */}
              {log?.source === 'coach' && (
                <span className="badge bg-violet-100 text-violet-700 flex-shrink-0 text-[10px]">
                  {t('workout.loggedByCoach')}
                </span>
              )}
            </div>
            {/* Sugerido por el coach */}
            <p className="text-xs text-gray-400 mt-0.5">
              {t('workout.suggestedLabel')}{' '}
              {[
                planEx.suggested_sets &&
                  t('workout.series', { count: Number(planEx.suggested_sets) }),
                suggestedRepsRaw && `× ${displayReps(suggestedRepsRaw)}`,
                prescribedPct1rm
                  ? derivedKg != null
                    ? `· ${derivedKg} kg (${prescribedPct1rm}% ${t('workout.ofYourMax')})`
                    : `· ${prescribedPct1rm}% ${t('workout.ofYourMax')}`
                  : planEx.suggested_weight &&
                    planEx.suggested_weight !== 'None' &&
                    `· ${planEx.suggested_weight}`,
                restScope === 'set' &&
                  planEx.rest_time &&
                  planEx.rest_time !== 'None' &&
                  `· ${t('workout.restBetweenSets', { time: planEx.rest_time })}`,
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
            {/* %RM: de dónde salieron los kilos (o por qué todavía no hay) */}
            {pctPrescription.status === 'derived' && (
              <p className="text-[11px] text-primary-600 mt-0.5">
                {rmReferenceName
                  ? t('workout.pct1rmFromReference', {
                      pct: prescribedPct1rm,
                      oneRm: pctPrescription.oneRm,
                      exercise: rmReferenceName,
                      date: formatShortDate(pctPrescription.oneRmDate, i18n.language),
                    })
                  : t('workout.pct1rmFromOwnMax', {
                      pct: prescribedPct1rm,
                      oneRm: pctPrescription.oneRm,
                      date: formatShortDate(pctPrescription.oneRmDate, i18n.language),
                    })}
              </p>
            )}
            {pctPrescription.status === 'missing_1rm' && (
              <p className="text-[11px] text-amber-600 mt-0.5">{t('workout.pct1rmNoEval')}</p>
            )}

            {/* doc 48 — el coach ajustó el objetivo de este ejercicio */}
            {prescriptionChange?.changes && (
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-emerald-700">
                <span className="inline-flex items-center gap-1 font-medium">
                  <TrendingUp size={11} />
                  {t('workout.coachAdjusted')}
                </span>
                {PRESCRIPTION_FIELD_KEYS.filter((k) => prescriptionChange.changes[k]).map((k) => (
                  <span key={k} className="text-emerald-600">
                    {t(`workout.prescriptionField.${k}`)} {prescriptionChange.changes[k].old}
                    {'→'}
                    <strong>{prescriptionChange.changes[k].new}</strong>
                  </span>
                ))}
                {prescriptionChange.note && (
                  <span className="w-full text-emerald-600/80 italic">
                    "{prescriptionChange.note}"
                  </span>
                )}
              </div>
            )}
            {/* Q1 — "Última vez" + badge chat (siempre visible en el header) */}
            <ExerciseHistoryHeaderLine
              lastLog={lastLog}
              noteCount={noteCount}
              onOpenChat={() => onOpenChat?.(planEx.exercise_id, exText.name)}
            />
            {isSkipped && !expanded && (
              <p className="text-xs text-amber-700 mt-0.5 font-medium">
                {t('workout.skippedCheck')}
                {log?.skip_reason && ` · ${t(`workout.skipReason.${log.skip_reason}`)}`}
              </p>
            )}
            {isLogDone(log) &&
              !expanded &&
              (() => {
                const wArr = readLogWeights(log).filter((w) => w != null && w !== '')
                const wDisplay =
                  wArr.length > 0 ? t('workout.weightKg', { value: wArr.join(', ') }) : null
                return (
                  <p className="text-xs text-green-600 mt-0.5 font-medium">
                    ✓{' '}
                    {[
                      log.actual_sets && t('workout.setsShort', { value: log.actual_sets }),
                      wDisplay,
                      log.perceived_difficulty &&
                        t('workout.pseValue', { value: log.perceived_difficulty }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )
              })()}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* "i" de información: revela la descripción (QUÉ es) sin abrir el registro */}
            {exText.description && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDescription((v) => !v)
                }}
                title={t('workout.exerciseInfo')}
                aria-label={t('workout.exerciseInfo')}
                aria-expanded={showDescription}
                className={`p-1.5 rounded-lg transition-colors ${
                  showDescription
                    ? 'text-indigo-600 bg-indigo-50'
                    : 'text-gray-400 hover:bg-gray-100'
                }`}
              >
                <Info size={18} />
              </button>
            )}
            {planEx.exercise?.video_url && planEx.exercise.video_url.startsWith('http') && (
              <a
                href={planEx.exercise.video_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
              >
                <PlayCircle size={18} />
              </a>
            )}
            {expanded ? (
              <ChevronDown size={18} className="text-gray-400 rotate-180" />
            ) : (
              <ChevronDown size={18} className="text-gray-400" />
            )}
          </div>
        </div>

        {/* Descripción (QUÉ es): la revela la "i" del header, sin abrir el modo registro */}
        {showDescription && exText.description && (
          <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-600 leading-relaxed">{exText.description}</p>
          </div>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-gray-100 p-4 space-y-4">
            {/* Q1 — última nota del coach + botón "Ver chat completo".
                Va antes de la técnica para que sea lo primero que ve
                el alumno al expandir (lo que más urge a Anto). */}
            <ExerciseHistoryBodyBlock
              previewNote={previewNote}
              noteCount={noteCount}
              onOpenChat={() => onOpenChat?.(planEx.exercise_id, exText.name)}
            />

            {/* Technique notes */}
            {/* Nota técnica (CÓMO se hace): siempre visible al expandir.
                extra_notes es por-plan y queda canónica (ver handoff de i18n de extra_notes) */}
            {(planEx.extra_notes || exText.technique_notes) && (
              <div className="bg-blue-50 rounded-xl p-3 flex gap-2">
                <Info size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  {planEx.extra_notes || exText.technique_notes}
                </p>
              </div>
            )}

            {planEx.suggested_pse && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{t('workout.suggestedPse')}</span>
                <span className="badge bg-orange-100 text-orange-700">
                  {PSE_OPTION_KEY[planEx.suggested_pse]
                    ? t(`workout.suggestedPseValue.${PSE_OPTION_KEY[planEx.suggested_pse]}`)
                    : planEx.suggested_pse}
                </span>
              </div>
            )}

            {/* v54 — vista de confirmación: lo prescripto en lectura + 3 salidas */}
            {showConfirmView ? (
              <div className="space-y-3 bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-700">
                  {t('workout.prescribedTitle')}
                </p>

                {setsForConfirm > 0 && confirmIsUniform ? (
                  /* Compacto: el coach puso lo mismo en todas las series (18 de
                     21 ejercicios del plan de Franco). La tabla por serie
                     queda para cuando diferenció. */
                  <dl className="rounded-xl bg-white border border-gray-200 divide-y divide-gray-100 text-sm">
                    <div className="flex items-center justify-between px-3 py-2">
                      <dt className="text-gray-500">{t('workout.setsLabel')}</dt>
                      <dd className="font-semibold text-gray-900">{setsForConfirm}</dd>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2">
                      <dt className="text-gray-500">
                        {logData.unilateral
                          ? t('workout.repsPerSidePerSetLabel')
                          : logData.reps_unit && logData.reps_unit !== 'reps'
                            ? t('workout.unitPerSetLabel', {
                                unit: t(`workout.repsUnitShort.${logData.reps_unit}`, {
                                  defaultValue: logData.reps_unit,
                                }),
                              })
                            : t('workout.repsPerSetLabel')}
                      </dt>
                      <dd className="font-semibold text-gray-900">{logData.actual_reps_arr[0]}</dd>
                    </div>
                    {showWeightInputs && (
                      <div className="flex items-center justify-between px-3 py-2">
                        <dt className="text-gray-500">{t('workout.weightPerSetLabel')}</dt>
                        <dd className="font-semibold text-gray-900">
                          {logData.actual_weights_arr[0]
                            ? `${logData.actual_weights_arr[0]} kg`
                            : '—'}
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : setsForConfirm > 0 ? (
                  <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
                    <div
                      className={`grid px-2.5 py-1.5 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 font-semibold ${
                        showWeightInputs ? 'grid-cols-[2.5rem_1fr_1fr]' : 'grid-cols-[2.5rem_1fr]'
                      }`}
                    >
                      <div>{t('workout.setHeader')}</div>
                      <div className="text-center">
                        {logData.unilateral
                          ? t('workout.repsPerSideHeader')
                          : logData.reps_unit && logData.reps_unit !== 'reps'
                            ? t(`workout.repsUnitShort.${logData.reps_unit}`, {
                                defaultValue:
                                  REPS_UNITS.find((u) => u.key === logData.reps_unit)?.short ||
                                  t('workout.repsHeader'),
                              })
                            : t('workout.repsHeader')}
                      </div>
                      {showWeightInputs && (
                        <div className="text-center">{t('workout.weightKgHeader')}</div>
                      )}
                    </div>
                    {Array.from({ length: setsForConfirm }, (_, i) => (
                      <div
                        key={i}
                        className={`grid px-2.5 py-1.5 border-t border-gray-100 text-sm items-center ${
                          showWeightInputs ? 'grid-cols-[2.5rem_1fr_1fr]' : 'grid-cols-[2.5rem_1fr]'
                        }`}
                      >
                        <div className="text-xs text-gray-400">{i + 1}</div>
                        <div className="text-center font-semibold text-gray-900">
                          {logData.actual_reps_arr[i] || '—'}
                        </div>
                        {showWeightInputs && (
                          <div className="text-center font-semibold text-gray-900">
                            {logData.actual_weights_arr[i]
                              ? `${logData.actual_weights_arr[i]} kg`
                              : '—'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">{t('workout.noPrescriptionToConfirm')}</p>
                )}

                {/* Procedencia del peso: si no lo puso el coach, hay que decirlo */}
                {showWeightInputs && weightSource === 'last' && lastLog?.logged_date && (
                  <p className="text-[11px] text-indigo-600 flex items-center gap-1">
                    <History size={11} className="flex-shrink-0" />
                    {t('workout.weightFromLastTime', {
                      date: formatShortDate(lastLog.logged_date, i18n.language),
                    })}
                  </p>
                )}
                {setsForConfirm > 0 && showWeightInputs && !weightsReady && (
                  <p className="text-[11px] text-amber-700">{t('workout.needWeightToConfirm')}</p>
                )}

                {pendingAction === 'confirm' ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-700 font-medium">
                      {t('workout.confirmPsePrompt')}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={saving}
                          onClick={() => confirmWithPse(n)}
                          className="w-8 h-8 rounded-lg text-sm font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
                          aria-label={t('workout.pseValue', { value: n })}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingAction(null)}
                      className="text-xs text-gray-500 underline underline-offset-2"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : pendingAction === 'skip' ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-700 font-medium">
                      {t('workout.skipReasonPrompt')}
                    </p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {SKIP_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          disabled={saving}
                          onClick={() => skipWith(r)}
                          className="btn-secondary text-sm text-left disabled:opacity-50"
                        >
                          {t(`workout.skipReason.${r}`)}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingAction(null)}
                      className="text-xs text-gray-500 underline underline-offset-2"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {canConfirm && (
                      <button
                        type="button"
                        onClick={() => setPendingAction('confirm')}
                        className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                      >
                        <CheckCircle2 size={16} />
                        {t('workout.confirmAsPrescribed')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPendingAction(null)
                        setEditing(true)
                      }}
                      className={`w-full flex items-center justify-center gap-2 text-sm ${
                        canConfirm ? 'btn-secondary' : 'btn-primary'
                      }`}
                    >
                      <Pencil size={15} />
                      {canConfirm ? t('workout.adjust') : t('workout.logWorkout')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingAction('skip')}
                      className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-1.5"
                    >
                      <MinusCircle size={15} />
                      {t('workout.didNotDo')}
                    </button>
                  </div>
                )}
              </div>
            ) : editing ? (
              <div className="space-y-3 bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">
                    {completed ? t('workout.logWorkout') : t('workout.adjustTitle')}
                  </p>
                  {!completed && (
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="text-[11px] text-gray-500 underline underline-offset-2"
                    >
                      {t('common.back')}
                    </button>
                  )}
                </div>

                {/* F4 (doc 23) — hint de restauración del draft local.
                    Aparece cuando el hook restaura datos desde localStorage
                    y todavía no fueron descartados. Permite descartar para
                    volver a los valores sugeridos del coach. */}
                {showDraftHint && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    <RotateCcw size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-800 flex-1 leading-tight">
                      {t('workout.draftRestored', {
                        date: formatRelativeDate(restoredAt, undefined, t),
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={discardDraft}
                      className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2"
                    >
                      {t('workout.discard')}
                    </button>
                  </div>
                )}

                {/* Series */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    {t('workout.setsPerformed')}
                    {maxSets < 99 && (
                      <span className="flex items-center gap-0.5 text-gray-400">
                        <Lock size={10} />
                        {t('workout.maxShort', { value: maxSets })}
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={maxSets < 99 ? maxSets : undefined}
                    className={`input text-sm text-center w-full transition-colors ${
                      setsLimitHit ? 'border-orange-400 bg-orange-50' : ''
                    }`}
                    placeholder={maxSets < 99 ? maxSets.toString() : '—'}
                    value={logData.actual_sets}
                    onChange={(e) => handleSetsChange(e.target.value)}
                  />
                  {setsLimitHit && (
                    <p className="text-[11px] text-orange-500 mt-0.5 flex items-center gap-1">
                      <Lock size={10} /> {t('workout.planLimitSets', { value: maxSets })}
                    </p>
                  )}
                </div>

                {/* Configuración del ejercicio (modo, unilateral, unidad reps) */}
                <div className="rounded-xl bg-white border border-gray-200 p-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-gray-500 mb-1 block">
                        {t('workout.weightType')}
                      </label>
                      <select
                        className="input text-xs py-1.5"
                        value={logData.weight_mode}
                        onChange={(e) => setLogData((p) => ({ ...p, weight_mode: e.target.value }))}
                      >
                        {WEIGHT_MODES_LOGGABLE.map((m) => (
                          <option key={m.key} value={m.key}>
                            {t(`workout.weightMode.${m.key}`, { defaultValue: m.label })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-500 mb-1 block">
                        {t('workout.repsUnit')}
                      </label>
                      <select
                        className="input text-xs py-1.5"
                        value={logData.reps_unit || ''}
                        onChange={(e) =>
                          setLogData((p) => ({ ...p, reps_unit: e.target.value || null }))
                        }
                      >
                        <option value="">{t('workout.repsDefault')}</option>
                        {REPS_UNITS.filter((u) => u.key !== 'reps').map((u) => (
                          <option key={u.key} value={u.key}>
                            {t(`workout.repsUnitOption.${u.key}`, { defaultValue: u.label })}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-violet-600"
                      checked={!!logData.unilateral}
                      onChange={(e) => setLogData((p) => ({ ...p, unilateral: e.target.checked }))}
                    />
                    <span className="text-xs text-gray-700">
                      {t('workout.unilateralEachSide')}
                      {logData.unilateral && (
                        <span className="block text-[10px] text-violet-600 font-bold">
                          {t('workout.repsPerSideNote')}
                        </span>
                      )}
                    </span>
                  </label>
                </div>

                {/* Reps + Peso por serie (grilla combinada) */}
                <div>
                  <label className="text-xs text-gray-500 mb-2 block font-medium">
                    {showWeightInputs
                      ? logData.unilateral
                        ? t('workout.repsPerSideAndWeightPerSet')
                        : t('workout.repsAndWeightPerSet')
                      : logData.unilateral
                        ? t('workout.repsPerSidePerSet')
                        : t('workout.repsPerSet')}
                  </label>
                  {/* Encabezados */}
                  <div
                    className={`grid gap-1.5 mb-1 px-0.5 ${showWeightInputs ? 'grid-cols-[2rem_1fr_1fr]' : 'grid-cols-[2rem_1fr]'}`}
                  >
                    <div />
                    <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                      {logData.unilateral
                        ? t('workout.repsPerSideHeader')
                        : logData.reps_unit && logData.reps_unit !== 'reps'
                          ? t(`workout.repsUnitShort.${logData.reps_unit}`, {
                              defaultValue:
                                REPS_UNITS.find((u) => u.key === logData.reps_unit)?.short ||
                                t('workout.repsHeader'),
                            })
                          : t('workout.repsHeader')}
                      {suggestedRepsRaw && (
                        <span className="block font-normal normal-case text-primary-400">
                          {t('workout.suggestedShort', { value: displayReps(suggestedRepsRaw) })}
                        </span>
                      )}
                    </div>
                    {showWeightInputs && (
                      <div className="text-[10px] text-center text-gray-500 font-semibold uppercase tracking-wide">
                        {t('workout.weightKgHeader')}
                        {prescribedPct1rm && derivedKg == null ? (
                          <span className="block font-normal normal-case text-primary-400">
                            {t('workout.suggestedShort', {
                              value: `${prescribedPct1rm}% ${t('workout.ofYourMax')}`,
                            })}
                          </span>
                        ) : (
                          suggestedWeightsArr.some(Boolean) && (
                            <span className="block font-normal normal-case text-primary-400">
                              {t('workout.suggestedShort', {
                                value: suggestedWeightsArr.filter(Boolean).join(', '),
                              })}
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                  {/* Fila por serie */}
                  {Array.from({ length: actualSetsCount }, (_, i) => (
                    <div
                      key={i}
                      className={`grid gap-1.5 mb-1.5 items-center ${showWeightInputs ? 'grid-cols-[2rem_1fr_1fr]' : 'grid-cols-[2rem_1fr]'}`}
                    >
                      <div className="text-xs text-center text-gray-400 font-medium">{i + 1}</div>
                      <input
                        className="input text-sm text-center"
                        placeholder="—"
                        value={logData.actual_reps_arr[i] || ''}
                        onChange={(e) => handleRepsChange(i, e.target.value)}
                      />
                      {showWeightInputs && (
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="input text-sm text-center"
                          placeholder="kg"
                          value={logData.actual_weights_arr[i] || ''}
                          onChange={(e) => handleWeightChange(i, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                  {!showWeightInputs && (
                    <p className="text-[11px] text-emerald-600 mt-1.5 px-0.5">
                      {t('workout.bodyweightOnlyReps')}
                    </p>
                  )}
                  {/* Soft-warning inline si barbell_only + algún peso > 20 */}
                  {showWeightInputs &&
                    logData.weight_mode === 'barbell_only' &&
                    logData.actual_weights_arr.some((w) => parseFloat(w) > 20) && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
                        <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                          {t('workout.barbellWarnPrefix')}{' '}
                          <strong>{t('workout.barbellWarnMode')}</strong>{' '}
                          {t('workout.barbellWarnSuffix')}
                        </p>
                      </div>
                    )}
                </div>

                {/* PSE por ejercicio */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {t('workout.perceivedEffortPSE')}
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() =>
                          setLogData((p) => ({
                            ...p,
                            perceived_difficulty: p.perceived_difficulty === n ? null : n,
                          }))
                        }
                        className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                          logData.perceived_difficulty === n
                            ? pseColor(n)
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {t('workout.observations')}
                  </label>
                  <textarea
                    className="input text-sm resize-none"
                    rows={2}
                    placeholder={t('workout.howDidItGoPlaceholder')}
                    value={logData.notes}
                    onChange={(e) => setLogData((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                <button
                  onClick={() => attemptSave('edited')}
                  disabled={saving}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      {t('workout.markCompleted')}
                    </>
                  )}
                </button>
              </div>
            ) : isSkipped ? (
              <div className="bg-amber-50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                  <MinusCircle size={13} />
                  {t('workout.skippedCheck')}
                </p>
                {log?.skip_reason && (
                  <p className="text-xs text-amber-700">
                    {t(`workout.skipReason.${log.skip_reason}`)}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setPendingAction('reopen')}
                    className="text-xs text-amber-800 underline"
                  >
                    {t('workout.change')}
                  </button>
                  <span className="text-amber-300 text-xs">·</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 size={11} />
                    {t('workout.unmark')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-green-700 flex items-center gap-2">
                  {t('workout.completedCheck')}
                  {log?.entry_mode && (
                    <span className="badge bg-green-100 text-green-700 text-[10px] font-medium">
                      {t(`workout.entryMode.${log.entry_mode}`)}
                    </span>
                  )}
                </p>
                {(() => {
                  const repsArr = readLogReps(log).filter((r) => r != null && r !== '')
                  const wArr = readLogWeights(log).filter((w) => w != null && w !== '')
                  const repsLabel = log?.unilateral ? ` ${t('workout.perSide')}` : ''
                  const unitLabel =
                    log?.reps_unit && log.reps_unit !== 'reps'
                      ? ` ${t(`workout.repsUnitShort.${log.reps_unit}`, { defaultValue: log.reps_unit })}`
                      : ''
                  return (
                    <p className="text-xs text-green-600">
                      {[
                        log?.actual_sets && t('workout.series', { count: Number(log.actual_sets) }),
                        repsArr.length > 0 && `× ${repsArr.join(', ')}${unitLabel}${repsLabel}`,
                        wArr.length > 0 && t('workout.weightKg', { value: wArr.join(', ') }),
                        log?.weight_mode === 'bodyweight' &&
                          wArr.length === 0 &&
                          t('workout.noWeight'),
                        log?.weight_mode === 'barbell_only' && t('workout.barbellOnlyShort'),
                        log?.perceived_difficulty &&
                          t('workout.pseValue', { value: log.perceived_difficulty }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )
                })()}
                {log?.notes && <p className="text-xs text-green-600 italic">"{log.notes}"</p>}
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    onClick={() => setEditing(true)}
                    className="text-xs text-green-700 underline"
                  >
                    {t('workout.edit')}
                  </button>
                  <span className="text-green-300 text-xs">·</span>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 size={11} />
                    {t('workout.unmark')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
