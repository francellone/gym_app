import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { UserCheck, Loader2, Users } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { fetchOneRmMap } from '@/features/evaluations/oneRm'
import { fetchExerciseHistory } from './studentExerciseHistory'

// ============================================================
// ¿Para quién es este plan?
// ------------------------------------------------------------
// Los datos dicen que la "plantilla" es casi siempre de UNA persona
// (31 de 41 plantillas de entrenamiento las usa una sola). Así que
// preguntar por la persona al principio no es un lujo: es cómo se
// trabaja de verdad.
//
// Elegirla no asigna nada ni le pone dueño al plan: el flujo
// plantilla → asignar queda igual. Lo único que cambia es que, mientras
// armás, cada ejercicio muestra los datos REALES de esa persona:
//   · su 1RM, para derivar los kilos de un ejercicio en %RM
//   · con cuánto viene cargando y su máximo, prescribas en kilos o en %
//
// Antes esto era un "previsualizar como" perdido arriba de los bloques:
// al scrollear se perdía de vista. Ahora se elige antes del primer
// ejercicio y el dato viaja en cada fila.
//
// Mismo patrón que ExerciseCatalogContext: la fila está a 3 niveles de
// profundidad, drillear por props sería ruido puro.
// ============================================================

// Recordar la última persona elegida mientras dura la sesión del navegador:
// la coach suele armar varios planes seguidos de la misma persona.
const STORAGE_KEY = 'planTargetPersonId'

function readRemembered() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

function remember(id) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Modo privado o storage bloqueado: no pasa nada, solo no se recuerda.
  }
}

const EMPTY = {
  students: [],
  studentId: null,
  studentName: '',
  oneRmMap: null,
  historyMap: null,
  loading: false,
  setStudentId: () => {},
  basic: false,
}

const PlanTargetPersonContext = createContext(EMPTY)

export function usePlanTargetPerson() {
  return useContext(PlanTargetPersonContext) || EMPTY
}

// fixedStudentId: la persona arma su propio plan (v68). No se elige a nadie:
// los datos que se muestran son los suyos. basic: armador sin %RM (la persona
// sin coach arma "lo básico": series, repeticiones, peso, descanso, notas).
export function PlanTargetPersonProvider({ children, fixedStudentId = null, basic = false }) {
  const [students, setStudents] = useState([])
  const [studentIdState, setStudentIdState] = useState(() =>
    fixedStudentId ? null : readRemembered()
  )
  const studentId = fixedStudentId || studentIdState
  const [oneRmMap, setOneRmMap] = useState(null)
  const [historyMap, setHistoryMap] = useState(null)
  const [loading, setLoading] = useState(false)

  function setStudentId(id) {
    setStudentIdState(id || null)
    remember(id)
  }

  useEffect(() => {
    let cancelled = false
    if (fixedStudentId) return undefined
    supabase
      .from('profiles')
      .select('id, name, email, active')
      .eq('role', 'student')
      .order('name')
      .then(({ data }) => {
        if (!cancelled) setStudents(data || [])
      })
    return () => {
      cancelled = true
    }
  }, [fixedStudentId])

  useEffect(() => {
    let cancelled = false
    if (!studentId) {
      setOneRmMap(null)
      setHistoryMap(null)
      return
    }
    setLoading(true)
    Promise.all([fetchOneRmMap(supabase, studentId), fetchExerciseHistory(supabase, studentId)])
      .then(([rm, hist]) => {
        if (cancelled) return
        setOneRmMap(rm)
        setHistoryMap(hist)
      })
      .catch((err) => {
        // Si falla, se sigue armando el plan igual: los datos de la persona
        // son contexto, no un requisito.
        console.error('No se pudieron leer los datos de la persona:', err)
        if (!cancelled) {
          setOneRmMap(new Map())
          setHistoryMap(new Map())
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studentId])

  const value = useMemo(
    () => ({
      students,
      studentId,
      studentName: students.find((s) => s.id === studentId)?.name || '',
      oneRmMap,
      historyMap,
      loading,
      setStudentId,
      basic,
    }),
    [students, studentId, oneRmMap, historyMap, loading, basic]
  )

  return (
    <PlanTargetPersonContext.Provider value={value}>{children}</PlanTargetPersonContext.Provider>
  )
}

/**
 * La pregunta del primer paso, dentro de "Información del plan".
 * No asigna nada: solo decide qué datos se muestran mientras armás.
 */
export function PlanTargetPersonPicker({ locked = false }) {
  const { t } = useTranslation()
  const { students, studentId, studentName, setStudentId, loading } = usePlanTargetPerson()
  // v40: personas inactivas ocultas por defecto; la seleccionada se
  // muestra siempre para no romper un plan que ya la tenía elegida.
  const [showInactive, setShowInactive] = useState(false)
  const visibleStudents = students.filter(
    (s) => showInactive || s.active !== false || s.id === studentId
  )
  const hasInactive = students.some((s) => s.active === false)

  // Plan personal ya asignado: la persona no se elige, viene dada.
  if (locked) {
    return (
      <div>
        <label className="label">{t('coach.planEditor.targetPerson.planFor')}</label>
        <p className="flex items-center gap-2 text-sm font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
          <UserCheck size={15} className="text-emerald-600 flex-shrink-0" />
          {studentName || t('coach.planEditor.targetPerson.loading')}
          {loading && <Loader2 size={13} className="text-gray-400 animate-spin" />}
        </p>
        <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">
          {t('coach.planEditor.targetPerson.lockedHint')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <label className="label">{t('coach.planEditor.targetPerson.question')}</label>
      <div className="relative">
        <select
          className="input"
          value={studentId || ''}
          onChange={(e) => setStudentId(e.target.value || null)}
        >
          <option value="">{t('coach.planEditor.targetPerson.generic')}</option>
          {visibleStudents.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || s.email}
              {s.active === false ? t('coach.planEditor.targetPerson.inactiveSuffix') : ''}
            </option>
          ))}
        </select>
        {loading && (
          <Loader2
            size={14}
            className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 animate-spin"
          />
        )}
      </div>
      {hasInactive && (
        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          {t('coach.planEditor.targetPerson.showInactive')}
        </label>
      )}
      {studentId ? (
        <p className="text-[11px] text-emerald-700 mt-1.5 flex items-start gap-1.5 leading-snug">
          <UserCheck size={13} className="mt-px flex-shrink-0" />
          <span>
            <Trans
              i18nKey="coach.planEditor.targetPerson.selectedHint"
              values={{ name: studentName }}
              components={{ b: <strong className="font-semibold" /> }}
            />
          </span>
        </p>
      ) : (
        <p className="text-[11px] text-gray-500 mt-1.5 flex items-start gap-1.5 leading-snug">
          <Users size={13} className="mt-px flex-shrink-0" />
          <span>{t('coach.planEditor.targetPerson.genericHint')}</span>
        </p>
      )}
    </div>
  )
}
