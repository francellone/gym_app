# Notas de diagnóstico - Supabase (raw)

> Proyecto: `bvexjanqmfypmtgoapbt` (francellone@gmail.com's Project)
> Org: gymorg (Free)
> Region: sa-east-1 (São Paulo)
> Compute: NANO
> Fecha: 2026-05-14

## Observaciones iniciales (UI)
- Tabs ya guardados en SQL Editor: `squema`, `seedd`, `Update Profile Role and Name`, `Profiles Table Select`
- Query existente referencia: `profiles` (role='student'), `plans` (plan_type='evaluation'), `workout_sessions` (student_id, plan_id, logged_date)
- "No migrations" y "No backups" en el dashboard.
- Comentario en `student_profiles`: "Los datos del alumno viven en public.profiles. Esta tabla se mantiene como archivo histórico de submissions. No leer desde el frontend. No agregar nuevas consultas aquí."

## 1) Inventario de tablas en `public` (23 tablas)

| Tabla | Filas | Tamaño | Observación |
|---|---:|---:|---|
| evaluation_results | 6 | 96 kB | |
| evaluation_test_responses | 8 | 80 kB | |
| evaluation_tests | 8 | 48 kB | |
| exercise_tag_assignments | 192 | 104 kB | |
| exercise_tags | 11 | 64 kB | |
| exercises | 275 | 184 kB | Catálogo principal |
| intake_form_assignments | 3 | 136 kB | |
| intake_form_submissions | 3 | 136 kB | |
| intake_form_templates | 3 | 176 kB | |
| notifications | 22 | 80 kB | |
| plan_assignments | 16 | 112 kB | |
| **plan_assignments_backup_20260508** | 12 | 16 kB | 🚨 Tabla de backup en producción (fecha 2026-05-08) |
| plan_blocks | 25 | 64 kB | Bloques de los planes |
| plan_exercises | 127 | 120 kB | |
| plans | 17 | 56 kB | |
| profiles | 12 | 64 kB | Fuente de verdad (incluye datos de alumno) |
| push_subscriptions | 0 | 32 kB | Sin uso aún |
| student_edit_history | 1 | 64 kB | Solo 1 fila |
| **student_profiles** | 4 | 48 kB | ⚠️ Deprecada (según comment) pero aún con datos |
| wellbeing_logs | 14 | 64 kB | |
| workout_block_logs | 8 | 96 kB | |
| workout_logs | 410 | 248 kB | Tabla más grande (set granular) |
| workout_sessions | 39 | 144 kB | Sesiones (agregado de logs) |

### Primeras red flags
1. `plan_assignments_backup_20260508` viva en producción → debe migrarse a un schema `_archive` o borrarse tras validación.
2. `student_profiles` declarada deprecada en comentario pero con 4 filas → riesgo de doble fuente de verdad con `profiles`.
3. `workout_logs` y `workout_sessions` coexisten (probable parent/child) → validar la relación y que toda lectura use ambas consistentemente.
4. `student_edit_history` con sólo 1 fila → o se rompió el trigger que lo alimenta, o nunca se está logueando, o nadie está editando alumnos.
5. `push_subscriptions` vacía → feature implementada pero sin uso real todavía.
