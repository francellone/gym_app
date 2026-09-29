// ============================================================
// Link de invitación de la coach y pedidos para sumarse (v65/v66).
// ============================================================
import { supabase } from '@/lib/supabase'

export async function fetchMyInviteCode() {
  const { data, error } = await supabase.rpc('my_invite_code')
  if (error) throw error
  return data
}

export async function regenerateInviteCode() {
  const { data, error } = await supabase.rpc('regenerate_invite_code')
  if (error) throw error
  return data
}

export async function fetchPendingLinkRequests() {
  const { data, error } = await supabase.rpc('my_pending_link_requests')
  if (error) throw error
  return data || []
}

export async function decideLinkRequest(requestId, accept) {
  const { data, error } = await supabase.rpc('decide_coach_link', {
    p_request_id: requestId,
    p_accept: accept,
  })
  if (error) throw error
  return data
}
