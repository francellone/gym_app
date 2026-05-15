# Handoff 2.4 — Respuestas del front a las 7 decisiones de sección 9

**Fecha:** 2026-05-15
**De:** agente del front (con Franco)
**Para:** agente del back
**Origen:** `handoff_24_actual_reps_weights_para_front.md` § 9 y § 12
**Estado:** ✅ decisiones cerradas — el back puede ejecutar Fase 1

---

## 1. TL;DR

Franco confirmó las 7 decisiones que el back necesitaba para destrabar Fase 1. Todas siguen la recomendación del back excepto que se elige doble escritura conservadora (1-2 sprints) y la UI de biblioteca de ejercicios entra en Fase 2 junto con el form del alumno y el form del coach.

**Orden de ejecución pactado:**

1. **Ahora:** este doc consolida las respuestas.
2. **Back:** ejecuta Fase 1 (UNA migración: columnas + constraints + backfill + RPC + helper).
3. **Front:** Fase 2 — yo aplico los cambios listados en § 4 con doble escritura a las columnas viejas.
4. **Más adelante:** Fase 3 — `DROP COLUMN actual_reps, actual_weights, actual_weight` cuando estén 1-2 sprints estables.

---

## 2. Respuestas a las 7 decisiones (§ 9 del handoff original)

| # | Pregunta | Decisión | Notas |
|---|---|---|---|
| 1 | ¿RPC `save_workout_log` o INSERT directo? | **RPC** | Centraliza validación + cálculo de volumen. Front llama `supabase.rpc('save_workout_log', {...})`. |
| 2 | ¿`reps_unit` con CHECK estricto? | **Sí, 4 valores fijos** | `reps`, `pasos`, `respiraciones`, `segundos`. El front ofrece dropdown con esos 4. |
| 3 | ¿Doble escritura a columnas viejas en Fase 2? | **Sí, 1-2 sprints** | Al guardar, front escribe nuevas (`actual_reps_jsonb`, `actual_weights_jsonb`, `weight_mode`, `unilateral`, `reps_unit`) Y las viejas (`actual_reps`, `actual_weights`, `actual_weight`). |
| 4 | ¿Pesos por lado (asimetría)? | **Simple** | 1 input de peso por set, asume igual ambos lados. Si hay asimetría real, va a `notes` ("80kg izq / 75kg der"). |
| 5 | Soft-warning `barbell_only` + peso > 20kg | **Sí, banner amarillo sin bloquear** | Avisa al alumno pero deja guardar. |
| 6 | `profiles.weight_kg = NULL` para bodyweight en métricas | **Placeholder + CTA al coach** | "Peso corporal sin registrar" en el gráfico de volumen + botón que linkea a la edición del perfil. |
| 7 | UI para editar `default_weight_mode` y `default_unilateral` en biblioteca | **Sí, en Fase 2** | Sin esto, Anto no puede corregir la heurística inicial. Va junto con el form del alumno y el form del coach. |

---

## 3. Confirmación del schema acordado (§ 3 del handoff original)

Franco confirma OK al schema completo de la sección 3:

- `workout_logs`: agregar `weight_mode`, `actual_reps_jsonb`, `actual_weights_jsonb`, `unilateral`, `reps_unit` + CHECK constraints.
- `exercises`: agregar `default_weight_mode`, `default_unilateral` + COMMENT.
- `plan_exercises`: agregar `weight_mode`, `unilateral` (ambos NULLable; NULL = hereda del exercise).
- Constraints de coherencia: `bodyweight ⇒ weights vacío`, `reps.length = weights.length`.
- Backfill de los 422 `workout_logs` siguiendo el mapeo de § 5 (incluyendo unilateral por sufijo `cl`, `reps_unit='pasos'/'respiraciones'`, descripciones a `notes`).
- Pre-clasificación del catálogo según heurística + casos especiales de § 4.
- RPC `save_workout_log` y helper `calculate_log_volume`.

**No tocar las columnas viejas en Fase 1** (`actual_reps`, `actual_weights`, `actual_weight` siguen vivas para retrocompat).

---

## 4. Plan de Fase 2 (lo que voy a hacer en el front cuando confirmes Fase 1 aplicada)

### 4.1. Archivos que voy a tocar

| Archivo | Cambio | Por qué |
|---|---|---|
| `src/utils/planHelpers.js` | Agregar helpers `parseJsonbArray`, `serializeToJsonb`, `getEffectiveWeightMode(planEx, exercise)`, `getEffectiveUnilateral(planEx, exercise)`, `WEIGHT_MODES`, `REPS_UNITS` | Lógica compartida de modos y herencia exercise → plan_exercise → log |
| `src/pages/student/TodayWorkoutPage.jsx` | Form de carga: dropdown "Tipo de peso" (3 opciones, default heredado), toggle "Unilateral (cada lado)" (default heredado), inputs de peso ocultos si `bodyweight`, label "reps por lado" si `unilateral`, dropdown `reps_unit` (opcional). Guardado vía `supabase.rpc('save_workout_log', {...})` + doble escritura a `actual_reps` / `actual_weights` / `actual_weight`. Soft-warning si `barbell_only` y peso > 20. | Form principal del alumno |
| `src/components/workout/CircuitBlockRunCard.jsx` | Idem en la grilla de ejercicios del circuito | Form de circuitos del alumno |
| `src/components/plan/PlanExerciseRow.jsx` | Agregar dropdown "Tipo de peso" (con opción "Heredar del ejercicio") y toggle "Unilateral" (con opción "Heredar del ejercicio") por plan_exercise. Si el modo es bodyweight: ocultar inputs de peso. Label "reps por lado" si unilateral. | Form del coach al asignar ejercicios al plan |
| `src/utils/planHelpers.js` (`uiExToDBEx`, `dbExToUIEx`) | Mapear los nuevos campos `weight_mode` y `unilateral` ↔ DB | Persistencia del plan |
| `src/pages/coach/ExercisesLibraryPage.jsx` (`ExerciseModal`) | Agregar campos `default_weight_mode` (select) y `default_unilateral` (checkbox) en el modal. Columna "Modo" en la lista. | Permite a Anto corregir heurística |
| `src/pages/coach/student/StudentProgressTab.jsx` | Migrar las funciones que parsean `actual_weights` (líneas 53-61, 201-218, etc.) a usar el RPC `calculate_log_volume` o leer `actual_weights_jsonb` directo. Bodyweight → multiplicar por `profiles.weight_kg` (o CTA si NULL). Unilateral → ×2. | Métricas correctas para el coach |
| `src/pages/coach/PlanProgressTab.jsx` | Idem (líneas 156-185) | Métricas a nivel plan |
| `src/pages/student/ProgressPage.jsx` | Idem (líneas 102-123, 248-286) | Métricas para el alumno |
| `src/pages/coach/student/StudentProgressTableView.jsx` | Idem (líneas 16-82, 347-490) | Tabla de progreso |
| `src/pages/coach/student/StudentLogsTab.jsx` | Display: leer `actual_reps_jsonb` con fallback a `actual_reps` (líneas 35-36) | Visualización legacy |
| `src/pages/student/HistoryPage.jsx` | Idem (líneas 85-86) | Historial del alumno |
| `src/pages/coach/CoachDashboard.jsx` | Idem (líneas 49, 210) | Dashboard |

### 4.2. Convenciones de mapping DB ↔ UI que voy a respetar

- **Herencia:** `log.weight_mode` resuelto = `log.weight_mode ?? plan_exercise.weight_mode ?? exercise.default_weight_mode ?? 'with_weight'`. Idem para `unilateral`.
- **Cálculo de volumen (front, mientras no esté el RPC):** uso `calculate_log_volume(p_log_id)` del back. No replico la lógica en cliente (evito divergir).
- **Doble escritura:** cuando guardo un log, además de los campos nuevos pongo:
  - `actual_reps` = `JSON.stringify(reps_array)` (string)
  - `actual_weights` = `JSON.stringify(weights_array)` (string)
  - `actual_weight` = primer peso válido del array (numeric)
  - Estos 3 mantienen el formato que ya está vivo. No introduzco más suciedad ("cl", descripciones embebidas, etc.) porque toda esa info pasa a `unilateral` / `notes` / `reps_unit`.

### 4.3. Soft-warning `barbell_only` + peso > 20

Banner amarillo no bloqueante encima del input de peso del set que viole la regla:
> ⚠️ Cargaste {N}kg con "Solo barra". La barra olímpica suele pesar 20kg. ¿Querés cambiar a "Con peso"?

Permite guardar igual. No es un modal — es inline para no interrumpir el flow.

### 4.4. Bodyweight sin `profiles.weight_kg`

En las pantallas de progreso (StudentProgressTab, ProgressPage, PlanProgressTab, StudentProgressTableView), cuando el log es `bodyweight` y `profiles.weight_kg IS NULL`:

- En la gráfica de volumen: punto/barra renderizado en gris claro con tooltip "Peso corporal sin registrar".
- Banner una sola vez por sesión arriba del chart: "Falta cargar el peso corporal del alumno para calcular volumen de ejercicios sin peso. [Cargar peso]" — el botón linkea a `/coach/students/{id}` o a la edición del perfil del alumno (la coach).
- En la vista del alumno, mensaje suavizado: "Tu peso corporal no está cargado. Pedile a tu coach que lo registre."

### 4.5. UI biblioteca de ejercicios (ExercisesLibraryPage)

Cambios concretos en `ExerciseModal`:

1. Después del campo "Nombre", agrego sección "Configuración del ejercicio":
   - **Modo de peso** (select): `with_weight` (Con peso) / `barbell_only` (Solo barra) / `bodyweight` (Sin peso)
     - Tooltip explicando cuándo usar cada uno.
   - **Unilateral** (checkbox): "Se ejecuta por lado (estocada, single-arm, etc.)"
     - Cuando está activo, helper text: "Las reps siempre se cargan por lado."
2. En la lista principal, agrego una pill al lado del nombre: `BW`, `Barra`, o nada (con_peso es el default).
3. Filtro nuevo opcional: "Filtrar por modo".

---

## 5. Lo que NO voy a tocar (fuera de alcance de 2.4)

- Asimetría real izq/der (decisión 4: simple por ahora; queda como nota para futuro).
- Merge de duplicados del catálogo por mayúsculas/minúsculas (§ 11.4 del handoff — deuda separada).
- `borg_scale` de session (deuda 3.7 del diagnóstico, fuera de 2.4).
- Cambios en otros tabs/pages que no leen reps/weights (formularios de intake, evaluaciones, etc.).

---

## 6. Riesgos identificados y cómo los mitigo

| Riesgo | Mitigación |
|---|---|
| Si me olvido de una lectura de las columnas viejas, esa pantalla queda vacía para logs nuevos | Doble escritura tapa esto: las viejas siguen pobladas. Grep exhaustivo de `actual_reps`/`actual_weights`/`actual_weight` antes del deploy (ya tengo el listado). |
| RPC `save_workout_log` falla a mitad de guardado, queda log inconsistente | Es atómica (SECURITY DEFINER). Postgres revierte. Front muestra error y reintenta. |
| Heurística clasifica mal algún ejercicio raro y el alumno ve inputs equivocados | Coach lo corrige en biblioteca (§ 4.5). El override a nivel `plan_exercise` y a nivel `log` permite arreglarlo sin tocar el catálogo. |
| Bodyweight con peso registrado en logs viejos (los 121 con ambas) | El backfill de § 5 ya los maneja: si tienen peso > 0, infiere `weight_mode='with_weight'`, no bodyweight. |
| Un log unilateral viejo donde el alumno cargó el total (no por lado) genera volumen ×2 incorrecto | El backfill lo deja como `unilateral=true` con reps "por lado" según el sufijo. Si hay error, se edita desde la UI. Aceptamos margen de error en logs históricos. |

---

## 7. Checklist antes de Fase 1

Para que el back arranque, confirmamos que están alineados:

- [x] Schema (§ 3 del handoff original): OK
- [x] Modelo conceptual (§ 2): OK (incluye regla "unilateral = reps por lado, NUNCA total")
- [x] Heurística de clasificación (§ 4.1) y casos especiales (§ 4.2): OK — Anto puede ajustar después desde UI
- [x] Mapeo de datos sucios (§ 5): OK
- [x] RPC `save_workout_log` (§ 6): OK, el back la crea
- [x] Helper `calculate_log_volume` (§ 7): OK, el back lo crea
- [x] Plan de validación post-Fase 1 (§ 10): el back corre las 6 queries y reporta antes de pasar a Fase 2

---

## 8. Próximos pasos

1. **Back:** ejecuta Fase 1. Al terminar, corre las queries de validación (§ 10) y pega resultados acá o en un nuevo handoff.
2. **Front:** apenas tenga la confirmación + las nuevas columnas visibles, arranco § 4.1 archivo por archivo.
3. **QA conjunto:** Anto carga un log de cada tipo (`with_weight`, `bodyweight`, `barbell_only`, `unilateral` con `reps_unit='pasos'`) y verificamos que volumen y métricas dan razonable.

Cualquier discrepancia con lo escrito acá, avisame antes de ejecutar para no romper nada.
