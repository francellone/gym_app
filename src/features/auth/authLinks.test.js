import { beforeEach, describe, expect, it } from 'vitest'
import {
  appUrl,
  authErrorKey,
  clearPendingInvite,
  homePathFor,
  inviteLink,
  normalizeInviteCode,
  readPendingInvite,
  savePendingInvite,
  signupChoiceToParams,
  validatePasswords,
} from './authLinks'

describe('código de invitación', () => {
  beforeEach(() => clearPendingInvite())

  it('acepta el formato de la base y normaliza mayúsculas y espacios', () => {
    expect(normalizeInviteCode(' t7yj53l ')).toBe('T7YJ53L')
    expect(normalizeInviteCode('T7YJ53L')).toBe('T7YJ53L')
  })

  it('rechaza letras confusas, largos incorrectos y vacío', () => {
    expect(normalizeInviteCode('T7YJ53O')).toBeNull() // O
    expect(normalizeInviteCode('T7YJ531')).toBeNull() // 1
    expect(normalizeInviteCode('T7YJ53')).toBeNull()
    expect(normalizeInviteCode('')).toBeNull()
    expect(normalizeInviteCode(null)).toBeNull()
  })

  it('guarda y lee el pendiente solo si es válido', () => {
    savePendingInvite('basura')
    expect(readPendingInvite()).toBeNull()
    savePendingInvite('abcdefg')
    expect(readPendingInvite()).toBe('ABCDEFG')
    clearPendingInvite()
    expect(readPendingInvite()).toBeNull()
  })

  it('arma el link de la coach', () => {
    expect(inviteLink('https://gym-appv2.vercel.app/', 'ABCDEFG')).toBe(
      'https://gym-appv2.vercel.app/unirme/ABCDEFG'
    )
    expect(appUrl('https://x.app', '/login')).toBe('https://x.app/login')
  })
})

describe('alta', () => {
  it('traduce la elección a parámetros de complete_signup', () => {
    expect(signupChoiceToParams('train')).toEqual({ asCoach: false, alsoTrains: false })
    expect(signupChoiceToParams('coach')).toEqual({ asCoach: true, alsoTrains: false })
    expect(signupChoiceToParams('both')).toEqual({ asCoach: true, alsoTrains: true })
    expect(signupChoiceToParams(undefined)).toEqual({ asCoach: false, alsoTrains: false })
  })

  it('valida contraseñas', () => {
    expect(validatePasswords('12345', '12345')).toBe('auth.passwordMin')
    expect(validatePasswords('123456', '123457')).toBe('auth.passwordsDontMatch')
    expect(validatePasswords('123456', '123456')).toBeNull()
  })

  it('manda al alta a quien tiene sesión sin perfil', () => {
    expect(homePathFor(null, true)).toBe('/onboarding')
    expect(homePathFor({ role: 'coach' }, false)).toBe('/coach')
    expect(homePathFor({ role: 'student' }, false)).toBe('/student')
  })

  it('traduce errores de Supabase Auth', () => {
    expect(authErrorKey(new Error('Email rate limit exceeded'))).toBe('auth.errors.rateLimit')
    expect(authErrorKey(new Error('Password should be at least 6 characters'))).toBe(
      'auth.errors.weakPassword'
    )
    expect(authErrorKey(new Error('Signups not allowed for this instance'))).toBe(
      'auth.errors.signupDisabled'
    )
    expect(authErrorKey(new Error('Unable to validate email address: invalid format'))).toBe(
      'auth.errors.emailInvalid'
    )
    expect(authErrorKey(new Error('boom'))).toBe('auth.errors.generic')
  })
})
