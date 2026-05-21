// ============================================================
// useNotifications — tests del hook
// ------------------------------------------------------------
// Foco: carga inicial, markAsRead optimistic + rollback en error,
// markAllAsRead no-op cuando unreadCount=0.
//
// El realtime (subscribe/onAuthStateChange) NO se testea acá — sólo
// validamos que el hook arme y limpie el canal. Eso es suficiente
// para asegurar que no hay leaks. Tests más profundos de realtime
// requieren un harness aparte, futuro.
//
// Patrón de await sobre el chain de supabase-js:
//   load:        await from('notifications').select('*').eq(...).order(...).limit(N)
//   markAsRead:  await from('notifications').update({...}).eq(...).eq(...)
//   markAllRead: await from('notifications').update({...}).eq(...).eq(...)
// Todas terminan awaiteando el chain, que en el mock es thenable
// (chain.then es un vi.fn). Cada await consume UNA implementación;
// usamos chain.then.mockImplementationOnce(...) para programar la
// respuesta de cada operación en orden.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createSupabaseMock, resetSupabaseMock } from '@/test/mocks/supabase'

const supabaseMock = createSupabaseMock()
vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  supabaseIsolated: supabaseMock,
}))

const { useNotifications } = await import('./useNotifications')

const USER_ID = 'user-1'
const fakeNotifs = [
  { id: 'n1', user_id: USER_ID, title: 'Plan asignado', read: false, created_at: '2026-05-21' },
  { id: 'n2', user_id: USER_ID, title: 'Recordatorio', read: true, created_at: '2026-05-20' },
  { id: 'n3', user_id: USER_ID, title: 'Saludo', read: false, created_at: '2026-05-19' },
]

// Helpers de configuración: encolan respuestas de chain.then en orden.
function queueResponse(payload) {
  supabaseMock._chain.then.mockImplementationOnce((resolve) => resolve(payload))
}

describe('useNotifications', () => {
  beforeEach(() => {
    resetSupabaseMock(supabaseMock)
    // Restaurar el default del chain.then (vi.fn() se limpia con resetSupabaseMock)
    supabaseMock._chain.then.mockImplementation((resolve) => resolve({ data: [], error: null }))
  })

  it('carga inicial: deja loading=false y popula notificaciones + unreadCount', async () => {
    queueResponse({ data: fakeNotifs, error: null })

    const { result } = renderHook(() => useNotifications(USER_ID))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.notifications).toHaveLength(3)
    expect(result.current.unreadCount).toBe(2) // n1 y n3 son unread
    expect(supabaseMock.from).toHaveBeenCalledWith('notifications')
  })

  it('userId vacío no dispara query y deja loading=true (waiting)', async () => {
    const { result } = renderHook(() => useNotifications(null))
    expect(supabaseMock.from).not.toHaveBeenCalled()
    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
  })

  it('markAsRead actualiza optimistic y baja unreadCount', async () => {
    // 1) load resuelve con notifs
    queueResponse({ data: fakeNotifs, error: null })
    // 2) markAsRead UPDATE resuelve OK
    queueResponse({ error: null })

    const { result } = renderHook(() => useNotifications(USER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.unreadCount).toBe(2)

    await act(async () => {
      await result.current.markAsRead('n1')
    })

    expect(result.current.unreadCount).toBe(1)
    expect(result.current.notifications.find((n) => n.id === 'n1').read).toBe(true)
    expect(supabaseMock._chain.update).toHaveBeenCalledWith({ read: true })
  })

  it('markAsRead revierte el estado si el UPDATE falla', async () => {
    queueResponse({ data: fakeNotifs, error: null }) // load
    queueResponse({ error: { code: 'PGRST_FAKE', message: 'boom' } }) // update falla

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useNotifications(USER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const initialUnread = result.current.unreadCount

    await act(async () => {
      await result.current.markAsRead('n1')
    })

    // Rollback: vuelve al estado original
    expect(result.current.unreadCount).toBe(initialUnread)
    expect(result.current.notifications.find((n) => n.id === 'n1').read).toBe(false)
    expect(errSpy).toHaveBeenCalled()

    errSpy.mockRestore()
  })

  it('markAllAsRead es no-op si unreadCount=0 (no llama UPDATE)', async () => {
    queueResponse({
      data: [{ id: 'n1', user_id: USER_ID, title: 'x', read: true, created_at: '2026-05-21' }],
      error: null,
    })

    const { result } = renderHook(() => useNotifications(USER_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.unreadCount).toBe(0)

    supabaseMock._chain.update.mockClear()

    await act(async () => {
      await result.current.markAllAsRead()
    })

    expect(supabaseMock._chain.update).not.toHaveBeenCalled()
  })

  it('arma y limpia el canal de realtime', async () => {
    queueResponse({ data: fakeNotifs, error: null })

    const { unmount } = renderHook(() => useNotifications(USER_ID))
    await waitFor(() => expect(supabaseMock.channel).toHaveBeenCalled())
    expect(supabaseMock.channel.mock.calls[0][0]).toBe(`notifications:${USER_ID}`)

    unmount()
    expect(supabaseMock.removeChannel).toHaveBeenCalled()
  })
})
