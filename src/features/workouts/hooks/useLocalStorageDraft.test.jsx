// ============================================================
// useLocalStorageDraft.test.jsx — F4 hook de draft local
// ------------------------------------------------------------
// Cubrimos:
//   - Restore al mount cuando hay draft válido.
//   - No-restore si TTL expirado (y limpieza oportunista).
//   - No-restore si enabled=false.
//   - Write debounced (avanzar timers con vi.useFakeTimers).
//   - clearDraft() borra y resetea estado.
//   - Storage que lanza no rompe la UI.
//   - Cambio de key dispara re-restore.
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import useLocalStorageDraft from './useLocalStorageDraft'
import { buildDraftKey, wrapDraftEnvelope, SCHEMA_VERSION } from '../draftStorage'

function createMemoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    get length() {
      return Object.keys(data).length
    },
    key(i) {
      return Object.keys(data)[i] ?? null
    },
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null
    },
    setItem(k, v) {
      data[k] = String(v)
    },
    removeItem(k) {
      delete data[k]
    },
    clear() {
      Object.keys(data).forEach((k) => delete data[k])
    },
    _dump() {
      return { ...data }
    },
  }
}

function makeKey(extra = {}) {
  return buildDraftKey({
    studentId: 's1',
    planExerciseId: 'pe1',
    loggedDate: '2026-05-24',
    ...extra,
  })
}

describe('useLocalStorageDraft', () => {
  let storage
  let onRestore

  beforeEach(() => {
    storage = createMemoryStorage()
    onRestore = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('restaura el draft al mount si existe y no expiró', () => {
    const key = makeKey()
    const payload = { actual_sets: '3', actual_reps_arr: ['10', '8', ''] }
    storage.setItem(key, wrapDraftEnvelope(payload, new Date().toISOString()))

    const { result } = renderHook(() =>
      useLocalStorageDraft({
        key,
        value: { actual_sets: '' }, // default vacío, antes del restore
        enabled: true,
        storage,
        onRestore,
      })
    )

    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(onRestore).toHaveBeenCalledWith(payload, expect.any(String))
    expect(result.current.restoredAt).toBeTypeOf('string')
  })

  it('no restaura si el draft expiró y lo barre del storage', () => {
    const key = makeKey()
    const veryOld = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString() // 9h
    storage.setItem(key, wrapDraftEnvelope({ x: 1 }, veryOld))

    const { result } = renderHook(() =>
      useLocalStorageDraft({ key, value: {}, enabled: true, storage, onRestore })
    )

    expect(onRestore).not.toHaveBeenCalled()
    expect(result.current.restoredAt).toBeNull()
    expect(storage.getItem(key)).toBeNull()
  })

  it('no restaura si enabled=false', () => {
    const key = makeKey()
    storage.setItem(key, wrapDraftEnvelope({ x: 1 }, new Date().toISOString()))

    renderHook(() =>
      useLocalStorageDraft({ key, value: {}, enabled: false, storage, onRestore })
    )

    expect(onRestore).not.toHaveBeenCalled()
  })

  it('no restaura si no hay key', () => {
    renderHook(() =>
      useLocalStorageDraft({ key: null, value: {}, enabled: true, storage, onRestore })
    )
    expect(onRestore).not.toHaveBeenCalled()
  })

  it('escribe debounced al cambiar value', async () => {
    vi.useFakeTimers()
    const key = makeKey()
    const initial = { actual_sets: '3', actual_reps_arr: ['', '', ''] }

    const { rerender } = renderHook(
      ({ value }) =>
        useLocalStorageDraft({
          key,
          value,
          enabled: true,
          storage,
          onRestore,
          debounceMs: 400,
        }),
      { initialProps: { value: initial } }
    )

    // Cambio de value → arranca timer
    rerender({ value: { ...initial, actual_reps_arr: ['10', '', ''] } })

    // Antes del debounce no hay escritura
    expect(storage.getItem(key)).toBeNull()

    // Avanzar 200ms: aún no
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(storage.getItem(key)).toBeNull()

    // Avanzar otros 250ms → cruzamos los 400ms
    act(() => {
      vi.advanceTimersByTime(250)
    })

    const raw = storage.getItem(key)
    expect(raw).not.toBeNull()
    const env = JSON.parse(raw)
    expect(env.payload.actual_reps_arr).toEqual(['10', '', ''])
  })

  it('múltiples cambios solo escriben una vez al asentarse', () => {
    vi.useFakeTimers()
    const key = makeKey()

    const { rerender } = renderHook(
      ({ value }) =>
        useLocalStorageDraft({ key, value, enabled: true, storage, onRestore, debounceMs: 400 }),
      { initialProps: { value: { v: 0 } } }
    )

    rerender({ value: { v: 1 } })
    act(() => vi.advanceTimersByTime(100))
    rerender({ value: { v: 2 } })
    act(() => vi.advanceTimersByTime(100))
    rerender({ value: { v: 3 } })

    // Aún no escribió porque el debounce sigue reiniciándose
    expect(storage.getItem(key)).toBeNull()

    act(() => vi.advanceTimersByTime(450))

    const env = JSON.parse(storage.getItem(key))
    expect(env.payload).toEqual({ v: 3 })
  })

  it('clearDraft borra del storage y resetea restoredAt', () => {
    const key = makeKey()
    storage.setItem(key, wrapDraftEnvelope({ x: 1 }, new Date().toISOString()))

    const { result } = renderHook(() =>
      useLocalStorageDraft({ key, value: {}, enabled: true, storage, onRestore })
    )

    expect(result.current.restoredAt).not.toBeNull()

    act(() => {
      result.current.clearDraft()
    })

    expect(storage.getItem(key)).toBeNull()
    expect(result.current.restoredAt).toBeNull()
  })

  it('storage que lanza no rompe la UI (Safari privado / cuota)', () => {
    vi.useFakeTimers()
    const throwing = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const key = makeKey()

    const { rerender, result } = renderHook(
      ({ value }) =>
        useLocalStorageDraft({
          key,
          value,
          enabled: true,
          storage: throwing,
          onRestore,
          debounceMs: 400,
        }),
      { initialProps: { value: { v: 0 } } }
    )

    expect(onRestore).not.toHaveBeenCalled()
    expect(result.current.restoredAt).toBeNull()

    // Cambiar value y avanzar timer no debe romper
    rerender({ value: { v: 1 } })
    expect(() => {
      act(() => vi.advanceTimersByTime(500))
    }).not.toThrow()

    // clearDraft tampoco rompe
    expect(() => {
      act(() => result.current.clearDraft())
    }).not.toThrow()
  })

  it('cambio de key re-dispara restore con el nuevo draft', async () => {
    const keyA = makeKey({ planExerciseId: 'pe-A' })
    const keyB = makeKey({ planExerciseId: 'pe-B' })
    storage.setItem(keyA, wrapDraftEnvelope({ from: 'A' }, new Date().toISOString()))
    storage.setItem(keyB, wrapDraftEnvelope({ from: 'B' }, new Date().toISOString()))

    const { rerender } = renderHook(
      ({ key }) =>
        useLocalStorageDraft({ key, value: {}, enabled: true, storage, onRestore }),
      { initialProps: { key: keyA } }
    )

    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1))
    expect(onRestore).toHaveBeenLastCalledWith({ from: 'A' }, expect.any(String))

    rerender({ key: keyB })

    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(2))
    expect(onRestore).toHaveBeenLastCalledWith({ from: 'B' }, expect.any(String))
  })

  it('si onRestore lanza, no rompe el render', () => {
    const key = makeKey()
    storage.setItem(key, wrapDraftEnvelope({ x: 1 }, new Date().toISOString()))
    const boom = vi.fn(() => {
      throw new Error('explodey')
    })

    expect(() => {
      renderHook(() =>
        useLocalStorageDraft({ key, value: {}, enabled: true, storage, onRestore: boom })
      )
    }).not.toThrow()

    expect(boom).toHaveBeenCalledTimes(1)
  })

  it('rechaza envelope con version distinta (v=99)', () => {
    const key = makeKey()
    storage.setItem(
      key,
      JSON.stringify({ v: SCHEMA_VERSION + 99, savedAt: new Date().toISOString(), payload: {} })
    )

    renderHook(() =>
      useLocalStorageDraft({ key, value: {}, enabled: true, storage, onRestore })
    )

    expect(onRestore).not.toHaveBeenCalled()
  })
})
