import { supabase } from '@/lib/supabase'
import { getNotificationTargetUrl } from '../components/NotificationBell'
import { CHAT_NOTIFICATION_TYPES, enrichWithPlanType } from '../hooks/useNotifications'

// A dónde lleva un aviso tocado en el celular (v81). Devuelve la ruta o null
// si el aviso no existe o no es de esta persona (RLS no lo devuelve).

export async function resolveNotificationDestination(id) {
  const { data } = await supabase
    .from('notifications')
    .select('id, type, data, read')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null

  const [enriched] = await enrichWithPlanType([data])

  // Lo que vive en el chat se marca leído al abrir ese chat, no acá.
  if (!data.read && !CHAT_NOTIFICATION_TYPES.includes(data.type)) {
    supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .then(() => {})
  }
  return getNotificationTargetUrl(enriched)
}
