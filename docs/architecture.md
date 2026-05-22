# `architecture.md` — gym_app en 1 página

Última revisión: 2026-05-21. Si encontrás algo desfasado, actualizalo en el mismo PR donde lo descubriste — este doc se cuida actualizado, no en lote.

---

## Producto, en una oración

App mobile-first donde un **coach** gestiona planes de entrenamiento y plantillas, y sus **alumnos** registran su desempeño diario (peso, reps, esfuerzo percibido, observaciones). Comunicación bidireccional por panel de notas. Hoy en producción con 5 alumnos / 1 coach principal.

---

## Stack

| Capa               | Tecnología                                                | Versión                        |
| ------------------ | --------------------------------------------------------- | ------------------------------ |
| Frontend framework | React                                                     | 18                             |
| Build / dev server | Vite                                                      | 5                              |
| Estilos            | Tailwind                                                  | 3                              |
| Routing            | react-router-dom                                          | 6                              |
| Lenguaje           | JavaScript (JSX)                                          | — (TS pendiente como Tier 3.3) |
| Lint               | ESLint flat config + eslint-plugin-react + react-hooks v7 | 9                              |
| Format             | Prettier                                                  | 3                              |
| Pre-commit         | husky + lint-staged                                       | 9 / 15                         |
| Tests              | Vitest + React Testing Library + jsdom                    | 2.1 / 16 / 25                  |
| Backend (BaaS)     | Supabase                                                  | Postgres 17.6                  |
| Auth               | Supabase Auth (email + magic link)                        | —                              |
| Realtime           | Supabase Realtime (postgres_changes)                      | —                              |
| Push               | Web Push API + service worker                             | —                              |
| Cron               | pg_cron + Edge Function `notify-cron`                     | —                              |
| Edge functions     | Deno (Supabase Functions)                                 | —                              |
| Hosting frontend   | Vercel                                                    | auto-deploy on push a `main`   |

---

## URLs

| Recurso              | URL                                                         |
| -------------------- | ----------------------------------------------------------- |
| App producción       | https://gym-appv2.vercel.app                                |
| Supabase Dashboard   | https://supabase.com/dashboard/project/bvexjanqmfypmtgoapbt |
| Supabase project ref | `bvexjanqmfypmtgoapbt` (sa-east-1)                          |
| Repo GitHub          | https://github.com/francellone/gym_app                      |
| Vercel project       | `gym-appv2`                                                 |
| Org Supabase         | `gymorg` (cuenta `francellone@gmail.com`)                   |

---

## Estructura del repo

```
gym_app/
├── src/                          frontend (ver src/README.md)
│   ├── App.jsx, main.jsx, index.css
│   ├── components/               sólo transversales (layout, modales globales)
│   ├── features/                 13 features con su README + estructura interna
│   │   ├── auth/                 AuthContext + LoginPage + ProfilePage
│   │   ├── dashboard/            CoachDashboard + StudentDashboard + calendario + alerts
│   │   ├── evaluations/          tests físicos (1RM, max reps, potencia, etc.)
│   │   ├── exercises/            biblioteca de ejercicios del coach
│   │   ├── forms/                motor de form-builder + intake + follow-ups
│   │   ├── notes/                panel notas coach↔alumno (data + UI + hooks)
│   │   ├── notifications/        campana + hook realtime + Web Push
│   │   ├── plans/                planes, plantillas, bloques (el módulo más grande)
│   │   ├── progress/             gráficos del alumno
│   │   ├── students/             gestión coach-side de alumnos
│   │   ├── wellbeing/            modal pre-sesión + tendencias
│   │   └── workouts/             ejecución del entrenamiento del día + historial
│   ├── lib/                      supabase.js (cliente único)
│   ├── utils/                    errorHelpers + helpers puros (sin React)
│   └── test/                     setup.js + mocks/supabase.js (Tier 3.2)
├── supabase/
│   ├── README.md                 estructura + convenciones de migraciones
│   ├── migrations/               YYYYMMDDHHMMSS_descripcion.sql (CLI default)
│   ├── functions/
│   │   ├── create-student/       signup aislado (no rompe sesión coach)
│   │   └── notify-cron/          cron dispatcher → llama RPCs fn_notify_*
│   ├── tests/rls_smoke_tests.sql 6 smoke tests RLS
│   └── legacy/                   schema.sql + seed.sql + 44 migration_v* viejas
├── docs/                         documentación viva (este archivo + 3 hermanos)
│   ├── architecture.md           ← este archivo
│   ├── er-diagram.mermaid        ER del schema public
│   ├── api-rpcs.md               catálogo de 26 RPCs callable
│   └── known-exceptions.md       trampas que ya pisamos
└── diagnostico_arquitec/         histórico de sesiones — NO modificar archivos viejos
    ├── 01_changelog_back.md      la biblia del back
    ├── 02-12_*                   handoffs y planes por sesión
    └── legacy/                   código y migraciones históricas (NO ejecutar)
```

---

## Roles y permisos (resumen, detalle en `api-rpcs.md` + `known-exceptions.md`)

- **Coach** (admin único en producción): crea/edita/borra planes, plantillas, ejercicios, evaluaciones. Asigna a alumnos. Ve TODO de sus alumnos asignados (logs, evals, notas). Recibe notificaciones.
- **Alumno**: registra workout_logs, wellbeing_logs, intake/follow-up forms. Ve sus propios planes asignados, sus logs, sus evals, sus notas (compartidas con su coach). NO ve nada de otros alumnos. Recibe notificaciones.
- **Anon** (sin login): sólo el formulario de intake público (vía `process_intake_submission`).

Aislamiento: garantizado por RLS en las 24 tablas de `public`. Smoke tests en `supabase/tests/rls_smoke_tests.sql`.

---

## Flujos clave

### Alta de un alumno

1. Coach completa el form en `/coach/students/new` con datos personales + plan inicial opcional.
2. Front llama a Edge Function **`create-student`** (NO `signUp` directo — ver `known-exceptions.md` §Crear alumnos).
3. La edge function:
   a. Crea el usuario en `auth.users` con un cliente aislado.
   b. Trigger `handle_new_user` crea la fila en `profiles`.
   c. Completa los campos extra (`coach_id`, `height_cm`, `weight_kg`, `level`, `objetivo`, etc.).
4. Si el coach eligió "asignar plan al crear": ejecuta `assign_template_to_student(template_id, student_id, ...)` que clona la plantilla y crea el `plan_assignments`.
5. Trigger `fn_notify_plan_assigned` notifica al alumno.

### Registro de un workout

1. Alumno entra a `/workouts/today`. `TodayWorkoutPage` carga el `plan_assignment` activo del día.
2. Por cada ejercicio: alumno completa reps/weights/sets/PSE, marca completed.
3. `features/workouts/api.js` arma los args con `buildSaveWorkoutLogArgs(...)` y llama a la RPC `save_workout_log(...)` (16 params).
4. La RPC crea/actualiza el `workout_logs` row, validando coherencia.
5. Trigger `fn_notify_workout_activity` notifica al coach asignado del alumno.

### Comunicación coach↔alumno (notas)

1. Front llama `notes_get_or_create_thread(coach_id, student_id)` — idempotente, devuelve thread_id.
2. INSERT en `notes` con `thread_id` + `body` + `context_type` (free, exercise, muscle_group, day).
3. Trigger `notes_resolve_context` denormaliza `exercise_id`/`muscle_group`/`note_date` desde el contexto.
4. Trigger `notes_bump_thread` actualiza `note_threads.last_bumped_at`.
5. Trigger `fn_notify_coach_note` o `fn_notify_student_note` (según `author_role`) notifica al otro lado.
6. Realtime emite el evento al otro browser, que actualiza el panel en vivo.
7. Al abrir el panel el receptor: `notes_mark_thread_read(thread_id, role)` actualiza el `*_last_read_at`.

---

## Cron y mantenimiento

`pg_cron` corre 4 jobs disparados por la Edge Function `notify-cron`:

| Cuándo  | RPC                                                                     |
| ------- | ----------------------------------------------------------------------- |
| Diario  | `fn_cleanup_abandoned_sessions()` — cierra sessions abandonadas         |
| Diario  | `fn_notify_expiring_plans()` — alerta al coach de planes por vencer     |
| Semanal | `fn_notify_stagnation()` — alerta por estancamiento de progreso         |
| Semanal | `fn_notify_weekly_summary()` — resumen semanal a alumno + coach         |
| Semanal | `fn_schema_health_check()` — auditoría de BD, notifica si hay anomalías |

Además: `release_due_forms()` es llamada desde el dashboard del student y del coach (lazy) — convierte intake assignments con `due_date` pasada a `status='released'`.

---

## Deployment

- **Frontend**: push a `main` en GitHub → Vercel detecta y deploya automático a `gym-appv2.vercel.app`. Sin staging.
- **Backend (Supabase)**: 2 caminos.
  1. **Migración SQL**: archivo en `supabase/migrations/YYYYMMDDHHMMSS_*.sql` + `supabase db push` (CLI) o `apply_migration` vía MCP.
  2. **Edge function**: `supabase functions deploy <name>` (CLI). Hoy hay 2: `create-student` y `notify-cron`.
- **Pre-commit local** (husky + lint-staged): corre `eslint --fix` + `prettier --write` sobre los archivos staged. Sin esto algunos commits van con código broken — el caso `SCORES not defined` del 21/05 lo cazó.
- **CI**: no hay GitHub Actions todavía (Tier 4 pendiente). El "CI" real es: el pre-commit local + el smoke manual en producción después de cada push.

---

## Dónde mirar logs

| Qué                                           | Dónde                                                                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Errores del front (React)                     | DevTools del browser (no hay Sentry todavía)                                                                                             |
| Errores de RPC / queries Postgres             | Supabase Dashboard → Logs → Postgres                                                                                                     |
| Errores de edge functions                     | Supabase Dashboard → Edge Functions → `<name>` → Logs                                                                                    |
| Errores de cron                               | tabla `cron.job_run_details` + payload de `notifications`                                                                                |
| Errores del realtime                          | DevTools → Network → WS, filtrar por `realtime`                                                                                          |
| `legacy_notes_shim_log` con `outcome='error'` | tabla `public.legacy_notes_shim_log` (query directo)                                                                                     |
| Push notifications fallidas                   | tabla `public.push_subscriptions` + inspeccionar `endpoint`                                                                              |
| Health check semanal                          | `fn_schema_health_check()` corre solo, manda notif si hay anomalías. Para verlo a demanda: `SELECT fn_schema_health_check();` desde MCP. |

---

## Cuándo NO modificar

- **`diagnostico_arquitec/`**: archivos viejos (NN ≤ último cierre) no se editan, sólo se leen. Cada sesión nueva agrega un `NN+1_*.md`.
- **`supabase/legacy/`**: schema.sql + seed.sql + migration_v\*.sql preservados como histórico — no se aplican más.
- **`src/features/` carpetas con README marcando "v??"**: leer el README antes de tocar, suelen tener "no movés X porque ..."
- **App de clubes deportivos** (proyecto separado del usuario): NUNCA modificar. Sólo referencia conceptual de orden, no de código.

---

## Estado de organización (al cierre del 21/05 PM 2026)

| Capa                              | % cubierto                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Tier 0 — Estructura del repo      | ~80% (falta CONVENTIONS.md raíz + supabase/)                                                                         |
| Tier 1 — Back hardening           | ~85% (falta auth_leaked_password_protection + revisar RPCs anon)                                                     |
| Tier 2 — Refactor monolitos front | ~70% (TodayWorkoutPage 2269→993, EvalWorkoutPage 2257→684. Otros pages 400-700 LOC c/u pendientes)                   |
| Tier 3 — Guardrails               | ~60% (3.1 lint cerrado, 3.2 tests 78 passing, 3.4 docs cerrado con este PR. Falta cleanup warnings + 3.3 TypeScript) |
| Tier 4 — Operacional/CI           | ~10% (Vercel auto-deploy. Falta GH Actions)                                                                          |

Detalle completo en `diagnostico_arquitec/10_handoff_proximo_agente_2026-05-21_pm.md`.

---

## Para el "yo del futuro" que vuelve a este repo en 3 meses

1. **Empezá** leyendo `diagnostico_arquitec/` ordenado por número descendente — el handoff más reciente tiene el estado real.
2. **Antes de tocar BD**: leé `01_changelog_back.md` + `known-exceptions.md`.
3. **Antes de tocar el front**: leé el README de la feature que vas a modificar + `known-exceptions.md` (sección que corresponda).
4. **Si vas a hacer un refactor de >500 LOC**: documentá plan en un nuevo `diagnostico_arquitec/NN_*.md` con 3 opciones, esperá OK explícito antes de tocar código.
5. **Cuando termines la sesión**: actualizá este `architecture.md` si cambió algo estructural, agregá un `NN+1_handoff_*.md` en `diagnostico_arquitec/` con lo que hiciste.
