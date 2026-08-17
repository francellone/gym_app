import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { registerPush, unregisterPush } from '@/features/notifications/services/pushService'
import i18n, { preLoginLanguage } from '@/i18n'
import { readAuthSnapshot, writeAuthSnapshot, clearAuthSnapshot } from './authSnapshot'
import { clearWorkoutSnapshots } from '@/features/workouts/workoutSnapshot'

const AuthContext = createContext(null)

// Ningún paso del cierre de sesión puede dejar al usuario esperando para
// siempre: si una promesa no resuelve, el botón "Cerrar sesión" queda mudo.
const PUSH_UNREGISTER_TIMEOUT_MS = 3000
const SIGN_OUT_TIMEOUT_MS = 5000

/** Promesa con techo de tiempo: rechaza si `promise` no resuelve a tiempo. */
function withTimeout(promise, ms, label = 'operación') {
  let timer
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: timeout de ${ms}ms`)), ms)
    }),
  ])
}

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

  // Cerrar sesión es a prueba de cuelgues. Dos pasos podían bloquearlo:
  //   1) unregisterPush → navigator.serviceWorker.ready NUNCA resuelve si no
  //      hay service worker activo (pestaña sin SW registrado, iOS sin PWA).
  //   2) supabase.auth.signOut() → puede colgarse sin red.
  // Ambos corren con timeout y, pase lo que pase, la sesión local se limpia:
  // más vale cerrar de más que dejar al usuario apretando un botón muerto.
  async function signOut() {
    if (user) {
      await withTimeout(unregisterPush(user.id), PUSH_UNREGISTER_TIMEOUT_MS, 'unregisterPush').catch(
        (err) => console.warn('Push unregister failed:', err)
      )
    }
    // Limpiar snapshots del pintado instantáneo para no filtrar datos entre cuentas.
    clearAuthSnapshot()
    clearWorkoutSnapshots()
    try {
      const { error } = await withTimeout(
        supabase.auth.signOut(),
        SIGN_OUT_TIMEOUT_MS,
        'supabase.auth.signOut'
      )
      if (error) throw error
    } catch (err) {
      // Offline, token ya inválido o timeout: la sesión local igual no sirve.
      console.warn('signOut falló; se cierra la sesión local igual:', err)
    } finally {
      userRef.current = null
      setUser(null)
      setProfile(null)
    }
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
