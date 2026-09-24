// Contexto de celebraciones (separado del Provider para que el archivo del
// componente solo exporte componentes). Por defecto no muestra nada: fuera
// de StudentLayout (modo coach) las celebraciones están apagadas.
import { createContext, useContext } from 'react'

export const NOOP_CELEBRATIONS = { enabled: false, celebrate: () => {}, setHold: () => {} }
export const CelebrationContext = createContext(NOOP_CELEBRATIONS)

export function useCelebrations() {
  return useContext(CelebrationContext)
}
