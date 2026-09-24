// ============================================================
// CelebrationContext — cola de celebraciones de la persona (Etapa 3)
// ------------------------------------------------------------
// Vive en StudentLayout. Fuera de él (modo coach) el contexto por
// defecto no muestra nada: la coach nunca ve celebraciones, y los hitos
// que otorga por la persona quedan pendientes en la base.
//
// Al montar:
//   1) trae los hitos pendientes (celebrated_at NULL) y los encola;
//   2) si el plan activo ya venció y no tiene su hito, lo otorga
//      (criterio combinado de fin de plan, rama "expired").
// `hold` frena la cola mientras otra ventana ocupa la pantalla (el modal
// de esfuerzo del día en Entrenar).
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import CelebrationOverlay from './components/CelebrationOverlay'
import { CelebrationContext } from './celebrationContextValue'
import {
  awardMilestone,
  fetchPendingMilestones,
  fetchPlanActivity,
  hasMilestone,
  markMilestonesCelebrated,
} from './api'
import {
  activeDaysOf,
  buildBlocksBySection,
  enrichPlanCandidate,
  toCelebration,
} from './celebrationModel'
import { closedSessionDates, detectPlanMilestone } from './milestoneRules'

async function checkExpiredPlan(studentId) {
  const { data: assignments, error } = await supabase
    .from('plan_assignments')
    .select('*, plan:plans!plan_id(*)')
    .eq('student_id', studentId)
    .eq('active', true)
  if (error) throw error
  const a = (assignments || []).find((x) => !x.plan?.plan_type || x.plan.plan_type === 'training')
  if (!a?.expected_end_date) return null
  const today = new Date()
  if (new Date(`${a.expected_end_date}T23:59:59`) >= today) return null
  if (await hasMilestone(supabase, studentId, 'plan_complete', String(a.id))) return null

  const [exRes, blRes, activity] = await Promise.all([
    supabase.from('plan_exercises').select('*').eq('plan_id', a.plan_id),
    supabase.from('plan_blocks').select('*').eq('plan_id', a.plan_id),
    fetchPlanActivity(supabase, { studentId, planId: a.plan_id, fromDate: a.start_date }),
  ])
  const blocksBySection = buildBlocksBySection(exRes.data, blRes.data)
  const closedDates = closedSessionDates({
    activeDays: activeDaysOf(blocksBySection),
    blocksBySection,
    logs: activity.logs,
    blockLogs: activity.blockLogs,
  })
  const cand = detectPlanMilestone({ assignment: a, closedDates, today })
  if (!cand) return null
  const res = await awardMilestone(
    supabase,
    studentId,
    enrichPlanCandidate(cand, { assignment: a, closedDates, today })
  )
  return res.isNew ? res : null
}

export function CelebrationProvider({ studentId, children }) {
  const [queue, setQueue] = useState([])
  const [hold, setHold] = useState(false)
  const bootedRef = useRef(null)

  const celebrate = useCallback((item) => {
    if (item) setQueue((q) => (q.some((x) => x.id && x.id === item.id) ? q : [...q, item]))
  }, [])

  useEffect(() => {
    if (!studentId || bootedRef.current === studentId) return undefined
    bootedRef.current = studentId
    let cancelled = false
    ;(async () => {
      try {
        const pending = await fetchPendingMilestones(supabase, studentId)
        if (cancelled) return
        for (const m of pending) {
          const c = toCelebration(m, { studentId })
          if (c) celebrate({ ...c, markOnDismiss: true })
        }
      } catch (err) {
        console.warn('[celebrations] no se pudieron leer los hitos pendientes:', err)
      }
      try {
        const planM = await checkExpiredPlan(studentId)
        if (!cancelled && planM) celebrate(toCelebration(planM, { studentId }))
      } catch (err) {
        console.warn('[celebrations] no se pudo revisar el fin de plan:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [studentId, celebrate])

  const current = hold ? null : queue[0] || null

  const dismiss = useCallback(() => {
    setQueue((q) => {
      const [head, ...rest] = q
      if (head?.markOnDismiss && head.id) {
        markMilestonesCelebrated(supabase, [head.id]).catch((err) =>
          console.warn('[celebrations] no se pudo marcar como vista:', err)
        )
      }
      return rest
    })
  }, [])

  const value = useMemo(() => ({ enabled: true, celebrate, setHold }), [celebrate])

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      <CelebrationOverlay
        key={current?.id || current?.kind || 'none'}
        item={current}
        onDismiss={dismiss}
      />
    </CelebrationContext.Provider>
  )
}
