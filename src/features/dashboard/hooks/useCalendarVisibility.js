import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_HIDDEN } from '../calendarLogic'

// ============================================================
// useCalendarVisibility (2026-09-27)
// ------------------------------------------------------------
// Qué tipos de evento están apagados en el calendario de la coach y
// en "Próximos 7 días". Se guarda en ESTE dispositivo (localStorage):
// es una comodidad de quien mira, no un dato de la app. Si el
// almacenamiento no está disponible (modo privado, etc.), arranca con
// DEFAULT_HIDDEN y funciona igual durante la visita.
//
// Calendario y agenda son componentes separados: se avisan entre sí
// con un evento de ventana para que un cambio se vea en los dos.
// ============================================================
// v2 (2026-09-27): cambió DEFAULT_HIDDEN (festejos apagados); la clave
// nueva hace que todos arranquen con los valores por defecto nuevos.
const KEY = 'coachCalendarHidden.v2'
const EVT = 'coach-calendar-visibility'

function read() {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return new Set(DEFAULT_HIDDEN)
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr) : new Set(DEFAULT_HIDDEN)
  } catch {
    return new Set(DEFAULT_HIDDEN)
  }
}

function write(set) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...set]))
  } catch {
    // sin almacenamiento: queda solo en memoria
  }
  try {
    window.dispatchEvent(new CustomEvent(EVT, { detail: [...set] }))
  } catch {
    // entornos sin CustomEvent
  }
}

export default function useCalendarVisibility() {
  const [hidden, setHidden] = useState(read)

  useEffect(() => {
    const onChange = (e) => {
      if (Array.isArray(e?.detail)) setHidden(new Set(e.detail))
      else setHidden(read())
    }
    const onStorage = (e) => {
      if (e.key === KEY) setHidden(read())
    }
    window.addEventListener(EVT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(EVT, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const toggle = useCallback(
    (kind) => {
      const next = new Set(hidden)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      setHidden(next)
      write(next)
    },
    [hidden]
  )

  const reset = useCallback(() => {
    const next = new Set(DEFAULT_HIDDEN)
    write(next)
    setHidden(next)
  }, [])

  const isDefault =
    hidden.size === DEFAULT_HIDDEN.length && DEFAULT_HIDDEN.every((k) => hidden.has(k))

  return { hidden, toggle, reset, isDefault }
}
