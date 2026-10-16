import { useEffect, useState } from 'react'
import { cachedExerciseImageUrl, getExerciseImageUrl } from './exerciseImageUrls'

/**
 * URL firmada de una ruta de imagen de ejercicio.
 * null = sin imagen o no se pudo firmar · undefined = todavía firmando.
 */
export function useExerciseImageUrl(path) {
  const [state, setState] = useState(() => ({ path, url: cachedExerciseImageUrl(path) }))
  const url = state.path === path ? state.url : cachedExerciseImageUrl(path)

  useEffect(() => {
    if (!path) return
    let alive = true
    getExerciseImageUrl(path).then((u) => alive && setState({ path, url: u }))
    return () => {
      alive = false
    }
  }, [path])

  if (!path) return null
  return url === undefined ? undefined : url || null
}
