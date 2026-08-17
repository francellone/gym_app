/**
 * Aviso en el ARMADOR: si todas las preguntas quedan para un solo idioma, el
 * formulario le llega vacío a las alumnas del otro (bug de agosto 2026). El
 * cartel tiene que aparecer donde se comete el error, no recién al enviar.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createSupabaseMock } from '@/test/mocks/supabase'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  supabaseIsolated: supabaseMock,
}))
vi.mock('@/features/forms/hooks/useCoachFormLanguages', () => ({
  useCoachFormLanguages: () => ({ bilingual: true }),
}))

const { default: FormBuilder } = await import('./FormBuilder')

function config({ hiddenFor } = {}) {
  return {
    intro: { content: 'Hola' },
    modules: [
      {
        id: 'm1',
        title: 'Bloque principal',
        emoji: '💪',
        order: 1,
        enabled: true,
        editable: true,
        questions: [
          {
            id: 'q1',
            type: 'text',
            label: '¿Cómo venís?',
            ...(hiddenFor ? { hidden_for: hiddenFor } : {}),
          },
        ],
      },
    ],
  }
}

function renderBuilder(initialConfig) {
  return render(<FormBuilder coachId="c1" initialConfig={initialConfig} formKind="follow_up" />)
}

describe('FormBuilder — aviso de formulario vacío por idioma', () => {
  it('avisa cuando todas las preguntas quedaron para el otro idioma', () => {
    renderBuilder(config({ hiddenFor: ['es'] }))
    expect(screen.getByText(/llegaría VACÍO a tus alumnas en español/i)).toBeInTheDocument()
  })

  it('no molesta cuando las preguntas se muestran a todas', () => {
    renderBuilder(config())
    expect(screen.queryByText(/llegaría VACÍO/i)).not.toBeInTheDocument()
  })

  it('no avisa en un formulario todavía sin preguntas', () => {
    renderBuilder({
      intro: { content: 'Hola' },
      modules: [{ id: 'm1', title: 'Vacío', order: 1, enabled: true, questions: [] }],
    })
    expect(screen.queryByText(/llegaría VACÍO/i)).not.toBeInTheDocument()
  })
})
