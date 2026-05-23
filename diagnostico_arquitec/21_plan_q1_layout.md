# Plan Q1 — layout "Última vez + última nota coach + chat completo" en TodayWorkoutPage

> Mini-plan A/B/C antes de codear. Doc 13 §Q1 estimaba 1 día. Decisión Franco
> 23/05 late night: avanzar sin foto Anto + sumar chat completo (memoria
> `project_q1_decision_franco_chat_historial.md`).

## Pre-flight de esta sesión (2026-05-23 late night / early madrugada)

- ✅ Doc 20 + doc 13 §Q1 + memoria `project_q1_decision_franco_chat_historial.md` leídos.
- ✅ Supabase MCP → `bvexjanqmfypmtgoapbt` (gymorg, sa-east-1).
- ✅ Browser **francellone** seleccionado.
- ✅ `git log -5` muestra los 3 commits Q2 / dashboard expandido / docs 18-20 ya
  mergeados en `main` (77b7772, 1d65f36, 085ea10).

## Datos disponibles en DB (verificado con MCP)

- `notes` con `context_type='exercise'` (9 vivas): tanto `author_role='coach'`
  como `author_role='student'`. `context_id = exercise_id` (NO plan_exercise_id).
  Visibility `shared` en todos los registros vivos.
- `notes` con `context_type='workout_log'` (80 vivas): siempre del alumno,
  visibility `shared`. Son las observaciones por sesión que vienen del flow
  de carga del log (mirror via `postWorkoutLogNote`).
- Thread por alumno (1:1 con su coach): `note_threads.student_id = profile.id`.
- `workout_logs` tiene `actual_weights_jsonb` (jsonb array) + `actual_reps_jsonb`
  (jsonb array) + columnas legacy de texto. Existe helper `readLogWeights/readLogReps`
  en `features/plans/helpers.js` que ya normaliza.

## Lo que Anto pidió originalmente (doc 13 §Q1)

> *"No ver la última nota a menos que entre en la parte de NOTAS. Me gustaría
> ver cuando entreno en el plan los últimos pesos registrados y último
> comentario."*

> *"Notas no están a mano. Está bueno el chat pero estaría bueno que cuando
> entras a entrenar en tu plan te salgan las notas correspondientes de cada
> ejercicio sumada a la última nota de la conversación del ejercicio."*

Resp 2 ya decidida por Anto (doc 13 § Pendientes de decisión): **comentario del
COACH + últimos pesos por alumno** (NO la última nota del alumno).

## Lo que sumó Franco (23/05 late night, no documentado en doc 13)

> Además de la última nota del coach por ejercicio, el alumno debe poder ver
> el HISTORIAL COMPLETO del chat de ese ejercicio mientras está cargando el
> workout.

Lectura UX: hace falta un acceso lateral que abra el thread completo del
ejercicio sin sacar al alumno del flow de carga.

## Restricciones técnicas

- `TodayWorkoutPage.jsx` tiene 1013 LOC, es la página más densa del proyecto.
  Cualquier cambio ahí es alto riesgo (memoria del handoff 20).
- `ExerciseCard.jsx` tiene 808 LOC pero la estructura del header colapsado es
  clara (líneas 432–514): tilde + nombre + sugerido + (si ya hay log) "✓ Ns ·
  Xkg · PSE Y". El body expandido tiene técnica + log form + PSE + textarea de
  notas.
- `StrengthBlockRunCard` arranca COLAPSADO (`expanded=false`). El alumno tiene
  que abrir el bloque para ver los ejercicios. Esto importa: si el sub-bloque
  "Última vez" va dentro del bloque colapsado, no se ve hasta que se expande.
- Notas en `context_type='exercise'`: identifican al EJERCICIO conceptual
  (mismo exercise_id puede aparecer en varios plan_exercises). El "chat del
  ejercicio" debería seguir esa misma lógica: thread por ejercicio, no por
  plan_exercise.
- Para los blocks aeróbicos / circuito el "ejercicio" no tiene la misma
  granularidad. Q1 aplica a **bloques strength** (ExerciseCard). Aerobic /
  circuit quedan fuera del primer drop — si Anto los pide después se extiende
  fácil.

## Lo que se va a fetchear (común a las 3 opciones)

Una sola query batch en `TodayWorkoutPage.fetchWorkout()`:

1. **Último log por `exercise_id` (no por plan_exercise_id):**
   `workout_logs WHERE student_id=me AND plan_id=mi_plan AND completed=true`
   ordenado por `logged_date DESC, id DESC`. Reduce client-side a "primero por
   exercise_id" (a través del join con `plan_exercises.exercise_id`).

   > **Por qué exercise_id y no plan_exercise_id**: el coach puede tener un
   > "Press de banca" repetido en Día A y Día B con plan_exercise_id distintos
   > pero el ejercicio conceptual (y la progresión de peso) es el mismo. Si
   > filtra por plan_exercise_id, el alumno verá "última vez 20kg" en Día A
   > aunque ayer hizo 22.5kg en Día B con el mismo Press. Memoria del Q1 dice
   > "no por exercise_id genérico — porque el contexto del bloque importa";
   > Franco decide en la pregunta de abajo si lo sumamos como filtro extra o no.

2. **Última nota del COACH por exercise_id:**
   `notes WHERE thread_id=mi_thread AND context_type='exercise' AND
   exercise_id IN (...) AND author_role='coach' AND deleted_at IS NULL`
   ordenado por `created_at DESC`. Reduce client-side a primera por exercise.

3. **Para el drawer "Ver chat completo":** lazy fetch al abrir el drawer.
   Misma query pero SIN `author_role='coach'` para traer ambos lados, y
   SIN `LIMIT 1`. Si lo prefetcheamos al cargar la página, son ~150 notas para
   8 ejercicios y la mayoría no se va a abrir. Lazy es más barato.

## Opciones de layout (A / B / C)

### Opción A — Todo en el header colapsado del ExerciseCard

El header del ExerciseCard (líneas 432–514) muestra hoy:

```
○  [block_label]  Press de banca                       [▶] [▼]
                  Sugerido: 3 series × 8-10 · 22.5kg
                  ✓ 3s · 22.5, 22.5, 20kg · PSE 8       ← solo si ya hay log de HOY
```

Opción A inserta sub-bloque debajo del "Sugerido" (siempre visible, también
en colapsado):

```
○  [block_label]  Press de banca                       [▶] [▼]
                  Sugerido: 3 series × 8-10 · 22.5kg
                  ⤴ Última vez (18/5): 3s · 22.5, 22.5, 20kg
                  💬 Coach: "podes ponerle más peso la próxima..."  [Ver chat ▾]
                  ✓ 3s · 22.5, 22.5, 20kg · PSE 8       ← solo si ya hay log de HOY
```

**Pros:**
- Visible siempre, sin extra clicks (matchea el deseo de Anto: "no ver la nota
  a menos que entre en NOTAS").
- Mínima fricción para el alumno: ve el chat anterior antes de cargar.

**Contras:**
- StrengthBlockRunCard arranca COLAPSADO. Hasta que el alumno no expanda el
  bloque, no ve el ExerciseCard, así que tampoco ve el sub-bloque. Para mitigar
  habría que cambiar el default a expanded=true cuando hay notas/última vez —
  pero romper ese default afecta a TODOS los bloques y los días con 4+ bloques
  se vuelven larguísimos.
- La altura del header crece bastante. Con notas largas del coach truncadas a
  ~2 líneas la card puede medir 140-180px solo en el header.
- En aerobic/circuit no aplica → asimetría visual.

### Opción B — Todo dentro del body expandido del ExerciseCard

El alumno expande el ExerciseCard como hoy y dentro del cuerpo ya hay PSE
sugerida, notas técnicas, log form, etc. Sumamos un panel "Última vez + chat"
arriba del form de carga:

```
[body expandido]
┌─ Técnica (si existe) ────────────────────────┐
├─ ⤴ Última vez (18/5): 3s · 22.5, 22.5, 20kg │
├─ 💬 Coach (18/5): "podes ponerle más peso..." │
│  [Ver chat completo →]                       │
├─ Registrar entrenamiento ───────────────────┤
│  Series / reps / pesos / PSE / Notas         │
└─────────────────────────────────────────────┘
```

**Pros:**
- Consistente con el patrón actual: todo lo "extra" vive en el body expandido.
- No rompe el default colapsado del block ni del exercise.
- Cuando el alumno realmente va a cargar el ejercicio, expande → ve la
  referencia → carga. Es el flow natural.

**Contras:**
- Necesita 2 clicks para ver la nota (bloque + ejercicio).
- No alinea 100% con "no ver la nota a menos que entre en NOTAS" — pero sí
  alinea con "que salgan las notas cuando entras a entrenar en tu plan",
  porque "entrar" se interpreta como expandir el ejercicio.

### Opción C — Híbrido: previews chicas en header + chat completo en body expandido

Header colapsado del ExerciseCard suma **solo** la "Última vez" en formato
1 línea (sin la nota del coach):

```
○  [block_label]  Press de banca                       [💬3] [▶] [▼]
                  Sugerido: 3 series × 8-10 · 22.5kg
                  ⤴ Última vez (18/5): 22.5kg / 8r          ← NUEVO 1 línea
                  ✓ 3s · 22.5, 22.5, 20kg · PSE 8           ← log de HOY
```

Badge `💬3` indica cuántos mensajes hay en el thread del ejercicio. Click en el
badge abre el drawer del chat **sin** expandir el ExerciseCard.

Body expandido suma la última nota del coach completa + botón "Ver chat":

```
[body expandido]
├─ 💬 Coach (18/5): "podes ponerle más peso la próxima"
│  [Ver chat completo →]
├─ Técnica (si existe)
├─ Registrar entrenamiento
```

**Pros:**
- "Última vez" siempre visible (matchea Anto: "que salgan los últimos pesos").
  Pero corto, 1 línea — no infla el header.
- Última nota del coach (la parte "linda" del chat) en el body expandido —
  matchea "cuando entras al ejercicio". Coherente con cómo funciona el resto
  del expanded.
- Acceso al chat completo desde 2 lados: badge en header (rápido, sin abrir
  el ejercicio) + botón "Ver chat" en body (cuando ya estás dentro).
- Funciona aunque el block esté colapsado: con `badge 💬3` visible en el
  header del ExerciseCard se ve igual.

**Contras:**
- Más componentes que A/B: badge en header + sub-bloque en body + drawer.
- Si el alumno NO expande el bloque, no ve la "Última vez" (porque vive en el
  ExerciseCard que está adentro). Igual que A. Misma limitación.

> **Empate parcial con A en el problema del bloque colapsado.** Para "Última
> vez" en el header del bloque (un nivel arriba) habría que agregar lógica
> para mostrar el último log de CADA ejercicio en el header del bloque, lo
> cual es ruidoso (3-5 líneas extra por bloque). Lo descarto.

## Recomendación

**Opción C** — balancea "siempre visible" para los pesos (lo que más urge a
Anto) con "expanded para detalles" (lo que mejor matchea el patrón del proyecto)
y suma el drawer del chat completo con dos entradas. La fricción de los 2 clicks
para ver el chat ya está presente hoy (panel de notas global), y la C agrega
shortcut directo desde el header.

## Datos pendientes para Franco (responder antes de codear)

1. **Filtro de último log: ¿exercise_id global o plan_exercise_id?**
   - exercise_id global: muestra el peso más reciente del Press de banca aunque
     se haya hecho en otro día del plan. Mejor para progresión.
   - plan_exercise_id: muestra solo el peso del MISMO ejercicio dentro del
     mismo bloque/día. Más conservador, matchea el doc 13 que dice "no por
     exercise_id genérico — porque el contexto del bloque importa".
   - Recomendación mía: **exercise_id global** (el peso es el peso, el bloque
     no cambia físicamente el ejercicio). Si Anto quiere ver "Última vez en
     este día específico", se puede sumar como subtexto chico ("× anteayer
     hiciste el A1 con esto").

2. **¿Cuántas sesiones hacia atrás mostrar como "Última vez"?**
   - 1 (solo la última) — minimalista.
   - 2 (últimas dos) — permite ver progresión.
   - 3 — empieza a sentirse cargado.
   - Recomendación mía: **1 fija**, con badge "↑ +2.5kg vs anterior" si se puede
     calcular barato. Mejor visual que listar 2-3 valores.

3. **¿El drawer del chat permite escribir respuesta (composer inline)?**
   - Sí: el alumno responde a la nota del coach sin salir del workout.
     Implica reusar NoteComposer dentro del drawer. Más LOC pero mucho mejor
     UX si la conversación es real.
   - No: solo lectura. El alumno ve y si quiere responder va al Panel de notas.
     Más simple, primera versión.
   - Recomendación mía: **read-only en V1**. Si Anto lo pide, sumar composer
     en V2.

4. **¿La "Última vez" + chat aplica también a bloques aerobic / circuit?**
   - Aerobic block: 1 sólo workout_block_log con campos distintos (duración,
     distancia). No tiene "peso". Podríamos mostrar "Última vez: 25 min · 3km".
   - Circuit: el block tiene varios ejercicios adentro pero el "log" se carga
     a nivel block. Más complejo.
   - Recomendación mía: **solo bloques strength en V1**. Aerobic/circuit
     quedan fuera del scope (no son lo que Anto pidió y son <20% del uso).

## Esfuerzo estimado

Asumiendo Opción C + respuestas mías recomendadas:

- Helper data layer (querys batch + normalización + tests): ~2h
- Componente ExerciseCardHistoryPreview (header line + body block): ~2h
- Drawer "Ver chat completo" (re-usando NoteCard): ~2h
- Integración en TodayWorkoutPage (fetch + pass props): ~1h
- Tests unitarios + lint: ~1h
- Smoke browser end-to-end: ~30min

Total estimado: ~8h. Matchea el cap de 1 día del doc 13.

## Archivos esperados a tocar

**Nuevos:**
- `src/features/workouts/exerciseHistoryLogic.js` — `pickLastLogPerExercise`,
  `pickLastCoachNotePerExercise`. Funciones puras.
- `src/features/workouts/exerciseHistoryLogic.test.js` — tests.
- `src/features/workouts/components/ExerciseHistoryPreview.jsx` — la línea
  "Última vez" + badge chat (header) + bloque expanded con última nota +
  botón.
- `src/features/workouts/components/ExerciseChatDrawer.jsx` — drawer modal
  con lista de NoteCard del thread filtrado por exercise_id.

**Modificados:**
- `src/features/workouts/pages/TodayWorkoutPage.jsx` — fetch extra + pasar
  props a BlockRenderer.
- `src/features/workouts/components/BlockRenderer.jsx` — passthrough.
- `src/features/workouts/components/StrengthBlockRunCard.jsx` — passthrough.
- `src/features/workouts/components/ExerciseCard.jsx` — render del preview en
  header (1 línea) + en body expandido.

## Pendientes que NO entran en este Q1

- Aerobic / circuit blocks (decisión arriba — quedan fuera).
- Composer dentro del drawer (V2 si Anto lo pide).
- Notas del alumno como "última nota" (Anto decidió: solo coach).
- Re-tocar Notes Panel global (Q1 es solo el flow workout).
- Mostrar el chat completo CON workout_log notes mezcladas (V2 si surge — por
  ahora solo `context_type='exercise'`).
- Smoke Q6 perfil del alumno — sigue pendiente del handoff 17/20, no es Q1.
