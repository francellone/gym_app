// ============================================================
// Mensaje de bienvenida que la coach le manda a una persona recién creada.
//
// Pedido de Franco (2026-09-29): cuando la coach crea una cuenta desde su
// panel, la app le da el mensaje listo para mandar (link de la app + usuario
// + contraseña), en el IDIOMA DE LA PERSONA, no en el del panel. Se eligió
// esto y no un link personal para elegir contraseña porque no vence.
//
// La contraseña no se guarda en ningún lado legible: este mensaje es la única
// vez que la coach la ve junto al resto de los datos.
// ============================================================
import i18n from '@/i18n'

export function loginUrl(origin) {
  return `${String(origin || '').replace(/\/+$/, '')}/login`
}

/**
 * @param {{ lang: 'es'|'en', name: string, coachName?: string, email: string,
 *           password: string, origin: string }} p
 */
export function buildWelcomeMessage({ lang, name, coachName, email, password, origin }) {
  const t = i18n.getFixedT(lang === 'en' ? 'en' : 'es')
  const firstName =
    String(name || '')
      .trim()
      .split(/\s+/)[0] || ''
  const key = coachName ? 'coach.students.welcome.message' : 'coach.students.welcome.messageNoCoach'
  return t(key, {
    name: firstName,
    coach: String(coachName || '').trim(),
    url: loginUrl(origin),
    email: String(email || '').trim(),
    password,
  })
}

export function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
