import { useEffect, useState } from 'react'
import { getStoredTheme, resolveTheme, setStoredTheme } from './theme'

/**
 * [modo guardado, cambiar modo, tema efectivo 'light'|'dark'].
 * Se sincroniza entre componentes y con el cambio de tema del celular.
 */
export function useTheme() {
  const [mode, setMode] = useState(getStoredTheme)
  const [resolved, setResolved] = useState(() => resolveTheme(getStoredTheme()))
  useEffect(() => {
    const onTheme = (e) => {
      setMode(e.detail)
      setResolved(resolveTheme(e.detail))
    }
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onSystem = () => setResolved(resolveTheme(getStoredTheme()))
    window.addEventListener('gymcoach:theme', onTheme)
    mq?.addEventListener?.('change', onSystem)
    return () => {
      window.removeEventListener('gymcoach:theme', onTheme)
      mq?.removeEventListener?.('change', onSystem)
    }
  }, [])
  return [mode, setStoredTheme, resolved]
}
