// ============================================================
// Reglas del perfil de la coach (v58), separadas para testear.
// ============================================================

export const BIO_MAX = 600
export const PHONE_MAX = 40
export const WORK_LANGS = ['es', 'en']

/** Estado inicial del formulario a partir del perfil guardado. */
export function formFromProfile(profile) {
  const langs =
    Array.isArray(profile?.coach_languages) && profile.coach_languages.length
      ? WORK_LANGS.filter((l) => profile.coach_languages.includes(l))
      : [profile?.language === 'en' ? 'en' : 'es']
  return {
    name: profile?.name || '',
    phone: profile?.phone || '',
    languages: langs,
    bio: { es: profile?.bio?.es || '', en: profile?.bio?.en || '' },
  }
}

/**
 * Lo que se guarda. La presentación solo guarda los idiomas elegidos:
 * si la coach saca un idioma, ese texto se descarta al guardar.
 */
export function payloadFromForm(form) {
  const bio = {}
  for (const l of form.languages) {
    const txt = (form.bio?.[l] || '').trim()
    if (txt) bio[l] = txt
  }
  return {
    name: form.name.trim(),
    phone: form.phone.trim() || null,
    coach_languages: WORK_LANGS.filter((l) => form.languages.includes(l)),
    bio: Object.keys(bio).length ? bio : null,
  }
}

/** Devuelve la clave de error (coach.profile.errors.*) o null. */
export function validateForm(form) {
  if (!form.name.trim()) return 'nameRequired'
  if (!form.languages.length) return 'pickLanguage'
  if (form.phone.trim().length > PHONE_MAX) return 'phoneTooLong'
  if (form.languages.some((l) => (form.bio?.[l] || '').trim().length > BIO_MAX)) return 'bioTooLong'
  return null
}

export function sameAsSaved(form, profile) {
  const a = payloadFromForm(form)
  const b = payloadFromForm(formFromProfile(profile))
  return (
    JSON.stringify(a) === JSON.stringify(b) &&
    JSON.stringify(a.coach_languages) === JSON.stringify(profile?.coach_languages || null)
  )
}
