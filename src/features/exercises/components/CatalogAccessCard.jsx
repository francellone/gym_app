import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, Check, Clock, X } from 'lucide-react'
import AvatarImage from '@/features/avatars/AvatarImage'
import { initialsOf } from '@/features/avatars/avatarUrls'
import {
  decideCatalogAccess,
  fetchCatalogRequests,
  fetchMyCatalogAccess,
  requestCatalogAccess,
} from '../catalogAccessApi'

// ============================================================
// Catálogo compartido (v72)
// - Coach nuevo: pedir el catálogo de la dueña (Anto) y ver el estado.
// - Dueña: aprobar / rechazar pedidos y quitar el acceso.
// onChanged: el catálogo visible cambió (p. ej. al aprobarse) → refetch.
// ============================================================
export default function CatalogAccessCard({ onChanged }) {
  const [access, setAccess] = useState(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      setAccess(await fetchMyCatalogAccess())
      setError(false)
    } catch (e) {
      console.error('[CatalogAccessCard]', e)
      setError(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error || !access || !access.owner_name) return null
  if (access.is_owner) return <OwnerRequests />
  return <RequesterCard access={access} onRequested={load} onChanged={onChanged} />
}

function RequesterCard({ access, onRequested }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const owner = access.owner_name

  if (access.status === 'approved') {
    return (
      <p className="text-xs text-texto2 flex items-center gap-1.5">
        <BookOpen size={13} aria-hidden="true" />
        {t('coach.exercises.catalogAccess.usingCatalog', { owner })}
      </p>
    )
  }

  async function ask() {
    setBusy(true)
    setFailed(false)
    try {
      await requestCatalogAccess()
      await onRequested()
    } catch (e) {
      console.error('[CatalogAccessCard] request', e)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const pending = access.status === 'pending'
  return (
    <div className="card flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
        {pending ? (
          <Clock size={18} className="text-primary-600" aria-hidden="true" />
        ) : (
          <BookOpen size={18} className="text-primary-600" aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-tinta text-sm">
          {pending
            ? t('coach.exercises.catalogAccess.pendingTitle', { owner })
            : t('coach.exercises.catalogAccess.askTitle', { owner })}
        </p>
        <p className="text-xs text-texto2 mt-0.5">
          {pending
            ? t('coach.exercises.catalogAccess.pendingText', { owner })
            : access.status === 'denied'
              ? t('coach.exercises.catalogAccess.deniedText', { owner })
              : t('coach.exercises.catalogAccess.askText', { owner })}
        </p>
        {failed && (
          <p className="text-xs text-red-600 mt-1">
            {t('coach.exercises.catalogAccess.error', { owner })}
          </p>
        )}
        {!pending && (
          <button
            type="button"
            onClick={ask}
            disabled={busy}
            className="btn-primary text-sm px-3 py-1.5 mt-3"
          >
            {access.status === 'denied'
              ? t('coach.exercises.catalogAccess.askAgain', { owner })
              : t('coach.exercises.catalogAccess.ask', { owner })}
          </button>
        )}
      </div>
    </div>
  )
}

function OwnerRequests() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [failed, setFailed] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(null)

  const load = useCallback(async () => {
    try {
      setRows(await fetchCatalogRequests())
    } catch (e) {
      console.error('[CatalogAccessCard] owner', e)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function decide(coachId, approve) {
    setBusyId(coachId)
    setFailed(false)
    try {
      await decideCatalogAccess(coachId, approve)
      setConfirmRevoke(null)
      await load()
    } catch (e) {
      console.error('[CatalogAccessCard] decide', e)
      setFailed(true)
    } finally {
      setBusyId(null)
    }
  }

  const pending = rows.filter((r) => r.status === 'pending')
  const approved = rows.filter((r) => r.status === 'approved')
  if (!pending.length && !approved.length) return null

  const person = (r) => (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <span className="w-9 h-9 bg-durazno-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
        <AvatarImage path={r.avatar_url} alt={r.name}>
          <span className="text-primary-700 font-bold text-xs">{initialsOf(r.name)}</span>
        </AvatarImage>
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-tinta break-words">{r.name}</p>
        <p className="text-xs text-texto2 break-words">{r.email}</p>
      </div>
    </div>
  )

  return (
    <div className="card space-y-3">
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold text-tinta text-sm">
            {t('coach.exercises.catalogAccess.ownerPendingTitle')}
          </p>
          <p className="text-xs text-texto2">
            {t('coach.exercises.catalogAccess.ownerPendingText')}
          </p>
          {pending.map((r) => (
            <div key={r.coach_id} className="flex items-center gap-2">
              {person(r)}
              <button
                type="button"
                onClick={() => decide(r.coach_id, false)}
                disabled={busyId === r.coach_id}
                className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1"
              >
                <X size={14} aria-hidden="true" />
                {t('coach.exercises.catalogAccess.deny')}
              </button>
              <button
                type="button"
                onClick={() => decide(r.coach_id, true)}
                disabled={busyId === r.coach_id}
                className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1"
              >
                <Check size={14} aria-hidden="true" />
                {t('coach.exercises.catalogAccess.approve')}
              </button>
            </div>
          ))}
        </div>
      )}
      {approved.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-texto2">
            {t('coach.exercises.catalogAccess.ownerApprovedTitle', { count: approved.length })}
          </summary>
          <div className="space-y-2 mt-2">
            {approved.map((r) => (
              <div key={r.coach_id} className="flex items-center gap-2">
                {person(r)}
                {confirmRevoke === r.coach_id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmRevoke(null)}
                      className="btn-secondary text-xs px-2.5 py-1.5"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(r.coach_id, false)}
                      disabled={busyId === r.coach_id}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-red-600 text-white"
                    >
                      {t('coach.exercises.catalogAccess.revokeConfirm')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(r.coach_id)}
                    className="btn-secondary text-xs px-2.5 py-1.5"
                  >
                    {t('coach.exercises.catalogAccess.revoke')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      {failed && <p className="text-xs text-red-600">{t('coach.exercises.catalogAccess.error')}</p>}
    </div>
  )
}
