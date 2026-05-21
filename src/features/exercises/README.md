# `src/features/exercises/` — biblioteca de ejercicios

CRUD del catálogo de ejercicios que el coach usa para armar planes. Incluye `weight_mode` (free / bw / bw_minus / bw_plus), `unilateral`, grupo muscular, descripción, defaults sugeridos. Se complementa con el sistema de tags (`exercise_tags`, `exercise_tag_assignments`).

**Movido a esta ubicación el 21/05/2026** desde `src/pages/coach/ExercisesLibraryPage.jsx`.

## Estructura

```
exercises/
├── README.md
└── pages/
    └── ExercisesLibraryPage.jsx    /coach/exercises — CRUD del catálogo + manejo de tags.
```

Single-page feature. Si crece, conviene partir en `components/` (cards, modales, tag manager) y `pages/` (lista). Hoy no hace falta.

## Quién consume

| Consumidor | Importa |
|---|---|
| `src/App.jsx` | `ExercisesLibraryPage` |

Otros consumos de la tabla `exercises` ocurren via `supabase` directo desde `features/plans/` (selector dentro de `PlanExerciseRow`, etc.). No hay API wrapper compartido — si emerge la necesidad, va `api.js` acá.

## Persistencia en Supabase

Tres tablas (RLS):

- **`exercises`** (276 filas al 2026-05-20) — catálogo. Coach es dueño del catálogo (no es multi-tenant todavía).
- **`exercise_tags`** (11 filas) — etiquetas (ej: "tren superior", "core", "técnica olímpica").
- **`exercise_tag_assignments`** (194 filas) — many-to-many ejercicio ↔ tag.

## Reglas que NO se rompen

- **No borrar ejercicios con logs/plan_exercises asociados.** Hay FK con `RESTRICT`. La page propone soft-delete (`archived = true`) cuando hay datos dependientes.
- **`default_weight_mode` y `default_unilateral`** se heredan en cascada: log → plan_exercise → exercise. Usar `getEffectiveWeightMode` / `getEffectiveUnilateral` de `@/features/plans/helpers` en lugar de leer el campo directo.
