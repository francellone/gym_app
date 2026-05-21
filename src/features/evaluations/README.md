# `src/features/evaluations/` — evaluaciones físicas

Tests físicos (1RM, max reps, potencia, cardio, composición corporal, FMS) que el coach asigna al alumno para medir y comparar progreso. Un plan de `plan_type = 'evaluation'` agrupa pruebas, el alumno las ejecuta desde `/student/eval/:planId`, y el resultado vive en `evaluation_results`.

**Movido a esta ubicación el 21/05/2026** desde `src/utils/evalHelpers.js`, `src/pages/coach/{EvaluationsPage,EvaluationDetailPage}.jsx`, `src/pages/coach/student/StudentEvaluationsTab.jsx` y `src/pages/student/EvalWorkoutPage.jsx`.

## Estructura

```
evaluations/
├── helpers.js                     EVAL_TYPES, METHODS, evalTypeColor, evalTypeIcon, evalTypeLabel, FMS_PATTERNS, pruebaTypeInfo, calc1RM, calcPower, calcVO2max, calcBodyComp, calcFMSScore. Funciones puras.
└── pages/
    ├── EvaluationsPage.jsx        /coach/evaluations — listado de evaluaciones (templates + instancias).
    ├── EvaluationDetailPage.jsx   /coach/evaluations/:id — detalle de UNA evaluación con resultados por prueba.
    ├── StudentEvaluationsTab.jsx  Tab "Evaluaciones" dentro de StudentDetailPage (coach).
    └── EvalWorkoutPage.jsx        /student/eval/:planId — pantalla del alumno para ejecutar la evaluación.
```

## Quién consume

`helpers.js` es transversal — lo usan las pages de evaluaciones, las pages de planes, y los dashboards (necesitan los íconos y colores por tipo):

| Consumidor | Importa |
|---|---|
| `src/App.jsx` | `EvaluationsPage`, `EvaluationDetailPage`, `EvalWorkoutPage` |
| `src/pages/coach/StudentDetailPage.jsx` | `StudentEvaluationsTab` |
| `src/components/plan/DuplicatePlanModal.jsx` | `EVAL_TYPES`, `evalTypeIcon` |
| `src/pages/coach/CreatePlanPage.jsx` y `EditPlanPage.jsx` | `EVAL_TYPES`, `METHODS`, `PRUEBA_TYPES`, `EVAL_TAG_SUGGESTIONS` |
| `src/pages/coach/PlansPage.jsx` | `evalTypeColor`, `evalTypeIcon` |
| `src/pages/student/StudentDashboard.jsx` | `evalTypeIcon`, `evalTypeLabel` |

Importar con alias:

```js
import { EVAL_TYPES, calc1RM } from '@/features/evaluations/helpers'
import EvalWorkoutPage from '@/features/evaluations/pages/EvalWorkoutPage'
```

## Persistencia en Supabase

Tres tablas (todas con RLS):

- **`evaluation_tests`** (8 filas al 2026-05-20) — definición de cada prueba dentro de una evaluación (1RM en banco, salto vertical, sprint 30m, etc.).
- **`evaluation_test_responses`** (8 filas) — respuestas concretas del alumno por prueba (peso levantado, altura saltada, etc.). La columna `result` es jsonb y guarda el cálculo derivado por `helpers.calc*`.
- **`evaluation_results`** (7 filas) — resumen de la evaluación completa. Se cierra cuando se ejecuta todas las pruebas (trigger `fn_close_eval_on_result`).

Las "notas" de evaluaciones viven en el módulo `notes/` (notas espejo con `context_type='evaluation_test'` o `'evaluation_result'`).

## Reglas que NO se rompen

- **No INSERT directo en `plan_assignments` para planes evaluation con templates.** El back rechaza con trigger `trg_pa_forbid_template`. Usar `assignTemplateToStudent(supabase, {...})` de `utils/assignmentHelpers.js` que clona la plantilla → instancia personal → assign en una transacción.
- **El cierre de la evaluación es automático.** Cuando se inserta el último `evaluation_result`, el trigger `fn_close_eval_on_result` marca la asignación como completada. No tocar a mano.

## Cálculos

Las fórmulas viven en `helpers.js`:

- **1RM (Brzycki, Epley, Lombardi):** estima el máximo a partir de peso × reps.
- **Power (Bosco, Sayers):** estima potencia anaeróbica a partir de salto vertical y peso corporal.
- **VO₂max (Cooper, Harvard):** Cooper a partir de distancia en 12 min; Harvard de FC post-step test.
- **Body comp (Jackson-Pollock 3/7 sites, Yuhasz):** % grasa a partir de pliegues + edad + sexo.
- **FMS:** score 0-3 por patrón + total ponderado.

Si surgen nuevos métodos, agregarlos como entrada en `METHODS[evalType]` y la función pura en `helpers.js`. La UI los descubre automáticamente.
