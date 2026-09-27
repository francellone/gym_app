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
  training: { bg: '#ffedd5', fg: '#c2410c', soft: '#fdba74' }, // durazno
  aerobic: { bg: '#e3ecf1', fg: '#3d5869', soft: '#a3bccb' }, // niebla
  evaluation: { bg: '#f3e8ef', fg: '#6b3f5d', soft: '#d3adc6' }, // ciruela
  wellbeing: { bg: '#e7f0e8', fg: '#4f7a5b', soft: '#a9c7b0' }, // salvia
  messages: { bg: '#f5f0eb', fg: '#5a4b42', soft: '#d8ccc1' }, // arena
  // Estados
  ok: { bg: '#dcfce7', fg: '#15803d', soft: '#86efac' },
  warn: { bg: '#fef3c7', fg: '#92400e', soft: '#fcd34d' },
  bad: { bg: '#fee2e2', fg: '#b91c1c', soft: '#fca5a5' },
}

export function segmentColors(segment) {
  return SEGMENTS[segment] || SEGMENTS.messages
}
