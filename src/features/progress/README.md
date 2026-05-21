# `src/features/progress/` — progreso del alumno

Página dedicada del alumno (`/student/progress`) con gráficos de evolución: peso por ejercicio, volumen, PSE, intensidad, asistencia (heatmap 8 semanas), wellbeing. Filtros por período + por etiqueta de ejercicio + por ejercicio individual.

**Movido a esta ubicación el 21/05/2026** desde `src/pages/student/ProgressPage.jsx`.

## Estructura

```
progress/
├── README.md
└── pages/
    └── ProgressPage.jsx     /student/progress — única ruta de la feature.
```

Single-page feature. Si crece (separar gráficos, sumar comparativas, exportar PDF), partir en `components/` por tipo de chart y un hook `useProgressData`.

## Quién consume

| Consumidor | Importa |
|---|---|
| `src/App.jsx` | `ProgressPage` |

Importar con alias:

```js
import ProgressPage from '@/features/progress/pages/ProgressPage'
```

La página consume helpers de **otras features**:
- `@/features/plans/helpers` — `borgColor`, `BORG_LABELS`, `maxWeightOfLog`, `calculateLogVolume`, `getEffectiveWeightMode`, `getEffectiveUnilateral`.
- `@/features/plans/typeFilters` — `filterTrainingLogs` para excluir logs de evaluaciones de los gráficos.
- `@/features/wellbeing/components/WellbeingModal` — `WELLBEING_METRICS`, `wellbeingColor` para renderizar los charts de bienestar.

## Persistencia en Supabase

No tiene tabla propia — agrega vistas de:
- `workout_logs` con joins a `plans` y `plan_exercises.exercise`.
- `v_workout_session_intensity` (view) — intensidad por sesión.
- `wellbeing_logs`.
- `exercise_tags` + `exercise_tag_assignments` para el filtro por etiqueta.

## Decisiones de diseño

- **Excluir evaluaciones** de las series temporales — un test puntual (1RM, salto) no es comparable con una sesión de entrenamiento. Hecho con `filterTrainingLogs`.
- **Heatmap 8 semanas** fijo (`AttendanceHeatmap`) — buen balance entre densidad visual y carga cognitiva en mobile.
- **Selector de ejercicio + selector de etiqueta** son ortogonales: cambiar etiqueta resetea el ejercicio si ya no pertenece.

## Lo que NO meter acá

- **Progreso del coach sobre un alumno específico** — eso vive en `@/features/students/tabs/StudentProgressTab.jsx` (más rico, con tabla pivot + comparativa plan vs real).
- **Progreso agregado del plan (multi-alumno)** — `@/features/plans/pages/PlanProgressTab.jsx`.
