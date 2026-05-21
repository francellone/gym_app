# Auditoría de estructura y documentación — gym_app

**Fecha:** 2026-05-20
**Alcance:** repo `gym_app` (root del proyecto), Supabase `bvexjanqmfypmtgoapbt`, app productiva en `https://gym-appv2.vercel.app/`.
**Objetivo:** hacer un foto fiel del estado real, marcar dónde la documentación dice cosas que no existen (o no dice cosas que sí existen), y dejar la base para el plan de reorganización (ver `04_propuesta_reorganizacion.md`).
**Auditor:** pasada externa post-refactor m26 + notas. La auditoría previa (`02_auditoria_post_refactor_2026-05-16.md`) cubrió la BD; ésta cubre estructura de repo y consistencia docs ↔ realidad.

---

## 1. Stack real (lo que efectivamente corre)

| Capa | Tecnología real | Notas |
|---|---|---|
| Frontend | React 18 + Vite 5 + Tailwind 3 | `package.json`. JSX puro, sin TypeScript. |
| Estado / nav | `react-router-dom` 6 + Context API (`AuthContext`) | Sin Redux, sin Zustand. |
| UI/Iconos | `lucide-react`, `recharts`, `date-fns` | Sin libs UI compuestas. |
| Backend | Supabase (Postgres 17.6 + Auth + Storage + Realtime + Edge Functions + pg_cron) | proyecto `bvexjanqmfypmtgoapbt`, región `sa-east-1`. |
| Edge Functions | 2 activas: `create-student`, `notify-cron` | versionadas en Supabase, código en `supabase/functions/`. |
| PWA / push | Service Worker propio (`public/sw.js`) + Web Push | Registro en `src/main.jsx`. |
| Hosting | Vercel (rewrites a `index.html` para SPA — `vercel.json`) | dominio `gym-appv2.vercel.app`. |
| Repo | `github.com/francellone/gym_app`, branches `main` y `v2` | rama default `main`. |

> No hay TypeScript, no hay tests automatizados, no hay path aliases en Vite, no hay linter configurado en `package.json`.

---

## 2. Lo que SETUP.md dice y la realidad no respalda

`SETUP.md` arranca con un mensaje útil para alguien recién llegado, pero hoy describe un proyecto que ya no es. Detalle (línea por línea):

| Línea en SETUP.md | Lo que dice | Lo que es real |
|---|---|---|
| L22-23 (Paso 2) | "Copiar y ejecutar `supabase/schema.sql`" | **No existe** `supabase/schema.sql`. La BD se construyó por migraciones acumuladas (`migration_v2.sql` … `migration_v29_*.sql`). |
| L23-24 (Paso 2) | "Copiar y ejecutar `supabase/seed.sql`" | **No existe** `supabase/seed.sql`. Tampoco hay carpeta `seed/`. Los 9 planes "del Excel" mencionados nunca quedaron versionados como seed. |
| L109-114 | "Los 9 planes de tu Excel ya están incluidos en `supabase/seed.sql`" | Falso — ver punto anterior. Lo que sí hay son 26 plans, 18 plan_assignments y 190 plan_exercises en producción, cargados a mano. |
| L120-138 | Mapa de rutas con sólo `/coach/{plans,students,exercises}` y `/student/{workout,progress,history,profile}` | Quedó congelado en una versión vieja. Hoy también existen: `/coach/{evaluations, form-builder, follow-up-forms}` y `/student/{forms, notes, intake, form/:assignmentId, eval/:planId}`. |
| Toda la guía | No menciona | **Edge Functions** (`create-student`, `notify-cron`), **push subscriptions** (`public/sw.js`), **intake forms**, **follow-up forms**, **panel de notas coach↔alumno** (v24), **wellbeing logs**, **evaluations**. |

**Veredicto:** `SETUP.md` sirve como museo, no como guía. Hay que reemplazarlo por algo que refleje el deploy real (ver propuesta).

---

## 3. Migraciones SQL — desincronización entre repo y Supabase

### 3.1 Archivos en `supabase/` del repo

44 archivos `migration_v*.sql` desde `v2` hasta `v29_*`. Naming inconsistente (a veces sufijos `a`, `b`, `c`; a veces solo número; nombre descriptivo opcional). Ejemplos:

```
migration_v2.sql
migration_v10.sql … migration_v22_preferred_days.sql
migration_v24_notes.sql … migration_v24f_mark_thread_read_rpc_and_tighten_coach.sql
migration_v25a … v25f, v26a … v26f, v27, v28, v29
```

### 3.2 Migraciones registradas en Supabase

47 entradas vía MCP `list_migrations`. **Sólo aparecen desde `20260515121029` (v22) en adelante**. Las versiones `v2` a `v21` del repo no figuran en el historial de Supabase: probablemente se aplicaron a mano por SQL Editor antes de adoptar MCP/CLI.

### 3.3 Cuatro migraciones aplicadas en Supabase que NO existen como archivo

```
20260519134717  multiclub_01_core_tables
20260519134740  multiclub_02_trigger_and_rls_helpers
20260519134758  multiclub_03_rls_users
20260519140008  rollback_multiclub_tables
```

Parecen ser un experimento de "multiclub" aplicado en producción el 19/05 y rolleado back 25 minutos después. **No queda copia local del SQL**. Si el experimento aún tiene utilidad, conviene recuperar los DDL desde el historial de Supabase y archivarlos en el repo (aunque sea bajo `diagnostico_arquitec/` para trazabilidad).

### 3.4 Convención usada por el proyecto de clubes deportivos

```
supabase/migrations/20260418120000_00_link_supabase_auth.sql
supabase/migrations/20260418120100_01_rls_helpers.sql
supabase/migrations/20260418120200_02_enable_rls.sql
…
```

Timestamp ISO + prefijo numérico de orden + descripción. Es la convención estándar del Supabase CLI y la que sugiero adoptar de acá en adelante (ver propuesta).

---

## 4. Esquema Supabase real (snapshot 2026-05-20)

24 tablas en `public`, todas con RLS habilitada. Conteos vivos:

| Tabla | Filas | Comentario relevante |
|---|--:|---|
| `profiles` | 14 | Sin `DELETE` por diseño (preservar FK). "Borrado" = `active=false` + `is_test=true`. |
| `exercises` | 276 | Catálogo. |
| `plans` | 26 | |
| `plan_assignments` | 18 | |
| `plan_exercises` | 190 | |
| `plan_blocks` | 40 | Soporta `block_type` (activación/strength/aerobic/circuit). |
| `workout_logs` | 460 | Logs granulares por ejercicio. Excepción documentada: `student1@gmail.com` tiene 113 logs históricos de evaluación. |
| `workout_sessions` | 39 | Pre-creadas por trigger. |
| `workout_block_logs` | 11 | Logs a nivel de bloque (circuit/aerobic). |
| `evaluation_tests` | 8 | |
| `evaluation_test_responses` | 8 | |
| `evaluation_results` | 7 | |
| `exercise_tags` | 11 | |
| `exercise_tag_assignments` | 194 | |
| `intake_form_templates` | 3 | |
| `intake_form_assignments` | 3 | |
| `intake_form_submissions` | 3 | |
| `student_edit_history` | 21 | Trigger automático. |
| `notifications` | 79 | |
| `push_subscriptions` | 0 | Aún sin alumnos suscritos por Web Push. |
| `note_threads` | 10 | v24 — 1 por par coach↔alumno. |
| `notes` | 102 | v24 — single source of truth de comunicación. |
| `legacy_notes_shim_log` | 0 | m27 — audit del shim de notas legacy. Vacío = front migrado. |
| `wellbeing_logs` | 16 | |

**Adicional en `archive`:** `plan_assignments_backup_20260508` (backup nominal preservado, RLS prendida sin policies — INFO de advisor).

---

## 5. Advisors de Supabase (linter) — snapshot 2026-05-20

103 entradas. **Cero ERROR**, **101 WARN**, **2 INFO**. Distribución por categoría: todas SECURITY.

| Tipo | Count | Naturaleza |
|---|--:|---|
| `anon_security_definer_function_executable` | ~95 | Funciones `SECURITY DEFINER` que el rol `anon` puede invocar vía `/rest/v1/rpc/*`. **Mayormente esperable**: RPCs como `assign_template_to_student`, `add_note_for_workout_log`, `calculate_log_volume`, `fn_notify_*` están pensadas para uso autenticado pero PostgREST expone los RPCs a `anon` por default. Hay que revisar uno por uno si necesitan `REVOKE EXECUTE ON FUNCTION … FROM anon`. |
| `function_search_path_mutable` | 6 | Funciones sin `SET search_path = public, pg_temp`. Hubieran tenido que pisarse en la auditoría del 16/05 — son las que se crearon **después**: `migrate_assignment_off_template`, `update_wellbeing_updated_at`, `_intake_map_nivel`, `_intake_parse_frecuencia`, `enforce_follow_up_template_limit`, `update_updated_at`. **Fix mecánico** y reproducible. |
| `rls_enabled_no_policy` (INFO) | 2 | `archive.plan_assignments_backup_20260508` (backup, OK por diseño) y `public.legacy_notes_shim_log` (auditoría del shim, sólo INSERT desde funciones SECURITY DEFINER; OK pero merece un comentario o una policy "deny all" explícita para que no quede ambigua). |

**Pendiente operativo del 16/05 que sigue abierto:** `auth_leaked_password_protection` en Dashboard → Authentication.

---

## 6. Front — mapa real de rutas (vs SETUP.md)

Extraído de `src/App.jsx`:

```
/login

/coach/                                  CoachDashboard
/coach/students                          StudentsPage
/coach/students/new                      CreateStudentPage
/coach/students/:id                      StudentDetailPage (con 10 tabs internos)
/coach/plans                             PlansPage
/coach/plans/new                         CreatePlanPage
/coach/plans/:id                         PlanDetailPage
/coach/plans/:id/edit                    EditPlanPage
/coach/exercises                         ExercisesLibraryPage
/coach/evaluations                       EvaluationsPage
/coach/evaluations/:id                   EvaluationDetailPage
/coach/form-builder                      FormBuilderPage           ← no documentado
/coach/follow-up-forms                   FollowUpFormsPage         ← no documentado
/coach/follow-up-forms/:id               FollowUpFormBuilderPage   ← no documentado

/student/                                StudentDashboard
/student/workout                         TodayWorkoutPage
/student/eval/:planId                    EvalWorkoutPage           ← no documentado
/student/progress                        ProgressPage
/student/history                         HistoryPage
/student/profile                         ProfilePage
/student/forms                           FormsListPage             ← no documentado
/student/notes                           NotesPage                 ← no documentado
/student/intake                          IntakeFormPage            ← no documentado, fuera del layout
/student/form/:assignmentId              FollowUpFormPage          ← no documentado, fuera del layout
```

`StudentDetailPage` (`/coach/students/:id`) además tiene 10 tabs internos: Info, Plans, Logs, Progress, ProgressTableView, Evaluations, Forms, Notes, Wellbeing, History.

---

## 7. Layout del repo: lo que estorba y lo que confunde

### 7.1 Carpetas hermanas que rompen `src/`

| Carpeta | Estado | Acción sugerida |
|---|---|---|
| `intake-form/` | **Activamente usada** desde 7 archivos de `src/pages/` con imports `../../../intake-form/…`. Vive afuera de `src/` por razones históricas (script `push-intake-form.sh` y migración `intake-form/supabase/migration_intake_form.sql`). | Mover a `src/features/forms/intake/` y borrar la importación profunda. Es el cambio estructural con mejor ratio costo/beneficio. |
| `_modificaciones/` | **SQL ya aplicado, JSX huérfano**. Contiene 3 .sql (`migration_borg_per_day`, `migration_wellbeing`, `add_payment_tracking`) y un `TodayWorkoutPage.jsx` de 1126 líneas que no se importa desde ningún lado. | Mover el contenido a `diagnostico_arquitec/legacy/` con un README que explique qué se aplicó y qué nunca llegó a producción. Renombrar la carpeta o eliminarla. |
| `diagnostico_arquitec/` | Documentación valiosa (changelog v22-v29, handoffs back↔front, 2 diagnósticos completos), **17 archivos sin commitear**. | Confirmar que se quiere versionar y hacer `git add` + commit. |
| `dist/` y `dist-verify/` | Build outputs. `dist` ya está en `.gitignore`. `dist-verify/` fue agregado en esta pasada. | Listo. |
| `Aplicación para Gimnasio y entrenamiento/` | Carpeta wrapper creada por Cowork, sólo contiene `CLAUDE.md`. | Ya agregado a `.gitignore`. |

### 7.2 Archivos sueltos en raíz que no debían estar

| Archivo | Estado | Acción |
|---|---|---|
| `vite.config.js.timestamp-*.mjs` × 43 | Vite los recrea cada `dev`. Estaban contaminando la raíz desde marzo. | **Borrados** + agregados a `.gitignore`. |
| `.env.local.tmp` | Contenido `x` / `x`. Basura. | Borrarlo (permission denied desde el shell sandbox; **borrar a mano**). |
| `commit_message_v24.txt` | Mensaje de commit ya aplicado (el commit `f40794f` lo tiene en la historia). | Borrar a mano. |
| `push-intake-form.sh` | Script de deploy específico de la edge-form que está adentro de `intake-form/supabase/`. | Mover a `scripts/` cuando se mueva `intake-form/`. |
| `vite.config.js` + alias | El `vite.config.js` actual tiene 4 líneas. **No hay path aliases** definidos, por eso aparecen imports `../../../../intake-form/…`. | Agregar `resolve.alias` (`@`, `@features`, `@lib`, etc.). |

### 7.3 Convención de imports

19 archivos usan rutas con tres niveles o más de `../`. La mayoría están en:
- `src/components/plan/blocks/*` → `../../../../`
- `src/pages/coach/student/*` → `../../../../`
- `src/pages/{coach,student}/*` que importan de `intake-form/` → `../../../`

Con un alias `@/` apuntando a `src/` y `@intake/` apuntando a la futura ubicación de los formularios, todo esto desaparece.

---

## 8. Tamaños de archivo — candidatos a partir

Top archivos por LOC en `src/` (sólo los más relevantes):

| Archivo | LOC | Diagnóstico |
|---|--:|---|
| `pages/student/TodayWorkoutPage.jsx` | 2080 | Hace de todo: render del bloque del día, registro de logs, manejo de RPE, sesiones, notas, wellbeing trigger. Candidato a partir en sub-componentes y un hook `useTodayWorkout`. |
| `pages/student/EvalWorkoutPage.jsx` | 1855 | Variante de evaluación del anterior. Mucha duplicación posible con `TodayWorkoutPage`. |
| `lib/notes.js` | 1039 | Data layer del módulo notas (v24+m26). Razonable para un módulo crítico, pero conviene partir por dominio (threads / notes / realtime). |
| `pages/coach/student/StudentProgressTableView.jsx` | 1021 | UI compleja de tabla pivot. |
| `pages/coach/student/StudentEvaluationsTab.jsx` | 1014 | |
| `pages/coach/PlanDetailPage.jsx` | 1013 | |
| `pages/coach/EditPlanPage.jsx` | 997 | |
| `pages/coach/CreatePlanPage.jsx` | 883 | Mucha duplicación con `EditPlanPage`. |
| `pages/student/ProgressPage.jsx` | 873 | |
| `pages/coach/student/StudentPlansTab.jsx` | 857 | |

30794 LOC en `src/`. No es enorme, pero la distribución está muy concentrada en pocos archivos gigantes.

---

## 9. Higiene de código (rápido)

- `console.log` en `src/`: **2** (limpio).
- TODO/FIXME/XXX/HACK reales: **0** (los 2 hits fueron falsos positivos, comentarios normales).
- Sin lint configurado, sin format configurado, sin test configurado en `package.json`.
- Sin TypeScript — los 30K LOC son `.jsx`/`.js`. No es problema en sí, pero a la hora de refactorizar los archivos de 1000+ líneas se sentirá la falta.

---

## 10. Resumen ejecutivo de hallazgos

### Rojos (urgente, alto impacto, bajo costo)

1. **`SETUP.md` engaña**. Reescribirlo o reemplazarlo es prioridad 1.
2. **Cuatro migraciones de Supabase sin copia local** (`multiclub_0{1,2,3}_*`, `rollback_multiclub_tables`). Sin ese SQL no se puede reproducir el estado de la BD.
3. **`intake-form/` afuera de `src/`** con imports profundos desde 7 archivos. Es el principal generador de complejidad estructural.

### Amarillos (importante, semana)

4. **Numeración inconsistente de migraciones** (`v2`, `v10`, `v22_preferred_days`, `v24f_mark_thread_read_rpc_…`, `v25a`…). Adoptar timestamp ISO + secuencial + descripción.
5. **6 funciones nuevas sin `search_path`** (linter de Supabase). Fix mecánico.
6. **Sin path aliases en Vite** → 19 archivos con imports `../../../` o `../../../../`.
7. **`_modificaciones/` y `dist-verify/`** mezclados con código vivo. Limpiar / mover.
8. **`diagnostico_arquitec/` sin commitear** (17 archivos `??`). Confirmar y commitear.

### Verdes (deuda real pero estratégica, mes)

9. **Archivos de 1000-2000 LOC**. Partir `TodayWorkoutPage` y `EvalWorkoutPage` con un hook común reduciría duplicación.
10. **Cero tests, cero lint, cero formato**. El proyecto está al borde del tamaño en el que esto empieza a doler.
11. **Sin TypeScript**. No urgente; pesarlo cuando se ataquen los archivos gigantes.
12. **`anon_security_definer_function_executable` × 95**. Revisar uno por uno: la mayoría son RPCs intencionales, pero hay que dejar el ejercicio hecho (`REVOKE EXECUTE … FROM anon` donde corresponda).

---

## 11. Comparativa con `Aplicación para clubes deportivos` (proyecto de referencia)

| Aspecto | gym_app (actual) | Clubes deportivos | Vale la pena adoptar? |
|---|---|---|---|
| Migraciones | `migration_v22_preferred_days.sql` sueltas en `supabase/` | `supabase/migrations/20260418120000_00_link_supabase_auth.sql` | **Sí**, es el estándar del CLI. |
| Tests RLS | Ninguno | `supabase/tests/rls_smoke_tests.sql` con `NOTICE: OK` por caso | **Sí**, tenés 24 tablas con RLS y ninguna tiene smoke test. |
| Schema doc | Implícita en migraciones | `README-schema.md` + `er-diagram.mermaid` | **Sí**, especialmente el ER en mermaid. |
| API doc | Implícita en `src/lib/*` y `src/utils/*` | `api-design.md` | Útil para vos cuando vuelvas en 3 meses y no te acordés qué RPC hace qué. |
| Decisión de stack | Implícita | `stack-recommendation.md` | Bueno para nuevos contribuidores y para el "yo" del futuro. |
| Layout del front | `src/{components,pages,hooks,utils,lib,services,contexts}` por **tipo** | `app/lib/features/{auth,sports,members,events}/{application,data,presentation}` por **dominio** | **Sí** parcialmente — para la app de gimnasio el corte natural es por dominio (planes / workouts / forms / notes / wellbeing / progress). |
| README de subcarpetas | Ninguno | `app/README.md`, `supabase/README.md` | Útil. |
| SETUP | Desactualizado | Detallado, paso a paso, con secciones de troubleshooting | **Sí**, copiá la estructura. |

---

## 12. Lo que queda hecho en esta pasada

- `.gitignore` actualizado para excluir vite timestamps, `dist-verify/`, `.env.local.tmp`, mensajes de commit y la carpeta wrapper de Cowork.
- 43 archivos `vite.config.js.timestamp-*.mjs` eliminados de la raíz.
- Este documento (`03_auditoria_estructura_2026-05-20.md`).
- Propuesta de reorganización en `04_propuesta_reorganizacion.md`.

## 13. Lo que NO se tocó (espera tu OK)

- `SETUP.md` original (sigue intacto; ver propuesta de reemplazo).
- `intake-form/`, `_modificaciones/`, `push-intake-form.sh` (no se movieron).
- `vite.config.js` (no se le agregaron alias).
- Migraciones (no se renombraron).
- Funciones con `search_path` mutable (no se aplicó fix).
- `.env.local.tmp` y `commit_message_v24.txt` (no se pudieron borrar desde el sandbox; borrar a mano).
- Nada en la carpeta de clubes deportivos.
