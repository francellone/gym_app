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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Verificar sesión activa ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) return json({ error: 'Sesión inválida' }, 401)

    // ── 2. Verificar que el usuario es coach y obtener su ID del servidor ─
    // El coach_id se toma del token verificado, nunca del cliente.
    const { data: coachProfile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role, id')
      .eq('id', user.id)
      .single()

    if (profileError || coachProfile?.role !== 'coach') {
      return json({ error: 'Solo los coaches pueden crear alumnos' }, 403)
    }

    const coachId = coachProfile.id  // ← viene del servidor, no del cliente

    // ── 3. Leer y validar el body ───────────────────────────────────────
    const body = await req.json()
    const { email, password, name, profileData } = body

    if (!email || !password || !name) {
      return json({ error: 'Faltan campos obligatorios: email, password, name' }, 400)
    }

    // ── 4. Crear el usuario con service role (sin email de confirmación) ─
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'student' },
    })

    if (createError) {
      const msg = createError.message.toLowerCase()
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        return json({ error: 'Ya existe un alumno registrado con ese email.' }, 409)
      }
      throw createError
    }

    if (!newUserData.user) {
      throw new Error('No se pudo obtener el usuario creado')
    }

    const newUserId = newUserData.user.id

    // ── 5. UPSERT del perfil ────────────────────────────────────────────
    // Usamos UPSERT (no UPDATE) para manejar el timing del trigger:
    // si el trigger handle_new_user ya insertó el perfil → actualiza.
    // si todavía no insertó → inserta directamente.
    // coach_id viene del servidor (paso 2), no del cliente.
    const upsertPayload = {
      id: newUserId,
      email,
      name,
      role: 'student',
      coach_id: coachId,
      ...(profileData ?? {}),
      // Sobreescribir coach_id por si el cliente mandó algo distinto
      coach_id: coachId,
    }

    const { error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(upsertPayload, { onConflict: 'id' })

    if (upsertError) {
      console.error('[create-student] upsert error:', upsertError)
      throw upsertError
    }

    console.log(`[create-student] OK — alumno ${email} creado, coach_id=${coachId}`)
    return json({ user: { id: newUserId, email } }, 200)

  } catch (err) {
    console.error('[create-student] ERROR:', err)
    return json({ error: err.message ?? 'Error interno del servidor' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
