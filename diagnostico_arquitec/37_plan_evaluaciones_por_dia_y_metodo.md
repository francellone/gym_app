# 37 — Plan: Evaluaciones por días + método por ejercicio (F14 + F15)

**Fecha:** 2026-05-30
**Origen:** Ronda 5 de pedidos de Anto (ver doc 13 §Ronda 5).
**Tipo:** cambio estructural en el modelo de evaluaciones (>500 LOC) → requiere decisión documentada antes de codear.
**Estado:** propuesta de opciones. Franco se inclina por **Opción A** + toggle de método en el front.

---

## 0. Qué pide la coach

1. **F14 — Días en evaluaciones:** poder asignar los ejercicios de una evaluación a distintos días (Día A/B/C…), igual que en un plan de entrenamiento.
2. **F15 — Método por ejercicio:** poder evaluar cada ejercicio con un método distinto dentro de la misma evaluación (ej: fuerza máxima en sentadilla, fuerza-resistencia en flexiones), con la **opción** de aplicar un método por ejercicio o el mismo a todos.

---

## 1. Cómo funciona hoy (relevamiento confirmado en código + DB, 30/05)

**Modelo de datos**
- Una evaluación es un `plans` con `plan_type='evaluation'`. Lleva **un único** `eval_type` (`one_rm`, `max_reps`, `power`, `cardio`, `body_comp`, `scored`, `custom`) y un único `eval_method` (ej. `brzycki`, `cooper`, `libre`).
- Ejercicios de tipos "científicos" (`one_rm`/`max_reps`): se guardan en `plan_exercises` con `section` **hardcodeado a `'day_a'`**.
- Pruebas `custom`: se guardan en `evaluation_tests` (columnas: `plan_id`, `exercise_id`, `exercise_name`, `test_type`, `instructions`, `expected_value`, `expected_unit`, `mandatory`, `order_index`). **No hay columna de día/sección.** Cada prueba ya tiene su propio `test_type` (hoy siempre `'libre'`).
- Resultados: `evaluation_results` (jsonb `results`) + `evaluation_test_responses` (para custom). Se guardan SIEMPRE contra el **clon** del alumno, no el template (arquitectura template-clon).

**Dónde vive cada cosa en el código**
- Editor: `src/features/plans/pages/CreatePlanPage.jsx` y `EditPlanPage.jsx`. El selector de tipo+método de eval está a nivel plan (`EVAL_TYPES`, `METHODS` de `features/evaluations/helpers.js`). Custom usa el sub-editor de pruebas (`evalPruebas`); one_rm/max_reps usa `evalExercises` (lista plana, se persiste con `section='day_a'`).
- Pantalla de la alumna: `src/features/evaluations/pages/EvalWorkoutPage.jsx`. El dispatcher `EvalForm` elige el formulario (`OneRMForm`, `MaxRepsForm`, …, `CustomForm`) según el **`eval_type` del plan**. Lee `plan_exercises` con `.eq('section','day_a')`.
- Detalle coach: `src/features/evaluations/pages/EvaluationDetailPage.jsx`.
- Días en planes de entrenamiento: `getDynamicSections(sessions_per_week, has_activation)` en `features/plans/helpers.js` → tabs Día A/B/C.

**Datos en prod (16 evaluaciones)**
- Tipos en uso: `one_rm` (12 evals, 23 ejercicios, método `brzycki`) y `custom` (4 evals, 32 pruebas, método `libre`). Los otros 5 tipos no se usan.
- 23/23 plan_exercises en `day_a`; 32/32 evaluation_tests con `exercise_id` y `test_type='libre'`, sin sección.
- ~10 resultados cargados. **Volumen bajo → migración de bajo riesgo: todo cae naturalmente a "Día A" + su método actual.**

**El nudo del problema:** hoy "qué tipo de evaluación es" y "qué método usa" son propiedades **del plan entero**, y de ahí cuelga qué formulario ve la alumna. F15 obliga a mover esa propiedad **al nivel del ejercicio**.

---

## 2. Opciones

### Opción A — Modelo unificado (eval = contenedor de ejercicios tipados por día) ⭐ recomendada

La evaluación deja de tener un tipo/método único. Pasa a ser, igual que un plan de entrenamiento, un **contenedor de ejercicios organizados por días/bloques**, donde **cada ejercicio lleva su propio `eval_type` + `eval_method`**.

**Datos**
- Unificar todo en `plan_exercises` (que ya tiene `section`, `block_label`, `order_index`) + agregar dos columnas: `eval_type` y `eval_method`. Las evals custom dejan de usar `evaluation_tests` como tabla separada (o se migran a `plan_exercises`). 
  - *Alternativa de bajo impacto:* mantener `evaluation_tests` y agregarle `section` + `eval_type` + `eval_method`, y para one_rm/max_reps seguir en `plan_exercises` con sus columnas nuevas. Decisión de implementación al codear; el modelo conceptual es el mismo.
- `plans.eval_type`/`eval_method` quedan como **valor por defecto** (el "mismo para todos") y/o se deprecan.
- **Migración:** cada prueba/ejercicio existente hereda el `eval_type`+`eval_method` del plan y `section='day_a'`. Trivial dado el volumen.

**Front (editor)**
- El editor de evaluación usa tabs de días (reusa `getDynamicSections`) + un campo "días" como en los planes.
- Por ejercicio: selector de tipo+método. **Toggle "Mismo método para todos / Método por ejercicio":** si está en "todos", se setea a nivel evaluación y se propaga a cada ejercicio (UI colapsada); si está en "por ejercicio", cada fila muestra su propio selector. Esto es exactamente lo que pidió Franco.

**Front (alumna)**
- `EvalWorkoutPage` agrupa por día y, **por cada ejercicio**, despacha el formulario según el `eval_type` del ejercicio (no del plan). El dispatcher `EvalForm` se reusa por-ejercicio en vez de una sola vez.

**Pros:** es lo que pide Anto, escala (mezcla libre de métodos), unifica el modelo eval≈plan (menos código duplicado a futuro), elimina el caso "custom es especial".
**Contras:** es el de mayor alcance. Toca DB (migración + columnas), editor (Create+Edit), pantalla alumna, detalle coach, helpers y tests. Riesgo: los formularios científicos (1RM, cardio…) asumen "una eval = un método"; renderizarlos por-ejercicio requiere refactor del dispatcher y de cómo se arma/lee el jsonb de resultados.

---

### Opción B — Tipo "mixta" nuevo a nivel plan

Se mantiene `eval_type` a nivel plan, pero se agrega un tipo nuevo `mixed` (o `combinada`) que habilita método por ejercicio. Los tipos actuales siguen igual (un método para todo); sólo `mixed` usa selección por ejercicio.

**Datos:** agregar `eval_type`/`eval_method` por ejercicio **sólo cuando el plan es `mixed`** + `section`. Los demás tipos no cambian.
**Front:** un camino nuevo en el editor y en `EvalWorkoutPage` para `mixed`; los días pueden sumarse sólo a `mixed` o a todos.

**Pros:** menos invasivo, no rompe los tipos existentes, se puede entregar incremental.
**Contras:** deja **dos arquitecturas conviviendo** (tipo-plan vs tipo-ejercicio) → más ramas, más superficie de bug a futuro, y el "mismo método para todos" termina implementándose dos veces. Anto seguramente quiera mezclar siempre, así que `mixed` se vuelve el caso por defecto y los otros tipos quedan medio muertos.

---

### Opción C — Mínimo sobre `custom`

Sólo se toca el tipo `custom` (el que ya tiene `test_type` por prueba): se le agrega (1) columna `section` a `evaluation_tests` para los días, y (2) se amplían los `PRUEBA_TYPES` para que una prueba "libre" pueda además declarar un método científico (1RM, fuerza-resistencia, etc.) y renderizar el input correcto.

**Datos:** `evaluation_tests` + `section` + (opcional) `eval_method`. Los tipos científicos a nivel plan no cambian.
**Front:** días + selector de método sólo dentro del editor custom y de `CustomForm`.

**Pros:** el más rápido y de menor riesgo; aprovecha que custom ya es "por prueba".
**Contras:** menos genérico — obliga a que toda eval con métodos mezclados sea de tipo "Personalizado", perdiendo los cálculos automáticos de los formularios científicos (estimación de 1RM, VO₂max, etc.). No es lo que Anto pidió si quiere los cálculos.

---

## 3. Comparación rápida

| | A (unificado) | B (tipo mixto) | C (mínimo custom) |
|---|---|---|---|
| Cumple F14 (días) | ✅ todos | ✅ (donde se aplique) | ✅ sólo custom |
| Cumple F15 (método x ejercicio) | ✅ pleno | ✅ sólo en `mixed` | ⚠️ pierde cálculos científicos |
| Toggle "mismo / por ejercicio" | ✅ nativo | ⚠️ sólo en `mixed` | ⚠️ limitado |
| Riesgo / esfuerzo | Alto | Medio | Bajo |
| Deuda futura | Baja (unifica) | Alta (2 caminos) | Media (custom especial) |
| Migración datos | Trivial (volumen bajo) | Trivial | Trivial |

---

## 4. Recomendación

**Opción A.** Coincide con lo que Franco eligió y con el pedido literal de Anto (mezclar fuerza máxima + fuerza-resistencia en una misma evaluación). Aunque es la de mayor alcance, los datos en prod son pocos y prolijos (todo en `day_a`, 2 métodos), así que la migración es de bajo riesgo. A mediano plazo unifica el modelo eval≈plan y elimina el caso especial de `custom`, reduciendo deuda. El **toggle "mismo método para todos / método por ejercicio"** se vuelve un detalle de UI sobre el mismo modelo, no una arquitectura aparte (eso es justo lo que evita la Opción B).

**Sugerencia de implementación por fases (para A):**
1. **DB + migración:** columnas de día + `eval_type`/`eval_method` por ejercicio; migrar lo existente a `day_a` + método heredado del plan. Smoke SQL con rollback.
2. **Editor (Create/Edit):** tabs de días + selector de tipo/método por ejercicio + toggle global. 
3. **Pantalla alumna (`EvalWorkoutPage`):** agrupar por día + dispatch por-ejercicio.
4. **Detalle coach (`EvaluationDetailPage`):** mostrar resultados agrupados por día/método.
5. **Tests + smoke visual en prod** (post `git push`).

**Pendiente antes de codear fase 1:** decidir si custom migra a `plan_exercises` o si `evaluation_tests` gana las columnas nuevas (ver Opción A §Datos). Lo defino al arrancar la implementación salvo que prefieras fijarlo ahora.

---

**Decisión registrada:** Franco eligió **Opción A** (2026-05-30) + toggle de método por ejercicio/global en el front.

---

## 5. Decisión "un solo cajón" (Franco, 2026-05-30)

Se unifica todo en **`plan_exercises`** (el cajón rico, que ya maneja días/bloques y lo usan planes + evals científicas). Las pruebas custom se mudan ahí; `evaluation_tests` se deja de usar para crear nuevas (se mantiene sólo hasta terminar la migración).

**Datos confirmados que condicionan la mudanza:**
- `plan_exercises.exercise_id` es **NOT NULL** + FK a `exercises`.
- Las 32 pruebas custom **todas tienen `exercise_id`** (0 con nombre libre).
- `evaluation_test_responses.test_id` tiene **FK + UNIQUE a `evaluation_tests.id`** y hay **8 respuestas** atadas → ese "hilo" hay que reatarlo al mudar.

**Diseño de la mudanza (fase 1):**
1. **Columnas nuevas en `plan_exercises`** (todas nullable, no afectan a los planes de entrenamiento que las dejan vacías): `eval_type`, `eval_method`, `expected_value`, `expected_unit`, `mandatory` (default false), `instructions`.
2. **Ejercicio del catálogo obligatorio en evals:** como `exercise_id` es NOT NULL en `plan_exercises` y hoy el 100% de las pruebas ya tienen ejercicio, se decide **requerir ejercicio del catálogo** en las pruebas de evaluación (el editor ya tiene botón "+ Nuevo"). Se quita la opción de "nombre libre sin ejercicio". *(Alternativa descartada: hacer `exercise_id` nullable — agrega complejidad sin caso real que lo necesite.)*
3. **Mudar las 32 pruebas** `evaluation_tests` → `plan_exercises` (con `section='day_a'`, `eval_type` heredado, `instructions`/`expected_*`/`mandatory` mapeados) y **reatar las 8 respuestas**: repuntar `evaluation_test_responses.test_id` a la nueva fila de `plan_exercises`. Todo en una sola transacción con verificación.
4. **Migrar evals científicas:** las 23 filas one_rm ya están en `plan_exercises`/`day_a`; sólo se les setea `eval_type='one_rm'` + `eval_method` heredado del plan.

**Regla de oro de seguridad:** el cambio de DB y el de código van **juntos, en un solo movimiento** (push coordinado), para que las evaluaciones custom no se rompan en producción mientras se trabaja. No se mueve data en prod hasta que el código lea del cajón nuevo.

**Próximo paso:** implementar fase 1 (columnas + migración + lectura/escritura desde `plan_exercises`), probar en local/branch, y recién ahí push. Pendiente sólo dar el ok para arrancar a codear.

---

## 6. Progreso de implementación

### ✅ Paso 1 — Foundation DB (aplicado a prod 30/05, migración `eval_per_exercise_method_phase1_columns`)
- Agregadas a `plan_exercises` (nullable / con default, **invisibles al código actual**): `eval_type`, `eval_method`, `expected_value`, `expected_unit`, `mandatory` (default false), `instructions`.
- Backfill: las **23** filas de evals científicas (one_rm) quedaron con `eval_type='one_rm'`, `eval_method='brzycki'` (heredado del plan). Custom NO se tocó (sigue en `evaluation_tests`).
- **Verificado por SQL.** Producción sin cambios de comportamiento (additive only).

### ⏳ Pendiente — Cutover coordinado (DB-data + código + push, todo junto)
Esto NO se puede partir: el editor que escribe a `plan_exercises`, la pantalla de la alumna que lee de ahí, y la mudanza de las 32 pruebas + 8 respuestas tienen que viajar en el mismo deploy, o se rompen las evals custom en vivo. Subpasos:
1. **Modelo de resultados (decisión a fijar al codear):** hoy custom guarda en `evaluation_test_responses` (key `test_id`→`evaluation_tests`) y científicas en `evaluation_results.results` (jsonb). Con métodos mezclados por ejercicio hay que unificar el guardado de resultados por-ejercicio (propuesta: `evaluation_test_responses` rekeyado a la fila de `plan_exercises`, o nueva columna `plan_exercise_id`). **Definir antes de codear la pantalla de la alumna.**
2. Editor (Create/Edit): tabs de días + selector tipo/método por ejercicio + toggle "mismo/por ejercicio". Escribe a `plan_exercises`.
3. Pantalla alumna (`EvalWorkoutPage`): leer `plan_exercises`, agrupar por día, dispatch de form por `eval_type` de cada ejercicio.
4. Detalle coach (`EvaluationDetailPage`): resultados por día/método.
5. Mudanza data (en el mismo deploy): 32 pruebas `evaluation_tests`→`plan_exercises` + reatar 8 `evaluation_test_responses`.
6. Tests + lint + build verdes → push → smoke visual de Franco (coach + alumna).

### ✅ Código implementado + validado (working tree, sin pushear — 30/05)
- Implementado según spec doc 38. **lint 0 errores**, **vitest 287/287** (15 nuevos), **build OK**.
- Archivos: `evaluations/helpers.js` (+tipo `mixed`, EXERCISE_EVAL_TYPES, isExerciseBasedEval, groupEvalExercisesByDay, buildExerciseResponseJson, converters), nuevo `plans/components/EvalDaysEditor.jsx`, nuevo `evaluations/components/forms/EvalByDayForm.jsx`, `CreatePlanPage`/`EditPlanPage` (editor por días + toggle), `EvalWorkoutPage` (lee plan_exercises sin hardcodear day_a, guarda response por ejercicio), `EvaluationDetailPage` (resultados por día/ejercicio), `helpers.test.js`.
- SQL de cutover escrito + **dry-run de solo lectura verificado contra prod**: `38b_migracion_cutover.sql` (mueve 32, reata 8, verificación que aborta) y `38c_clone_rpc_fix.sql` (RPC `assign_template_to_student` copiaba plan_exercises SIN las 6 columnas nuevas → el clon perdía método por ejercicio).
- **PENDIENTE (cutover, requiere ok de Franco):** push del código + aplicar `38b` + `38c` (juntos) → smoke visual. Nada de esto tocó prod todavía (la foundation de columnas sí, pero es inocua).
