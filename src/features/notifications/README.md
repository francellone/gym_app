# `src/features/notifications/` — avisos (campana + celular)

Dos salidas para el mismo aviso:

1. **Campana** dentro de la app (tiempo real).
2. **Aviso al celular** (Web Push), aunque la app esté cerrada. Activo desde v81.

Todo aviso es una fila de `public.notifications`, generada por un trigger o un cron de la base (`fn_notify_*`). El push no se programa por tipo: se cuelga de esa tabla.

## Estructura

```
notifications/
├── components/
│   ├── NotificationBell.jsx     Campana + lista. Exporta getNotificationTargetUrl (a dónde lleva cada tipo).
│   ├── PushSettingsCard.jsx     Tarjeta "Avisos en este dispositivo": activar, probar, desactivar.
│   └── PushPromptBanner.jsx     Cartel de una sola vez que ofrece activarlos.
├── hooks/
│   └── useNotifications.js      Carga + realtime + marcar leídas. Enriquece plan_type y plan_title.
├── pages/
│   └── NotificationRedirectPage.jsx   Ruta /n/:id — destino de un aviso tocado en el celular.
├── services/
│   └── pushService.js           Estado del dispositivo, activar/desactivar, sincronizar al entrar, aviso de prueba.
└── utils/
    └── resolveNotificationText.js   Texto de la campana en el idioma de quien mira.
```

## El circuito del aviso al celular (v81)

```
evento → trigger fn_notify_* → fila en notifications
                                  │ BEFORE INSERT: ¿fn_push_policy(tipo, rol)?
                                  ▼
                          push_status = 'pending'
                                  │ pg_cron, cada minuto: fn_dispatch_push()
                                  ▼
                     edge function send-push
            reclama (pending → sent) y envía a push_subscriptions
                                  ▼
            sw.js muestra el aviso → toque → /n/<id> → destino real
```

- **Qué suena** lo decide `public.fn_push_policy(tipo, rol)` en la base. Es la única fuente. Hoy: para el coach `student_note`, `form_submitted`, `evaluation_completed`, `coach_link_request`, `exercise_unclear`. Todo lo demás, solo campana. Para quien entrena, nada todavía.
- **Demora:** hasta un minuto (lo que tarda el cron). Se eligió cron + extensión `http` en vez de un trigger con `pg_net` porque la instancia no tiene memoria para un proceso más (ver v80).
- **Sin duplicados:** la función reclama las filas de forma atómica antes de enviar.
- **Auditoría:** `notifications.push_status` (`pending`, `sent`, `no_devices`, `failed`, `expired`) y `push_sent_at`.
- **Destino:** el push lleva `/n/<id>`. `NotificationRedirectPage` usa `getNotificationTargetUrl`, la misma función que la campana. El service worker no conoce los tipos.
- **Apagarlo:** `select cron.unschedule('dispatch_push');`

## Reglas del lado del dispositivo

- El permiso se pide **solo desde un botón** (`enablePush`). Nunca al iniciar sesión.
- Al iniciar sesión, `syncPush` vuelve a registrar el dispositivo sin preguntar, si ya había permiso y la persona no lo apagó.
- Al cerrar sesión, `unregisterPush` saca el dispositivo de esa cuenta.
- El estado es **por dispositivo**, no por cuenta: cada celular o compu se activa por separado.
- **iPhone:** el push solo existe con la app instalada en la pantalla de inicio (iOS 16.4+). En Safari la tarjeta explica cómo instalarla.
- La app ya **no dispara avisos nativos por su cuenta** con la pestaña en segundo plano: duplicaba el push y hacía sonar tipos que son solo de campana.
- La clave pública VAPID está en `pushService.js` como valor por defecto (es pública por diseño). La privada vive en los secrets de `send-push`.

## Probar

- Tarjeta → "Enviar aviso de prueba": recorre el camino real (edge function → servicio de push → dispositivo) y no escribe nada en la base.
- Salud de las claves: `GET https://<proyecto>.supabase.co/functions/v1/send-push` devuelve `keys_match`.
- Etapa coach: a quien entrena la tarjeta no se le muestra. Para probarla desde una cuenta de persona, abrir una vez `/student/profile?avisos=1` en ese dispositivo.

## Agregar un tipo de aviso

1. Ampliar el CHECK `notifications_type_check` y crear el trigger `fn_notify_*`.
2. `TYPE_CONFIG` y `getNotificationTargetUrl` en `NotificationBell.jsx` (+ test).
3. Si va a quien entrena: claves en `notifications.types.*` de `es/en.json` y case en `resolveNotificationText`.
4. Si tiene que sonar en el celular: sumarlo en `fn_push_policy` (migración nueva).

## Pendiente para la etapa de quien entrena

- `send-push` manda el `title`/`body` de la tabla, que está en español: hay que resolver el texto por idioma ahí (hoy lo hace solo el front, en `resolveNotificationText`).
- Sumar los tipos en `fn_push_policy` y mostrar la tarjeta y el cartel en la vista de quien entrena (quitar `pushPreviewEnabled`).

## Quién consume

| Consumidor                                     | Importa                                    |
| ---------------------------------------------- | ------------------------------------------ |
| `src/components/layout/CoachLayout.jsx`        | `NotificationBell`, `PushPromptBanner`     |
| `src/components/layout/StudentLayout.jsx`      | `NotificationBell`                         |
| `src/features/auth/AuthContext.jsx`            | `syncPush`, `unregisterPush`               |
| `src/features/auth/pages/CoachProfilePage.jsx` | `PushSettingsCard`                         |
| `src/features/auth/pages/ProfilePage.jsx`      | `PushSettingsCard` (solo en modo prueba)   |
| `src/App.jsx`                                  | `NotificationRedirectPage` (ruta `/n/:id`) |
