import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY')
}

// Cliente principal (usa la sesión del usuario logueado)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente aislado para crear alumnos sin tocar la sesión del coach.
// Si usáramos el cliente principal, el signUp() del alumno podría
// reemplazar la sesión activa del coach y desloguearlo.
export const supabaseIsolated = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  },
})
