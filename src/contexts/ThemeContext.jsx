// ThemeContext.jsx
// Persiste el modo oscuro en localStorage y aplica la clase 'dark' al <html>.
// Uso: envolver <App> con <ThemeProvider>, luego usar useTheme() en cualquier componente.

import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({ dark: false, toggleDark: () => {} })

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('theme')
      if (saved) return saved === 'dark'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  function toggleDark() {
    setDark(d => !d)
  }

  return (
    <ThemeContext.Provider value={{ dark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
