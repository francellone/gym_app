import { describe, expect, it } from 'vitest'
import { buildWelcomeMessage, loginUrl, whatsappShareUrl } from './welcomeMessage'

const base = {
  name: 'Ana María López',
  coachName: 'Anto',
  email: ' ana@mail.com ',
  password: 'clave123',
  origin: 'https://gym-appv2.vercel.app/',
}

describe('mensaje de bienvenida', () => {
  it('arma el link de login sin barras dobles', () => {
    expect(loginUrl('https://x.app/')).toBe('https://x.app/login')
    expect(loginUrl('https://x.app')).toBe('https://x.app/login')
  })

  it('en español lleva nombre de pila, coach, link, usuario y contraseña', () => {
    const m = buildWelcomeMessage({ ...base, lang: 'es' })
    expect(m).toContain('Ana')
    expect(m).not.toContain('María')
    expect(m).toContain('Anto')
    expect(m).toContain('https://gym-appv2.vercel.app/login')
    expect(m).toContain('ana@mail.com')
    expect(m).toContain('Usuario: ana@mail.com\n')
    expect(m).toContain('clave123')
    expect(m).toMatch(/Contraseña/)
  })

  it('sale en el idioma de la persona, no en el del panel', () => {
    const m = buildWelcomeMessage({ ...base, lang: 'en' })
    expect(m).toMatch(/Password/)
    expect(m).not.toMatch(/Contraseña/)
    expect(m).toContain('clave123')
  })

  it('sin nombre de coach no deja huecos', () => {
    const m = buildWelcomeMessage({ ...base, coachName: '', lang: 'es' })
    expect(m).not.toContain('{{')
    expect(m).not.toMatch(/ de \./)
  })

  it('el link de WhatsApp codifica el texto', () => {
    expect(whatsappShareUrl('hola & chau\nlínea')).toBe(
      'https://wa.me/?text=hola%20%26%20chau%0Al%C3%ADnea'
    )
  })
})
