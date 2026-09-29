// ============================================================
// Registro propio, link de invitación y recuperación de contraseña.
// Lógica pura (sin React) para poder testearla sin red.
// Base: migración v65 (coach_invites, complete_signup, coach_link_requests).
// ============================================================

// Mismo alfabeto que public._new_invite_code(): sin I, O, 0 ni 1.
const INVITE_RE = /^[A-HJ-NP-Z2-9]{7}$/
const PENDING_INVITE_KEY = 'gymcoach_pending_invite'

/** Normaliza lo que venga en el link (espacios, minúsculas). null si no es válido. */
export function normalizeInviteCode(raw) {
  const c = String(raw ?? '')
    .trim()
    .toUpperCase()
  return INVITE_RE.test(c) ? c : null
}

// El código viaja del link a la pantalla de alta (que puede ser OTRO día,
// después de confirmar el mail), así que se guarda en el dispositivo.
export function savePendingInvite(code) {
  const c = normalizeInviteCode(code)
  if (!c) return
  try {
    localStorage.setItem(PENDING_INVITE_KEY, c)
  } catch {
    /* sin almacenamiento: el pedido se puede hacer después desde el perfil */
  }
}

export function readPendingInvite() {
  try {
    return normalizeInviteCode(localStorage.getItem(PENDING_INVITE_KEY))
  } catch {
    return null
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    /* no-op */
  }
}

export function appUrl(origin, path) {
  return `${String(origin || '').replace(/\/+$/, '')}${path}`
}

/** Link que comparte la coach. */
export function inviteLink(origin, code) {
  return appUrl(origin, `/unirme/${code}`)
}

/**
 * Qué elige la persona en el alta → parámetros de complete_signup.
 * 'train' = persona, 'coach' = coach, 'both' = coach que también entrena.
 */
export function signupChoiceToParams(choice) {
  if (choice === 'coach') return { asCoach: true, alsoTrains: false }
  if (choice === 'both') return { asCoach: true, alsoTrains: true }
  return { asCoach: false, alsoTrains: false }
}

/** Traduce errores de Supabase Auth a claves de i18n (auth.errors.*). */
export function authErrorKey(err) {
  const m = String(err?.message || err || '').toLowerCase()
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes'))
    return 'auth.errors.rateLimit'
  if (m.includes('weak') || m.includes('password should')) return 'auth.errors.weakPassword'
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return 'auth.errors.signupDisabled'
  if (m.includes('invalid') && m.includes('email')) return 'auth.errors.emailInvalid'
  return 'auth.errors.generic'
}

export function validatePasswords(password, repeat) {
  if (!password || password.length < 6) return 'auth.passwordMin'
  if (password !== repeat) return 'auth.passwordsDontMatch'
  return null
}

/**
 * A dónde va alguien con sesión. Sin perfil todavía → alta (onboarding).
 */
export function homePathFor(profile, profileMissing) {
  if (profileMissing) return '/onboarding'
  return profile?.role === 'coach' ? '/coach' : '/student'
}
