# Experimento multiclub aplicado por error en gym_app — 2026-05-19

## Resumen

Entre las **13:47** y las **14:00** del 19/05/2026, el esquema del proyecto **"Aplicación para clubes deportivos"** (una app distinta, con su propio modelo de datos) se aplicó por error contra la base productiva del **gym_app** (proyecto Supabase `bvexjanqmfypmtgoapbt`). 23 minutos después el ejecutor se dio cuenta y aplicó el rollback. **Nadie alcanzó a tocar las nuevas tablas en ese intervalo** — Franco lo confirmó el 2026-05-20.

Esta carpeta archiva el SQL exacto que se aplicó y el rollback que lo revirtió, **bajado desde el historial de `supabase_migrations.schema_migrations` del propio gym_app**. Su único objetivo es trazabilidad: el SQL no figuraba como archivo en el repo (se aplicó por MCP) y sin esta copia local no hay forma de reproducir o auditar qué corrió.

Estas migraciones **NO deben volver a aplicarse contra el gym_app** bajo ninguna circunstancia. Su lugar real es el repo de la app de clubes, no éste.

## Cronología

| Hora (UTC -3) | Versión migración | Qué hizo |
|---|---|---|
| 13:47:17 | `20260519134717_multiclub_01_core_tables.sql` | Creó `public.users`, `public.global_roles`, `public.clubs`, `public.club_memberships`, `public.club_role_assignments`, helper `set_updated_at()` y triggers de `updated_at`. |
| 13:47:40 | `20260519134740_multiclub_02_trigger_and_rls_helpers.sql` | Creó trigger `on_auth_user_created` sobre `auth.users` que insertaba automáticamente en `public.users`. Helpers RLS: `is_app_owner()`, `is_club_member()`, `has_club_role()`, `can_admin_club()`, `my_club_ids()`. Todas `SECURITY DEFINER`. |
| 13:47:58 | `20260519134758_multiclub_03_rls_users.sql` | Habilitó RLS y 4 policies sobre `public.users` (select/insert/update/delete) + backfill desde `auth.users`. |
| 14:00:08 | `20260519140008_rollback_multiclub_tables.sql` | Dropeó las 5 tablas con CASCADE, el trigger sobre `auth.users`, y las 6 funciones (incluyendo `set_updated_at`). |

## Impacto real (verificado)

- **Datos del gym_app:** no se tocaron. Las tablas creadas (`users`, `clubs`, `club_memberships`, etc.) eran completamente nuevas y nadie escribió en ellas en los 23 minutos en que existieron.
- **`auth.users`:** el trigger `on_auth_user_created` quedó activo durante ~12 minutos. Si en ese intervalo alguien hubiera creado una cuenta nueva, se hubiera insertado una fila en la (ahora inexistente) tabla `public.users`. Verificado vía `auth.users.created_at`: **ningún signup ocurrió en ese rango**.
- **`set_updated_at()`:** la función fue creada por multiclub_01 y dropeada por el rollback. **Si alguna migración de gym_app dependiera de ella, se hubiera roto.** En el snapshot del 2026-05-20, el gym_app usa `update_updated_at` (sin la `_at` adelante en la parte set) y `update_wellbeing_updated_at` — **funciones distintas**, no afectadas.
- **Helper functions `is_app_owner` / `is_club_member` / etc.:** dropeadas por el rollback, no existen actualmente. El gym_app no las usa.
- **Otras dependencias:** ninguna identificada.

## Cómo evitar que se repita

Este episodio fue posible porque:

1. El mismo cliente (MCP de Supabase, este agente) tiene acceso a múltiples proyectos. Aplicar contra el proyecto equivocado es un `project_id` mal copiado.
2. Las migraciones no quedaron como archivo en el repo — se aplicaron vía MCP directamente. Sin copia local, no hay diff revisable previo.

Mitigaciones recomendadas:

- Toda migración nueva del gym_app debe vivir primero en `supabase/migrations/YYYYMMDDHHMMSS_NN_descripcion.sql`, ser revisada, y recién después aplicarse (vía CLI `supabase db push` o vía MCP citando el archivo del repo). Nunca SQL ad-hoc directo a producción.
- Antes de aplicar, doble check del `project_id` o del nombre del proyecto Supabase. Si el cliente lo permite, pedirle confirmación explícita.

## Archivos en esta carpeta

| Archivo | Origen |
|---|---|
| `README.md` (este archivo) | Redactado 2026-05-20 a partir del historial de migraciones y la confirmación del usuario. |
| `20260519134717_multiclub_01_core_tables.sql` | Bajado de `supabase_migrations.schema_migrations` del proyecto `bvexjanqmfypmtgoapbt`. |
| `20260519134740_multiclub_02_trigger_and_rls_helpers.sql` | Idem. |
| `20260519134758_multiclub_03_rls_users.sql` | Idem. |
| `20260519140008_rollback_multiclub_tables.sql` | Idem. |
