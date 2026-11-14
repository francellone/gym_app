/**
 * send-push — Supabase Edge Function (v81)
 *
 * Único punto de salida de los avisos al celular (Web Push).
 *
 * Tres modos:
 *   GET                      → chequeo de salud: ¿están las claves VAPID y
 *                              la privada corresponde a la pública?
 *   POST {}                  → DESPACHO. Lo llama pg_cron cada minuto vía
 *                              public.fn_dispatch_push() cuando hay filas de
 *                              notifications con push_status = 'pending'.
 *   POST { test: true }      → PRUEBA. Con el JWT de la persona: manda un
 *                              aviso de prueba SOLO a sus propios dispositivos.
 *                              No escribe nada en la base.
 *
 * Por qué no pide JWT (verify_jwt = false):
 *   - El despacho no recibe datos: solo envía lo que la base ya marcó como
 *     pendiente, y lo reclama de forma atómica (pending → sent) antes de
 *     enviar. Llamarla de afuera no puede inventar avisos ni duplicarlos; a
 *     lo sumo adelanta unos segundos un envío que iba a salir igual.
 *   - La prueba valida el JWT acá adentro y solo le escribe a quien llama.
 *
 * Qué avisos suenan lo decide la base (public.fn_push_policy), no esta función.
 *
 * Idioma (v82): los avisos a quien entrena salen en el idioma de su perfil.
 * Los textos viven en ./push-texts.json y son copia de `notifications.types.*`
 * de los locales del front; un test del repo (pushTexts.parity.test.js) falla
 * si se desalinean. El resto de los tipos sale con el texto de la tabla.
 *
 * Secrets necesarios (Dashboard → Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { createECDH } from 'node:crypto'
import { Buffer } from 'node:buffer'
import pushTexts from './push-texts.json' with { type: 'json' }

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:francellone@gmail.com'

// Un aviso viejo ya no sirve: si no salió en este lapso, no sale.
const MAX_AGE_MINUTES = 30
const TTL_SECONDS = 60 * 60
const BODY_MAX = 180

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function b64url(buf: Uint8Array) {
  return Buffer.from(buf).toString('base64url')
}

/** ¿La clave privada cargada es la pareja de la pública? */
function keysMatch(): boolean {
  try {
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(VAPID_PRIVATE, 'base64url'))
    return b64url(ecdh.getPublicKey()) === VAPID_PUBLIC.replace(/=+$/, '')
  } catch {
    return false
  }
}

let vapidReady = false
function ensureVapid(): boolean {
  if (vapidReady) return true
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  vapidReady = true
  return true
}

interface Sub {
  user_id: string
  endpoint: string
  keys: { p256dh: string; auth: string }
}

interface Notif {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown> | null
}

/** Envía a un dispositivo. Devuelve true si el servicio de push lo aceptó. */
async function sendTo(sub: Sub, payload: Record<string, unknown>): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
      { TTL: TTL_SECONDS, urgency: 'high' }
    )
    return true
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode
    // 404/410 = el dispositivo ya no existe (desinstaló, revocó el permiso).
    if (status === 404 || status === 410) {
      await admin
        .from('push_subscriptions')
        .delete()
        .eq('user_id', sub.user_id)
        .eq('endpoint', sub.endpoint)
    } else {
      console.error('push falló', status, String(err).slice(0, 200))
    }
    return false
  }
}

type Lang = 'es' | 'en'
type TypeTexts = { title: string; body?: string; bodyNoTitle?: string }
const TEXTS = pushTexts as Record<Lang, Record<string, TypeTexts>>

/** Título y cuerpo en el idioma de quien lo recibe (misma regla que la campana). */
function textFor(n: Notif, lang: Lang, planTitle: string | null) {
  const t = TEXTS[lang]?.[n.type]
  if (!t) return { title: n.title, body: n.body ?? '' }
  // coach_comment: el cuerpo es lo que escribió la coach; no se traduce.
  if (n.type === 'coach_comment') return { title: t.title, body: n.body ?? '' }
  if (n.type === 'plan_assigned') {
    return {
      title: t.title,
      body: planTitle ? t.body!.replace('{{planTitle}}', planTitle) : t.bodyNoTitle!,
    }
  }
  return { title: t.title, body: n.body ?? '' }
}

function payloadFor(n: Notif, lang: Lang, planTitle: string | null) {
  const data = n.data ?? {}
  const text = textFor(n, lang, planTitle)
  const body = text.body.trim()
  return {
    id: n.id,
    type: n.type,
    title: text.title,
    body: body.length > BODY_MAX ? body.slice(0, BODY_MAX - 1) + '…' : body,
    // La app resuelve el destino real con la misma lógica que la campana.
    url: `/n/${n.id}`,
    // Mismo tipo + misma persona = un solo aviso que se actualiza.
    tag: `${n.type}:${data.student_id ?? data.thread_id ?? n.id}`,
  }
}

async function dispatch() {
  if (!ensureVapid()) return json({ ok: false, error: 'vapid_not_configured' }, 500)

  const cutoff = new Date(Date.now() - MAX_AGE_MINUTES * 60 * 1000).toISOString()

  // Reclamo atómico: lo que este llamado toma, ningún otro lo vuelve a tomar.
  const { data: claimed, error } = await admin
    .from('notifications')
    .update({ push_status: 'sent', push_sent_at: new Date().toISOString() })
    .eq('push_status', 'pending')
    .gte('created_at', cutoff)
    .select('id, user_id, type, title, body, data')

  if (error) return json({ ok: false, error: error.message }, 500)
  const notifs = (claimed ?? []) as Notif[]
  if (notifs.length === 0) return json({ ok: true, claimed: 0 })

  const userIds = [...new Set(notifs.map((n) => n.user_id))]
  const { data: subsData } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, keys')
    .in('user_id', userIds)
  const subs = (subsData ?? []) as Sub[]

  // Idioma de cada persona y título de los planes mencionados (el trigger de
  // plan_assigned no guarda el título en el payload).
  const planIds = [
    ...new Set(
      notifs
        .filter((n) => n.type === 'plan_assigned' && n.data?.plan_id && !n.data?.plan_title)
        .map((n) => String(n.data!.plan_id))
    ),
  ]
  const [{ data: profiles }, { data: plans }] = await Promise.all([
    admin.from('profiles').select('id, language').in('id', userIds),
    planIds.length
      ? admin.from('plans').select('id, title').in('id', planIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ])
  const langOf = new Map((profiles ?? []).map((p) => [p.id, p.language === 'en' ? 'en' : 'es']))
  const titleOf = new Map((plans ?? []).map((p) => [p.id, p.title]))

  const noDevices: string[] = []
  const failed: string[] = []
  let delivered = 0

  for (const n of notifs) {
    const mine = subs.filter((s) => s.user_id === n.user_id)
    if (mine.length === 0) {
      noDevices.push(n.id)
      continue
    }
    const lang = (langOf.get(n.user_id) ?? 'es') as Lang
    const planTitle =
      (n.data?.plan_title as string | undefined) ?? titleOf.get(String(n.data?.plan_id)) ?? null
    const payload = payloadFor(n, lang, planTitle)
    const results = await Promise.all(mine.map((s) => sendTo(s, payload)))
    if (results.some(Boolean)) delivered++
    else failed.push(n.id)
  }

  if (noDevices.length) {
    await admin
      .from('notifications')
      .update({ push_status: 'no_devices', push_sent_at: null })
      .in('id', noDevices)
  }
  if (failed.length) {
    await admin
      .from('notifications')
      .update({ push_status: 'failed', push_sent_at: null })
      .in('id', failed)
  }

  return json({
    ok: true,
    claimed: notifs.length,
    delivered,
    failed: failed.length,
    no_devices: noDevices.length,
  })
}

const TEST_TEXT: Record<string, { title: string; body: string }> = {
  es: { title: 'GymCoach', body: 'Los avisos funcionan en este dispositivo.' },
  en: { title: 'GymCoach', body: 'Notifications are working on this device.' },
}

async function testPush(req: Request) {
  if (!ensureVapid()) return json({ ok: false, error: 'vapid_not_configured' }, 500)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await admin.auth.getUser(token)
  const userId = auth?.user?.id
  if (!userId) return json({ ok: false, error: 'unauthorized' }, 401)

  const [{ data: profile }, { data: subsData }] = await Promise.all([
    admin.from('profiles').select('language').eq('id', userId).maybeSingle(),
    admin.from('push_subscriptions').select('user_id, endpoint, keys').eq('user_id', userId),
  ])
  const subs = (subsData ?? []) as Sub[]
  if (subs.length === 0) return json({ ok: true, devices: 0, delivered: 0 })

  const text = TEST_TEXT[profile?.language === 'en' ? 'en' : 'es']
  const results = await Promise.all(
    subs.map((s) => sendTo(s, { ...text, type: 'push_test', url: '/', tag: 'push_test' }))
  )
  return json({ ok: true, devices: subs.length, delivered: results.filter(Boolean).length })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    // El cliente de Supabase agrega cabeceras propias que cambian entre
    // versiones; una lista fija termina bloqueando el POST en el navegador.
    // Se autoriza exactamente lo que el navegador dice que va a mandar.
    const asked = req.headers.get('Access-Control-Request-Headers')
    return new Response('ok', {
      headers: { ...cors, ...(asked ? { 'Access-Control-Allow-Headers': asked } : {}) },
    })
  }

  try {
    if (req.method === 'GET') {
      return json({
        ok: true,
        vapid_public: !!VAPID_PUBLIC,
        vapid_private: !!VAPID_PRIVATE,
        keys_match: !!VAPID_PUBLIC && !!VAPID_PRIVATE && keysMatch(),
        public_key: VAPID_PUBLIC || null,
      })
    }
    if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

    const body = await req.json().catch(() => ({}))
    return body?.test === true ? await testPush(req) : await dispatch()
  } catch (err) {
    console.error('send-push error', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
