import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  computePeriodRange,
  resolveDefaultPeriod,
  PERIOD_OPTIONS,
} from '../dashboardPeriods'

// ============================================================
// useCoachDashboardFilters
// ------------------------------------------------------------
// Maneja los 3 filtros globales del CoachDashboard:
//   - studentId  uuid | null   (null = "todos")
//   - planId     uuid | null   (null = "todos los planes" o
//                                 "todos los del alumno" si studentId set)
//   - periodKey  string        ('vigente' | '7d' | ... | 'all')
//
// Persistencia (decisión Franco 2026-05-23 doc 19 D3):
//   - URL params primero (?student=...&plan=...&period=...)
//   - localStorage backup (key 'coachDashboardFilters_v1')
//     Solo se restaura desde localStorage si la URL viene vacía
//     (refresh sin params manuales).
//
// Defaults (doc 19 D2):
//   - periodKey = 'vigente' si el alumno seleccionado tiene plan activo
//                de training; sino '30d'.
//   - Cuando NO hay studentId, periodKey default = '30d'.
//
// Datos derivados (no triggerean fetch del consumidor):
//   - studentOptions       todos los alumnos activos del coach
//   - planOptionsForStudent  plan_assignments del studentId actual
//                              (active + paused + replaced, no archived)
//   - selectedStudent      profile object del studentId actual
//   - selectedAssignment   plan_assignment del planId actual
//   - periodRange          { start, end } resuelto
// ============================================================

const STORAGE_KEY = 'coachDashboardFilters_v1'

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch (err) {
    console.warn('[useCoachDashboardFilters] storage parse', err)
  }
  return null
}

function writeStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (err) {
    console.warn('[useCoachDashboardFilters] storage write', err)
  }
}

export default function useCoachDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Inicialización: URL primero, sino localStorage, sino defaults.
  const initial = useMemo(() => {
    const urlStudent = searchParams.get('student')
    const urlPlan = searchParams.get('plan')
    const urlPeriod = searchParams.get('period')

    const fromUrl = urlStudent || urlPlan || urlPeriod
    if (fromUrl) {
      return {
        studentId: urlStudent || null,
        planId: urlPlan || null,
        periodKey: urlPeriod || null, // lo resolveremos cuando sepamos si hay plan
      }
    }
    const stored = readStorage()
    if (stored) {
      return {
        studentId: stored.studentId || null,
        planId: stored.planId || null,
        periodKey: stored.periodKey || null,
      }
    }
    return { studentId: null, planId: null, periodKey: null }
    // Solo inicializamos una vez — los cambios posteriores no deben re-leer URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [studentId, setStudentIdState] = useState(initial.studentId)
  const [planId, setPlanIdState] = useState(initial.planId)
  const [periodKey, setPeriodKeyState] = useState(initial.periodKey)

  // ── Fetch de opciones ────────────────────────────────────────
  const [studentOptions, setStudentOptions] = useState([])
  const [allAssignments, setAllAssignments] = useState([])
  const [loadingOptions, setLoadingOptions] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingOptions(true)
      try {
        // Alumnos activos del coach (RLS limita al coach autenticado).
        const [studentsRes, assignmentsRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, name, avatar_url, active')
            .eq('role', 'student')
            .eq('active', true)
            .order('name', { ascending: true }),
          supabase
            .from('plan_assignments')
            .select(
              'id, plan_id, student_id, status, plan_type, start_date, end_date, schedule_mode, preferred_days, plan:plans!plan_id(title, plan_type, sessions_per_week)'
            )
            .neq('status', 'archived')
            .order('created_at', { ascending: false }),
        ])
        if (cancelled) return
        setStudentOptions(studentsRes.data || [])
        setAllAssignments(assignmentsRes.data || [])
      } catch (err) {
        console.error('[useCoachDashboardFilters] load options', err)
        if (!cancelled) {
          setStudentOptions([])
          setAllAssignments([])
        }
      } finally {
        if (!cancelled) setLoadingOptions(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Plan options para el studentId actual (mostradas en el dropdown plan).
  const planOptionsForStudent = useMemo(() => {
    if (!studentId) return []
    return allAssignments.filter((a) => a.student_id === studentId)
  }, [allAssignments, studentId])

  const selectedStudent = useMemo(
    () => studentOptions.find((s) => s.id === studentId) || null,
    [studentOptions, studentId]
  )

  const selectedAssignment = useMemo(
    () => allAssignments.find((a) => a.id === planId) || null,
    [allAssignments, planId]
  )

  // Asignación activa de training del alumno seleccionado (para defaults).
  const activeTrainingAssignment = useMemo(() => {
    if (!studentId) return null
    return (
      allAssignments.find(
        (a) =>
          a.student_id === studentId &&
          a.status === 'active' &&
          (a.plan_type || a.plan?.plan_type || 'training') === 'training'
      ) || null
    )
  }, [allAssignments, studentId])

  // Resolver periodKey si todavía no fue elegido (default según contexto).
  const resolvedPeriodKey = useMemo(() => {
    if (periodKey) return periodKey
    return resolveDefaultPeriod({ hasActivePlan: !!activeTrainingAssignment })
  }, [periodKey, activeTrainingAssignment])

  // Para 'vigente', usamos el plan SELECCIONADO si hay, sino el activo.
  const periodPlanReference = selectedAssignment || activeTrainingAssignment

  const periodRange = useMemo(
    () =>
      computePeriodRange({
        periodKey: resolvedPeriodKey,
        planAssignment: periodPlanReference,
      }),
    [resolvedPeriodKey, periodPlanReference]
  )

  // ── Sincronización URL + storage ─────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    let dirty = false
    function setOrDelete(key, value) {
      if (value) {
        if (params.get(key) !== value) {
          params.set(key, value)
          dirty = true
        }
      } else if (params.has(key)) {
        params.delete(key)
        dirty = true
      }
    }
    setOrDelete('student', studentId)
    setOrDelete('plan', planId)
    setOrDelete('period', periodKey)
    if (dirty) setSearchParams(params, { replace: true })

    writeStorage({ studentId, planId, periodKey })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, planId, periodKey])

  // ── Setters (mantienen consistencia) ─────────────────────────
  const setStudent = useCallback(
    (id) => {
      setStudentIdState(id || null)
      // Cambiar de alumno invalida el plan seleccionado (puede no pertenecerle).
      setPlanIdState((current) => {
        if (!current) return current
        const stillValid = allAssignments.some((a) => a.id === current && a.student_id === id)
        return stillValid ? current : null
      })
    },
    [allAssignments]
  )

  const setPlan = useCallback((id) => {
    setPlanIdState(id || null)
  }, [])

  const setPeriod = useCallback((key) => {
    setPeriodKeyState(key || null)
  }, [])

  const clearAll = useCallback(() => {
    setStudentIdState(null)
    setPlanIdState(null)
    setPeriodKeyState(null)
  }, [])

  return {
    // Estado actual (con default resuelto en periodKey)
    studentId,
    planId,
    periodKey: resolvedPeriodKey,
    periodRange,

    // Setters
    setStudent,
    setPlan,
    setPeriod,
    clearAll,

    // Datos derivados / opciones
    studentOptions,
    planOptionsForStudent,
    selectedStudent,
    selectedAssignment,
    activeTrainingAssignment,
    loadingOptions,

    // Constantes para la UI
    periodOptions: PERIOD_OPTIONS,
  }
}
