import { DuoIcon, DuoGlyph } from '@/components/icons/SegmentIcon'
import { segmentColors } from '@/components/icons/segments'
import { evalTypeDuo } from '../helpers'

// Ícono del tipo de evaluación (estilo 2 del manual: dos tonos, ciruela).
//   inline → solo el dibujo, del tamaño del texto (para badges y títulos)
export default function EvalTypeIcon({ type, size = 'md', inline = false, className = '' }) {
  const name = evalTypeDuo(type)
  if (inline) {
    const c = segmentColors('evaluation')
    return (
      <span className={`inline-block align-[-3px] ${className}`}>
        <DuoGlyph name={name} size={16} soft={c.soft} strong={c.fg} />
      </span>
    )
  }
  return <DuoIcon name={name} segment="evaluation" size={size} className={className} />
}
