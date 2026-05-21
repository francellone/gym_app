# `src/features/auth/` — autenticación y sesión

Gestiona login, sesión activa, perfil del usuario logueado y el guard de rutas (`PrivateRoute`). Single source of truth para "quién está usando la app".

**Movido a esta ubicación el 21/05/2026** desde `src/contexts/AuthContext.jsx` y `src/pages/LoginPage.jsx`.

## Estructura

```
auth/
├── AuthContext.jsx        Context React + AuthProvider. Mantiene { user, profile, loading } y métodos para login/logout. Dispara registerPush al cerrar sesión y unregisterPush al cerrar.
└── pages/
    └── LoginPage.jsx      Pantalla pública /login. Email + password + manejo de errores. Redirige al dashboard según role.
```

## Quién consume

`useAuth()` se usa en **~20 archivos** (todos los layouts, todas las pages, varios tabs). Es el módulo más transversal del frontend.

| Consumidor representativo | Para qué |
|---|---|
| `src/App.jsx` | `AuthProvider` (wrap) + `LoginPage` (route) |
| `src/components/layout/CoachLayout.jsx` y `StudentLayout.jsx` | `useAuth()` para mostrar el perfil + logout |
| Todas las pages del coach y del alumno | `useAuth()` para sacar `profile.id`, `profile.role`, etc. |

Siempre con alias absoluto:

```js
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import LoginPage from '@/features/auth/pages/LoginPage'
```

## Persistencia en Supabase

No tiene tabla propia — usa `auth.users` (manejado por Supabase Auth) + `public.profiles` (extensión con `role`, `name`, `coach_id`, etc.).

El flujo de sesión:

1. `supabase.auth.signInWithPassword({ email, password })` desde `LoginPage`.
2. `AuthProvider` escucha `onAuthStateChange` y al cambiar carga el `profile` de `public.profiles`.
3. Si `profile.role === 'student'`, intenta `registerPush()` (en standby — ver `../notifications/`).
4. Al logout: `unregisterPush()` + `supabase.auth.signOut()`.

## Reglas que NO se rompen

- **Crear alumnos no usa este módulo.** Para no perder la sesión del coach, la creación de alumnos pasa por la edge function `create-student` que usa un cliente aislado (`supabaseIsolated` en `src/lib/supabase.js`). Ver el changelog para el por qué.
- **`profiles` no tiene policy `DELETE`.** "Borrar" cuentas = `active = false` + `is_test = true`.
- **El cliente principal `supabase`** persiste la sesión en `localStorage`. Si se usa SSR o se quiere session-less, importar `supabaseIsolated` en su lugar.
