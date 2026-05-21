// ============================================================
// assignmentHelpers — tests de funciones puras
// ------------------------------------------------------------
// Este es el test "más fácil" del Tier 3.2: cero mocks de Supabase,
// cero React. Sirve para construir confianza en la setup de vitest
// antes de meternos en hooks y components.
//
// Cubre las piezas con más lógica:
//   - máquina de estados (canTransition, actionsForStatus)
//   - normalización defensiva (normalizePreferredDays)
//   - selección de plan primario (pickPrimaryTrainingAssignment)
//   - bucketeo de evaluaciones (groupEvaluationAssignments)
//   - date math (getExpectedSessionDates, computeWeekAdherence)
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  canTransition,
  actionsForStatus,
  ALLOWED_TRANSITIONS,
  normalizePreferredDays,
  formatPreferredDays,
  getAssignmentStatus,
  isActive,
  isLiveAssignment,
  isClosedAssignment,
  pickPrimaryTrainingAssignment,
  groupEvaluationAssignments,
  getExpectedSessionDates,
  computeWeekAdherence,
  startOfWeekMonday,
  endOfWeekSunday,
} from './assignmentHelpers'

describe('máquina de estados de plan_assignments', () => {
  it('canTransition respeta el mapa ALLOWED_TRANSITIONS', () => {
    // Las transiciones del mapa son legales
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransition(from, to)).toBe(true)
      }
    }
  })

  it('canTransition rechaza self-transition', () => {
    expect(canTransition('active', 'active')).toBe(false)
    expect(canTransition('paused', 'paused')).toBe(false)
  })

  it('canTransition rechaza null/undefined', () => {
    expect(canTransition(null, 'active')).toBe(false)
    expect(canTransition('active', null)).toBe(false)
    expect(canTransition(undefined, undefined)).toBe(false)
  })

  it('canTransition rechaza transiciones ilegales', () => {
    expect(canTransition('replaced', 'paused')).toBe(false) // solo 'active' permitido desde replaced
    expect(canTransition('completed', 'paused')).toBe(false)
    expect(canTransition('archived', 'replaced')).toBe(false)
  })

  it('actionsForStatus devuelve botones consistentes con las transiciones permitidas', () => {
    const activeActions = actionsForStatus('active')
    expect(activeActions.map((a) => a.toStatus).sort()).toEqual(['archived', 'completed', 'paused'])

    const pausedActions = actionsForStatus('paused')
    expect(pausedActions.map((a) => a.toStatus).sort()).toEqual(['active', 'archived', 'completed'])

    // Estados cerrados sólo permiten reactivar
    expect(actionsForStatus('replaced')).toEqual([
      { key: 'reactivate', label: 'Reactivar', tone: 'primary', toStatus: 'active' },
    ])
    expect(actionsForStatus('archived')[0].toStatus).toBe('active')
  })

  it('actionsForStatus devuelve [] para status desconocido', () => {
    expect(actionsForStatus('nonsense')).toEqual([])
    expect(actionsForStatus(null)).toEqual([])
  })
})

describe('getAssignmentStatus / isActive / isLiveAssignment / isClosedAssignment', () => {
  it('lee status explícito cuando viene', () => {
    expect(getAssignmentStatus({ status: 'paused' })).toBe('paused')
  })

  it('infiere desde el booleano legacy cuando no viene status', () => {
    expect(getAssignmentStatus({ active: true })).toBe('active')
    expect(getAssignmentStatus({ active: false })).toBe('archived')
  })

  it('devuelve null para asignación falsy', () => {
    expect(getAssignmentStatus(null)).toBeNull()
    expect(getAssignmentStatus(undefined)).toBeNull()
  })

  it('isLiveAssignment cubre active y paused, no los cerrados', () => {
    expect(isLiveAssignment({ status: 'active' })).toBe(true)
    expect(isLiveAssignment({ status: 'paused' })).toBe(true)
    expect(isLiveAssignment({ status: 'completed' })).toBe(false)
    expect(isLiveAssignment({ status: 'archived' })).toBe(false)
    expect(isLiveAssignment({ status: 'replaced' })).toBe(false)
  })

  it('isClosedAssignment es complementario a isLive', () => {
    for (const s of ['active', 'paused']) {
      expect(isClosedAssignment({ status: s })).toBe(false)
    }
    for (const s of ['replaced', 'completed', 'archived']) {
      expect(isClosedAssignment({ status: s })).toBe(true)
    }
  })

  it('isActive es estricto: solo true para status="active"', () => {
    expect(isActive({ status: 'active' })).toBe(true)
    expect(isActive({ status: 'paused' })).toBe(false)
  })
})

describe('normalizePreferredDays', () => {
  it('devuelve [] para input falsy', () => {
    expect(normalizePreferredDays(null)).toEqual([])
    expect(normalizePreferredDays(undefined)).toEqual([])
    expect(normalizePreferredDays('')).toEqual([])
  })

  it('parsea string JSON', () => {
    expect(normalizePreferredDays('[1,3,5]')).toEqual([1, 3, 5])
  })

  it('devuelve [] si el string no es JSON válido', () => {
    expect(normalizePreferredDays('lun-mie-vie')).toEqual([])
  })

  it('dedupea, ordena y filtra fuera-de-rango', () => {
    expect(normalizePreferredDays([3, 1, 1, 5, 8, -1, '2', 'x'])).toEqual([1, 2, 3, 5])
  })

  it('acepta array vacío', () => {
    expect(normalizePreferredDays([])).toEqual([])
  })
})

describe('formatPreferredDays', () => {
  it('devuelve string vacío para input vacío', () => {
    expect(formatPreferredDays(null)).toBe('')
    expect(formatPreferredDays([])).toBe('')
  })

  it('formato corto (default)', () => {
    expect(formatPreferredDays([1, 3, 5])).toBe('Lun · Mié · Vie')
  })

  it('formato largo cuando short=false', () => {
    expect(formatPreferredDays([1, 3], { short: false })).toBe('Lunes · Miércoles')
  })

  it('ordena aunque venga desordenado', () => {
    expect(formatPreferredDays([5, 1, 3])).toBe('Lun · Mié · Vie')
  })
})

describe('pickPrimaryTrainingAssignment', () => {
  // Helper para crear asignaciones rápido
  const make = (id, status, planType = 'training', createdAt = '2026-05-01') => ({
    id,
    status,
    plan_type: planType,
    created_at: createdAt,
  })

  it('devuelve null para lista vacía', () => {
    expect(pickPrimaryTrainingAssignment([])).toBeNull()
    expect(pickPrimaryTrainingAssignment(null)).toBeNull()
  })

  it('devuelve null si no hay training assignments', () => {
    expect(pickPrimaryTrainingAssignment([make('a', 'active', 'evaluation')])).toBeNull()
  })

  it('elige la active más reciente', () => {
    const result = pickPrimaryTrainingAssignment([
      make('old', 'active', 'training', '2026-04-01'),
      make('new', 'active', 'training', '2026-05-15'),
      make('paused', 'paused', 'training', '2026-05-20'),
    ])
    expect(result.id).toBe('new')
  })

  it('cae a paused si no hay active', () => {
    const result = pickPrimaryTrainingAssignment([
      make('done', 'completed', 'training', '2026-05-10'),
      make('p_old', 'paused', 'training', '2026-04-01'),
      make('p_new', 'paused', 'training', '2026-05-15'),
    ])
    expect(result.id).toBe('p_new')
  })

  it('ignora evaluations aunque sean más recientes', () => {
    const result = pickPrimaryTrainingAssignment([
      make('train', 'active', 'training', '2026-04-01'),
      make('eval', 'active', 'evaluation', '2026-05-20'),
    ])
    expect(result.id).toBe('train')
  })

  it('lee plan_type desde plan anidado si no está top-level', () => {
    const result = pickPrimaryTrainingAssignment([
      { id: 'nested', status: 'active', created_at: '2026-05-01', plan: { plan_type: 'training' } },
    ])
    expect(result?.id).toBe('nested')
  })
})

describe('groupEvaluationAssignments', () => {
  it('separa evaluaciones del plan activo, independientes e históricas', () => {
    const assignments = [
      { id: 'train', status: 'active', plan_type: 'training', created_at: '2026-05-01' },
      { id: 'eval-current', plan_type: 'evaluation', linked_assignment_id: 'train' },
      { id: 'eval-old', plan_type: 'evaluation', linked_assignment_id: 'other-plan' },
      { id: 'eval-indep', plan_type: 'evaluation', linked_assignment_id: null },
    ]

    const { ofCurrentPlan, independent, historical, activeTraining } =
      groupEvaluationAssignments(assignments)

    expect(activeTraining?.id).toBe('train')
    expect(ofCurrentPlan.map((e) => e.id)).toEqual(['eval-current'])
    expect(independent.map((e) => e.id)).toEqual(['eval-indep'])
    expect(historical.map((e) => e.id)).toEqual(['eval-old'])
  })

  it('si no hay training activo, todas las evals quedan en "historical" o "independent"', () => {
    const { ofCurrentPlan, independent, historical } = groupEvaluationAssignments([
      { id: 'e1', plan_type: 'evaluation', linked_assignment_id: 'phantom' },
      { id: 'e2', plan_type: 'evaluation', linked_assignment_id: null },
    ])
    expect(ofCurrentPlan).toHaveLength(0)
    expect(independent.map((e) => e.id)).toEqual(['e2'])
    expect(historical.map((e) => e.id)).toEqual(['e1'])
  })
})

describe('startOfWeekMonday / endOfWeekSunday', () => {
  // Lunes 2026-05-18, Domingo 2026-05-24
  it('lunes devuelve sí mismo', () => {
    const mon = new Date(2026, 4, 18) // 2026-05-18 (mayo es mes 4)
    const result = startOfWeekMonday(mon)
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(18)
  })

  it('domingo cae al lunes anterior', () => {
    const sun = new Date(2026, 4, 24) // 2026-05-24
    const result = startOfWeekMonday(sun)
    expect(result.getDay()).toBe(1)
    expect(result.getDate()).toBe(18)
  })

  it('endOfWeekSunday es el domingo de esa misma semana', () => {
    const wed = new Date(2026, 4, 20) // miércoles
    const sun = endOfWeekSunday(wed)
    expect(sun.getDay()).toBe(0)
    expect(sun.getDate()).toBe(24)
  })
})

describe('getExpectedSessionDates (modo fixed)', () => {
  // Asignación fixed lun/mié/vie, vigente toda la semana
  const fixed = {
    schedule_mode: 'fixed',
    preferred_days: [1, 3, 5],
    start_date: '2026-05-01',
    end_date: '2026-06-30',
  }

  it('devuelve lun, mié y vie de la semana solicitada', () => {
    const from = new Date(2026, 4, 18) // lun
    const to = new Date(2026, 4, 24) // dom
    const dates = getExpectedSessionDates(fixed, from, to)
    expect(dates).toEqual(['2026-05-18', '2026-05-20', '2026-05-22'])
  })

  it('respeta end_date de la asignación', () => {
    const early = { ...fixed, end_date: '2026-05-20' }
    const dates = getExpectedSessionDates(early, new Date(2026, 4, 18), new Date(2026, 4, 24))
    expect(dates).toEqual(['2026-05-18', '2026-05-20'])
  })

  it('modo flexible devuelve []', () => {
    const flex = { ...fixed, schedule_mode: 'flexible' }
    expect(getExpectedSessionDates(flex, new Date(2026, 4, 18), new Date(2026, 4, 24))).toEqual([])
  })

  it('sin preferred_days devuelve []', () => {
    const empty = { ...fixed, preferred_days: [] }
    expect(getExpectedSessionDates(empty, new Date(2026, 4, 18), new Date(2026, 4, 24))).toEqual([])
  })
})

describe('computeWeekAdherence', () => {
  const monday = new Date(2026, 4, 18) // 2026-05-18 (lun)

  it('inactive cuando la asignación no se solapa con la semana', () => {
    const future = {
      schedule_mode: 'fixed',
      preferred_days: [1, 3, 5],
      start_date: '2026-08-01',
      end_date: '2026-09-01',
    }
    const result = computeWeekAdherence(future, [], monday, monday)
    expect(result.status).toBe('inactive')
    expect(result.expectedCount).toBe(0)
  })

  describe('modo fixed', () => {
    const fixed = {
      schedule_mode: 'fixed',
      preferred_days: [1, 3, 5], // lun-mié-vie
      start_date: '2026-05-01',
      end_date: '2026-12-31',
    }

    it('good cuando cumple las 3', () => {
      const sessions = ['2026-05-18', '2026-05-20', '2026-05-22']
      // "Hoy" es lunes próximo, así que toda la semana ya pasó
      const today = new Date(2026, 4, 25)
      const result = computeWeekAdherence(fixed, sessions, monday, today)
      expect(result.status).toBe('good')
      expect(result.completedCount).toBe(3)
      expect(result.missedCount).toBe(0)
      expect(result.percentage).toBe(1)
    })

    it('partial cuando cumple 2/3 con semana ya terminada', () => {
      const sessions = ['2026-05-18', '2026-05-20']
      const today = new Date(2026, 4, 25)
      const result = computeWeekAdherence(fixed, sessions, monday, today)
      expect(result.status).toBe('partial')
      expect(result.completedCount).toBe(2)
      expect(result.missedCount).toBe(1)
    })

    it('poor cuando cumple <=50%', () => {
      const sessions = ['2026-05-18']
      const today = new Date(2026, 4, 25)
      const result = computeWeekAdherence(fixed, sessions, monday, today)
      expect(result.status).toBe('poor')
      expect(result.percentage).toBeLessThanOrEqual(0.5)
    })

    it('días futuros no cuentan como missed', () => {
      // Hoy es martes 19, sólo cumplí el lunes; miércoles y viernes son futuro
      const sessions = ['2026-05-18']
      const today = new Date(2026, 4, 19) // martes
      const result = computeWeekAdherence(fixed, sessions, monday, today)
      expect(result.pendingCount).toBe(2) // mié + vie
      expect(result.missedCount).toBe(0) // ni mié ni vie son missed todavía
    })
  })

  describe('modo flexible', () => {
    const flex = {
      schedule_mode: 'flexible',
      plan: { sessions_per_week: 3 },
      start_date: '2026-05-01',
      end_date: '2026-12-31',
    }

    it('good cuando cumple las 3 esperadas', () => {
      const sessions = ['2026-05-18', '2026-05-20', '2026-05-23']
      const today = new Date(2026, 4, 25)
      const result = computeWeekAdherence(flex, sessions, monday, today)
      expect(result.status).toBe('good')
      expect(result.percentage).toBe(1)
    })

    it('pending si la semana no terminó y no llegó al objetivo', () => {
      const sessions = ['2026-05-18']
      const today = new Date(2026, 4, 19) // martes, semana corriendo
      const result = computeWeekAdherence(flex, sessions, monday, today)
      expect(result.status).toBe('pending')
      expect(result.missedCount).toBe(0) // semana no terminó → no missed
    })

    it('partial cuando la semana terminó con 2/3', () => {
      const sessions = ['2026-05-18', '2026-05-20']
      const today = new Date(2026, 4, 25)
      const result = computeWeekAdherence(flex, sessions, monday, today)
      expect(result.status).toBe('partial')
      expect(result.missedCount).toBe(1)
    })

    it('no cuenta sesiones fuera del rango de la asignación', () => {
      const earlyEnd = { ...flex, end_date: '2026-05-19' }
      const sessions = ['2026-05-18', '2026-05-22'] // la del 22 cae fuera de end_date
      const today = new Date(2026, 4, 25)
      const result = computeWeekAdherence(earlyEnd, sessions, monday, today)
      expect(result.completedCount).toBe(1)
    })
  })
})
