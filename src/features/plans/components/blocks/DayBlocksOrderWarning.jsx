import { AlertTriangle, X } from 'lucide-react'
import {
  isBlockOrderValid,
  hasNumberGaps,
  countUnlettered,
  blockDisplayTitle,
} from '../../helpers'

/**
 * Q7 — Banner por día del editor de planes.
 *
 * Detecta dos problemas en los bloques strength del día:
 *   1) Orden no consecutivo (ej: A1, B1, A2).
 *   2) Huecos en la numeración dentro de una letra (ej: A1, A2, A4).
 *
 * Ofrece reordenar automáticamente: ordena por (letra, número) y compacta
 * la numeración (1, 2, 3...). Los ejercicios sin letra no se mueven
 * (se preserva su slot).
 *
 * Props:
 *   - dayBlocks: array de bloques del día (todos los tipos, filtra strength)
 *   - onReorderDay: () => void — aplica reordenamiento a todos los strength del día
 *   - onDismiss: () => void — oculta el banner por esta sesión de edición
 */
export default function DayBlocksOrderWarning({ dayBlocks = [], onReorderDay, onDismiss }) {
  // Numerar los bloques strength para mostrar "Fuerza", "Fuerza 2"
  let strengthCounter = 0
  const disorderedBlocks = []
  const gappedBlocks = []
  let totalUnlettered = 0

  for (const block of dayBlocks) {
    if (block.block_type !== 'strength') continue
    const strengthIndex = strengthCounter
    strengthCounter += 1
    const exercises = block.exercises || []
    const title = blockDisplayTitle(block, strengthIndex)

    if (!isBlockOrderValid(exercises)) {
      disorderedBlocks.push({ title })
    }
    if (hasNumberGaps(exercises)) {
      gappedBlocks.push({ title })
    }
    totalUnlettered += countUnlettered(exercises)
  }

  // Si no hay problemas → no renderizar nada
  if (disorderedBlocks.length === 0 && gappedBlocks.length === 0) return null

  const joinNames = (arr) => {
    const names = arr.map((b) => `"${b.title}"`)
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} y ${names[1]}`
    return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
  }

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-semibold text-amber-900">
            Hay bloques que conviene reordenar
          </p>
          {disorderedBlocks.length > 0 && (
            <p className="text-xs text-amber-800">
              {joinNames(disorderedBlocks)}{' '}
              {disorderedBlocks.length === 1 ? 'tiene' : 'tienen'} las letras (A, B, C...) fuera
              de orden.
            </p>
          )}
          {gappedBlocks.length > 0 && (
            <p className="text-xs text-amber-800">
              {joinNames(gappedBlocks)}{' '}
              {gappedBlocks.length === 1 ? 'tiene' : 'tienen'} números salteados (ej: A1, A2, A4).
              Se renumerarán para que queden consecutivos.
            </p>
          )}
          {totalUnlettered > 0 && (
            <p className="text-xs text-amber-700">
              {totalUnlettered === 1
                ? '1 ejercicio sin letra quedará en su lugar.'
                : `${totalUnlettered} ejercicios sin letra quedarán en su lugar.`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg flex-shrink-0"
          aria-label="Cerrar aviso"
          title="Dejar como está"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 pl-7">
        <button
          type="button"
          onClick={onReorderDay}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
        >
          Reordenar día
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium px-3 py-1.5 rounded-lg text-amber-700 hover:bg-amber-100 transition-colors"
        >
          Dejar como está
        </button>
      </div>
    </div>
  )
}
