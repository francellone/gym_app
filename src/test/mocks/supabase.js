// ============================================================
// src/test/mocks/supabase.js — factory de mock para @/lib/supabase
// ------------------------------------------------------------
// Patrón "chain mock": los métodos del query builder de supabase-js
// son chaineables (.from().select().eq().is().maybeSingle()) y terminales
// (.single(), .maybeSingle(), o el await directo).
//
// Esta factory devuelve un objeto donde:
//   - Cada método intermedio (select, eq, in, is, order, limit, update, insert)
//     devuelve `this` por default. Tests pueden re-mockear si necesitan.
//   - Los métodos terminales (single, maybeSingle) resuelven a { data, error }.
//   - El await del builder mismo (caso `await supabase.from('x').select()`)
//     se resuelve gracias a un `then` settable que el caller controla.
//
// Uso típico en un test:
//
//   import { createSupabaseMock } from '@/test/mocks/supabase'
//   import { vi } from 'vitest'
//
//   const mock = createSupabaseMock()
//   vi.mock('@/lib/supabase', () => ({ supabase: mock, supabaseIsolated: mock }))
//
//   mock._chain.maybeSingle.mockResolvedValueOnce({ data: { id: '123' }, error: null })
//   // ... ejecutar el código bajo test ...
//   expect(mock.from).toHaveBeenCalledWith('notes')
//   expect(mock._chain.eq).toHaveBeenCalledWith('id', '123')
// ============================================================
import { vi } from 'vitest'

export function createSupabaseMock() {
  // El chain se construye una sola vez por mock. Si un test necesita aislar
  // calls entre query y query, puede llamar a `resetChain()` o crear un mock nuevo.
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    gt: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    lte: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    not: vi.fn(),
    ilike: vi.fn(),
    overlaps: vi.fn(),
    contains: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    range: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    // Terminales: devuelven Promises con { data, error } por default.
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    // `then` hace que el chain mismo sea thenable: `await supabase.from('x').select().eq(...)`
    // resuelve con { data: [], error: null } por default. Es vi.fn() para que cada test
    // pueda sobrescribir con .mockImplementationOnce((resolve) => resolve({ ... })).
    then: vi.fn((resolve) => resolve({ data: [], error: null })),
  }

  // Todos los intermedios devuelven el mismo chain (encadenamiento fluent).
  for (const key of [
    'select',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'is',
    'in',
    'or',
    'not',
    'ilike',
    'overlaps',
    'contains',
    'order',
    'limit',
    'range',
    'insert',
    'update',
    'upsert',
    'delete',
  ]) {
    chain[key].mockReturnValue(chain)
  }

  // Auth — métodos típicos. Tests sobre-mockean por test si necesitan.
  const auth = {
    signInWithPassword: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'user-test' }, session: {} }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'user-new' } }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  }

  // Realtime — stub que no emite eventos.
  const channelStub = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    state: 'joined',
  }
  channelStub.on.mockReturnValue(channelStub)
  channelStub.subscribe.mockReturnValue(channelStub)
  channelStub.unsubscribe.mockReturnValue(channelStub)

  const mock = {
    from: vi.fn(() => chain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth,
    channel: vi.fn(() => channelStub),
    removeChannel: vi.fn(),
    // Exposed para inspección y re-mock desde los tests
    _chain: chain,
    _channel: channelStub,
  }

  return mock
}

// Helper: resetea todos los mock.fn() del chain entre tests sin perder la
// estructura (útil dentro de beforeEach).
export function resetSupabaseMock(mock) {
  if (!mock) return
  mock.from.mockClear()
  mock.rpc.mockClear()
  mock.channel.mockClear()
  mock.removeChannel.mockClear()
  for (const key of Object.keys(mock._chain)) {
    const fn = mock._chain[key]
    if (fn && typeof fn.mockClear === 'function') fn.mockClear()
  }
  for (const key of Object.keys(mock.auth)) {
    const fn = mock.auth[key]
    if (fn && typeof fn.mockClear === 'function') fn.mockClear()
  }
}
