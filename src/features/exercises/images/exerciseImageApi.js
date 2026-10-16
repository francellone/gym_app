// ============================================================
// Subir / quitar la imagen de un ejercicio (v74). Solo la dueña del
// ejercicio puede (políticas del bucket). Se llama desde el guardado del
// formulario del ejercicio, así "Cancelar" nunca deja nada a medias.
// ============================================================
import { supabase } from '@/lib/supabase'
import { EXERCISE_IMAGE_BUCKET, primeExerciseImageUrl } from './exerciseImageUrls'

export function buildExerciseImagePath(exerciseId, blob, now = Date.now()) {
  const ext = blob?.type === 'image/jpeg' ? 'jpg' : blob?.type === 'image/png' ? 'png' : 'webp'
  return `${exerciseId}/${now}.${ext}`
}

/** Sube el blob y deja la ruta en exercises.image_path. Devuelve la ruta. */
export async function uploadExerciseImage(exerciseId, blob) {
  const path = buildExerciseImagePath(exerciseId, blob)
  const { error } = await supabase.storage
    .from(EXERCISE_IMAGE_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/webp', upsert: false })
  if (error) throw error
  const { error: e2 } = await supabase
    .from('exercises')
    .update({ image_path: path })
    .eq('id', exerciseId)
  if (e2) {
    // Sin la ruta en la fila, el archivo quedaría huérfano: se borra.
    await supabase.storage.from(EXERCISE_IMAGE_BUCKET).remove([path])
    throw e2
  }
  try {
    primeExerciseImageUrl(path, URL.createObjectURL(blob))
  } catch {
    /* sin createObjectURL (tests): se firma al mostrarla */
  }
  return path
}

/** Deja el ejercicio sin imagen. */
export async function clearExerciseImage(exerciseId) {
  const { error } = await supabase
    .from('exercises')
    .update({ image_path: null })
    .eq('id', exerciseId)
  if (error) throw error
}

/** Borra un archivo viejo (reemplazado o quitado). Si falla no frena nada. */
export async function removeExerciseImageFile(path) {
  if (!path) return
  try {
    await supabase.storage.from(EXERCISE_IMAGE_BUCKET).remove([path])
  } catch (err) {
    console.warn('No se pudo borrar la imagen anterior:', err)
  }
}
