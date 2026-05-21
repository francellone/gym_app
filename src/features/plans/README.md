# `src/features/plans/` — planes de entrenamiento

Core del producto: plantillas de planes, instancias asignadas a alumnos, estructura de bloques + ejercicios, calendario de planificación. Es el módulo más grande del front (~6000 LOC repartidas).

**Movido a esta ubicación el 21/05/2026** desde `src/utils/{planHelpers,assignmentHelpers,planTypeFilters}.js`, `src/components/{plan,DeletePlanModal}` y `src/pages/coach/{Plans,PlanDetail,CreatePlan,EditPlan,PlanProgressTab}.jsx` + `src/pages/coach/student/StudentPlansTab.jsx`.

## Estructura

```
plans/
├── README.md
├── helpers.js                Lógica del modelo: BORG_LABELS, weight_mode, unilateral, parseReps, calcVolume, sugerencias, etc. (~811 LOC).
├── assignmentHelpers.js      Asignación de plantillas a alumnos + RPC assignTemplateToStudent + status helpers (~659 LOC).
├── typeFilters.js            filterTrainingLogs / planTypeFilters — separar logs training vs evaluation.
├── components/
│   ├── DeletePlanModal.jsx        Confirmación de borrado (también usado por evaluations).
│   ├── DuplicatePlanModal.jsx
│   ├── ReplacePlanModal.jsx
│   ├── ScheduleEditor.jsx         Frecuencia + días preferidos.
│   ├── DayOfWeekSelector.jsx
│   ├── PlanExerciseRow.jsx        Fila de ejercicio dentro del editor de plan.
│   ├── EvaluationParentPlanField.jsx
│   └── blocks/
│       ├── AddBlockMenu.jsx
│       ├── BlockCard.jsx
│       ├── StrengthBlockEditor.jsx
│       ├── AerobicBlockEditor.jsx
│       └── CircuitBlockEditor.jsx
└── pages/
    ├── PlansPage.jsx                  /coach/plans — listado.
    ├── CreatePlanPage.jsx             /coach/plans/new
    ├── EditPlanPage.jsx               /coach/plans/:id/edit
    ├── PlanDetailPage.jsx             /coach/plans/:id
    ├── PlanProgressTab.jsx            Tab interno de PlanDetailPage (progreso agregado del plan).
    └── StudentPlansTab.jsx            Tab "Planes" dentro de StudentDetailPage.
```

## Quién consume (módulo más transversal del front)

`helpers.js` es importado por **10+ archivos** porque encapsula la lógica de logs de entrenamiento (weight_mode, unilateral, parseReps, volumen):

| Consumidor | Importa |
|---|---|
| Workouts (`TodayWorkoutPage`, `EvalWorkoutPage`, `HistoryPage`) | `borgColor`, `parseReps`, `readLogReps`, `readLogWeights`, `getEffectiveWeightMode`, `getEffectiveUnilateral`, `WEIGHT_MODES`, `REPS_UNITS`, `DAY_SECTION_IDS`, `SECTION_LABELS`, `groupExercisesIntoBlocks`, `blockDisplayTitle`, `suggestNextDay` |
| Progress (`ProgressPage`, `StudentProgressTab`, `StudentProgressTableView`) | `borgColor`, `BORG_LABELS`, `maxWeightOfLog`, `calculateLogVolume`, `getEffectiveWeightMode`, `getEffectiveUnilateral` |
| Dashboards (`CoachDashboard`) | helpers de logs |
| Workout block run cards (`AerobicBlockRunCard`, `CircuitBlockRunCard`) | helpers de blocks |
| Logs (`StudentLogsTab`) | helpers de lectura |

`assignmentHelpers.js`:
- `MonthlyCalendar`, `useCoachCalendarData` (dashboard del coach)
- `StudentsPage`, `StudentPlansTab`
- `StudentEvaluationsTab` (asigna evaluaciones via mismo RPC)

`typeFilters.js`:
- `ProgressPage`, `StudentProgressTab`

`DeletePlanModal`:
- `PlansPage`, `PlanDetailPage` (internos)
- `EvaluationsPage`, `EvaluationDetailPage` (cross-feature — evaluaciones son un tipo de plan con `plan_type='evaluation'`)

Importar siempre con alias:

```js
import { borgColor, parseReps } from '@/features/plans/helpers'
import { assignTemplateToStudent, getAssignmentStatus } from '@/features/plans/assignmentHelpers'
import { filterTrainingLogs } from '@/features/plans/typeFilters'
import DeletePlanModal from '@/features/plans/components/DeletePlanModal'
import EditPlanPage from '@/features/plans/pages/EditPlanPage'
```

## Persistencia en Supabase

5 tablas principales (todas con RLS):

- **`plans`** (26 filas) — plantillas + instancias. Discriminado por `is_template`, `plan_type` ∈ {`training`, `evaluation`}, `parent_plan_id` (instancia → template).
- **`plan_assignments`** (18 filas) — asigna un plan a un alumno con período + estado.
- **`plan_blocks`** (40 filas) — bloques dentro de un plan (`block_type`: `activation` | `strength` | `aerobic` | `circuit`).
- **`plan_exercises`** (190 filas) — ejercicios dentro de un bloque, con `suggested_*` sugeridos por el coach.
- (`workout_logs`, `workout_sessions`, `workout_block_logs` viven en el módulo `workouts/` cuando se mueva.)

## Reglas que NO se rompen

- **No INSERT directo en `plan_assignments` con `plan_id` apuntando a una plantilla.** El trigger `trg_pa_forbid_template` lo rechaza. Usar `assignTemplateToStudent(supabase, {...})` que clona la plantilla a una instancia personal del alumno y crea el assignment en una transacción atómica.
- **No borrar `plans` directamente.** Los DELETE pasan por `DeletePlanModal` que valida si hay logs/sessions dependientes y propone soft-delete (`archived = true`) cuando hay datos.
- **`plan_type='evaluation'` es un caso especial.** Los planes de evaluación tienen `parent_plan_id` apuntando al plan de training relacionado. La lógica vive en `assignmentHelpers.groupEvaluationAssignments`.
- **`weight_mode` y `unilateral`** se resuelven en cascada: log → plan_exercise → exercise. Usar `getEffectiveWeightMode` y `getEffectiveUnilateral` para no repetir la lógica.

## Cuándo tocar qué

- **Cambio en cómo se renderiza un ejercicio:** `components/PlanExerciseRow.jsx`.
- **Cambio en cómo se calcula volumen / RM / etc:** `helpers.js` (función pura, fácil de testear).
- **Cambio en flujo de asignar plan a alumno:** `assignmentHelpers.js` + RPC en Supabase.
- **Cambio en un block type:** los editores viven en `components/blocks/` + helpers compartidos en `helpers.js` (`emptyPlanExercise`, `BLOCK_TYPE_LIST`).
- **Nueva ruta del coach con planes:** `pages/` + actualizar `App.jsx`.

## Tamaño y deuda

| Archivo | LOC | Deuda |
|---|--:|---|
| `helpers.js` | 811 | Candidato a partir por dominio (logs vs blocks vs weight_mode vs sugerencias). Hoy todo en uno. |
| `assignmentHelpers.js` | 659 | Idem — mezcla agrupado de evaluaciones, mapeo de estados, RPC wrapper. |
| `pages/EditPlanPage.jsx` | 997 | Similar a CreatePlanPage; mucha duplicación. Considerar hook común `usePlanForm()`. |
| `pages/PlanDetailPage.jsx` | 1013 | Render del plan + tabs + carga de stats agregadas. |
| `pages/CreatePlanPage.jsx` | 883 | Ver EditPlanPage. |
| `pages/StudentPlansTab.jsx` | 857 | Listado + asignar + reemplazar — bien delimitado. |

## Lo que NO meter acá

- **Lógica de ejecución del entrenamiento del día.** Eso es `workouts/` (cuando se mueva): `TodayWorkoutPage`, `EvalWorkoutPage`, `RPEScale`, `AerobicBlockRunCard`, `CircuitBlockRunCard`.
- **Componentes de progreso del alumno.** `ProgressPage`, `StudentProgressTab`, `StudentProgressTableView` — irán a `progress/` o `students/` cuando se muevan.
- **Catálogo de ejercicios.** `ExercisesLibraryPage` → `exercises/` (cuando se mueva).
