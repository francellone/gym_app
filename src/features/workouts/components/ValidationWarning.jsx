import { AlertTriangle } from 'lucide-react'

// ============================================================
// Modal de aviso de validación (solo para peso inusual)
// ============================================================
// Aparece cuando el alumno intenta guardar un peso que el helper de
// validación considera fuera de rango razonable. No bloquea: ofrece
// "Corregir" o "Guardar igual".
export default function ValidationWarning({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-orange-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Verificá este dato</p>
            <p className="text-sm text-gray-600 mt-0.5">{message}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1 text-sm">
            Corregir
          </button>
          <button onClick={onConfirm} className="btn-primary flex-1 text-sm">
            Guardar igual
          </button>
        </div>
      </div>
    </div>
  )
}
