# `src/features/notifications/` — notificaciones (in-app + push)

Centraliza la entrega de avisos al usuario: badge con campana en los layouts, listado interactivo, suscripción a Web Push para que las notificaciones lleguen aún con la app cerrada.

**Movido a esta ubicación el 21/05/2026** desde `src/components/notifications/`, `src/hooks/useNotifications.js` y `src/services/pushService.js`.

## Estructura

```
notifications/
├── components/
│   └── NotificationBell.jsx     Dropdown con campana — montado en CoachLayout y StudentLayout. Maneja unread count, lista, mark-as-read y navegación al click.
├── hooks/
│   └── useNotifications.js      Hook que trae notificaciones (con realtime) + marca leídas + filtra borradas. Enriquece client-side plan_type y plan_title.
├── utils/
│   └── resolveNotificationText.js  i18n de notificaciones al alumno: resuelve title/body por type+payload desde los locales (es/en), con el texto guardado en BD como fallback.
└── services/
    └── pushService.js           Web Push API: registra/desregistra suscripción en `public.push_subscriptions` (sw.js corre el push handler).
```

## i18n del texto (2026-07-06)

Los triggers SQL (`fn_notify_*`) guardan `title`/`body` **en español**. Para los
tipos dirigidos al alumno (`coach_comment`, `plan_assigned`, `plan_updated`,
`plan_expiring`, `weekly_summary`), el front NO muestra ese texto: lo resuelve
`resolveNotificationText(notification, t)` desde `notifications.types.*` en los
locales, según el idioma activo del viewer. Cubre históricas y cambios de
idioma. El texto de BD queda como fallback (tipos del coach, copias del coach
de weekly_summary/plan_expiring — se distinguen por `data.student_name` —,
tipos desconocidos, payloads incompletos). Si se agrega un tipo nuevo dirigido
al alumno: sumar claves en `es/en.json` + case en el resolver.

⚠️ Si se activa Web Push: `notify-cron` manda el `title`/`body` de la tabla
(español) — habría que replicar la resolución en el edge function.

## Quién consume

| Consumidor                                | Importa                                            |
| ----------------------------------------- | -------------------------------------------------- |
| `src/components/layout/CoachLayout.jsx`   | `NotificationBell`                                 |
| `src/components/layout/StudentLayout.jsx` | `NotificationBell`                                 |
| `src/features/auth/AuthContext.jsx`       | `registerPush, unregisterPush` desde `pushService` |

Siempre con alias absoluto:

```js
import NotificationBell from '@/features/notifications/components/NotificationBell'
import { useNotifications } from '@/features/notifications/hooks/useNotifications'
import { registerPush, unregisterPush } from '@/features/notifications/services/pushService'
```

## Persistencia en Supabase

Dos tablas (RLS):

- **`notifications`** (79 filas al 2026-05-20). Una por evento dirigido al usuario. Tipos (CHECK constraint `notifications_type_check`): `coach_comment`, `plan_assigned`, `plan_updated`, `plan_expiring`, `form_submitted`, `session_completed`, `stagnation_alert`, `student_note`, `activity_update`, `weekly_summary`, `schema_health_alert`, `profile_change` (Q6 — 2026-05-23). Cada tipo se genera por un trigger del back (`fn_notify_*`). Si se agrega un nuevo tipo: ampliar el CHECK + sumar entry en `TYPE_CONFIG` y `getNotificationTargetUrl` en `NotificationBell.jsx`.
- **`push_subscriptions`** (0 filas al 2026-05-20 — feature en standby). Suscripciones Web Push activas. Una por (user_id + endpoint).

## Realtime

`useNotifications` se suscribe al canal `notifications:user_id=eq.<userId>` y recibe INSERTs en vivo. La campana en el layout actualiza el badge automáticamente.

## Service Worker

El handler vive en `public/sw.js` (no en esta feature, porque tiene que servirse en la raíz). `pushService.registerPush` se encarga de:

1. Pedir permiso al usuario.
2. Suscribir vía `navigator.serviceWorker.pushManager.subscribe`.
3. Persistir el endpoint en `push_subscriptions`.

El `notify-cron` edge function manda los push usando esos endpoints.

## Estado actual

Web Push está **implementado pero en standby** — `push_subscriptions` tiene 0 filas porque no se está pidiendo activamente al alumno que se suscriba. Si se decide activar, sumar el prompt en `StudentDashboard` o equivalente.
