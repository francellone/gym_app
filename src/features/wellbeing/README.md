# `src/features/wellbeing/` — registro de bienestar pre-sesión

Captura el estado de bienestar del alumno al inicio del entrenamiento del día (sueño, nutrición, hidratación, energía, estrés, fatiga muscular). El coach ve la evolución en su tab para detectar tendencias (alumno cansado, durmiendo mal, etc.) y ajustar el plan.

**Movido a esta ubicación el 21/05/2026** desde `src/components/wellbeing/` y `src/pages/coach/student/StudentWellbeingTab.jsx`. Sin cambios funcionales — sólo reorganización.

## Estructura

```
wellbeing/
├── components/
│   └── WellbeingModal.jsx      Modal que pide las 6 métricas (1-10) + opcional comentario. Lo dispara TodayWorkoutPage. Exports: WellbeingModal (default), WELLBEING_METRICS, wellbeingColor.
└── pages/
    └── StudentWellbeingTab.jsx  Tab dentro de StudentDetailPage (coach) con gráficos de tendencia (line + radar) por período (2s, 1m, 3m, todo).
```

## Las 6 métricas

| Key | Label | Tipo | "10 es…" |
|---|---|---|---|
| `sleep_quality` | Calidad de sueño | positive | excelente |
| `nutrition_quality` | Calidad de nutrición | positive | excelente |
| `hydration_quality` | Hidratación | positive | excelente |
| `energy_level` | Energía | positive | alta |
| `stress_level` | Estrés | negative | máximo (crítico) |
| `muscle_fatigue` | Fatiga muscular | negative | máximo (crítico) |

`positive: true` significa que valores altos son buenos. `positive: false` (estrés, fatiga) significa que valores altos son problema. La función `wellbeingColor(value, positive)` traduce esto a un código de color para chips/badges.

## Quién consume estos módulos

| Consumidor | Importa |
|---|---|
| `src/pages/student/TodayWorkoutPage.jsx` | `WellbeingModal` (default) + `WELLBEING_METRICS` + `wellbeingColor` — muestra la tarjeta "Wellbeing de hoy", dispara el modal, persiste en `public.wellbeing_logs`. |
| `src/pages/student/ProgressPage.jsx` | `WELLBEING_METRICS` + `wellbeingColor` — para renderizar la métrica en los gráficos de progreso del alumno. |
| `src/pages/coach/StudentDetailPage.jsx` | `StudentWellbeingTab` (default) — monta el tab Wellbeing dentro del detalle del alumno. |

Siempre importar con alias absoluto:

```js
import WellbeingModal, { WELLBEING_METRICS, wellbeingColor } from '@/features/wellbeing/components/WellbeingModal'
import StudentWellbeingTab from '@/features/wellbeing/pages/StudentWellbeingTab'
```

## Persistencia en Supabase

Una tabla con RLS:

- **`wellbeing_logs`** (16 filas al 2026-05-20):
  - `user_id`, `date` (UNIQUE por par)
  - 6 columnas SMALLINT con CHECK `BETWEEN 1 AND 10`
  - `notes` text opcional
  - `created_at` / `updated_at` con trigger `update_wellbeing_updated_at` (con `search_path = public, pg_temp` desde el fix del 21/05).

No hay RPCs ni edge functions. Insertar/leer va directo desde el cliente con `supabase.from('wellbeing_logs')`.

## Patrón de uso

1. Alumno abre `/student/workout` (TodayWorkoutPage).
2. Carga el `wellbeing` del día si existe.
3. Si NO existe, dispara un aviso pasivo después de unos segundos (no bloquea entrenamiento).
4. El alumno puede tocar la tarjeta "Wellbeing" y abrir el modal.
5. El modal hace UPSERT en `wellbeing_logs` (no genera notas mirror, no notifica al coach).

El coach lo ve en `/coach/students/:id` → tab Wellbeing como serie temporal y radar comparativo.

## Lo que NO meter acá

- Lógica de entrenamiento. Wellbeing es independiente — vive en su propia tabla y no afecta los planes ni los logs.
- Notificaciones push al coach. Si hace falta alertar por wellbeing bajo, eso va a `notifications` / edge function `notify-cron`, no acá.
