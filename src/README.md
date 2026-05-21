# `src/` — frontend

App React 18 + Vite 5 + Tailwind 3 con cliente Supabase. JSX puro (sin TypeScript).

## Mapa rápido

```
src/
├── App.jsx              Rutas y guards (PrivateRoute).
├── main.jsx             Bootstrap React + registro del service worker.
├── index.css            Imports de Tailwind.
├── contexts/            AuthContext — sesión activa + perfil.
├── components/
│   ├── layout/          CoachLayout, StudentLayout.
│   ├── dashboard/       MonthlyCalendar.
│   ├── plan/            Editor de planes y bloques.
│   ├── workout/         RPEScale + cards de bloques de circuito/aerobic.
│   ├── notes/           Panel coach↔alumno (v24+).
│   ├── notifications/   NotificationBell.
│   └── wellbeing/       Modal de bienestar pre-sesión.
├── pages/
│   ├── coach/           Vistas del coach (StudentDetailPage tiene 10 tabs en coach/student/).
│   └── student/         Vistas del alumno.
├── hooks/               useCoachAlerts, useCoachCalendarData, useNotifications, useNotes, useNoteThreadUnread.
├── utils/               Helpers puros (sin React): assignmentHelpers, calendarLogic, planHelpers, planTypeFilters, studentHelpers, studentStatus, studentDashboardLogic, coachAlerts, evalHelpers, errorHelpers.
├── services/            pushService.js — Web Push API.
├── lib/                 supabase.js (cliente), notes.js (data layer del módulo notas).
└── features/
    ├── auth/            AuthContext + LoginPage + ProfilePage.
    ├── dashboard/       CoachDashboard + StudentDashboard + MonthlyCalendar + alerts + calendarLogic + hooks.
    ├── evaluations/     Tests físicos (1RM, max reps, potencia, etc.). Helpers + 4 pages.
    ├── exercises/       Biblioteca de ejercicios del coach (CRUD + tags).
    ├── forms/           Motor de form-builder (intake/) + 6 pages (intake + follow-up).
    ├── notes/           Panel de notas coach↔alumno (data layer + UI + hooks + pages).
    ├── notifications/   Campana, hook con realtime, Web Push.
    ├── plans/           Planes, bloques, ejercicios — el módulo más grande. Helpers + assignmentHelpers + typeFilters + 12 components + 6 pages.
    ├── progress/        ProgressPage del alumno (gráficos de evolución).
    ├── students/        Gestión coach-side de alumnos. Helpers + status + dashboardLogic + 3 pages + 5 tabs + StudentProgressTableView shared.
    ├── wellbeing/       Modal pre-sesión + tab de tendencias en coach.
    └── workouts/        Ejecución del entrenamiento del día + historial. TodayWorkoutPage (2080 LOC) + HistoryPage + RPE/Aerobic/Circuit run cards.
```

## Convenciones

- **Imports:** preferir aliases `@/`, `@features/`, `@lib/`, `@utils/`, `@components/` (definidos en `vite.config.js`). Dentro de una misma feature usar imports relativos (`../api`, `../hooks/useNotes`); cross-feature, alias absoluto (`@/features/notes/api` o `@features/notes/api`). Los imports relativos largos siguen funcionando — convertir gradualmente cuando se toca cada archivo.
- **Rutas:** definidas en `src/App.jsx`. Coach bajo `/coach/*`, alumno bajo `/student/*`. `PrivateRoute` valida `requiredRole`.
- **Acceso a Supabase:** siempre vía `src/lib/supabase.js`. Hay dos clientes: `supabase` (sesión persistida) y `supabaseIsolated` (sin sesión — se usa cuando hay que crear alumnos sin reemplazar la sesión del coach).
- **Errores hacia el usuario:** mapearlos vía `src/utils/errorHelpers.js`. Si el back devuelve un CHECK constraint conocido, se traduce ahí en un solo lugar.
- **Estilos:** Tailwind. Sin CSS modules ni styled-components. Paleta primaria definida en `tailwind.config.js`.

## Donde NO meter cosas

- `_modificaciones/` (carpeta legacy en raíz) — ya está vacía o por borrarse. No reusar.
- `intake-form/` (carpeta vieja) — fue movida a `src/features/forms/intake/`. No volver a la raíz.

## Tamaño

Snapshot 2026-05-20: ~30.794 LOC en `.jsx` + `.js`. Top archivos:
- `pages/student/TodayWorkoutPage.jsx` — 2080 LOC (candidato a partir, ver propuesta Tier 2.3).
- `pages/student/EvalWorkoutPage.jsx` — 1855 LOC (idem).
- `lib/notes.js` — 1039 LOC.
- Varios tabs y páginas de coach entre 800-1000 LOC.
