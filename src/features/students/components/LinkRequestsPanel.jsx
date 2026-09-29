import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, Check, X } from 'lucide-react'
import AvatarImage from '@/features/avatars/AvatarImage'
import { decideLinkRequest, fetchPendingLinkRequests } from '../linkRequestsApi'

// Pedidos pendientes de personas que entraron por el link de la coach (v65).
// Aceptar las suma a la lista; rechazar les avisa y siguen por su cuenta.
// Si no hay pedidos, no ocupa lugar.
export default function LinkRequestsPanel({ onAccepted }) {
  const { t } = useTranslation()
  const [requests, setRequests] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setRequests(await fetchPendingLinkRequests())
    } catch (e) {
      console.error('[LinkRequestsPanel]', e)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function decide(req, accept) {
    setBusyId(req.request_id)
    setError(null)
    try {
      await decideLinkRequest(req.request_id, accept)
      setRequests((prev) => prev.filter((r) => r.request_id !== req.request_id))
      if (accept) onAccepted?.()
    } catch (e) {
      console.error('[LinkRequestsPanel] decide', e)
      setError(t('coach.students.linkRequests.error'))
      load()
    } finally {
      setBusyId(null)
    }
  }

  if (requests.length === 0) return null

  return (
    <div className="card space-y-3 border-primary-200" id="pedidos">
      <div className="flex items-center gap-2">
        <UserPlus size={18} className="text-primary-700" />
        <h2 className="font-semibold text-gray-900">
          {t('coach.students.linkRequests.title', { count: requests.length })}
        </h2>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-100">
        {requests.map((r) => (
          <li key={r.request_id} className="py-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-durazno-100 rounded-full flex items-center justify-center overflow-hidden shrink-0">
              <AvatarImage path={r.avatar_url} alt={r.name}>
                <span className="text-primary-700 font-bold text-sm">
                  {(r.name || '?').slice(0, 1).toUpperCase()}
                </span>
              </AvatarImage>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 break-words">{r.name}</p>
              <p className="text-xs text-gray-500 break-all">{r.email}</p>
              <p className="text-xs text-gray-500">
                {r.share_history
                  ? t('coach.students.linkRequests.sharesHistory')
                  : t('coach.students.linkRequests.noHistory')}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => decide(r, true)}
                disabled={busyId === r.request_id}
                className="btn-primary flex items-center gap-1"
                aria-label={t('coach.students.linkRequests.accept', { name: r.name })}
              >
                <Check size={16} />
                <span className="hidden sm:inline">
                  {t('coach.students.linkRequests.acceptShort')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => decide(r, false)}
                disabled={busyId === r.request_id}
                className="btn-ghost flex items-center gap-1"
                aria-label={t('coach.students.linkRequests.reject', { name: r.name })}
              >
                <X size={16} />
                <span className="hidden sm:inline">
                  {t('coach.students.linkRequests.rejectShort')}
                </span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
