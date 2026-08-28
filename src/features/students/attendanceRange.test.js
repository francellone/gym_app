// ============================================================
// El rango que se le pide a la base tiene que cubrir TODA la grilla dibujada.
// ------------------------------------------------------------
// Regresión 2026-08-28: el heatmap de asistencia dibujaba 8 semanas pero se
// pintaba con las fechas recortadas por el filtro de período; con "1m" las
// semanas 5–8 salían siempre grises. Estos tests fijan el invariante para que
// un cambio futuro rompa acá y no aparezca como ausencias falsas en la app.
// ============================================================
import { describe, it, expect } from 'vitest'
import { format } from 'date-fns'
import { ATTENDANCE_WEEKS, attendanceWeeks, attendanceRangeStart } from './attendanceRange'

// Lunes, miércoles y domingo: el corte por startOfWeek es lo que más fácil se
// escapa por un día.
const DIAS = ['2026-08-24T12:00:00', '2026-08-26T12:00:00', '2026-08-30T12:00:00']

describe('rango de asistencia', () => {
  it('dibuja exactamente ATTENDANCE_WEEKS semanas de 7 días', () => {
    const semanas = attendanceWeeks(new Date('2026-08-28T12:00:00'))
    expect(semanas).toHaveLength(ATTENDANCE_WEEKS)
    expect(semanas.every((w) => w.length === 7)).toBe(true)
  })

  it('ordena de la semana más vieja a la más nueva', () => {
    const semanas = attendanceWeeks(new Date('2026-08-28T12:00:00'))
    const primeros = semanas.map((w) => format(w[0], 'yyyy-MM-dd'))
    expect([...primeros].sort()).toEqual(primeros)
  })

  it('incluye el día de hoy en la última semana', () => {
    for (const dia of DIAS) {
      const hoy = new Date(dia)
      const ultima = attendanceWeeks(hoy).at(-1).map((d) => format(d, 'yyyy-MM-dd'))
      expect(ultima).toContain(format(hoy, 'yyyy-MM-dd'))
    }
  })

  it('ninguna celda de la grilla queda antes del rango pedido', () => {
    for (const dia of DIAS) {
      const hoy = new Date(dia)
      const desde = attendanceRangeStart(hoy)
      const dias = attendanceWeeks(hoy)
        .flat()
        .map((d) => format(d, 'yyyy-MM-dd'))
      expect(dias.every((d) => d >= desde)).toBe(true)
      expect(dias[0]).toBe(desde)
    }
  })

  it('el rango empieza un lunes', () => {
    for (const dia of DIAS) {
      // getDay(): 1 = lunes
      expect(attendanceWeeks(new Date(dia))[0][0].getDay()).toBe(1)
    }
  })
})
