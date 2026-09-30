// ============================================================
// Catálogo de coaches — del lado de la persona (v69)
// ============================================================
import { supabase } from '@/lib/supabase'

export async function fetchCoachDirectory() {
  const { data, error } = await supabase.rpc('list_coach_directory')
  if (error) throw error
  return data || []
}

export async function fetchMyPendingCoachRequest() {
  const { data, error } = await supabase.rpc('my_pending_coach_request')
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) || null
}

export async function requestListedCoach(coachId, shareHistory) {
  const { error } = await supabase.rpc('request_coach_link_listed', {
    p_coach_id: coachId,
    p_share_history: shareHistory,
  })
  if (error) throw error
}

export async function cancelCoachRequest() {
  const { error } = await supabase.rpc('cancel_coach_link_request')
  if (error) throw error
}

/** Presentación en el idioma de quien mira; si no hay, la otra. */
export function bioFor(coach, lang) {
  const bio = coach?.bio || {}
  const want = lang === 'en' ? 'en' : 'es'
  return (bio[want] || bio[want === 'en' ? 'es' : 'en'] || '').trim()
}

const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Filtros del catálogo. city: texto libre (sin tildes ni mayúsculas).
 * workMode: 'online' | 'in_person' | '' — 'both' cumple cualquiera.
 * language: 'es' | 'en' | ''.
 */
export function filterCoaches(coaches, { city = '', workMode = '', language = '' } = {}) {
  const c = norm(city)
  return (coaches || []).filter((coach) => {
    if (c && !norm(coach.coach_city).includes(c)) return false
    if (workMode && coach.coach_work_mode !== workMode && coach.coach_work_mode !== 'both')
      return false
    if (language && !(coach.coach_languages || []).includes(language)) return false
    return true
  })
}
