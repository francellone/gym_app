import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { UserCheck, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchOneRmMap } from '@/features/evaluations/oneRm'

// ============================================================
// Previsualizar el plan "como [persona]" (%RM)
// ------------------------------------------------------------
// Problema que resuelve: al armar una PLANTILLA no hay persona, y los
// kilos de un ejercicio en %RM se derivan del 1RM de cada una. El coach
// prescribía a ciegas.
//
// La alternativa era invertir el flujo (asignar antes de armar); se
// descartó por diseño. En su lugar, el coach elige una persona para
// PREVISUALIZAR: el plan no cambia, solo se muestran los kilos que le
// tocarían a ella y qué ejercicios no tienen evaluación de 1RM.
//
// Mismo patrón que ExerciseCatalogContext: la fila de ejercicio está a
// 3 niveles de profundidad, drillear por props sería ruido puro.
// ============================================================

const EMPTY = {
  students: [],
  studentId: null,
  studentName: '',
  oneRmMap: null,
  loading: false,
  setStudentId: () => {},
}

const Pct1rmPreviewContext = createContext(EMPTY)

export function usePct1rmPreview() {
  return useContext(Pct1rmPreviewContext) || EMPTY
}

/**
 * Provider: mantiene la persona elegida y su mapa de 1RM.
 * Las personas se cargan una sola vez; el mapa, cada vez que cambia la elegida.
 */
export function Pct1rmPreviewProvider({ children }) {
  const [students, setStudents] = useState([])
  const [studentId, setStudentId] = useState(null)
  const [oneRmMap, setOneRmMap] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('profiles')
      .select('id, name, email')
      .eq('role', 'student')
      .order('name')
      .then(({ data }) => {
        if (!cancelled) setStudents(data || [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!studentId) {
      setOneRmMap(null)
      return
    }
    setLoading(true)
    fetchOneRmMap(supabase, studentId)
      .then((map) => {
        if (!cancelled) setOneRmMap(map)
      })
      .catch((err) => {
        console.error('No se pudieron leer los 1RM para la vista previa:', err)
        if (!cancelled) setOneRmMap(new Map())
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
      loading,
      setStudentId,
    }),
    [students, studentId, oneRmMap, loading]
  )

  return <Pct1rmPreviewContext.Provider value={value}>{children}</Pct1rmPreviewContext.Provider>
}

/**
 * Selector de la persona a previsualizar.
 * Se muestra solo si el plan usa %RM en algún lado (`visible`), para no
 * agregar un control que no hace nada en la mayoría de los planes.
 */
export function Pct1rmPreviewSelector({ visible = true }) {
  const { students, studentId, setStudentId, loading } = usePct1rmPreview()
  if (!visible) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <UserCheck size={15} className="text-amber-700 flex-shrink-0" />
        <p className="text-xs font-semibold text-amber-800">Ver los kilos como una persona</p>
        {loading && <Loader2 size={13} className="text-amber-600 animate-spin" />}
      </div>
      <select
        className="input text-sm"
        value={studentId || ''}
        onChange={(e) => setStudentId(e.target.value || null)}
      >
        <option value="">Sin previsualizar (se muestra el %)</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name || s.email}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-amber-700 mt-1.5 leading-snug">
        Solo cambia lo que ves acá: los ejercicios prescriptos por % del máximo muestran los kilos
        que le tocarían a esa persona, y cuáles todavía no tienen evaluación. El plan no se toca.
      </p>
    </div>
  )
}
