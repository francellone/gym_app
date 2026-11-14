// ============================================================
// pushService — avisos al celular, lado del dispositivo (v81)
// ------------------------------------------------------------
// Lo que estos tests fijan:
//   - El estado del dispositivo se lee bien en cada plataforma
//     (iPhone sin instalar, navegador sin push, bloqueado, apagado, activo).
//   - syncPush (inicio de sesión) NUNCA pide permiso.
//   - enablePush (botón) pide permiso, suscribe y guarda el dispositivo.
//   - Apagar se recuerda: el próximo inicio de sesión no lo vuelve a prender.
// Todo con supabase mockeado: sin red y sin rastro.
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createSupabaseMock, resetSupabaseMock } from '@/test/mocks/supabase'

const supabaseMock = createSupabaseMock()
supabaseMock.functions = { invoke: vi.fn() }
vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  supabaseIsolated: supabaseMock,
}))

const {
  disablePush,
  enablePush,
  getPushStatus,
  pushSupport,
  sameKey,
  sendTestPush,
  syncPush,
  urlBase64ToUint8Array,
} = await import('./pushService')

const USER = 'user-1'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1'

function fakeSubscription() {
  return {
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

/** Arma un navegador con Web Push. `subscription` = lo que ya tiene el dispositivo. */
function setupBrowser({ permission = 'default', subscription = null, requestResult } = {}) {
  let current = subscription
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async ({ applicationServerKey }) => {
      current = fakeSubscription()
      current.options.applicationServerKey = applicationServerKey.buffer
      return current
    }),
  }
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn(async () => requestResult ?? permission),
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  })
  return pushManager
}

function setUserAgent(ua) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
}

const ORIGINAL_UA = navigator.userAgent

describe('pushService', () => {
  beforeEach(() => {
    resetSupabaseMock(supabaseMock)
    supabaseMock._chain.then.mockImplementation((resolve) => resolve({ data: [], error: null }))
    supabaseMock.functions.invoke.mockReset()
    localStorage.clear()
    window.matchMedia = vi.fn(() => ({ matches: false }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setUserAgent(ORIGINAL_UA)
    delete navigator.serviceWorker
  })

  describe('claves', () => {
    it('sameKey compara byte a byte y rechaza la ausencia de clave', () => {
      const key = urlBase64ToUint8Array('AQID')
      expect([...key]).toEqual([1, 2, 3])
      expect(sameKey(Uint8Array.from([1, 2, 3]).buffer, key)).toBe(true)
      expect(sameKey(Uint8Array.from([1, 2, 4]).buffer, key)).toBe(false)
      expect(sameKey(Uint8Array.from([1, 2]).buffer, key)).toBe(false)
      expect(sameKey(null, key)).toBe(false)
    })
  })

  describe('estado del dispositivo', () => {
    it('iPhone con la app abierta en Safari → hay que instalarla primero', async () => {
      setUserAgent(IPHONE_UA)
      expect(pushSupport()).toBe('needs-install')
      expect(await getPushStatus()).toBe('needs-install')
    })

    it('iPhone con la app instalada → puede recibir avisos', () => {
      setUserAgent(IPHONE_UA)
      window.matchMedia = vi.fn(() => ({ matches: true }))
      setupBrowser()
      expect(pushSupport()).toBe('ok')
    })

    it('navegador sin Web Push → no soportado', async () => {
      expect(await getPushStatus()).toBe('unsupported')
    })

    it('permiso denegado → bloqueado', async () => {
      setupBrowser({ permission: 'denied' })
      expect(await getPushStatus()).toBe('blocked')
    })

    it('sin decidir → apagado', async () => {
      setupBrowser({ permission: 'default' })
      expect(await getPushStatus()).toBe('off')
    })

    it('con permiso pero sin suscripción → apagado', async () => {
      setupBrowser({ permission: 'granted' })
      expect(await getPushStatus()).toBe('off')
    })

    it('con permiso y suscripción → activo', async () => {
      setupBrowser({ permission: 'granted', subscription: fakeSubscription() })
      expect(await getPushStatus()).toBe('on')
    })
  })

  describe('syncPush (inicio de sesión)', () => {
    it('sin permiso previo no pregunta ni suscribe', async () => {
      const pm = setupBrowser({ permission: 'default' })
      expect(await syncPush(USER)).toBe(false)
      expect(Notification.requestPermission).not.toHaveBeenCalled()
      expect(pm.subscribe).not.toHaveBeenCalled()
      expect(supabaseMock.from).not.toHaveBeenCalled()
    })

    it('con permiso previo registra el dispositivo sin preguntar', async () => {
      const pm = setupBrowser({ permission: 'granted' })
      expect(await syncPush(USER)).toBe(true)
      expect(Notification.requestPermission).not.toHaveBeenCalled()
      expect(pm.subscribe).toHaveBeenCalledTimes(1)
      expect(supabaseMock.from).toHaveBeenCalledWith('push_subscriptions')
      expect(supabaseMock._chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: USER, endpoint: 'https://push.example/abc' }),
        { onConflict: 'user_id,endpoint' }
      )
    })

    it('una suscripción hecha con otra clave se rehace', async () => {
      const old = fakeSubscription()
      old.options.applicationServerKey = Uint8Array.from([9, 9, 9]).buffer
      const pm = setupBrowser({ permission: 'granted', subscription: old })
      await syncPush(USER)
      expect(old.unsubscribe).toHaveBeenCalled()
      expect(pm.subscribe).toHaveBeenCalledTimes(1)
    })
  })

  describe('enablePush / disablePush (botón)', () => {
    it('pide permiso, suscribe y guarda', async () => {
      const pm = setupBrowser({ permission: 'default', requestResult: 'granted' })
      expect(await enablePush(USER)).toBe('on')
      expect(Notification.requestPermission).toHaveBeenCalledTimes(1)
      expect(pm.subscribe).toHaveBeenCalledTimes(1)
      expect(supabaseMock._chain.upsert).toHaveBeenCalled()
    })

    it('si la persona rechaza, queda bloqueado y no se guarda nada', async () => {
      const pm = setupBrowser({ permission: 'default', requestResult: 'denied' })
      expect(await enablePush(USER)).toBe('blocked')
      expect(pm.subscribe).not.toHaveBeenCalled()
      expect(supabaseMock.from).not.toHaveBeenCalled()
    })

    it('si no se puede guardar el dispositivo, avisa con un error', async () => {
      setupBrowser({ permission: 'default', requestResult: 'granted' })
      supabaseMock._chain.then.mockImplementationOnce((resolve) =>
        resolve({ data: null, error: { message: 'rls' } })
      )
      await expect(enablePush(USER)).rejects.toThrow('save_failed')
    })

    it('apagar borra el dispositivo y el próximo inicio de sesión no lo vuelve a prender', async () => {
      const sub = fakeSubscription()
      const pm = setupBrowser({ permission: 'granted', subscription: sub })
      await disablePush(USER)
      expect(supabaseMock._chain.delete).toHaveBeenCalled()
      expect(sub.unsubscribe).toHaveBeenCalled()

      expect(await syncPush(USER)).toBe(false)
      expect(pm.subscribe).not.toHaveBeenCalled()
    })

    it('volver a activar olvida el apagado', async () => {
      const pm = setupBrowser({ permission: 'granted', requestResult: 'granted' })
      localStorage.setItem('gymcoach-push-off', '1')
      await enablePush(USER)
      pm.subscribe.mockClear()
      expect(await syncPush(USER)).toBe(true)
    })
  })

  describe('sendTestPush', () => {
    it('llama a la edge function en modo prueba y devuelve su respuesta', async () => {
      supabaseMock.functions.invoke.mockResolvedValue({
        data: { ok: true, devices: 1, delivered: 1 },
        error: null,
      })
      expect(await sendTestPush()).toEqual({ ok: true, devices: 1, delivered: 1 })
      expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('send-push', {
        body: { test: true },
      })
    })

    it('propaga el error si la función falla', async () => {
      supabaseMock.functions.invoke.mockResolvedValue({ data: null, error: new Error('boom') })
      await expect(sendTestPush()).rejects.toThrow('boom')
    })
  })
})
