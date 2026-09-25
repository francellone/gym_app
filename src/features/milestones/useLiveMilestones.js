// ============================================================
// useLiveMilestones — hitos en vivo desde Entrenar (Etapa 3)
// ------------------------------------------------------------
// Mira el mapa de estados del día de la fecha que se está cargando. Cuando
// un día pasa a CERRADO (complete o partial) por una acción de la persona
// (o de la coach en modo coach), otorga los hitos que correspondan: día,
// semana y plan. Muestra el de más nivel si hay CelebrationProvider (la
// persona); en modo coach solo los otorga y quedan pendientes.
//
// Reglas de disparo:
//   - Solo transiciones, nunca al cargar: el primer mapa de cada fecha se
//     toma como punto de partida.
//   - Solo si hubo un guardado hace menos de 15 s (markUserAction): una
//     recarga que trae datos de otro dispositivo no celebra.
//   - Espera 1,2 s y revisa que el día siga cerrado: el guardado es
//     optimista y puede revertirse si la base lo rechaza.
// ============================================================
import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { isDayStateClosed } from '@/features/workouts/completionRules'
import { awardMilestone, fetchPlanActivity } from './api'
import {
  computeLiveCandidates,
  pickTopCelebration,
  toCelebration,
  withStreak,
} from './celebrationModel'
import { detectStreakMilestones } from './milestoneRules'
import { loadStreakState } from './streak'
import { useCelebrations } from './celebrationContextValue'

const ACTION_WINDOW_MS = 15000
const SETTLE_MS = 1200

export function useLiveMilestones({
  studentId,
  assignment,
  blocksBySection,
  dayStateMap,
  selectedDate,
  loading,
}) {
  const { enabled, celebrate, setStreak } = useCelebrations()
  const prevRef = useRef({ date: null, states: null })
  const latestRef = useRef({ date: null, states: null })
  const actionAtRef = useRef(0)
  const timersRef = useRef([])
  const ctxRef = useRef({})
  useEffect(() => {
    ctxRef.current = { studentId, assignment, blocksBySection, enabled, celebrate, setStreak }
  }, [studentId, assignment, blocksBySection, enabled, celebrate, setStreak])

  const markUserAction = useCallback(() => {
    actionAtRef.current = Date.now()
  }, [])

  useEffect(
    () => () => {
      for (const id of timersRef.current) clearTimeout(id)
      timersRef.current = []
    },
    []
  )

  useEffect(() => {
    latestRef.current = { date: selectedDate, states: dayStateMap }
    if (loading) return
    const prev = prevRef.current
    prevRef.current = { date: selectedDate, states: dayStateMap }
    if (prev.date !== selectedDate || !prev.states) return
    if (Date.now() - actionAtRef.current > ACTION_WINDOW_MS) return

    const dayId = Object.keys(dayStateMap || {}).find(
      (id) => isDayStateClosed(dayStateMap[id]) && !isDayStateClosed(prev.states[id])
    )
    if (!dayId) return
    const prevStates = prev.states
    const date = selectedDate

    const timer = setTimeout(async () => {
      const latest = latestRef.current
      if (latest.date !== date || !isDayStateClosed(latest.states?.[dayId])) return
      const { studentId: sid, assignment: a, blocksBySection: bbs } = ctxRef.current
      if (!sid || !a?.plan_id) return
      try {
        const activity = await fetchPlanActivity(supabase, {
          studentId: sid,
          planId: a.plan_id,
          fromDate: a.start_date,
        })
        const candidates = computeLiveCandidates({
          dayId,
          date,
          prevStates,
          nextStates: latest.states,
          assignment: a,
          blocksBySection: bbs,
          activity,
          today: new Date(),
        })
        const awarded = []
        for (const c of candidates) {
          const res = await awardMilestone(supabase, sid, c)
          if (res.isNew) awarded.push(res)
        }
        // Etapa 5: si se cerró la semana, la racha cambia. Se recalcula,
        // se otorga su hito si corresponde y se muestra DENTRO de la hoja
        // de semana (no como otra hoja).
        const weekCand = candidates.find((c) => c.kind === 'week_complete')
        let streakState = null
        let streakNew = false
        if (weekCand) {
          try {
            streakState = await loadStreakState(supabase, sid)
            ctxRef.current.setStreak?.(streakState)
            for (const c of detectStreakMilestones(streakState, streakState.weeks)) {
              const res = await awardMilestone(supabase, sid, c)
              if (res.isNew && c.kind === 'streak') streakNew = true
            }
          } catch (err) {
            console.warn('[celebrations] no se pudo actualizar la racha:', err)
          }
        }
        const { enabled: on, celebrate: show } = ctxRef.current
        if (!on || awarded.length === 0) return
        const items = awarded.map((m) => {
          const c = toCelebration(m, { studentId: sid })
          return c?.kind === 'week_complete'
            ? withStreak(c, streakState, { streakMilestoneNew: streakNew })
            : c
        })
        const top = pickTopCelebration(items)
        if (top) show(top)
      } catch (err) {
        console.warn('[celebrations] no se pudieron registrar los hitos:', err)
      }
    }, SETTLE_MS)
    timersRef.current.push(timer)
  }, [dayStateMap, selectedDate, loading])

  return { markUserAction, celebrationsEnabled: enabled }
}
