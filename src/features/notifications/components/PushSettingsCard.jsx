import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellRing, CheckCircle2 } from 'lucide-react'
import { disablePush, enablePush, getPushStatus, sendTestPush } from '../services/pushService'

// Tarjeta "Avisos en este dispositivo" (v81). Único lugar donde se pide el
// permiso del sistema: siempre desde un botón. El estado es del DISPOSITIVO,
// no de la cuenta: cada celular o compu se activa por separado.

export default function PushSettingsCard({ userId }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    let alive = true
    getPushStatus().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [])

  async function run(action) {
    setBusy(true)
    setMsg(null)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const handleEnable = () =>
    run(async () => {
      try {
        setStatus(await enablePush(userId))
      } catch {
        setMsg({ kind: 'error', text: t('notifications.push.error') })
      }
    })

  const handleDisable = () =>
    run(async () => {
      try {
        await disablePush(userId)
      } catch {
        /* aunque falle el borrado remoto, el dispositivo queda apagado */
      }
      setStatus(await getPushStatus())
    })

  const handleTest = (burst = 1) =>
    run(async () => {
      try {
        const res = await sendTestPush({ burst })
        setMsg(
          res?.delivered > 0
            ? {
                kind: 'ok',
                text: t(
                  burst > 1 ? 'notifications.push.testBurstSent' : 'notifications.push.testSent'
                ),
              }
            : { kind: 'error', text: t('notifications.push.testFailed') }
        )
      } catch {
        setMsg({ kind: 'error', text: t('notifications.push.testFailed') })
      }
    })

  if (!status) return null

  const hint = {
    off: 'intro',
    blocked: 'blocked',
    'needs-install': 'needsInstall',
    unsupported: 'unsupported',
  }[status]

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <BellRing size={16} className="text-gray-500" aria-hidden="true" />
        <h2 className="text-sm font-medium text-gray-900">{t('notifications.push.title')}</h2>
      </div>

      {status === 'on' ? (
        <p className="text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 size={15} aria-hidden="true" />
          {t('notifications.push.onText')}
        </p>
      ) : (
        <p className="text-xs text-texto2 leading-relaxed">{t(`notifications.push.${hint}`)}</p>
      )}

      {status === 'off' && (
        <button type="button" className="btn-primary w-full" onClick={handleEnable} disabled={busy}>
          {busy ? t('notifications.push.enabling') : t('notifications.push.enable')}
        </button>
      )}

      {status === 'on' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => handleTest()}
              disabled={busy}
            >
              {t('notifications.push.test')}
            </button>
            <button type="button" className="btn-ghost" onClick={handleDisable} disabled={busy}>
              {t('notifications.push.disable')}
            </button>
          </div>
          <button
            type="button"
            className="btn-ghost w-full text-xs"
            onClick={() => handleTest(3)}
            disabled={busy}
          >
            {t('notifications.push.testBurst')}
          </button>
        </div>
      )}

      {msg && (
        <p
          role="status"
          className={`text-xs ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}
