// ─────────────────────────────────────────────────────────────
// PaymentModal (v49)
// ------------------------------------------------------------
// Registrar un cobro. El período viene propuesto (día siguiente al
// último cubierto + el ciclo del alumno) porque es lo que la coach va
// a querer el 90% de las veces, pero se puede pisar.
//
// D4: si el plan de la persona vence antes del fin del período que se
// está pagando, se OFRECE extender la vigencia. Desmarcado por defecto:
// pagar y entrenar son ciclos distintos y no se acoplan solos.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { AlertCircle } from 'lucide-react'
import { shouldOfferPlanExtension } from '../payments'

export default function PaymentModal({
  proposal,
  activeAssignment,
  saving,
  error,
  onCancel,
  onSave,
}) {
  const [form, setForm] = useState({
    paid_on: proposal.paid_on,
    period_start: proposal.period_start,
    period_end: proposal.period_end,
    amount: '',
    method: '',
    notes: '',
  })
  const [extendPlan, setExtendPlan] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const offerExtension = shouldOfferPlanExtension(activeAssignment, form.period_end)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="bg-white rounded-2xl p-5 max-w-md w-full space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div>
          <h3 className="font-semibold text-gray-900">Registrar pago</h3>
          <p className="text-xs text-gray-500 mt-1">
            El vencimiento del pago se calcula solo: es el día siguiente al último día
            cubierto.
          </p>
        </div>

        <div>
          <label className="label text-xs">Fecha del pago</label>
          <input type="date" className="input" value={form.paid_on} onChange={set('paid_on')} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label text-xs">Cubre desde</label>
            <input
              type="date"
              className="input"
              value={form.period_start}
              onChange={set('period_start')}
            />
          </div>
          <div>
            <label className="label text-xs">Hasta</label>
            <input
              type="date"
              className="input"
              value={form.period_end}
              onChange={set('period_end')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label text-xs">Monto (opcional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              placeholder="—"
              value={form.amount}
              onChange={set('amount')}
            />
          </div>
          <div>
            <label className="label text-xs">Medio (opcional)</label>
            <input
              className="input"
              placeholder="Efectivo, transferencia..."
              value={form.method}
              onChange={set('method')}
            />
          </div>
        </div>

        <div>
          <label className="label text-xs">Nota (solo la ve el coach)</label>
          <input
            className="input"
            placeholder="Ej: pagó dos meses juntos"
            value={form.notes}
            onChange={set('notes')}
          />
        </div>

        {offerExtension && (
          <label className="flex items-start gap-2 bg-gray-50 rounded-xl p-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={extendPlan}
              onChange={(e) => setExtendPlan(e.target.checked)}
            />
            <span className="text-xs text-gray-700">
              Extender también la vigencia del plan hasta el{' '}
              {format(parseISO(form.period_end), 'dd/MM/yyyy')}
              <span className="block text-gray-500">
                Hoy vence el{' '}
                {format(parseISO(activeAssignment.expected_end_date), 'dd/MM/yyyy')}. Son dos
                cosas distintas: marcalo solo si además querés correr el plan.
              </span>
            </span>
          </label>
        )}

        {error && (
          <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl p-2.5 text-xs">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-sm" disabled={saving} onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="btn-primary text-sm"
            disabled={saving || !form.period_start || !form.period_end}
            onClick={() => onSave(form, { extendPlan: extendPlan && offerExtension })}
          >
            {saving ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
