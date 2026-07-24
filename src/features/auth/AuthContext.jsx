import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { registerPush, unregisterPush } from '@/features/notifications/services/pushService'
import i18n, { preLoginLanguage } from '@/i18n'
import { readAuthSnapshot, writeAuthSnapshot, clearAuthSnapshot } from './authSnapshot'
import { clearWorkoutSnapshots } from '@/features/workouts/workoutSnapshot'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Pintado instantáneo (PWA cold start): si tenemos {user, profile} cacheados,
  // arrancamos con ese estado y SIN spinner, y revalidamos la sesión de Supabase
  // en silencio por detrás. Si la sesión resultó inválida, onAuthStateChange /
  // getSession la limpian y PrivateRoute redirige a /login.
  const initialAuth = useMemo(() => readAuthSnapshot(), [])
  const [user, setUser] = useState(initialAuth?.user ?? null)
  const [profile, setProfile] = useState(initialAuth?.profile ?? null)
  const [loading, setLoading] = useState(!initialAuth)
  // Ref al user más reciente para poder snapshotear (id + email) en fetchProfile.
  const userRef = useRef(initialAuth?.user ?? null)

  useEffect(() => {
    // Aplicar de una el idioma del perfil optimista para que la UI pinte en el
    // idioma correcto sin esperar la red.
    if (initialAuth?.profile?.language) i18n.changeLanguage(initialAuth.profile.language)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Obtener sesión actual (revalidación)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      userRef.current = sessionUser
      if (sessionUser) {
        fetchProfile(sessionUser)
      } else {
        // No hay sesión válida: limpiar cualquier estado optimista.
        setProfile(null)
        clearAuthSnapshot()
        clearWorkoutSnapshots()
        setLoading(false)
      }
    })

    // Escuchar cambios de auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      userRef.current = sessionUser
      if (sessionUser) {
        fetchProfile(sessionUser)
        // Registrar push al iniciar sesión o al recuperar sesión existente
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          registerPush(sessionUser.id).catch((err) =>
            console.warn('Push registration failed:', err)
          )
        }
      } else {
        setProfile(null)
        setLoading(false)
        // logout → limpiar snapshots y volver al default pre-login
        clearAuthSnapshot()
        clearWorkoutSnapshots()
        i18n.changeLanguage(preLoginLanguage())
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchProfile(userObj) {
    const userId = userObj?.id
    if (!userId) return
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()

      if (!error) {
        setProfile(data)
        // Persistir el snapshot para el próximo pintado instantáneo.
        writeAuthSnapshot({ user: userRef.current || userObj, profile: data })
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
    // Limpiar snapshots del pintado instantáneo para no filtrar datos entre cuentas.
    clearAuthSnapshot()
    clearWorkoutSnapshots()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  async function refreshProfile() {
    if (userRef.current) await fetchProfile(userRef.current)
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
