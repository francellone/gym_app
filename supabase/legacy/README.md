# supabase/legacy/

Archivos preservados por trazabilidad. **No volver a aplicar.** El estado vivo de la BD se construye exclusivamente a partir de `supabase/migrations/` y el historial registrado en `supabase_migrations.schema_migrations` (vía MCP `list_migrations`).

## Qué hay acá y por qué

### `schema.sql`, `seed.sql`, `seed_exercises_videoteca.sql`

Snapshots del setup original (~marzo 2026). El `schema.sql` (280 LOC) era el DDL inicial y `seed.sql` (153 LOC) los inserts de ejercicios con placeholder `COACH_USER_ID`. Quedaron desactualizados al poco tiempo cuando se empezaron a aplicar migraciones incrementales. **Hoy no representan el schema real.**

Se preservan porque:
- Sirven como referencia histórica del estado inicial del proyecto.
- Por si en algún momento querés reconstruir una réplica del primer día (cosa improbable).

Si alguien los corre por accidente: el DDL probablemente falle por `IF NOT EXISTS`/conflictos, pero los `INSERT` de seed sí pueden duplicar filas. Por eso viven en `legacy/` con este README como aviso.

### `migration_v2.sql` … `migration_v31_*.sql` (44 archivos)

Migraciones históricas aplicadas entre marzo 2026 y mayo 2026 con nomenclatura `v<N>[<letra>]_<descripcion>.sql`. Las versiones `v2` a `v21` se aplicaron a mano en el SQL Editor del Dashboard antes de adoptar el flujo MCP/CLI — **no figuran en `supabase_migrations.schema_migrations`**. Las versiones `v22` en adelante sí están registradas, con timestamps `20260515*` a `20260518*`.

Naming inconsistente (a veces sufijo `a`/`b`/`c`, a veces sólo número, descripción opcional). Convención dejada de usar el 2026-05-21.

**Por qué se preservan:** son la única fuente legible del razonamiento de cada cambio que se hizo entre `v2` y `v21` (las que no quedaron en el historial de Supabase). Para `v22` adelante hay copia funcional en el historial, pero el nombre del archivo aporta contexto.

## Convención actual (vigente desde 2026-05-21)

Toda migración nueva vive en `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql` (formato estándar del Supabase CLI). Toda función nueva DECLARA `SET search_path = public, pg_temp`. `SECURITY DEFINER` con `REVOKE EXECUTE … FROM PUBLIC` y `GRANT … TO authenticated` salvo justificación. Backups en `archive.*` SIEMPRE con RLS habilitada (deny-by-default si no necesita lectura desde la app).

Ver `diagnostico_arquitec/07_propuesta_escalado_proyecto_2026-05-21.md` §1.2 para el detalle de convenciones.
