import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BLOCK_TYPE_LIST } from '../../helpers'

/**
 * Botón + menú para agregar un bloque a la sección.
 * Al elegir un tipo llama onAdd(type).
 */
export default function AddBlockMenu({ onAdd }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={16} />
          {t('coach.planEditor.addBlock.button')}
        </button>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600 text-center">
            {t('coach.planEditor.addBlock.question')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {BLOCK_TYPE_LIST.map((bt) => (
              <button
                key={bt.key}
                type="button"
                onClick={() => {
                  onAdd(bt.key)
                  setOpen(false)
                }}
                className="rounded-xl border-2 border-gray-200 bg-white hover:border-primary-400 p-2 text-center transition-all"
              >
                <span className="text-xl block mb-0.5">{bt.icon}</span>
                <span className="text-xs font-semibold text-gray-700">
                  {t(`coach.planEditor.blockTypes.${bt.key}.label`)}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-full text-xs text-gray-400 hover:text-gray-600"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
