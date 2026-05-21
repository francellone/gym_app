# `supabase/` — backend del gym_app

Proyecto Supabase **`bvexjanqmfypmtgoapbt`** (región `sa-east-1`). Postgres 17.6 + Auth + Storage + Realtime + Edge Functions + pg_cron.

## Estructura

```
supabase/
├── migration_v*.sql          Migraciones históricas v2 → v29 (aplicadas a mano o por MCP, antes de adoptar la convención CLI).
├── migrations/               Convención nueva (CLI estándar): YYYYMMDDHHMMSS_NN_descripcion.sql.
│   ├── 20260521003824_fix_search_path_six_functions.sql   ← primera con la convención nueva
│   └── legacy/               SQL viejos que se conservan por trazabilidad.
└── functions/
    ├── create-student/       Edge Function: signup + perfil del alumno (no reemplaza sesión del coach).
    └── notify-cron/          Edge Function: notificaciones programadas (vencimientos, estancamiento).
```

## Estado del esquema (snapshot 2026-05-20)

- **24 tablas en `public`** — todas con RLS habilitada. Inventario completo en `../diagnostico_arquitec/03_auditoria_estructura_2026-05-20.md` sección 4.
- **schema `archive`** — backups nominales (`plan_assignments_backup_20260508`). RLS prendida sin policies (esperable por diseño).
- **47 migraciones registradas** en `supabase_migrations.schema_migrations`. Las v2-v21 no figuran ahí porque se aplicaron por SQL Editor antes de MCP/CLI.
- **0 ERROR del linter** (`get_advisors`), **101 WARN** (mayormente RPCs intencionalmente expuestas a `anon` — revisar caso por caso), **2 INFO**.

## Convenciones para migraciones nuevas

1. **Nombre:** `YYYYMMDDHHMMSS_NN_descripcion_en_snake_case.sql` (timestamp UTC).
2. **Ubicación:** `supabase/migrations/` (no más en `supabase/` flat).
3. **Atomicidad:** envolver en `BEGIN; … COMMIT;` cuando hay múltiples DDL relacionados.
4. **Verificación inline:** terminar con un bloque `DO $$ … RAISE NOTICE 'OK …' END $$;` que afirme que el cambio aplicó.
5. **Funciones nuevas:** siempre `SET search_path = public, pg_temp` (o `public, extensions, pg_temp` si toca extensiones). Esto evita la grieta de schema hijacking que reapareció en la auditoría del 20/05 con 6 funciones nuevas.
6. **`SECURITY DEFINER`:** sólo cuando es estrictamente necesario, y siempre con `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated` (o el rol que corresponda).
7. **Aplicar:** vía Supabase CLI (`supabase db push`) o vía MCP `apply_migration` citando el archivo del repo. **Nunca SQL ad-hoc directo a producción sin archivo en el repo.**

## Guardrails activos

Detalle completo en `../diagnostico_arquitec/01_changelog_back.md`. Resumen:

- **6 cron jobs:** cleanup diario de sesiones abandonadas + 4 notifs + health check semanal.
- **7 triggers preventivos:** `forbid_template`, `close_eval_on_result`, `sessions_finished_requires_started`, `audit_profile_changes`, etc.
- **10 CHECK constraints** que validan coherencia en INSERT/UPDATE.
- **6 RLS policies** ajustadas o instaladas durante el refactor de mayo.
- **0 funciones SECURITY DEFINER sin `search_path`** (vulnerabilidad eliminada — ver migration `20260521003824_fix_search_path_six_functions.sql` para el último fix).
- **0 vistas SECURITY DEFINER** (todas con `security_invoker=on`).

## Reglas que NO se rompen

- `profiles` no tiene policy `DELETE` por diseño. "Borrar" = `active=false` + `is_test=true`. Está documentado en el COMMENT de la tabla.
- Los logs históricos se preservan aunque el dato esté sucio. Si hay que limpiar, mover a `archive` con un timestamp en el nombre, no DROP.
- **Doble check del `project_id` antes de aplicar cualquier migración**. El 19/05/2026 se aplicó por error el esquema de la app de clubes contra esta base; ver `../diagnostico_arquitec/legacy_multiclub_experiment/README.md`.
