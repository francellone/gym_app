import { useEffect, useState } from 'react'
import { getStoredTheme, setStoredTheme } from './theme'

/** [modo guardado, cambiar modo] — se sincroniza entre pantallas abiertas */
export function useTheme() {
  const [mode, setMode] = useState(getStoredTheme)
  useEffect(() => {
    const onTheme = (e) => setMode(e.detail)
    window.addEventListener('gymcoach:theme', onTheme)
    return () => window.removeEventListener('gymcoach:theme', onTheme)
  }, [])
  return [mode, setStoredTheme]
}
