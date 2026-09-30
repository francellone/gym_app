// ============================================================
// "Ambas" (v71): la coach que también entrena alterna entre su panel de
// coach y "Mi entrenamiento" (la vista de una persona sin coach).
// ============================================================

const VIEW_KEY = 'gymcoach_view'

/** La cuenta puede usar la vista de entrenamiento. */
export function canTrain(profile) {
  if (!profile) return false
  return profile.role === 'student' || (profile.role === 'coach' && Boolean(profile.also_trains))
}

/** Coach que además entrena: ve el selector de vista. */
export function hasBothViews(profile) {
  return profile?.role === 'coach' && Boolean(profile.also_trains)
}

export function readPreferredView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'student' ? 'student' : 'coach'
  } catch {
    return 'coach'
  }
}

export function savePreferredView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view === 'student' ? 'student' : 'coach')
  } catch {
    // storage bloqueado: se usa el panel de coach por defecto
  }
}
