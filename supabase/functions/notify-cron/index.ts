/**
 * notify-cron — Supabase Edge Function
 *
 * Ejecuta las notificaciones basadas en tiempo:
 *   - Planes por vencer en 7 días        (diario)
 *   - Alumnos sin actividad en 7 días    (diario)
 *   - Resumen semanal                    (lunes)
 *
 * Luego envía push notifications a los dispositivos suscritos.
 *
 * ─── Cómo programar (Supabase dashboard) ────────────────────
 *   1. Deploy: supabase functions deploy notify-cron
 *   2. En el dashboard → Edge Functions → notify-cron → Schedule
 *      Cron: 0 8 * * *   (todos los días a las 08:00 UTC)
 *
 * ─── Variables de entorno requeridas ────────────────────────
 *   SUPABASE_URL          (auto-inyectada por Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY  (auto-inyectada)
 *   VAPID_PUBLIC_KEY      (generada con web-push CLI)
 *   VAPID_PRIVATE_KEY     (generada con web-push CLI)
 *   VAPID_SUBJECT         (ej: "mailto:coach@ejemplo.com")
 *   RESEND_API_KEY        (opcional, para emails)
 * ────────────────────────────────────────────────────────────
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

// ── Tipos ────────────────────────────────────────────────────
interface PushSubscription {
  user_id: string
  endpoint: string
  keys: { p256dh: string; auth: string }
}

interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
}

// ── Enviar Web Push ──────────────────────────────────────────
async function sendWebPush(sub: PushSubscription, notification: Notification) {
  const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:gymcoach@example.com'

  if (!vapidPublic || !vapidPrivate) {
    console.warn('VAPID keys not configured — skipping push')
    return
  }

  const payload = JSON.stringify({
    title: notification.title,
    body:  notification.body ?? '',
    data:  notification.data,
    icon:  '/favicon.svg',
    badge: '/favicon.svg',
  })

  // Usar la Web Push API nativa de Deno (disponible en Supabase Edge Functions)
  try {
    const { default: webpush } = await import('https://esm.sh/web-push@3.6.7')
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      payload
    )
  } catch (err) {
    console.error(`Push failed for ${sub.endpoint}:`, err)
  }
}

// ── Enviar email via Resend (opcional) ───────────────────────
async function sendEmail(
  email: string,
  subject: string,
  html: string
) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return  // Email desactivado si no hay key

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'GymCoach <notificaciones@tudominio.com>',
      to:   [email],
      subject,
      html,
    }),
  })
}

// ── Handler principal ────────────────────────────────────────
Deno.serve(async (req) => {
  // Permite invocación manual vía GET/POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const today     = new Date()
  const isMonday  = today.getDay() === 1  // 0=Dom, 1=Lun
  const results: string[] = []

  try {
    // ── 1. Planes por vencer ─────────────────────────────────
    const { error: e1 } = await supabase.rpc('fn_notify_expiring_plans')
    if (e1) console.error('fn_notify_expiring_plans:', e1)
    else results.push('expiring_plans ✓')

    // ── 2. Estancamiento ─────────────────────────────────────
    const { error: e2 } = await supabase.rpc('fn_notify_stagnation')
    if (e2) console.error('fn_notify_stagnation:', e2)
    else results.push('stagnation ✓')

    // ── 3. Resumen semanal (solo lunes) ──────────────────────
    if (isMonday) {
      const { error: e3 } = await supabase.rpc('fn_notify_weekly_summary')
      if (e3) console.error('fn_notify_weekly_summary:', e3)
      else results.push('weekly_summary ✓')
    }

    // ── 4. Push: enviar notificaciones no leídas recientes ───
    //    (creadas en los últimos 5 minutos para evitar reenvíos)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    const { data: recentNotifs } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, body, data')
      .gte('created_at', fiveMinAgo)
      .eq('read', false)

    if (recentNotifs && recentNotifs.length > 0) {
      // Obtener suscripciones push de todos los users afectados
      const userIds = [...new Set(recentNotifs.map((n: Notification) => n.user_id))]

      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('user_id, endpoint, keys')
        .in('user_id', userIds)

      if (subs) {
        for (const notif of recentNotifs as Notification[]) {
          const userSubs = (subs as PushSubscription[]).filter(
            s => s.user_id === notif.user_id
          )
          for (const sub of userSubs) {
            await sendWebPush(sub, notif)
          }
        }
        results.push(`push sent to ${subs.length} device(s) ✓`)
      }
    }

    // ── 5. Email para planes por vencer (opcional) ───────────
    //    Busca las notificaciones de plan_expiring recién creadas
    //    y envía email si RESEND_API_KEY está configurada
    if (Deno.env.get('RESEND_API_KEY')) {
      const { data: expiringNotifs } = await supabase
        .from('notifications')
        .select('user_id, title, body, data')
        .eq('type', 'plan_expiring')
        .gte('created_at', fiveMinAgo)

      if (expiringNotifs) {
        for (const notif of expiringNotifs) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, name')
            .eq('id', notif.user_id)
            .single()

          if (profile?.email) {
            await sendEmail(
              profile.email,
              notif.title,
              `<p>Hola ${profile.name},</p>
               <p>${notif.body}</p>
               <p>Ingresá a la app para renovar o ajustar el plan.</p>`
            )
          }
        }
        results.push('emails ✓')
      }
    }

    return new Response(
      JSON.stringify({ ok: true, results, timestamp: new Date().toISOString() }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('notify-cron error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
