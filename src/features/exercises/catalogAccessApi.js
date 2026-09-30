// ============================================================
// Catálogo compartido de ejercicios — pedir / aprobar (v62 + v72)
// ============================================================
import { supabase } from '@/lib/supabase'

/** { is_owner, owner_name, status: null|'pending'|'approved'|'denied' } */
export async function fetchMyCatalogAccess() {
  const { data, error } = await supabase.rpc('my_catalog_access')
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) || null
}

export async function requestCatalogAccess() {
  const { error } = await supabase.rpc('request_catalog_access')
  if (error) throw error
}

export async function fetchCatalogRequests() {
  const { data, error } = await supabase.rpc('catalog_requests_for_owner')
  if (error) throw error
  return data || []
}

export async function decideCatalogAccess(coachId, approve) {
  const { error } = await supabase.rpc('decide_catalog_access', {
    p_coach: coachId,
    p_approve: approve,
  })
  if (error) throw error
}
