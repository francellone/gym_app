# `src/features/dashboard/` — dashboards de coach y alumno

Vista de inicio para ambos roles:

- **Coach** (`/coach`): KPIs del día, alertas de gestión (alumnos sin entrenar, esfuerzo alto sostenido, sin plan, etc.), calendario mensual con asistencia, actividad reciente.
- **Alumno** (`/student`): saludo + streak + heatmap semanal + próximas evaluaciones + accesos rápidos.

**Movido a esta ubicación el 21/05/2026** desde `src/pages/{coach/CoachDashboard,student/StudentDashboard}.jsx`, `src/components/dashboard/MonthlyCalendar.jsx`, `src/hooks/useCoach{Alerts,CalendarData}.js`, `src/utils/{coachAlerts,calendarLogic}.js`.

## Estructura

```
dashboard/
├── README.md
├── alerts.js                 ALERT_KIND, ALERT_RENDER_ORDER, ALERT_THRESHOLDS — definición de las alertas del coach (sin React).
├── calendarLogic.js          Funciones puras del calendario (sin React, sin Supabase). Útil para tests + scripts.
├── hooks/
│   ├── useCoachAlerts.js          Computa las alertas a partir de logs + assignments + thresholds.
│   └── useCoachCalendarData.js    Trae datos del calendario + re-exporta utilidades de calendarLogic.
├── components/
│   ├── MonthlyCalendar.jsx        Calendario mensual con asistencia (consumido por CoachDashboard).
│   └── StudentPanel.jsx           Panel al filtrar por alumno: KPIs + donut + wellbeing + botones "Informe" (→ /coach/students/:id/informe) y "Ver alumno".
└── pages/
    ├── CoachDashboard.jsx         /coach — vista de inicio del coach.
    └── StudentDashboard.jsx       /student — vista de inicio del alumno.
```

## Quién consume

| Consumidor         | Importa                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.jsx`      | `CoachDashboard`, `StudentDashboard` (route components)                                                                                                                                      |
| Internamente       | `CoachDashboard` usa `MonthlyCalendar`, `useCoachAlerts`, `alerts.ALERT_*`. `MonthlyCalendar` usa `useCoachCalendarData` que a su vez usa `calendarLogic`                                    |
| `StudentDashboard` | `@/features/students/dashboardLogic` (computeStreak, computeWeekTrainingDays, filterTrainingLogs) — los helpers viven en students/ porque son helpers del alumno, no del dashboard genérico. |

Importar con alias:

```js
import CoachDashboard from '@/features/dashboard/pages/CoachDashboard'
import MonthlyCalendar from '@/features/dashboard/components/MonthlyCalendar'
import useCoachAlerts from '@/features/dashboard/hooks/useCoachAlerts'
import { ALERT_KIND } from '@/features/dashboard/alerts'
```

## Alertas (`alerts.js`)

Cinco categorías ordenadas por severidad (`ALERT_RENDER_ORDER`):

| Kind            | Condición                                                            |
| --------------- | -------------------------------------------------------------------- |
| `no_plan`       | Alumno sin plan activo                                               |
| `stagnation`    | Mismo peso/reps por N sesiones (configurable via `ALERT_THRESHOLDS`) |
| `high_effort`   | RPE alto sostenido (≥ N sesiones con PSE ≥ X)                        |
| `inactive`      | Sin logs en > N días                                                 |
| `plan_expiring` | Plan próximo a vencer (≤ N días)                                     |

Thresholds en `ALERT_THRESHOLDS`. Cambiarlos = cambiar la sensibilidad de las alertas, sin tocar la lógica.

## Calendario (`calendarLogic.js` + `useCoachCalendarData.js` + `MonthlyCalendar.jsx`)

`calendarLogic` es **puro** (sin React, sin Supabase). Recibe assignments y devuelve eventos del mes (inicio/fin/sesiones programadas). Pensado para tests y para reuso en scripts.

`useCoachCalendarData` lo envuelve con fetching desde Supabase + estado de loading. Re-exporta utilidades de `calendarLogic` para que los consumidores importen de un solo lugar.

`MonthlyCalendar` es la UI: grilla del mes, días con/sin asistencia, badges para inicio/fin de plan, filtro por alumno.

## Reglas que NO se rompen

- **Las alertas son derivadas — nunca se persisten.** Se calculan en el cliente a partir de `workout_logs` + `plan_assignments` + thresholds. Si hace falta cambiar la condición de una alerta, editar `alerts.js`.
- **El calendario filtra por coach.** Un coach sólo ve a sus alumnos. La query en `useCoachCalendarData` ya respeta RLS — no agregar joins que bypasseen.

## Lo que NO meter acá

- **Alertas que mandan notification a la BD.** Eso ya existe (trigger `fn_notify_stagnation` y similar). Las alertas de este módulo son sólo UI del coach.
- **Métricas long-form / reportes mensuales.** Si emerge un módulo "reports", crear `features/reports/`.
