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

| Consumidor    | Importa                |
| ------------- | ---------------------- |
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

## Imagen por ejercicio (v74, 2026-10-16)

- `exercises.image_path` guarda la RUTA dentro del bucket privado `exercise-images` (`<exercise_id>/<ts>.webp`), nunca una URL (las firmadas vencen).
- Lectura: la política del bucket consulta `exercises` con los permisos de quien pide → la imagen la ve exactamente quien ve el ejercicio. Escritura: solo la dueña del ejercicio.
- `images/`: `exerciseImageUrls.js` (firma en lote + caché, mismo patrón que avatars), `useExerciseImageUrl` (null = sin imagen, undefined = firmando), `ExerciseThumb` (miniatura que se abre a pantalla completa; sin imagen no dibuja nada), `ExerciseImageViewer` (portal), `ExerciseImageField` (campo del formulario; el cambio se aplica al Guardar), `resizeImage.js` (lado mayor 800 px, webp con caída a jpeg), `exerciseImageApi.js`.
- Dónde se ve: catálogo (con hueco punteado "agregar imagen" para la dueña y filtro "Sin imagen"), `ExercisePicker` (armador: fuerza, circuito, aeróbico, evaluaciones) y Entrenar (las 3 run cards).
- Para sumar un lugar: el select tiene que traer `image_path` (los `exercises(*)` ya lo traen) y poner `<ExerciseThumb path={ex.image_path} name=… size=…/>`.
- La fusión (`merge_exercises`) NO traspasa la imagen.
