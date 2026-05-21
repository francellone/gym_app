# `src/features/students/` — gestión de alumnos (coach-side)

Todo lo que el coach ve y maneja respecto a sus alumnos: listado, alta, detalle con tabs por área (info, planes, evaluaciones, formularios, wellbeing, progreso, logs, historial, notas). También los helpers puros (labels, status de pago/plan, lógica del dashboard del alumno).

**Movido a esta ubicación el 21/05/2026** desde `src/pages/coach/{Students,StudentDetail,CreateStudent}Page.jsx`, `src/pages/coach/student/*`, y `src/utils/{studentHelpers,studentStatus,studentDashboardLogic}.js`.

## Estructura

```
students/
├── README.md
├── helpers.js               LEVEL_LABELS, GENDER_LABELS, FIELD_LABELS, PATOLOGIAS_OPTIONS, displayValue, validateLesionesConsistency, lesionesCheckErrorMessage, etc.
├── status.js                getPaymentStatus, getPlanStatus, PAYMENT_STATUS, PLAN_STATUS (semáforo de pago + plan activo).
├── dashboardLogic.js        computeStreak, computeWeekTrainingDays (alimentan StudentDashboard del alumno). Re-exporta filterTrainingLogs desde plans/typeFilters.
├── pages/
│   ├── StudentsPage.jsx          /coach/students — listado con búsqueda + chips de status.
│   ├── StudentDetailPage.jsx     /coach/students/:id — orquestador con 9 tabs.
│   └── CreateStudentPage.jsx     /coach/students/new — alta de alumno via edge function create-student.
├── tabs/
│   ├── StudentInfoTab.jsx        Datos personales + intake editable.
│   ├── StudentLogsTab.jsx        Logs raw del alumno (chronological).
│   ├── StudentHistoryTab.jsx     Historial de cambios (student_edit_history).
│   ├── StudentProgressTab.jsx    Gráficos + heatmap + tabla pivot.
│   └── StudentFormsTab.jsx       Vista del coach de los formularios asignados.
└── components/
    └── StudentProgressTableView.jsx   Tabla pivot — también usada por features/plans/pages/PlanProgressTab.
```

> Los tabs que viven en OTRAS features pero se montan dentro de `StudentDetailPage`:
> - `StudentPlansTab` → `features/plans/pages/`
> - `StudentEvaluationsTab` → `features/evaluations/pages/`
> - `StudentNotesTab` → `features/notes/pages/`
> - `StudentWellbeingTab` → `features/wellbeing/pages/`

## Quién consume

| Consumidor | Importa |
|---|---|
| `src/App.jsx` | `StudentsPage`, `StudentDetailPage`, `CreateStudentPage` |
| Internamente | `StudentDetailPage` monta los 5 tabs locales + los 4 cross-feature |
| `features/plans/pages/PlanProgressTab.jsx` | `StudentProgressTableView` (vista compartida) |
| `src/pages/student/StudentDashboard.jsx` | `dashboardLogic` (computeStreak, computeWeekTrainingDays, filterTrainingLogs) — cuando StudentDashboard se mueva a `features/dashboard/`, este import sigue igual con el alias |

Importar con alias:

```js
import StudentsPage from '@/features/students/pages/StudentsPage'
import StudentInfoTab from '@/features/students/tabs/StudentInfoTab'
import StudentProgressTableView from '@/features/students/components/StudentProgressTableView'
import { LEVEL_LABELS } from '@/features/students/helpers'
import { getPaymentStatus, PAYMENT_STATUS } from '@/features/students/status'
import { computeStreak } from '@/features/students/dashboardLogic'
```

## Persistencia en Supabase

Tabla principal: **`profiles`** (14 filas al 2026-05-20). Sin policy `DELETE` por diseño — "borrar" = `active=false` + `is_test=true`. Comentarios completos en `supabase/README.md`.

Tablas secundarias del módulo:
- **`student_edit_history`** (21 filas) — auditoría automática vía trigger `audit_profile_changes`.
- **`profiles.last_payment_date`, `next_payment_due`, `payment_notes`** (3 columnas agregadas por la migración `add_payment_tracking.sql` el 04/2026) — alimentan `getPaymentStatus`.
- **`intake_form_assignments`** + **`intake_form_submissions`** — el detalle del alumno trae el último submission para mostrar las respuestas del intake.

Edge function relacionada:
- **`create-student`** — sign-up + creación de `profiles` sin tocar la sesión del coach. Usada por `CreateStudentPage`.

## Reglas que NO se rompen

- **No INSERT directo a `profiles` desde el cliente del coach** — pasa por la edge function `create-student` con cliente aislado (`supabaseIsolated`), si no la sesión del coach se reemplaza.
- **No usar `profiles.coach_id` como único filtro de "mis alumnos".** Desde v31 hay multi-coach (un alumno puede tener varios coaches via tabla intermedia). El refactor está completo en BD pero algunas vistas todavía leen `coach_id` directo — ver `diagnostico_arquitec/01_changelog_back.md`.
- **`weight_kg` puede ser null** en alumnos viejos (no se les pidió). 3 casos documentados al 2026-05-16. El front comunica al usuario y deja el cálculo sin BW.
- **Los tabs de StudentDetailPage** se cargan all-at-once y reciben los datos como props desde el orquestador. No re-fetcher en cada tab; usar `onRefresh` del padre cuando algo cambia.

## Lo que NO meter acá

- **Notes / wellbeing / plans / evaluations**: cada uno tiene su feature. Los tabs viven en sus respectivas features y se montan acá vía import.
- **Dashboards (`StudentDashboard.jsx` del alumno, `CoachDashboard.jsx`)**: van a `features/dashboard/` (todavía pendiente).
- **Profile (`ProfilePage.jsx` del alumno)**: vista que el alumno usa para editar sus propios datos. Pendiente decidir si va en `students/` o `auth/`.

## Tamaño y deuda

| Archivo | LOC | Deuda |
|---|--:|---|
| `tabs/StudentProgressTab.jsx` | 798 | Mucha lógica de filtrado y gráficos — candidato a partir en sub-componentes por tipo de chart. |
| `components/StudentProgressTableView.jsx` | 1021 | Tabla pivot compleja. Si crece más, partir filas/columnas/render en componentes. |
| `pages/StudentDetailPage.jsx` | ~270 | Razonable. Es sólo orquestación. |
| `tabs/StudentInfoTab.jsx` | 779 | Datos personales + edit form + intake summary — partir en cards. |
