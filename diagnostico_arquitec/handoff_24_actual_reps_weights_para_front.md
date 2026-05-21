# Handoff 2.4 — `actual_reps` / `actual_weights` sucios: schema nuevo + modos de peso + unilateral por lado

**Fecha:** 2026-05-15
**De:** agente del back
**Para:** agente del front
**Bug original:** 2.4 del diagnóstico (`diagnostico-supabase.md`)
**Estado del back:** ⏸️ esperando confirmación de las decisiones de schema antes de tocar nada
**Criticidad:** 🔴 alta — bloquea métricas confiables de volumen y progreso

---

## 1. TL;DR

`workout_logs.actual_reps` y `workout_logs.actual_weights` son `text` con datos heterogéneos y sucios (sufijos `"cl"`, descripciones embebidas, números sueltos, JSON con strings vacíos). Coexisten con `actual_weight` numeric (vieja) y los mismos datos están duplicados en 124 logs.

**Plan acordado con el usuario:**

1. Cambiar a JSON estructurado (`actual_reps_jsonb`, `actual_weights_jsonb`).
2. Mover `"cl"` / `"cada lado"` a un flag `unilateral`. **Regla nueva: si `unilateral=true`, las reps se especifican SIEMPRE por lado, nunca como total.**
3. Mover descripciones embebidas a `notes`.
4. Introducir `weight_mode` con 3 valores: `'with_weight'`, `'barbell_only'`, `'bodyweight'`. La UI muestra/oculta inputs según el modo.
5. **Agregar `default_weight_mode` al catálogo `exercises`** para que el coach configure una vez por ejercicio. El plan_exercise hereda; el log puede override.
6. Pre-clasificar los 275 ejercicios del catálogo según heurística + ajustes manuales. Anto puede ajustar desde UI cualquier ejercicio después.
7. Calcular volumen correctamente para cada modo, incluyendo `unilateral` (×2 si por lado) y bodyweight × peso corporal.
8. Migrar el front con coexistencia temporal de las viejas.

---

## 2. Modelo conceptual acordado (lenguaje del coach)

### 2.1. Modos de peso

3 modos por log:

| Modo | UI muestra inputs de peso | Cuándo usarlo | Ejemplos |
|---|---|---|---|
| **`with_weight`** "Con peso" | Sí, como hoy | Hay peso explícito (discos, mancuernas, kettlebell) | Press Banca con discos, Estocada con mancuernas, Hip Thrust |
| **`barbell_only`** "Solo con barra" | Sí, como hoy | Ejercicio con barra olímpica sin discos extra. El alumno carga lo que quiera (idealmente ≤20kg). Coach revisa. | Press Banca solo barra |
| **`bodyweight`** "Sin peso" | No, oculto | Ejercicios de peso corporal puro | Push Up, Plancha, Chin Up |

### 2.2. Regla nueva: reps unilaterales SIEMPRE por lado

Si el ejercicio es unilateral (`unilateral=true`):

- **El coach planifica por lado.** Ej: "Estocada con mancuernas, 3 series de 10 reps por lado" → en el plan se guarda `suggested_reps=10` (NO 20).
- **El alumno carga por lado.** Ej: hace 10 reps con cada pierna → carga `actual_reps_jsonb=[10]` (NO 20).
- **El volumen total** se calcula así:
  - Si `unilateral=true`: `(reps × 2) × peso`
  - Si `unilateral=false`: `reps × peso`

**¿Por qué esta convención?** Es la forma natural en que el coach piensa y comunica: "8 cada lado". Que el alumno tenga que multiplicar mentalmente para cargar el total ("8 cada lado = 16") es propenso a error. Y desambigua los `"8cl"` y `"8 cada lado"` que hay en los datos viejos.

### 2.3. Pesos por lado (asimetría) — punto a discutir

Pregunta abierta del usuario: ¿qué pasa si el alumno usa pesos distintos por lado (asimetría real)?

**Opciones:**

- **A. Simple (recomendado para empezar):** un solo input de peso por set, asume igual ambos lados. Si hay asimetría, va a `notes` ("80kg izq / 75kg der"). Más rápido de cargar.
- **B. Con asimetría:** dos inputs por set (izq/der) cuando es unilateral. Captura el detalle real.

Mi sugerencia: empezar con A. Si después se quiere medir asimetría como métrica, se agrega un schema extendido. Pero pidan opinión del coach antes de decidir.

---

## 3. Schema nuevo

### 3.1. Columnas nuevas en `workout_logs`

```sql
-- Modo del log
ALTER TABLE public.workout_logs
  ADD COLUMN weight_mode text NOT NULL DEFAULT 'with_weight';

ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_weight_mode_check
  CHECK (weight_mode IN ('with_weight', 'barbell_only', 'bodyweight'));

-- Reps por set
ALTER TABLE public.workout_logs
  ADD COLUMN actual_reps_jsonb jsonb;

-- Peso por set
ALTER TABLE public.workout_logs
  ADD COLUMN actual_weights_jsonb jsonb;

-- Unilateral: si true, las reps en actual_reps_jsonb son POR LADO
ALTER TABLE public.workout_logs
  ADD COLUMN unilateral boolean NOT NULL DEFAULT false;

-- Unidad de medida
ALTER TABLE public.workout_logs
  ADD COLUMN reps_unit text DEFAULT NULL;

ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_reps_unit_check
  CHECK (reps_unit IS NULL OR reps_unit IN ('reps', 'pasos', 'respiraciones', 'segundos'));
```

### 3.2. Columnas nuevas en `exercises` (catálogo)

```sql
-- Default que hereda el plan_exercise. El log puede override.
ALTER TABLE public.exercises
  ADD COLUMN default_weight_mode text NOT NULL DEFAULT 'with_weight';

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_default_weight_mode_check
  CHECK (default_weight_mode IN ('with_weight', 'barbell_only', 'bodyweight'));

-- Default unilateral del ejercicio. El plan/log puede override.
ALTER TABLE public.exercises
  ADD COLUMN default_unilateral boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.exercises.default_weight_mode IS
  'Modo de peso default para este ejercicio. Se hereda al plan_exercise al asignarlo y al log al cargarse. El coach puede override en el plan; el alumno puede override en el log (raro).';
COMMENT ON COLUMN public.exercises.default_unilateral IS
  'Si el ejercicio se ejecuta por defecto unilateralmente (cada lado). Si true, las reps se especifican por lado.';
```

### 3.3. Columnas nuevas en `plan_exercises`

```sql
-- Hereda del catálogo pero el coach puede override.
ALTER TABLE public.plan_exercises
  ADD COLUMN weight_mode text DEFAULT NULL;  -- NULL = usa default del exercise

ALTER TABLE public.plan_exercises
  ADD CONSTRAINT plan_exercises_weight_mode_check
  CHECK (weight_mode IS NULL OR weight_mode IN ('with_weight', 'barbell_only', 'bodyweight'));

ALTER TABLE public.plan_exercises
  ADD COLUMN unilateral boolean DEFAULT NULL;  -- NULL = usa default del exercise
```

### 3.4. Constraints de coherencia

```sql
-- Si modo = bodyweight, NO debe haber weights
ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_bodyweight_no_weights
  CHECK (
    weight_mode <> 'bodyweight'
    OR actual_weights_jsonb IS NULL
    OR actual_weights_jsonb = '[]'::jsonb
  );

-- reps y weights con misma longitud
ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_reps_weights_same_length
  CHECK (
    actual_reps_jsonb IS NULL
    OR actual_weights_jsonb IS NULL
    OR jsonb_array_length(actual_reps_jsonb) = jsonb_array_length(actual_weights_jsonb)
  );
```

### 3.5. Formato de los `jsonb`

```json
// actual_reps_jsonb (array de números)
[12, 10, 8]   // 3 sets. Si unilateral=true, son 12/10/8 POR LADO.
[8]
[5, 5, 5, 5]

// actual_weights_jsonb (array de números, mismo length que reps)
[80, 80, 75]
[null, null, 60]
```

---

## 4. Heurística de clasificación inicial del catálogo

El back va a aplicar esta clasificación pre-hecha a los 275 ejercicios (108 activos + 167 sin uso). **Anto puede revisar y modificar desde UI cualquier ejercicio cuando el front implemente el campo en la biblioteca.**

### 4.1. Reglas de clasificación

**`bodyweight`** si el nombre contiene (case-insensitive):

- Push up / Pull up / Chin up (sin "weighted")
- Plancha / Plank
- Bird dog, Dead bug, Burpee, Mountain climber, Jumping jack, Crunch, Sit up, Superman, Spiderman, Open book, Bear crawl, Cossack, Carioca, Inchworm, Hollow, Wall sit
- TRX (suspensión)
- Banded / Banda (bandas elásticas)
- Activación / Coordinación
- Movilidad / Stretch / Flexibility / Estiramiento
- Tobillo, Estrella con conos, Hombro con palo, Cuadrupedia, Respiración
- Glute bridge (sin "kb", "db", "barbell", "weighted")
- Kickback (sin "kb", "db", "cable", "weighted")
- Drop jump / Box jump / Salto
- Pigeon / Paloma
- Trote / Run / Correr / Sprint
- Fitball / Swiss ball / Pelota (sin "kb", "db", "barbell", "barra")
- **Casos especiales identificados manualmente** (a agregar a la heurística):
  - `BICI FIJA` (cardio)
  - `BRACING` (activación)
  - `CHINITO` (chin up)
  - `COLGARSE` (activación)
  - `DOWNWARD DOG/CARPA` (yoga/movilidad)
  - `ASSISTED JUMP W POWERBAND` (pliometría con banda)
  - `TRIPLE AMENAZA`, `LIFT`, `AIR ROW`, `AJUSTE COLGADX` (activaciones)
  - `jefferson` (lowercase) y `molino con aductor` (lowercase) — son activaciones (sus versiones capitalizadas ya se clasifican bien)
- Grupos musculares: `ACTIVACION`, `STRECH`, `EXPLOSIVE/PLIOMETRIA` (este último excepto si nombre menciona barra/mancuerna/kb/db)

**`barbell_only`** — no se aplica como default. Es un override por log (caso "hoy hice solo con barra" en un ejercicio típicamente con discos).

**`with_weight`** — default para todo lo demás.

### 4.2. SQL listo para ejecutar (Fase 1)

```sql
-- Clasificación inicial — TODA en una sola transacción
UPDATE public.exercises
SET default_weight_mode = CASE
  -- Patrones genéricos
  WHEN lower(name) ~ 'push.?up' THEN 'bodyweight'
  WHEN lower(name) ~ '(pull.?up|chin.?up)' AND lower(name) !~ 'weighted' THEN 'bodyweight'
  WHEN lower(name) ~ '(plancha|plank)' THEN 'bodyweight'
  WHEN lower(name) LIKE '%bird dog%' THEN 'bodyweight'
  WHEN lower(name) ~ 'dead.?bug' AND lower(name) !~ '(kb|db|weight)' THEN 'bodyweight'
  WHEN lower(name) LIKE '%burpee%' THEN 'bodyweight'
  WHEN lower(name) LIKE '%mountain climber%' THEN 'bodyweight'
  WHEN lower(name) LIKE '%jumping jack%' THEN 'bodyweight'
  WHEN lower(name) ~ '(crunch|sit.?up)' AND lower(name) !~ 'weighted' THEN 'bodyweight'
  WHEN lower(name) LIKE '%superman%' THEN 'bodyweight'
  WHEN lower(name) ~ 'spider.?man' THEN 'bodyweight'
  WHEN lower(name) LIKE '%open book%' THEN 'bodyweight'
  WHEN lower(name) LIKE '%bear crawl%' THEN 'bodyweight'
  WHEN lower(name) LIKE '%cossack%' THEN 'bodyweight'
  WHEN lower(name) LIKE '%carioca%' THEN 'bodyweight'
  WHEN lower(name) LIKE '%inchworm%' THEN 'bodyweight'
  WHEN lower(name) ~ 'hollow' THEN 'bodyweight'
  WHEN lower(name) LIKE '%wall sit%' THEN 'bodyweight'
  WHEN lower(name) LIKE '%trx%' THEN 'bodyweight'
  WHEN lower(name) ~ '(banded|banda)' THEN 'bodyweight'
  WHEN lower(name) ~ '(activacion|activación)' THEN 'bodyweight'
  WHEN lower(name) ~ '(coordinacion|coordinación)' THEN 'bodyweight'
  WHEN lower(name) LIKE '%tobillo%' THEN 'bodyweight'
  WHEN lower(name) ~ '(movilidad|stretch|strech|estiramiento|flexibility|flexibilidad)' THEN 'bodyweight'
  WHEN lower(name) LIKE '%estrella%' THEN 'bodyweight'
  WHEN lower(name) LIKE '%hombro con palo%' THEN 'bodyweight'
  WHEN lower(name) LIKE '%cuadrupedia%' THEN 'bodyweight'
  WHEN lower(name) LIKE '%respiracion%' THEN 'bodyweight'
  WHEN lower(name) ~ 'glute bridge' AND lower(name) !~ '(kb|db|barbell|weighted)' THEN 'bodyweight'
  WHEN lower(name) ~ 'kickback' AND lower(name) !~ '(kb|db|cable|weighted)' THEN 'bodyweight'
  WHEN lower(name) LIKE '%conos%' THEN 'bodyweight'
  WHEN lower(name) ~ '(drop jump|box jump|salto)' THEN 'bodyweight'
  WHEN lower(name) ~ '(pigeon|paloma)' THEN 'bodyweight'
  WHEN lower(name) ~ '(trote|run|correr|sprint)' THEN 'bodyweight'
  WHEN lower(name) ~ '(fitball|swiss ball|pelota)' AND lower(name) !~ '(kb|db|barbell|barra)' THEN 'bodyweight'

  -- Casos especiales identificados manualmente
  WHEN lower(trim(name)) IN ('bici fija','bracing','chinito','colgarse',
                              'downward dog/carpa','assisted jump w powerband',
                              'triple amenaza','lift','air row','ajuste colgadx',
                              'jefferson','molino con aductor',
                              'hop lateral a step','jumping rope') THEN 'bodyweight'

  -- Por grupo muscular
  WHEN muscle_group ILIKE '%activacion%' OR muscle_group ILIKE '%activación%' THEN 'bodyweight'
  WHEN muscle_group ILIKE '%strech%' OR muscle_group ILIKE '%stretch%' THEN 'bodyweight'
  WHEN (muscle_group ILIKE '%explosive%' OR muscle_group ILIKE '%pliometria%')
       AND lower(name) !~ '(barbell|kb|db|barra|mancuerna)' THEN 'bodyweight'

  -- Default
  ELSE 'with_weight'
END;

-- Setear default_unilateral basándose en el nombre
UPDATE public.exercises
SET default_unilateral = CASE
  WHEN lower(name) ~ '(unilat|single|spider.?man|cossack|pistol|cada lado)' THEN true
  WHEN lower(name) ~ '(carries|carry|suitcase|waiter)' THEN true
  ELSE false
END;
```

---

## 5. Mapeo de datos sucios → limpios (backfill workout_logs)

| Valor viejo `actual_reps` | Nuevo `actual_reps_jsonb` | `unilateral` | Otros |
|---|---|---|---|
| `"8"` | `[8]` | (heredado) | — |
| `"12.0"` | `[12]` | — | — |
| `["10","12","12"]` | `[10, 12, 12]` | — | — |
| `"8 cada lado"` | `[8]` | `true` | (8 reps POR LADO) |
| `["4cl","4"]` | `[4, 4]` | `true` | |
| `["12cl","12","12"]` | `[12, 12, 12]` | `true` | |
| `["8pasos cl","8"]` | `[8, 8]` | `true` | `reps_unit='pasos'` |
| `["6 respiraciones","6","6"]` | `[6, 6, 6]` | `false` | `reps_unit='respiraciones'` |
| `["3 (1 cada 15seg)"]` | `[3]` | — | `notes` += `"(1 cada 15seg)"` |
| `["12 ","12","12"]` | `[12, 12, 12]` | — | trim |
| `"igual q video"` | `null` | — | `notes` += `"igual q video"` |

**Inferencia de `weight_mode`:**

| Estado | `weight_mode` | Justificación |
|---|---|---|
| Tiene `actual_weight` > 0 o `actual_weights` con números | `with_weight` | Hay peso explícito |
| `actual_weight = NULL` y `actual_weights = NULL/[""]` | `bodyweight` | Suposición: si no hay peso, era bodyweight (acordado con usuario) |

---

## 6. RPC sugerida `save_workout_log`

```sql
CREATE FUNCTION public.save_workout_log(
  p_log_id              uuid DEFAULT NULL,
  p_student_id          uuid,
  p_plan_id             uuid,
  p_plan_exercise_id    uuid,
  p_logged_date         date,
  p_weight_mode         text,
  p_actual_sets         int,
  p_reps                jsonb,            -- POR LADO si unilateral=true
  p_weights             jsonb DEFAULT NULL,
  p_unilateral          boolean DEFAULT false,
  p_reps_unit           text DEFAULT NULL,
  p_perceived_difficulty int DEFAULT NULL,
  p_perceived_difficulty_label text DEFAULT NULL,
  p_notes               text DEFAULT NULL,
  p_completed           boolean DEFAULT true,
  p_logged_late         boolean DEFAULT false
) RETURNS uuid;
```

---

## 7. Helper de cálculo de volumen

```sql
CREATE FUNCTION public.calculate_log_volume(p_log_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
-- Lógica:
--   'with_weight' / 'barbell_only':
--     volumen = sum(reps[i] * weights[i]) * (CASE WHEN unilateral THEN 2 ELSE 1 END)
--   'bodyweight':
--     volumen = sum(reps[i]) * profile.weight_kg * (CASE WHEN unilateral THEN 2 ELSE 1 END)
--     Si profile.weight_kg IS NULL: devolver NULL (sin volumen calculable)
$$;
```

---

## 8. Plan de migración (3 fases)

### Fase 1 — Back (cuando vos confirmes)

UNA migración hace:

1. Agregar columnas a `workout_logs`, `exercises`, `plan_exercises`.
2. CHECK constraints como `NOT VALID` primero.
3. UPDATE inicial de `exercises.default_weight_mode` con la heurística de §4.
4. UPDATE inicial de `exercises.default_unilateral`.
5. Backfill de los 422 `workout_logs` (sección 5).
6. Validar constraints.
7. Crear RPC `save_workout_log` y helper `calculate_log_volume`.

Las columnas viejas (`actual_reps`, `actual_weights`, `actual_weight`) **no se tocan en Fase 1**.

### Fase 2 — Front

1. **Biblioteca de ejercicios:** UI permite a Anto ver y editar `default_weight_mode` y `default_unilateral` de cada ejercicio. Idealmente mostrar la lista filtrable y ordenable.
2. **Form del plan (coach):** al asignar un ejercicio, los defaults vienen del catálogo. El coach puede override `weight_mode` y `unilateral` por plan_exercise.
3. **Form de carga (alumno):**
   - Dropdown "Tipo de peso" con 3 opciones (default: lo que vino del plan_exercise → exercise).
   - Si `bodyweight`: ocultar inputs de peso.
   - Si `with_weight` / `barbell_only`: mostrar inputs como hoy.
   - Toggle "Unilateral (cada lado)" (default: lo que vino del plan_exercise → exercise).
   - Si `unilateral=true`: el label de reps dice "reps **por lado**".
   - Si `reps_unit != null`: el label dice "X pasos / respiraciones / segundos".
4. **Lectura de progreso/dashboards:** usar `actual_reps_jsonb`, `actual_weights_jsonb`, `weight_mode`, y la función `calculate_log_volume`.
5. **Coexistencia opcional:** doble escritura a las viejas durante 1-2 sprints.
6. **Soft-warning si `barbell_only` + peso > 20kg**: banner amarillo, sin bloquear.

### Fase 3 — Cleanup

`DROP COLUMN actual_reps, actual_weights, actual_weight` cuando todo esté estable.

---

## 9. Decisiones que el front necesita confirmar

1. **¿RPC `save_workout_log` o INSERT directo?**
   - Recomendación: RPC.

2. **¿`reps_unit` con CHECK estricto?**
   - Recomendación: sí, 4 valores fijos.

3. **¿Doble escritura en Fase 2 a las columnas viejas?**
   - Recomendación: sí, 1-2 sprints.

4. **¿Pesos por lado (asimetría)?**
   - Recomendación: empezar simple (1 input por set, asume igual ambos lados). Asimetría va a `notes` o se agrega después.

5. **Soft-warning si "Solo con barra" + peso > 20:** ¿sí?
   - Recomendación: sí, sin bloquear.

6. **¿Manejo de `profiles.weight_kg = NULL` para bodyweight?**
   - Recomendación: la métrica muestra "Peso corporal sin registrar" + CTA al coach.

7. **UI para que Anto edite `default_weight_mode` y `default_unilateral` en biblioteca de ejercicios:**
   - ¿Es prioritario en Fase 2 o se hace después?
   - Recomendación: incluirlo en Fase 2. Sino Anto no puede corregir la heurística inicial.

---

## 10. Plan de validación post Fase 1

```sql
-- 1. Catálogo clasificado
select default_weight_mode, count(*) from public.exercises group by default_weight_mode;
-- Esperado: ~129 bodyweight, ~146 with_weight, 0 barbell_only

-- 2. Logs con datos nuevos
select count(*) from public.workout_logs where actual_reps_jsonb is not null;
-- Esperado: ~417

-- 3. Distribución de weight_mode en logs
select weight_mode, count(*) from public.workout_logs group by weight_mode;
-- Esperado: with_weight ~280, bodyweight ~135, barbell_only 0

-- 4. Coherencia
select count(*) from public.workout_logs
where weight_mode='bodyweight' and actual_weights_jsonb is not null
  and actual_weights_jsonb != '[]'::jsonb;
-- Esperado: 0

-- 5. Unilateral marcado
select count(*) from public.workout_logs where unilateral = true;
-- Esperado: ~60-80 (los que tenían "cl", "cada lado", etc.)

-- 6. Volumen calculable razonable
select wl.id, e.name, wl.unilateral, wl.weight_mode,
       calculate_log_volume(wl.id) as vol
from public.workout_logs wl
join public.plan_exercises pe on pe.id = wl.plan_exercise_id
join public.exercises e on e.id = pe.exercise_id
limit 20;
```

---

## 11. Casos especiales documentados

1. **124 logs con peso duplicado:** backfill prioriza `actual_weights` (formato nuevo).

2. **114 logs sin peso ni weights:** mayoría → `bodyweight`. El front puede después marcar algunos como `reps_unit='segundos'` si eran time-based.

3. **Ejercicios "puente" entre planes** (Chin Ups + HIP THRUST de Franco entre PLAN 10 y PLAN 11): comparten `exercise_id`. Las queries de progreso histórico deben agrupar por `exercise_id`, no por `plan_exercise_id`.

4. **Duplicados en catálogo por mayúsculas/minúsculas** (deuda separada, no parte de 2.4):
   - "Chin Ups" vs "chin ups"
   - "Jefferson" vs "jefferson"
   - "Molino Con Aductor" vs "molino con aductor"
   - "Glute Bridge" vs "glute bridge"
   - Otros probables (revisar al hacer el sprint de cleanup del catálogo).
   - **Impacto presente:** la clasificación pre-hecha puede dar resultados distintos para duplicados (uno entra al pattern, el otro no). Cuando se merge los duplicados, se quedará con el mejor clasificado.
   - **Próximo sprint sugerido:** merge de duplicados. El back puede ayudar a identificarlos y migrar `plan_exercises` / `workout_logs` que apunten al duplicado a la versión "canónica".

5. **Logs anteriores al modelo nuevo editados desde la UI nueva:** la doble escritura (si se implementa en Fase 2) los normaliza al schema nuevo.

---

## 12. Qué necesito de vos antes de ejecutar Fase 1

1. Visto bueno al schema (sección 3) y al modelo conceptual (sección 2).
2. Respuestas a las 7 decisiones de sección 9.
3. Confirmación de timing para Fase 2.

Si todo está OK, ejecuto Fase 1 (1 migración) y te aviso para arrancar Fase 2.

---

Cualquier duda sobre patrones, parsing, o si querés ajustar el diseño, avisame.
