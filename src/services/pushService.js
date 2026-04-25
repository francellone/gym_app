/**
 * pushService.js
 *
 * Gestiona el registro y cancelación de suscripciones Web Push.
 *
 * ─── Setup ───────────────────────────────────────────────────
 * 1. Generar par VAPID:
 *    npx web-push generate-vapid-keys
 *
 * 2. Agregar en .env:
 *    VITE_VAPID_PUBLIC_KEY=<clave pública>
 *
 * 3. Agregar en Supabase Edge Function secrets:
 *    supabase secrets set VAPID_PUBLIC_KEY=<clave pública>
 *    supabase secrets set VAPID_PRIVATE_KEY=<clave privada>
 *    supabase secrets set VAPID_SUBJECT=mailto:tucoach@dominio.com
 * ────────────────────────────────────────────────────────────
 */

import { supabase } from '../lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Convierte la clave VAPID de base64url a Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

/**
 * Solicita permiso y registra la suscripción push del dispositivo.
 * Guarda el endpoint en la tabla push_subscriptions.
 *
 * @returns {boolean} true si se registró correctamente
 */
export async function registerPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications no soportadas en este navegador')
    return false
  }

  if (!VAPID_PUBLIC_KEY) {
    console.warn('VITE_VAPID_PUBLIC_KEY no configurada — push desactivado')
    return false
  }

  // Pedir permiso
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  try {
    const reg = await navigator.serviceWorker.ready

    // Obtener o crear suscripción
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const { endpoint, keys } = sub.toJSON()

    // Guardar en Supabase (upsert por user_id + endpoint)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id:    userId,
          endpoint,
          keys,
          user_agent: navigator.userAgent,
        },
        { onConflict: 'user_id,endpoint' }
      )

    if (error) {
      console.error('Error guardando suscripción push:', error)
      return false
    }

    console.log('Push subscription registrada ✓')
    return true
  } catch (err) {
    console.error('Error al registrar push:', err)
    return false
  }
}

/**
 * Cancela la suscripción push del dispositivo actual y la elimina de la DB.
 */
export async function unregisterPush(userId) {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()

    if (sub) {
      const { endpoint } = sub.toJSON()

      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint)

      await sub.unsubscribe()
    }
  } catch (err) {
    console.error('Error al cancelar push:', err)
  }
}

/**
 * Verifica si las notificaciones push están activas en este dispositivo.
 */
export async function isPushEnabled() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  if (!VAPID_PUBLIC_KEY) return false

  const permission = Notification.permission
  if (permission !== 'granted') return false

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}
