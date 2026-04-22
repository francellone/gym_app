import { useState } from 'react'
import { Plus } from 'lucide-react'
import { BLOCK_TYPE_LIST } from '../../../utils/planHelpers'

/**
 * Botón + menú para agregar un bloque a la sección.
 * Al elegir un tipo llama onAdd(type).
 */
export default function AddBlockMenu({ onAdd }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={16} />
          Agregar bloque
        </button>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600 text-center">
            ¿Qué tipo de bloque querés agregar?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {BLOCK_TYPE_LIST.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  onAdd(t.key)
                  setOpen(false)
                }}
                className="rounded-xl border-2 border-gray-200 bg-white hover:border-primary-400 p-2 text-center transition-all"
              >
                <span className="text-xl block mb-0.5">{t.icon}</span>
                <span className="text-xs font-semibold text-gray-700">{t.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-full text-xs text-gray-400 hover:text-gray-600"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
