import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { registerPush, unregisterPush } from '@/features/notifications/services/pushService'
import i18n, { preLoginLanguage } from '@/i18n'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Obtener sesión actual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // Escuchar cambios de auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        // Registrar push al iniciar sesión o al recuperar sesión existente
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          registerPush(session.user.id).catch((err) =>
            console.warn('Push registration failed:', err)
          )
        }
      } else {
        setProfile(null)
        setLoading(false)
        // logout → volver al default pre-login (preferencia guardada o idioma del navegador)
        i18n.changeLanguage(preLoginLanguage())
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()

      if (!error) {
        setProfile(data)
        // i18n (doc 46): el idioma de la UI sigue a profiles.language.
        // Default 'es' — coach y alumnos sin preferencia ven todo igual que antes.
        i18n.changeLanguage(data?.language || 'es')
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    // Desregistrar push antes de cerrar sesión
    if (user) {
      await unregisterPush(user.id).catch((err) => console.warn('Push unregister failed:', err))
    }
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
