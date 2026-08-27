import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WellbeingStatusBadge from './WellbeingStatusBadge'
import WellbeingSummaryBlock from './WellbeingSummaryBlock'
import { computeWellbeingSummary } from '../wellbeingSummaryLogic'

// Fixtures en memoria: estos tests NO tocan Supabase.
const TODAY = new Date(2026, 7, 27)

const OK = {
  sleep_quality: 8,
  nutrition_quality: 7,
  hydration_quality: 7,
  energy_level: 8,
  stress_level: 3,
  muscle_fatigue: 3,
}
const log = (date, overrides = {}) => ({ user_id: 's1', date, ...OK, ...overrides })

const summaryOf = (logs, extra = {}) =>
  computeWellbeingSummary({ logs, to: '2026-08-27', today: TODAY, ...extra })

const renderBlock = (summary, props = {}) =>
  render(
    <MemoryRouter>
      <WellbeingSummaryBlock
        summary={summary}
        studentId="s1"
        periodLabel="Últimos 30 días"
        {...props}
      />
    </MemoryRouter>
  )

describe('WellbeingStatusBadge', () => {
  it('sin datos muestra "sin wellbeing"', () => {
    render(<WellbeingStatusBadge summary={summaryOf([])} />)
    expect(screen.getByText('sin wellbeing')).toBeInTheDocument()
  })

  it('con datos muestra cuándo fue el último registro', () => {
    render(<WellbeingStatusBadge summary={summaryOf([log('2026-08-26')])} />)
    expect(screen.getByText('ayer')).toBeInTheDocument()
  })

  it('en alerta expone el motivo en el title (tooltip)', () => {
    const logs = ['2026-08-24', '2026-08-25', '2026-08-26'].map((d) => log(d, { stress_level: 9 }))
    const { container } = render(<WellbeingStatusBadge summary={summaryOf(logs)} showLabel />)
    expect(screen.getByText('Alerta')).toBeInTheDocument()
    expect(container.querySelector('[title]').getAttribute('title')).toContain('estrés alto 3 días')
  })
})

describe('WellbeingSummaryBlock', () => {
  it('avisa cuando no hay registros en el período', () => {
    renderBlock(summaryOf([]))
    expect(screen.getByText(/Sin registros de wellbeing/i)).toBeInTheDocument()
  })

  it('muestra los promedios del período y el último valor de cada métrica', () => {
    renderBlock(
      summaryOf([log('2026-08-25', { energy_level: 6 }), log('2026-08-26', { energy_level: 8 })])
    )
    expect(screen.getByText('Energía')).toBeInTheDocument()
    // promedio de energía (6+8)/2 = 7.0 (otras métricas también promedian 7.0)
    expect(screen.getAllByText('7.0').length).toBeGreaterThan(0)
    // último valor con tendencia
    expect(screen.getAllByText('8').length).toBeGreaterThan(0)
    expect(screen.getByText(/Último:/)).toBeInTheDocument()
  })

  it('marca el registro cargado por el coach', () => {
    renderBlock(summaryOf([log('2026-08-26', { source: 'coach' })]))
    expect(screen.getByText('Coach')).toBeInTheDocument()
  })

  it('muestra el motivo del semáforo cuando hay señal sostenida', () => {
    const logs = ['2026-08-24', '2026-08-25', '2026-08-26'].map((d) =>
      log(d, { muscle_fatigue: 9 })
    )
    renderBlock(summaryOf(logs))
    expect(screen.getByText(/fatiga alta 3 días/)).toBeInTheDocument()
    expect(screen.getByText('Alerta')).toBeInTheDocument()
  })

  it('linkea a la pestaña Wellbeing del alumno', () => {
    renderBlock(summaryOf([log('2026-08-26')]))
    expect(screen.getByRole('link', { name: /Ver evolución/i })).toHaveAttribute(
      'href',
      '/coach/students/s1?tab=wellbeing'
    )
  })
})
