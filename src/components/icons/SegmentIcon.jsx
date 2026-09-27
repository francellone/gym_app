import { segmentColors } from './segments'
import { DUO_PATHS } from './duoPaths'

// ============================================================
// Los dos estilos de ícono del manual de identidad (2026-09-27)
// ------------------------------------------------------------
// Estilo 1 — <CircleIcon>: ícono de línea (lucide) dentro de un círculo
//   con el fondo de su parte. Para listas, filas, avisos y carteles:
//   acompaña al texto.
// Estilo 2 — <DuoIcon>: ícono a dos tonos (Phosphor) dentro de un
//   recuadro redondeado. Para identificar un tipo o una sección: tipos de
//   evaluación, encabezados, tarjetas grandes.
// Los festejos (semana completa, fin de bloque) conservan su emoji: ahí
// suma calidez y es parte del mensaje (decisión de Franco).
// ============================================================

const CIRCLE_SIZES = {
  xs: { box: 24, icon: 13 },
  sm: { box: 28, icon: 15 },
  md: { box: 36, icon: 19 },
  lg: { box: 44, icon: 22 },
}

export function CircleIcon({
  icon: Icon,
  segment = 'messages',
  size = 'md',
  className = '',
  title,
}) {
  const c = segmentColors(segment)
  const s = CIRCLE_SIZES[size] || CIRCLE_SIZES.md
  return (
    <span
      className={`inline-grid place-items-center rounded-full flex-shrink-0 ${className}`}
      style={{ width: s.box, height: s.box, background: c.bg, color: c.fg }}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      {Icon && <Icon size={s.icon} strokeWidth={2} />}
    </span>
  )
}

const DUO_SIZES = {
  sm: { box: 36, icon: 22, radius: 11 },
  md: { box: 48, icon: 30, radius: 14 },
  lg: { box: 56, icon: 36, radius: 16 },
}

export function DuoGlyph({ name, size = 24, soft, strong }) {
  const p = DUO_PATHS[name]
  if (!p) return null
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
      {p.soft.map((d, i) => (
        <path key={`s${i}`} d={d} fill={soft} />
      ))}
      {p.strong.map((d, i) => (
        <path key={`f${i}`} d={d} fill={strong} />
      ))}
    </svg>
  )
}

export function DuoIcon({ name, segment = 'messages', size = 'md', className = '', title }) {
  const c = segmentColors(segment)
  const s = DUO_SIZES[size] || DUO_SIZES.md
  return (
    <span
      className={`inline-grid place-items-center flex-shrink-0 ${className}`}
      style={{ width: s.box, height: s.box, borderRadius: s.radius, background: c.bg }}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      <DuoGlyph name={name} size={s.icon} soft={c.soft} strong={c.fg} />
    </span>
  )
}
