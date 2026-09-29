import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WelcomeMessageCard from './WelcomeMessageCard'

const created = {
  id: 'u1',
  name: 'Kendra Smith',
  email: 'kendra@mail.com',
  password: 'secret99',
  language: 'en',
}

describe('WelcomeMessageCard', () => {
  it('muestra el mensaje en el idioma de la persona, con usuario y contraseña', () => {
    render(
      <WelcomeMessageCard
        created={created}
        coachName="Anto Almanza"
        onViewProfile={() => {}}
        onCreateAnother={() => {}}
        onBack={() => {}}
      />
    )
    const box = screen.getByRole('textbox')
    expect(box.value).toMatch(/Hi Kendra!/)
    expect(box.value).toMatch(/Anto's training app/)
    expect(box.value).not.toMatch(/Almanza/)
    expect(box.value).toMatch(/User: kendra@mail\.com/)
    expect(box.value).toMatch(/Password: secret99/)
    expect(box.value).toMatch(/\/login/)
    const wa = screen.getByRole('link')
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=Hi%20Kendra/)
  })

  it('copia el mensaje al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <WelcomeMessageCard
        created={{ ...created, language: 'es' }}
        coachName="Anto"
        onViewProfile={() => {}}
        onCreateAnother={() => {}}
        onBack={() => {}}
      />
    )
    fireEvent.click(screen.getAllByRole('button')[0])
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toMatch(/Contraseña: secret99/)
  })

  it('los botones de salida llaman a su acción', () => {
    const onViewProfile = vi.fn()
    const onCreateAnother = vi.fn()
    const onBack = vi.fn()
    render(
      <WelcomeMessageCard
        created={created}
        coachName="Anto"
        onViewProfile={onViewProfile}
        onCreateAnother={onCreateAnother}
        onBack={onBack}
      />
    )
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1])
    fireEvent.click(buttons[2])
    fireEvent.click(buttons[3])
    expect(onViewProfile).toHaveBeenCalled()
    expect(onCreateAnother).toHaveBeenCalled()
    expect(onBack).toHaveBeenCalled()
  })
})
