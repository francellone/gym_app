import { Lock } from 'lucide-react'
import { METHODS } from '../helpers'

// Badge informativo del método configurado por el coach.
// No es selectable — el alumno sólo lo ve. Si el método no existe en METHODS,
// no renderiza nada.
export default function MethodBadge({ evalType, methodKey }) {
  const methods = METHODS[evalType] || []
  const m = methods.find((x) => x.key === methodKey)
  if (!m) return null
  return (
    <div className="flex items-start gap-2 bg-purple-50 border border-purple-200 rounded-xl p-3">
      <Lock size={14} className="text-purple-500 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs font-semibold text-purple-700">Método: {m.label}</p>
        {m.note && <p className="text-xs text-purple-500 mt-0.5">{m.note}</p>}
      </div>
    </div>
  )
}
