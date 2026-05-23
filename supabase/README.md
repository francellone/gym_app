# `supabase/` — backend del gym_app

Proyecto Supabase **`bvexjanqmfypmtgoapbt`** (región `sa-east-1`). Postgres 17.6 + Auth + Storage + Realtime + Edge Functions + pg_cron.

## Estructura

```
supabase/
├── migrations/              Convención CLI estándar: YYYYMMDDHHMMSS_descripcion.sql.
│   ├── 20260521003824_fix_search_path_six_functions.sql
│   ├── 20260521135103_enable_rls_on_archive_notes_backups.sql
│   └── legacy/              SQL viejos preservados (ej. migration_intake_form.sql).
├── functions/
│   ├── create-student/      Edge Function: signup + perfil del alumno (no reemplaza sesión del coach).
│   └── notify-cron/         Edge Function: notificaciones programadas (vencimientos, estancamiento).
├── tests/
│   └── rls_smoke_tests.sql  6 smoke tests para RLS. Crecer 1 test por policy que se toque.
├── legacy/                  Snapshots históricos NO APLICABLES (schema.sql, seed.sql, migration_v*.sql).
└── CONVENTIONS.md           (pendiente — ver propuesta 07)
```

> **Doc viva del back:** ver `../docs/er-diagram.mermaid` (24 tablas + 48 FKs), `../docs/api-rpcs.md` (26 RPCs callable) y `../docs/known-exceptions.md` (trampas conocidas — RLS+RETURNING, snapshot inmutable de intake en `public.intake_profile_snapshots`, etc.).

## Estado del esquema (snapshot 2026-05-23)

- **25 tablas en `public`** — todas con RLS habilitada. Inventario completo en `../diagnostico_arquitec/03_auditoria_estructura_2026-05-20.md` sección 4. Nueva inquilina desde 2026-05-23: `intake_profile_snapshots` (movida desde `archive.student_profiles` y renombrada — snapshot inmutable del intake, ver `../docs/known-exceptions.md`).
- **6 tablas en `archive`** — todas con RLS habilitada y **sin policies** (deny-by-default, sólo `service_role` accede). `plan_assignments_backup_20260508` y los 5 `*_notes_20260517` (RLS habilitada el 2026-05-21 vía migración `enable_rls_on_archive_notes_backups`). El schema ahora cumple la convención: 100% backups, sin tablas operacionales.
- **48 migraciones registradas** en `supabase_migrations.schema_migrations`. Las v2-v21 no figuran ahí porque se aplicaron por SQL Editor antes de MCP/CLI — se preservan en `legacy/`.
- **Advisors security:** 0 ERROR, 95 WARN (mayormente RPCs intencionalmente expuestas a `anon` — revisar caso por caso), 7 INFO (`rls_enabled_no_policy` en backups de `archive`, esperable). 1 WARN aparte (`auth_leaked_password_protection`) requiere toggle manual en Dashboard.

## Convenciones para migraciones nuevas

1. **Nombre:** `YYYYMMDDHHMMSS_descripcion_en_snake_case.sql` (timestamp UTC; formato CLI default sin `_NN_`).
2. **Ubicación:** `supabase/migrations/` (no más en `supabase/` flat — el flat está cerrado, vive en `legacy/`).
3. **Atomicidad:** envolver en `BEGIN; … COMMIT;` cuando hay múltiples DDL relacionados.
4. **Verificación inline:** terminar con un bloque `DO $$ … RAISE NOTICE 'OK …' END $$;` que afirme que el cambio aplicó.
5. **Funciones nuevas:** siempre `SET search_path = public, pg_temp` (o `public, extensions, pg_temp` si toca extensiones).
6. **`SECURITY DEFINER`:** sólo cuando es estrictamente necesario, y siempre con `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated` (o el rol que corresponda).
7. **Backups en `archive.*`:** SIEMPRE con RLS habilitada (deny-by-default). Documentar el propósito en `COMMENT ON TABLE`.
8. **Aplicar:** vía Supabase CLI (`supabase db push`) o vía MCP `apply_migration` citando el archivo del repo. **Nunca SQL ad-hoc directo a producción sin archivo en el repo.**

## Guardrails activos

Detalle completo en `../diagnostico_arquitec/01_changelog_back.md`. Resumen:

- **6 cron jobs:** cleanup diario de sesiones abandonadas + 4 notifs + health check semanal.
- **7 triggers preventivos:** `forbid_template`, `close_eval_on_result`, `sessions_finished_requires_started`, `audit_profile_changes`, etc.
- **10 CHECK constraints** que validan coherencia en INSERT/UPDATE.
- **6 RLS policies** ajustadas o instaladas durante el refactor de mayo.
- **0 funciones SECURITY DEFINER sin `search_path`** (vulnerabilidad eliminada — ver migration `20260521003824_fix_search_path_six_functions.sql`).
- **0 vistas SECURITY DEFINER** (todas con `security_invoker=on`).
- **5 tablas archive de notas con RLS habilitada** desde 2026-05-21 (ver migration `20260521135103_enable_rls_on_archive_notes_backups.sql`).

## Reglas que NO se rompen

- `profiles` no tiene policy `DELETE` por diseño. "Borrar" = `active=false` + `is_test=true`. Está documentado en el COMMENT de la tabla.
- Los logs históricos se preservan aunque el dato esté sucio. Si hay que limpiar, mover a `archive` con un timestamp en el nombre, no DROP.
- **Doble check del `project_id` antes de aplicar cualquier migración**. El 19/05/2026 se aplicó por error el esquema de la app de clubes contra esta base; ver `../diagnostico_arquitec/legacy_multiclub_experiment/README.md`.
- **Crear alumnos sólo vía edge function `create-student`** con `supabaseIsolated` (nunca INSERT directo en `profiles`).
- **No INSERT directo en `plan_assignments`** para `plan_id` que sea plantilla → usar RPC `assign_template_to_student`.
