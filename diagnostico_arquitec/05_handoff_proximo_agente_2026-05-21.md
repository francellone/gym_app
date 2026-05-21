# Handoff para retomar — gym_app, 2026-05-21

Sesión cerrada ~01:00 UTC-3 del 21/05 después de migrar todo el frontend a `src/features/`. Este documento existe porque la memoria persistente de Claude no fue accesible desde el sandbox de Cowork — guardalo acá y al retomar arrancá pidiéndole al agente que lea `diagnostico_arquitec/05_handoff_proximo_agente_2026-05-21.md`.

---

## TL;DR — qué pasó

- Auditoría del repo + propuesta por tiers en `03_auditoria_estructura_2026-05-20.md` y `04_propuesta_reorganizacion.md`.
- Limpieza: 43 vite timestamps borrados, `_modificaciones/` y experimento `multiclub_*` archivados, `diagnostico_arquitec/` versionado por primera vez.
- Vite con path aliases (`@`, `@lib`, `@utils`, `@components`, `@pages`, `@hooks`, `@contexts`, `@services`).
- Supabase: fix de `search_path` aplicado en 6 funciones (migración `20260521003824` estrena `supabase/migrations/`). RLS smoke tests en `supabase/tests/rls_smoke_tests.sql`.
- **Tier 2.2 completo (12/12 features):** todo `src/` ahora vive en `src/features/{auth, dashboard, evaluations, exercises, forms, notes, notifications, plans, progress, students, wellbeing, workouts}`.
- READMEs en `src/`, `supabase/` y cada feature.

## Estado del repo

```
src/
├── App.jsx, main.jsx, index.css
├── components/layout/{CoachLayout,StudentLayout}.jsx       transversales
├── components/SendToStudentModal.jsx                       compartido
├── lib/supabase.js                                         supabase + supabaseIsolated
├── utils/errorHelpers.js                                   genérico
└── features/
    ├── auth/           AuthContext + LoginPage + ProfilePage
    ├── dashboard/      CoachDashboard + StudentDashboard + MonthlyCalendar + alerts + calendarLogic + 2 hooks
    ├── evaluations/    helpers + 4 pages
    ├── exercises/      ExercisesLibraryPage
    ├── forms/          intake builder + 6 pages
    ├── notes/          api + 4 components + 2 hooks + 2 pages
    ├── notifications/  NotificationBell + useNotifications + pushService
    ├── plans/          el más grande — helpers + assignmentHelpers + typeFilters + 12 components + 6 pages
    ├── progress/       ProgressPage del alumno
    ├── students/       helpers + status + dashboardLogic + 3 pages + 5 tabs + StudentProgressTableView
    ├── wellbeing/      WellbeingModal + StudentWellbeingTab
    └── workouts/       TodayWorkoutPage (2080 LOC) + HistoryPage + 3 run cards
```

Bundle: 1,519.32 kB / 395.82 kB gzip — idéntico al pre-reorg.

## Pendiente operativo

1. **`SETUP.draft.md` espera tu OK** — está al lado de `SETUP.md` (que sigue desactualizado). Si te convence el draft, `mv SETUP.draft.md SETUP.md`.

2. **Cleanups manuales acumulados** — el sandbox de Cowork no puede borrar archivos preexistentes. Después de cada move te pasé un `rm` para correr. Si quedó alguno sin correr, `git status` te lo va a marcar como duplicado. Comando completo de garantía:

   ```bash
   cd ~/Desktop/gym_app/gym_app
   # Si algo de esto existe todavía, borralo:
   rm -rf src/components/{notes,wellbeing,workout,notifications,plan,dashboard} 2>/dev/null
   rm -rf src/pages/coach/student src/contexts 2>/dev/null
   rm src/components/DeletePlanModal.jsx 2>/dev/null
   rm src/hooks/use{Notes,NoteThreadUnread,Notifications,CoachAlerts,CoachCalendarData}.js 2>/dev/null
   rm src/lib/notes.js 2>/dev/null
   rm src/services/pushService.js 2>/dev/null && rmdir src/services 2>/dev/null
   rm src/utils/{planHelpers,assignmentHelpers,planTypeFilters,evalHelpers,studentHelpers,studentStatus,studentDashboardLogic,coachAlerts,calendarLogic}.js 2>/dev/null
   rm src/pages/coach/{CoachDashboard,StudentsPage,StudentDetailPage,CreateStudentPage,PlansPage,PlanDetailPage,CreatePlanPage,EditPlanPage,PlanProgressTab,ExercisesLibraryPage,EvaluationsPage,EvaluationDetailPage,FormBuilderPage,FollowUpFormBuilderPage,FollowUpFormsPage}.jsx 2>/dev/null
   rm src/pages/student/{StudentDashboard,TodayWorkoutPage,HistoryPage,ProgressPage,ProfilePage,EvalWorkoutPage,IntakeFormPage,FollowUpFormPage,FormsListPage,NotesPage}.jsx 2>/dev/null
   rmdir src/pages/coach src/pages/student src/pages 2>/dev/null
   rm src/pages/LoginPage.jsx 2>/dev/null
   npm run build
   ```

3. **Commit pendiente** — todo lo de esta sesión está sin commitear (varios commits que fuiste haciendo + el último batch de dashboard/progress/profile).

## Próximos pasos del plan (orden recomendado)

Detalle en `04_propuesta_reorganizacion.md`. Por costo/beneficio:

1. **Tier 2.3 — partir `TodayWorkoutPage` y `EvalWorkoutPage`** con un hook común `useWorkoutSession(planId, mode)`. Son 2080 + 1855 LOC con ~70% de código duplicado. Es el refactor con mejor ratio del lote restante y la mejor preparación para sumar features nuevas en workouts/evaluations.
2. **Tier 3.1 — eslint + prettier + husky + lint-staged.** 30K LOC sin lint es deuda creciente.
3. **Tier 3.2 — `vitest` + 5 tests críticos de UI.** Login, plan create, log save, note create, notification bell.
4. **Tier 3.3 — TypeScript gradual** empezando por `lib/` y `features/*/helpers.js`.
5. **Tier 3.4 — `er-diagram.mermaid` + `docs/api-rpcs.md`** (documentación del modelo).

## Convenciones vivas (no romper)

- **Supabase migrations:** `supabase/migrations/YYYYMMDDHHMMSS_NN_descripcion.sql`. Funciones nuevas SIEMPRE con `SET search_path = public, pg_temp`. `SECURITY DEFINER` con REVOKE FROM PUBLIC + GRANT TO authenticated. Doble check del `project_id = bvexjanqmfypmtgoapbt` antes de aplicar.
- **Frontend imports:** dentro de una feature, relativos (`../api`, `../hooks/useNotes`). Cross-feature, alias absoluto (`@/features/notes/api`). Shared lib/utils, alias (`@/lib/supabase`).
- **profiles** no tiene policy DELETE — "borrar" = `active=false` + `is_test=true`.
- **No INSERT directo en `plan_assignments`** para plan_id que sea plantilla → RPC `assign_template_to_student`.
- **Crear alumnos** sólo vía edge function `create-student` con `supabaseIsolated`.
- **App de clubes deportivos: NUNCA modificar.** Sólo referencia.

## Datos y URLs clave

- App prod: https://gym-appv2.vercel.app/
- Supabase: https://supabase.com/dashboard/project/bvexjanqmfypmtgoapbt (sa-east-1, Postgres 17.6)
- Repo: https://github.com/francellone/gym_app (branches `main` + `v2`)
- Coach principal: `anto.au.almanza@gmail.com` (id `4d7b89ef-28af-4407-9d91-b5616e806ce3`, 5 alumnos)
- Browser para validación: usar el llamado **francellone** (deviceId `5c324fc5-b1e8-4e0f-b5bd-ab5054057e08`), no el otro.

## Para el próximo agente — instrucciones de arranque

Cuando Franco abra una sesión nueva:

1. Leer este archivo (`diagnostico_arquitec/05_handoff_proximo_agente_2026-05-21.md`).
2. Leer `01_changelog_back.md` (la "biblia" del back) si vas a tocar BD.
3. Leer el README de la(s) feature(s) que vas a modificar — están en `src/features/<x>/README.md`.
4. Correr `git status` para ver si quedaron archivos viejos sin borrar.
5. Confirmar con Franco qué quiere atacar — si dice "sigamos" o "vamos", elegí el próximo paso lógico del plan en `04_propuesta_reorganizacion.md` sin pedir clarificación adicional.

## Estilo de trabajo de Franco (cosas que aprendí)

- Confía en autonomía. "Sigamos" / "vamos" / "todo ok" → ejecutá el próximo paso sin preguntar de nuevo.
- Cuando algo no le cierra, pregunta directo y espera evidencia concreta (ej: query SQL que pruebe lo que decís), no racionalización.
- Da feedback corto y conciso. No le des largos pre-ambles, andá directo al action + comando shell.
- Tipea desde teléfono o con prisa — interpretá los typos con buena fe.
- No es desarrollador formal — explicaciones técnicas conviene aterrizarlas con qué hace cada cosa y qué tiene que correr él.
- Mac con zsh: pegarle comentarios `#` en multi-linea le tira ruido (`zsh: command not found: #`). Inofensivo pero feo. Evitarlo cuando se pueda.
- El sandbox de Cowork no puede borrar archivos preexistentes — terminá CADA refactor que mueva/renombre cosas con un bloque ```bash``` con los `rm` que él tiene que correr.
- Hace los cleanups y commits a mano en su terminal. Vos sólo proponés y el código aplica automáticamente vía Write/Edit/sed.
