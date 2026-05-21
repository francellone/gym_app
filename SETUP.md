# GymCoach — Guía de instalación y operación

> **Estado del documento:** draft del 2026-05-20. Reemplazo propuesto del `SETUP.md` original (que quedó desactualizado: hablaba de un `schema.sql`/`seed.sql` inexistentes y no mencionaba la mitad de las features actuales). Revisar y, si está OK, pisar `SETUP.md`.

Esta guía describe **lo que efectivamente corre en producción** del proyecto GymCoach, no lo que se planeó al inicio.

---

## 0. Qué es esto

App mobile-first para que un coach (Anto) gestione planes y entrenamientos de sus alumnos. El alumno entra desde el celular, ve su rutina del día, registra sets/reps/peso/RPE, completa formularios (intake + seguimientos), recibe notificaciones push y le manda notas al coach. El coach ve todo consolidado: dashboard con alertas, calendario, biblioteca de ejercicios, evaluaciones, panel de notas, etc.

Hoy en producción: **5 alumnos activos, 25 planes, ~460 logs**. Deploy en `https://gym-appv2.vercel.app/`.

---

## 1. Stack real

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | React 18 + Vite 5 + Tailwind 3 | JSX puro (sin TypeScript). |
| Routing / estado | `react-router-dom` 6 + Context API (`AuthContext`) | Sin Redux/Zustand. |
| Iconos / charts | `lucide-react`, `recharts`, `date-fns` | |
| Backend | Supabase Postgres 17.6 + Auth + Storage + Realtime + Edge Functions + pg_cron | Proyecto `bvexjanqmfypmtgoapbt`, región `sa-east-1`. |
| Edge Functions | `create-student`, `notify-cron` | Código en `supabase/functions/`. Versionadas en Supabase. |
| PWA / push | Service Worker propio (`public/sw.js`) + Web Push API | Registro en `src/main.jsx`. |
| Hosting | Vercel | `vercel.json` con rewrite SPA. |
| Repo | GitHub `francellone/gym_app` | Ramas: `main` (default) y `v2`. |

No hay TypeScript, no hay tests automatizados, no hay linter configurado en `package.json`. El refactor de BD del 16/05 dejó **24 tablas con RLS** y guardrails en producción (triggers, cron jobs, CHECK constraints). Detalle completo en `diagnostico_arquitec/01_changelog_back.md`.

---

## 2. Estructura del repo (snapshot 2026-05-20)

```
gym_app/
├── src/
│   ├── App.jsx              ← rutas
│   ├── main.jsx             ← bootstrap + service worker
│   ├── index.css
│   ├── contexts/            AuthContext
│   ├── components/          UI: dashboard, layout, notes, notifications, plan, wellbeing, workout
│   ├── pages/
│   │   ├── coach/           CoachDashboard, PlansPage, EditPlanPage, …
│   │   │   └── student/     10 tabs internos para StudentDetailPage
│   │   └── student/         StudentDashboard, TodayWorkoutPage, …
│   ├── hooks/               useCoachAlerts, useNotes, useNotifications, …
│   ├── utils/               assignmentHelpers, calendarLogic, planHelpers, …
│   ├── services/            pushService.js
│   └── lib/                 supabase.js (cliente), notes.js (data layer)
├── public/                  favicon, manifest.json, sw.js
├── supabase/
│   ├── migration_v*.sql     ← migraciones históricas (v2 → v29). Aplicadas, no renombrar.
│   ├── migrations/          ← convención nueva: YYYYMMDDHHMMSS_NN_descripcion.sql
│   └── functions/
│       ├── create-student/  edge function (sign-up + perfil)
│       └── notify-cron/     edge function (notificaciones programadas)
├── src/features/forms/intake/  ← intake + follow-up forms (movido desde intake-form/ el 21/05)
├── scripts/                 verify_calendar_fix.mjs, verify_student_dashboard_fix.mjs
├── diagnostico_arquitec/    auditorías, changelog del refactor de BD, handoffs back↔front
├── vite.config.js           con path aliases @, @lib, @utils, @components, @pages, @hooks, @contexts, @services
├── tailwind.config.js
├── postcss.config.js
├── vercel.json              rewrite SPA → index.html
├── package.json
└── .env.example             plantilla de variables
```

---

## 3. Levantar el proyecto en local

### 3.1 Pre-requisitos

- Node.js 20+ (probado en 20 y 22).
- Cuenta en [Supabase](https://supabase.com) (free tier alcanza).
- Cuenta en [Vercel](https://vercel.com) para deploy (free tier).
- Opcional: [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) si vas a aplicar migraciones nuevas desde el repo.

### 3.2 Variables de entorno

Copiar plantilla y completar:

```bash
cp .env.example .env
```

`.env` debe quedar así (valores reales del proyecto Supabase):

```
VITE_SUPABASE_URL=https://bvexjanqmfypmtgoapbt.supabase.co
VITE_SUPABASE_ANON_KEY=<copiar desde Supabase Dashboard → Settings → API → anon public>
```

### 3.3 Instalación y dev server

```bash
npm install
npm run dev
```

App disponible en `http://localhost:5173`. Cualquier cambio en `src/` se hot-reloadea.

### 3.4 Build de producción

```bash
npm run build      # genera dist/
npm run preview    # sirve dist/ localmente
```

---

## 4. Acceso a Supabase

### 4.1 Conectarse

- Dashboard: https://supabase.com/dashboard/project/bvexjanqmfypmtgoapbt
- Cliente JS configurado en `src/lib/supabase.js`. Exporta `supabase` (sesión persistida) y `supabaseIsolated` (sin sesión — se usa para crear alumnos sin reemplazar la del coach).

### 4.2 Esquema actual (24 tablas, todas con RLS)

Ver `diagnostico_arquitec/03_auditoria_estructura_2026-05-20.md` sección 4 para el inventario con conteo de filas y comentarios por tabla. Resumido:

- **Identidad / acceso:** `profiles`, `student_edit_history`.
- **Catálogo:** `exercises`, `exercise_tags`, `exercise_tag_assignments`.
- **Planificación:** `plans`, `plan_assignments`, `plan_exercises`, `plan_blocks`.
- **Ejecución de entrenamiento:** `workout_sessions`, `workout_logs`, `workout_block_logs`.
- **Evaluaciones:** `evaluation_tests`, `evaluation_test_responses`, `evaluation_results`.
- **Formularios:** `intake_form_templates`, `intake_form_assignments`, `intake_form_submissions`.
- **Comunicación coach↔alumno (v24+):** `note_threads`, `notes`, `legacy_notes_shim_log`.
- **Notificaciones:** `notifications`, `push_subscriptions`.
- **Bienestar:** `wellbeing_logs`.

Además: schema `archive` con 7 backups nominales (`plan_assignments_backup_20260508`, `student_profiles` y 5 `*_notes_20260517`). Todos con RLS habilitada — los `*_notes_20260517` se habilitaron el 2026-05-21 vía migración `enable_rls_on_archive_notes_backups`.

### 4.3 Migraciones

**Convención vigente desde 2026-05-21:** toda migración nueva vive en `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql` (formato estándar del CLI de Supabase, sin sufijo `_NN_`). Las migraciones históricas (`migration_v2.sql` a `migration_v31_*.sql`) viven en `supabase/legacy/` con README explicativo — **no se renombran ni se vuelven a aplicar**.

Para aplicar:

- Vía CLI: `supabase db push` (requiere tener el CLI configurado contra el proyecto).
- Vía MCP de Supabase: enviar el SQL como `apply_migration` con `name` igual al sufijo del archivo (sin la fecha).

**Importante:** antes de aplicar, doble check del `project_id`. El 19/05/2026 se aplicó por error el esquema del proyecto "Aplicación para clubes deportivos" contra esta base; se rolleó en 13 minutos y no hubo impacto, pero quedó archivado en `diagnostico_arquitec/legacy_multiclub_experiment/` como recordatorio.

### 4.4 Edge Functions

Dos funciones activas:

| Slug | Verifica JWT | Para qué sirve | Código |
|---|---|---|---|
| `create-student` | No (público, usa service role internamente) | Sign-up + creación de `profiles` para alumnos nuevos sin tocar la sesión del coach. | `supabase/functions/create-student/index.ts` |
| `notify-cron` | Sí | Trigger de notificaciones programadas (vencimientos de planes, estancamientos). | `supabase/functions/notify-cron/index.ts` |

Para deploy: `supabase functions deploy <slug>` con el CLI configurado.

### 4.5 Cron jobs activos (pg_cron)

Detalle en `diagnostico_arquitec/01_changelog_back.md` sección "Guardrails automáticos". A grandes rasgos: cleanup diario de sesiones abandonadas, 4 jobs de notificaciones de negocio, y un health check semanal que detecta regresiones de esquema y notifica a los coaches.

---

## 5. Rutas de la app

```
/login

/coach/                                  CoachDashboard (alertas + calendario + actividad)
/coach/students                          listado de alumnos
/coach/students/new                      alta de alumno
/coach/students/:id                      detalle del alumno (10 tabs: Info, Plans, Logs, Progress, ProgressTableView, Evaluations, Forms, Notes, Wellbeing, History)
/coach/plans                             listado de planes
/coach/plans/new                         crear plan
/coach/plans/:id                         ver plan
/coach/plans/:id/edit                    editar plan
/coach/exercises                         biblioteca de ejercicios
/coach/evaluations                       listado de evaluaciones
/coach/evaluations/:id                   detalle
/coach/form-builder                      builder de intake form
/coach/follow-up-forms                   listado de follow-ups
/coach/follow-up-forms/:id               builder de follow-up

/student/                                StudentDashboard
/student/workout                         entrenamiento del día (registrar)
/student/eval/:planId                    evaluación
/student/progress                        gráficos de progreso
/student/history                         historial
/student/profile                         perfil
/student/forms                           listado de formularios pendientes
/student/notes                           hilo de notas con el coach
/student/intake                          intake form (fuera del layout)
/student/form/:assignmentId              follow-up form individual (fuera del layout)
```

`PrivateRoute` en `src/App.jsx` valida `requiredRole` (coach o student) y redirige a `/login` si no hay sesión.

---

## 6. Deploy

### 6.1 Producción (Vercel)

Configurado en `vercel.json`: rewrite SPA a `index.html`. Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se cargan desde el dashboard de Vercel (Settings → Environment Variables).

Cada push a `main` en GitHub dispara un deploy automático. URL pública: `https://gym-appv2.vercel.app/`.

### 6.2 Edge functions

`supabase functions deploy create-student` y `supabase functions deploy notify-cron` cuando cambien.

### 6.3 Service Worker / push notifications

El `public/sw.js` se sirve directo desde el bundle. Para suscribir un alumno, se llama a `pushService.js` (en `src/services/`) que registra la suscripción en la tabla `public.push_subscriptions`. Hoy esa tabla tiene 0 filas — la feature está en standby hasta decidir si se mantiene.

---

## 7. Operaciones comunes

### 7.1 Crear un alumno

Opción recomendada — desde la app:

1. Ingresar como coach.
2. `/coach/students/new`, completar datos + asignar plan inicial.
3. El backend usa la edge function `create-student` para no perder la sesión del coach.
4. Compartirle al alumno email + password.

Opción manual (debugging):

1. Supabase Dashboard → Authentication → Users → Add user.
2. SQL Editor: `UPDATE profiles SET role = 'student', name = '…' WHERE email = '…';`

### 7.2 Crear un plan

Como coach: `/coach/plans/new`. Editor con bloques (`A1`, `B1`, activación, core), cada bloque con ejercicios desde la biblioteca o nuevos. El plan se asigna a uno o varios alumnos.

### 7.3 Cargar ejercicios masivamente

Hoy es manual desde `/coach/exercises`. No hay seed automático.

### 7.4 Notificaciones push en el celular

Una vez instalada como PWA ("Agregar a pantalla de inicio" en el navegador), el alumno recibe notificaciones nativas. Requiere que `pushService.js` haya registrado la suscripción.

---

## 8. Operación de Supabase

### 8.1 Cuando aparezca un bug nuevo

Crear un handoff nuevo en `diagnostico_arquitec/handoff_<bug>_<nombre>_para_front.md` siguiendo el formato de los anteriores. Documentar decisiones antes de tocar BD.

### 8.2 Health check semanal

Cron job que detecta 6 categorías de regresiones de esquema y manda una `notification` a los coaches. Si llega una alerta, revisar el `data` del notification (jsonb con los counts por categoría) y cruzar con el `01_changelog_back.md` para entender contexto.

### 8.3 Linter externo

Cada vez que se aplica una migración mayor, conviene correr `mcp__supabase__get_advisors` (security + performance). El snapshot 2026-05-20 dejó **0 ERROR**, **101 WARN** (mayormente RPCs intencionalmente expuestas a `anon` + algunas funciones sin `search_path` ya fixeadas) y **2 INFO**. Detalle en `03_auditoria_estructura_2026-05-20.md` sección 5.

---

## 9. Costos (snapshot 2026-05-20)

| Item | Hoy | Cuándo deja de ser gratis |
|---|---|---|
| Supabase (DB + Auth + Storage + Functions) | USD 0 | 500 MB DB, 1 GB storage, 50k MAU, 500k edge function invocations/mes. |
| Vercel | USD 0 | Hobby tier para proyectos personales. |
| GitHub | USD 0 | Repo privado, free tier. |
| Total mensual | USD 0 | |

---

## 10. Dónde más leer

| Para entender… | Mirá |
|---|---|
| El refactor de BD de mayo y los guardrails que quedaron | `diagnostico_arquitec/01_changelog_back.md` |
| La auditoría post-refactor del 16/05 | `diagnostico_arquitec/02_auditoria_post_refactor_2026-05-16.md` |
| El estado real del repo y los huecos de doc al 20/05 | `diagnostico_arquitec/03_auditoria_estructura_2026-05-20.md` |
| Plan de reorganización por tiers | `diagnostico_arquitec/04_propuesta_reorganizacion.md` |
| El módulo de notas v24+ | `diagnostico_arquitec/plan_deprecacion_notas_v24.md`, `src/lib/notes.js`, `src/components/notes/` |

---

## 11. FAQ

**¿Funciona en celular?**
Sí, mobile-first. También en escritorio.

**¿Se puede instalar como app en el celular?**
Sí, es una PWA. "Agregar a pantalla de inicio" desde el navegador.

**¿Los alumnos ven las notas privadas del coach?**
No. Las notas privadas del coach están protegidas por RLS y por separación de columnas (campos `private_*` solo legibles por el coach).

**¿Por qué no hay tests?**
Deuda real. Está en `diagnostico_arquitec/04_propuesta_reorganizacion.md` (Tier 3) — la propuesta es arrancar con `vitest` + 5 tests críticos + `supabase/tests/rls_smoke_tests.sql`.
