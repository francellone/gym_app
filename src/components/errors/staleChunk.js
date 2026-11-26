/** true si el error viene de un chunk que ya no existe (deploy nuevo). */
export function isStaleChunkError(error) {
  const msg = String(error?.message || error || '')
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|error loading dynamically/i.test(
    msg
  )
}
