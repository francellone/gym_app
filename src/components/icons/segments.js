// ============================================================
// Colores por parte de la app (manual de identidad §Íconos, 2026-09-27)
// ------------------------------------------------------------
// Cada parte de la app tiene siempre el mismo fondo y el mismo tono de
// ícono; así el color solo ya dice de qué se trata. Verde, ámbar y rojo
// NO son partes: se reservan para estados (bien / atención / problema).
//   bg    fondo del círculo o recuadro
//   fg    trazo del ícono (tono oscuro)
//   soft  capa clara de los íconos a dos tonos
// ============================================================
export const SEGMENTS = {
  // Partes de la app
  training: {
    bg: 'rgb(var(--c-primary-100))',
    fg: 'rgb(var(--c-primary-700))',
    soft: 'rgb(var(--c-primary-300))',
  }, // durazno
  aerobic: {
    bg: 'rgb(var(--c-niebla-100))',
    fg: 'rgb(var(--c-niebla-700))',
    soft: 'rgb(var(--c-niebla-300))',
  }, // niebla
  evaluation: {
    bg: 'rgb(var(--c-ciruela-100))',
    fg: 'rgb(var(--c-ciruela-700))',
    soft: 'rgb(var(--c-ciruela-300))',
  }, // ciruela
  wellbeing: {
    bg: 'rgb(var(--c-salvia-100))',
    fg: 'rgb(var(--c-salvia-700))',
    soft: 'rgb(var(--c-salvia-300))',
  }, // salvia
  messages: {
    bg: 'rgb(var(--c-gray-100))',
    fg: 'rgb(var(--c-gray-700))',
    soft: 'rgb(var(--c-gray-300))',
  }, // arena
  // Estados
  ok: {
    bg: 'rgb(var(--c-green-100))',
    fg: 'rgb(var(--c-green-700))',
    soft: 'rgb(var(--c-green-300))',
  },
  warn: {
    bg: 'rgb(var(--c-amber-100))',
    fg: 'rgb(var(--c-amber-800))',
    soft: 'rgb(var(--c-amber-300))',
  },
  bad: { bg: 'rgb(var(--c-red-100))', fg: 'rgb(var(--c-red-700))', soft: 'rgb(var(--c-red-300))' },
}

export function segmentColors(segment) {
  return SEGMENTS[segment] || SEGMENTS.messages
}
