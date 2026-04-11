// supabase/functions/create-student/index.ts
// Edge Function que crea un alumno con permisos de admin.
// Ventajas frente al signUp() desde el frontend:
//  - Sin rate limit de emails
//  - email_confirm: true → el alumno queda listo para loguear de inmediato
//  - No toca la sesión del coach
//  - Solo puede ser llamada por un usuario con rol 'coach'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Verificar que hay sesión activa ──────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'No autorizado' }, 401)
    }

    // Cliente con anon key + sesión del coach para verificar su rol
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) return json({ error: 'Sesión inválida' }, 401)

    // ── 2. Verificar que el usuario es coach ────────────────────────────
    const { data: coachProfile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || coachProfile?.role !== 'coach') {
      return json({ error: 'Solo los coaches pueden crear alumnos' }, 403)
    }

    // ── 3. Leer y validar el body ───────────────────────────────────────
    const body = await req.json()
    const { email, password, name, profileData } = body

    if (!email || !password || !name) {
      return json({ error: 'Faltan campos obligatorios: email, password, name' }, 400)
    }

    // ── 4. Crear el usuario con service role (sin email de confirmación) ─
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // ← confirmado al instante, sin mandar email
      user_metadata: { name, role: 'student' },
    })

    if (createError) {
      // Manejar usuario duplicado específicamente
      if (createError.message.toLowerCase().includes('already registered') ||
          createError.message.toLowerCase().includes('already been registered')) {
        return json({ error: 'Ya existe un alumno registrado con ese email.' }, 409)
      }
      throw createError
    }

    // ── 5. Actualizar perfil en la tabla profiles ───────────────────────
    if (newUserData.user) {
      const updatePayload = {
        name,
        ...(profileData ?? {}),
      }

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(updatePayload)
        .eq('id', newUserData.user.id)

      if (updateError) throw updateError
    }

    return json({ user: { id: newUserData.user?.id, email } }, 200)

  } catch (err) {
    console.error('[create-student]', err)
    return json({ error: err.message ?? 'Error interno del servidor' }, 500)
  }
})

// Helper para respuestas JSON
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
