// ============================================================
// usePersonalBests — detección de mejores marcas al guardar (Etapa 4)
// ------------------------------------------------------------
// Se llama por detrás después de que save_workout_log confirmó (con el id
// real del registro). Reglas en milestoneRules.detectPersonalBest:
// supera estrictamente el máximo previo, con al menos 3 registros previos,
// sin contar omitidos ni marcas anuladas.
//
// Además mantiene la coherencia cuando la persona CORRIGE un registro que
// ya era marca: si con el valor nuevo deja de serlo, la marca se anula
// sola (motivo 'corrected').
//
// Una celebración por día: solo la primera marca del día se muestra; las
// siguientes quedan registradas en silencio.
// ============================================================
import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  awardMilestone,
  countBestsSince,
  fetchBestForLog,
  fetchExerciseHistory,
  fetchVoidedBestLogIds,
  voidPersonalBest,
} from './api'
import { bestCelebrationMode, detectPersonalBest } from './milestoneRules'
import { toCelebration } from './celebrationModel'
import { useCelebrations } from './celebrationContextValue'

function startOfTodayIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function usePersonalBests({ studentId }) {
  const { enabled, celebrate } = useCelebrations()
  const ctxRef = useRef({})
  useEffect(() => {
    ctxRef.current = { studentId, enabled, celebrate }
  }, [studentId, enabled, celebrate])

  // log: fila (proyectada o real) con id, logged_date y los arrays de
  // registro. planEx: el plan_exercise (para exercise_id y el nombre).
  const checkBest = useCallback(async ({ log, planEx, exerciseName }) => {
    const { studentId: sid, enabled: on, celebrate: show } = ctxRef.current
    const exerciseId = planEx?.exercise_id ?? planEx?.exercise?.id
    if (!sid || !log?.id || !exerciseId || !log.logged_date) return
    try {
      const [history, voided, existing] = await Promise.all([
        fetchExerciseHistory(supabase, { studentId: sid, exerciseId, beforeDate: log.logged_date }),
        fetchVoidedBestLogIds(supabase, { studentId: sid, exerciseId }),
        fetchBestForLog(supabase, { studentId: sid, logId: log.id }),
      ])
      const candidate = detectPersonalBest({ log, history, voidedLogIds: voided })

      if (existing) {
        // Ya era marca: si la corrección la bajó, se anula sola.
        if (!existing.voided_at && !candidate) {
          await voidPersonalBest(supabase, existing.id, 'corrected')
        }
        return
      }
      if (!candidate) return

      const res = await awardMilestone(supabase, sid, {
        ...candidate,
        payload: {
          ...candidate.payload,
          exercise_name: exerciseName ?? null,
          plan_exercise_id: planEx?.id ?? null,
        },
      })
      if (!res.isNew || !on) return
      const already = await countBestsSince(supabase, {
        studentId: sid,
        sinceIso: startOfTodayIso(),
        excludeId: res.id,
      })
      if (bestCelebrationMode({ bestsAlreadyToday: already }) !== 'toast') return
      const item = toCelebration(res, { studentId: sid })
      if (item) show(item)
    } catch (err) {
      console.warn('[celebrations] no se pudo revisar la mejor marca:', err)
    }
  }, [])

  return { checkBest }
}
