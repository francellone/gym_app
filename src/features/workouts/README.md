# `src/features/workouts/` — ejecución de entrenamientos

Lo que el alumno ve y completa el día del entrenamiento: cargar reps/peso/RPE, marcar ejercicios como hechos, registrar PSE del día, agregar notas. También el historial agregado de sesiones pasadas.

**Movido a esta ubicación el 21/05/2026** desde `src/pages/student/{TodayWorkoutPage,HistoryPage}.jsx` y `src/components/workout/*`.

## Estructura

```
workouts/
├── README.md
├── components/
│   ├── RPEScale.jsx              Selector visual de RPE 1-10 (rama, sport-science default).
│   ├── AerobicBlockRunCard.jsx   Card de ejecución para bloques aeróbicos (zonas, duración, distancia).
│   └── CircuitBlockRunCard.jsx   Card para circuitos (rondas, time-cap).
└── pages/
    ├── TodayWorkoutPage.jsx      /student/workout — el archivo más grande del repo (2080 LOC).
    └── HistoryPage.jsx           /student/history — sesiones pasadas agrupadas por fecha.
```

> Nota: `EvalWorkoutPage` (la "versión evaluación" del workout, 1855 LOC) vive en `features/evaluations/` aunque comparte ~70% de la lógica con `TodayWorkoutPage`. Es una decisión de dominio (evaluación es otra cosa que entrenamiento), pero queda la deuda de extraer un hook común `useWorkoutSession(planId, mode)` — ver `diagnostico_arquitec/04_propuesta_reorganizacion.md` Tier 2.3.

## Quién consume

| Consumidor | Importa |
|---|---|
| `src/App.jsx` | `TodayWorkoutPage`, `HistoryPage` |
| Internamente | `TodayWorkoutPage` usa `AerobicBlockRunCard`, `CircuitBlockRunCard` (que a su vez usan `RPEScale`) |

Importar con alias:

```js
import TodayWorkoutPage from '@/features/workouts/pages/TodayWorkoutPage'
import RPEScale from '@/features/workouts/components/RPEScale'
```

## Persistencia en Supabase

Tres tablas (RLS):

- **`workout_sessions`** (39 filas al 2026-05-20) — una por (alumno, día). Pre-creadas por trigger al asignar plan. Guardan `borg_per_day` (jsonb con PSE por día del plan), `started_at`/`finished_at`.
- **`workout_logs`** (460 filas) — un log por (alumno, ejercicio, día). Reps/peso/RPE/notas. Excepción documentada: `student1@gmail.com` tiene 113 logs de evaluación históricos.
- **`workout_block_logs`** (11 filas) — agregado por bloque para circuit/aerobic.

Cron jobs relacionados:
- `fn_cleanup_abandoned_sessions` — limpia sessions sin actividad después de N días.

Triggers de back:
- `sessions_finished_requires_started` — CHECK constraint.
- Triggers que pueblan notas mirror al editar logs (sync con `notes`).

## Patrón de uso

### Día normal de entrenamiento (TodayWorkoutPage)

1. Alumno entra a `/student/workout`.
2. Componente carga: ejercicios del día (según el `schedule` del plan asignado) + logs existentes + session del día + wellbeing del día + sugerencias de "ejercicios recientes".
3. Si no hay wellbeing y es la primera vez, dispara aviso pasivo.
4. Por cada ejercicio:
   - Muestra plan_exercise + log si ya existe.
   - Al guardar: UPSERT en `workout_logs` con denormalización de notas mirror.
5. Al terminar bloque: actualiza `workout_block_logs` (para aerobic/circuit).
6. Al cerrar el día: registra PSE por día en `workout_sessions.borg_per_day`.

### Historial (HistoryPage)

Lista paginada de sesiones por fecha, con logs expandibles y notas espejo merged.

## Reglas que NO se rompen

- **No INSERTAR sessions a mano si ya hay una para ese día.** Hay UNIQUE constraint. Usar UPSERT.
- **`workout_logs.notes` queda obsoleto.** El flujo activo usa `notes` (mirror) con `context_type='workout_log'`. La columna sigue por compat, pero quien escribe es `postWorkoutLogNote` de `@/features/notes/api`.
- **No tocar `started_at`/`finished_at` después del cierre.** Si hace falta corregir, hacerlo via Supabase Dashboard.

## Lo que NO meter acá

- **Evaluation workout (`EvalWorkoutPage`).** Vive en `features/evaluations/pages/`.
- **Lógica del modelo de plan/ejercicio.** Esa vive en `features/plans/helpers.js` y este módulo la consume.
- **Componentes de progreso histórico** (gráficos, heatmap). Esos van a `features/progress/` cuando se haga.

## Deuda conocida

- **`TodayWorkoutPage.jsx`: 2080 LOC.** Candidato a partir en sub-componentes + hook `useWorkoutSession`. Ver propuesta Tier 2.3.
- **Duplicación con `EvalWorkoutPage`.** 70% del código se podría unificar.
