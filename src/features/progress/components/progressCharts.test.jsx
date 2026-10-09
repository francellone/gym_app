import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '@/i18n'
import ChartHeader from './ChartHeader'
import { SetsTooltip } from './RepsWeightChart'

const t = i18n.t.bind(i18n)

describe('ChartHeader', () => {
  it('la "i" muestra y oculta la explicación, en párrafos', () => {
    render(<ChartHeader title="Volumen" subtitle="sub" info={'Primero.\n\nSegundo.'} />)
    expect(screen.queryByText('Primero.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cómo leer este dato' }))
    expect(screen.getByText('Primero.')).toBeTruthy()
    expect(screen.getByText('Segundo.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cómo leer este dato' }))
    expect(screen.queryByText('Primero.')).toBeNull()
  })
  it('sin info no hay botón', () => {
    render(<ChartHeader title="PSE" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('SetsTooltip (detalle de la sesión)', () => {
  const point = {
    best: 12,
    avg: 11.3,
    kg: 42.5,
    sets: [
      { reps: 12, kg: 40 },
      { reps: 10, kg: 42.5 },
    ],
  }
  it('muestra mejor serie, promedio, kilos y cada serie', () => {
    render(
      <SetsTooltip
        active
        label="01/10"
        payload={[{ payload: point }]}
        unitShort="reps"
        lang="es"
        t={t}
      />
    )
    expect(screen.getByText('Mejor serie: 12 reps')).toBeTruthy()
    expect(screen.getByText('Promedio por serie: 11,3 reps')).toBeTruthy()
    expect(screen.getByText('Kilos máx.: 42,5 kg')).toBeTruthy()
    expect(screen.getByText('2 series: 12 × 40 kg · 10 × 42,5 kg')).toBeTruthy()
  })
  it('peso corporal unilateral: sin kilos y aclara por lado', () => {
    render(
      <SetsTooltip
        active
        label="02/10"
        payload={[{ payload: { best: 10, avg: 9, kg: null, sets: [{ reps: 10 }, { reps: 8 }] } }]}
        unitShort="reps"
        unilateral
        lang="es"
        t={t}
      />
    )
    expect(screen.queryByText(/Kilos/)).toBeNull()
    expect(screen.getByText('2 series: 10 · 8 (por lado)')).toBeTruthy()
  })
})
