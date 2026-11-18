/**
 * pushService.js — avisos al celular (Web Push), lado del dispositivo.
 *
 * Reglas (v81):
 *   - El permiso SOLO se pide desde un botón (`enablePush`). Nunca al iniciar
 *     sesión: en iPhone no funciona sin un toque y en el resto molesta.
 *   - Al iniciar sesión, `syncPush` vuelve a registrar el dispositivo sin
 *     preguntar nada, si la persona ya había dado permiso y no lo apagó.
 *   - Todo lo que espera al service worker lleva tope de tiempo
 *     (`navigator.serviceWorker.ready` no resuelve nunca si no hay SW).
 *
 * El envío lo hace la edge function `send-push`; qué avisos suenan lo decide
 * la base (`fn_push_policy`). Ver ../README.md.
 */

import { supabase } from '@/lib/supabase'
import { isIos, isInstalled } from '@/lib/pwa'

// La clave pública VAPID es pública por diseño: viaja en cada suscripción y
// solo sirve para que el navegador sepa quién le puede escribir. La privada
// vive en los secrets de la edge function. Queda acá como valor por defecto
// para no depender de una variable de entorno del hosting.
const DEFAULT_VAPID_PUBLIC_KEY =
  'BK9b7rBiFIgRS63Ivr6gWBah8yc-8TB94wWP9vmL2xdTqbdrGsf951_xXrmAlKxpxZo0k5V0aq1PuuP-mtR0s_E'
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY

const SW_TIMEOUT_MS = 4000
const OPT_OUT_KEY = 'gymcoach-push-off'

// Convierte la clave VAPID de base64url a Uint8Array
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** ¿La suscripción existente se hizo con la misma clave que usamos hoy? */
export function sameKey(existing, expected) {
  if (!existing) return false
  const a = new Uint8Array(existing)
  if (a.length !== expected.length) return false
  return a.every((byte, i) => byte === expected[i])
}

function swReady() {
  let timer
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('sw_timeout')), SW_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timer))
}

function optedOut() {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1'
  } catch {
    return false
  }
}

function setOptedOut(value) {
  try {
    if (value) localStorage.setItem(OPT_OUT_KEY, '1')
    else localStorage.removeItem(OPT_OUT_KEY)
  } catch {
    /* sin localStorage: no se recuerda, nada más */
  }
}

/**
 * ¿Este dispositivo puede recibir avisos?
 *   'needs-install' → iPhone/iPad con la app abierta en Safari (hay que
 *                     agregarla a la pantalla de inicio)
 *   'unsupported'   → el navegador no tiene Web Push
 *   'ok'
 */
export function pushSupport() {
  if (isIos() && !isInstalled()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'unsupported'
  return 'ok'
}

/**
 * Estado de los avisos en ESTE dispositivo:
 *   'needs-install' | 'unsupported' | 'blocked' | 'off' | 'on'
 */
export async function getPushStatus() {
  const support = pushSupport()
  if (support !== 'ok') return support
  if (Notification.permission === 'denied') return 'blocked'
  if (Notification.permission !== 'granted') return 'off'
  try {
    const reg = await swReady()
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

async function ensureSubscription(reg) {
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  let sub = await reg.pushManager.getSubscription()
  // Suscripción hecha con otra clave (rotación): no sirve, se rehace.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe()
    sub = null
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  }
  return sub
}

async function saveSubscription(userId, sub) {
  const { endpoint, keys } = sub.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint, keys, user_agent: navigator.userAgent },
      { onConflict: 'user_id,endpoint' }
    )
  if (error) console.error('Error guardando suscripción push:', error)
  return !error
}

async function removeSubscription(userId) {
  const reg = await swReady()
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const { endpoint } = sub.toJSON()
  await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
  await sub.unsubscribe()
}

/**
 * Activa los avisos en este dispositivo. Llamar SOLO desde un click: pide el
 * permiso del sistema. Devuelve el estado resultante.
 */
export async function enablePush(userId) {
  const support = pushSupport()
  if (support !== 'ok') return support

  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'blocked'
  if (permission !== 'granted') return 'off'

  const reg = await swReady()
  const sub = await ensureSubscription(reg)
  if (!(await saveSubscription(userId, sub))) throw new Error('save_failed')
  setOptedOut(false)
  return 'on'
}

/** La persona apaga los avisos en este dispositivo (se recuerda). */
export async function disablePush(userId) {
  setOptedOut(true)
  await removeSubscription(userId)
}

/**
 * Al iniciar sesión: si este dispositivo ya tiene permiso y la persona no lo
 * apagó, lo deja registrado a su nombre. No pregunta nada.
 */
export async function syncPush(userId) {
  if (pushSupport() !== 'ok') return false
  if (Notification.permission !== 'granted' || optedOut()) return false
  try {
    const reg = await swReady()
    const sub = await ensureSubscription(reg)
    return await saveSubscription(userId, sub)
  } catch (err) {
    console.warn('No se pudo sincronizar el push:', err)
    return false
  }
}

/** Al cerrar sesión: este dispositivo deja de recibir avisos de esa cuenta. */
export async function unregisterPush(userId) {
  try {
    await removeSubscription(userId)
  } catch (err) {
    console.error('Error al cancelar push:', err)
  }
}

/**
 * Pide al servidor un aviso de prueba para los dispositivos de quien llama.
 * Recorre el camino real (edge function → servicio de push → dispositivo) y
 * no escribe en la base. Con `burst` > 1 llegan varios seguidos, para ver
 * cómo se muestran cuando se juntan. Devuelve { devices, delivered }.
 */
export async function sendTestPush({ burst = 1 } = {}) {
  const body = burst > 1 ? { test: true, burst } : { test: true }
  const { data, error } = await supabase.functions.invoke('send-push', { body })
  if (error) throw error
  return data
}
