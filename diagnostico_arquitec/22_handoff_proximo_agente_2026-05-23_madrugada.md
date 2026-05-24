# Handoff próximo agente — 2026-05-23 (madrugada / arranque del 24)

> **Continuación directa del handoff 20.** Doc 20 cerró Q2 + dashboard expandido
> (Opción C de doc 19) y dejó Q1 pendiente con un requerimiento nuevo de Franco
> (historial completo del chat por ejercicio). Esta sesión implementó Q1 entero
> con la Opción C del plan A/B/C (doc 21). Quedan pendientes: smoke browser
> end-to-end (Franco con login alumno), Q6 smoke (sigue arrastrado del handoff
> 17), commits + push.

## Pre-flight al arrancar próxima sesión

1. Leer este doc + handoff 20 + memoria
   `project_q1_decision_franco_chat_historial.md`.
2. Supabase MCP → `bvexjanqmfypmtgoapbt` (gymorg, sa-east-1).
3. Browser: usar **francellone** (`deviceId 5c324fc5-b1e8-4e0f-b5bd-ab5054057e08`).
4. Working dir: `~/Desktop/gym_app/gym_app/`. Vite: `npm run dev` →
   `http://localhost:5173`.
5. `git log -5` para verificar si Franco mergeó el commit Q1 de esta sesión.

## Items cerrados esta sesión

### Q1 — Última nota del coach + últimos pesos + chat completo en el flow workout (doc 13 §Q1 + memoria del 23/05)

Pedido literal Anto (doc 13 §Q1):

> *"No ver la última nota a menos que entre en la parte de NOTAS. Me gustaría
> ver cuando entreno en el plan los últimos pesos registrados y último
> comentario."*

> *"Notas no están a mano. Está bueno el chat pero estaría bueno que cuando
> entras a entrenar en tu plan te salgan las notas correspondientes de cada
> ejercicio sumada a la última nota de la conversación del ejercicio."*

Requerimiento extra Franco 23/05 late night (registrado en memoria
`project_q1_decision_franco_chat_historial.md`):

> *Sumar el HISTORIAL COMPLETO del chat por ejercicio mientras se carga el
> workout.*

**Decisión de layout (AskUserQuestion 24/05 madrugada):**

| Decisión | Respuesta de Franco | Por qué |
|---|---|---|
| Layout | **Opción C híbrido** (doc 21) | Header con preview 1 línea + body expandido con nota coach + drawer chat |
| Filtro último log | **exercise_id global** | Mismo ejercicio en Día A vs Día B comparte progresión de peso |
| Drawer composer | **Read-only V1** | Para responder, el alumno va al Panel de notas global |
| Scope blocks | **Incluir aerobic + circuit** | Implementación completa, no solo strength |

**Archivos nuevos:**

- `src/features/workouts/exerciseHistoryLogic.js` — funciones puras
  (`pickLastLogPerExercise`, `pickLastBlockLogPerBlock`,
  `pickLastCoachNotePerExercise`, `countNotesByExercise`,
  `groupNotesByExercise`, `formatLastLogSummary`, `formatLastBlockLogSummary`,
  `formatRelativeDate`).
- `src/features/workouts/exerciseHistoryLogic.test.js` — **26 tests**, todos
  verdes. Cubren: agrupación por exercise_id global vs plan_exercise_id,
  excludeDate (no mostrar el log del día actual), completedOnly, tiebreak por
  id, ignoración de notas privadas/borradas/otro context_type, formato de
  resumen con jsonb / legacy / bodyweight, fechas relativas (hoy/ayer/hace N
  días/DD/MM).
- `src/features/workouts/components/ExerciseHistoryPreview.jsx` — dos
  sub-componentes: `ExerciseHistoryHeaderLine` (1 línea compacta con
  "⤴ ayer: 22.5kg · 8r · PSE 8" + badge 💬N) y `ExerciseHistoryBodyBlock`
  (panel con última nota completa del coach + botón "Ver chat completo").
- `src/features/workouts/components/ExerciseChatDrawer.jsx` — drawer modal
  read-only que renderiza el thread filtrado por `(thread_id, context_type=
  'exercise', exercise_id)` con `NoteCard` reusado del feature notes. Lazy
  fetch (con cache opcional desde el padre para evitar trip extra).

**Archivos modificados:**

- `src/features/workouts/pages/TodayWorkoutPage.jsx` — sumé 3 fetches en
  paralelo dentro de `fetchWorkout`:
  - `recent_exercise_logs` (cap 300, `logged_date < selectedDate`,
    `completed=true`) con `actual_weights_jsonb` + `actual_reps_jsonb` +
    `perceived_difficulty` para `formatLastLogSummary`.
  - `recent_block_logs` (cap 200, mismo filtro) para aerobic/circuit.
  - `getStudentThread(profile.id)` → `threadId`. Luego serial fetch de
    notas tipo `exercise` shared del thread (cap 500, sirve para preview
    + chat completo via cache).
  - 5 useMemo derivados: `lastLogByExercise`, `lastBlockLogByBlock`,
    `lastCoachNoteByExercise`, `noteCountByExercise`, `notesByExercise`
    (para el cache del drawer).
  - Render del `<ExerciseChatDrawer />` controlado por estado `chatDrawer`.
- `src/features/workouts/components/BlockRenderer.jsx` — passthrough de
  los 4 mapas Q1 + `onOpenChat` a strength/aerobic/circuit.
- `src/features/workouts/components/StrengthBlockRunCard.jsx` — passthrough
  por exercise a cada `<ExerciseCard />` (mira en `exercise_id` del plan_ex).
- `src/features/workouts/components/ExerciseCard.jsx` — `<ExerciseHistoryHeaderLine />`
  debajo del "Sugerido" (siempre visible en colapsado) + `<ExerciseHistoryBodyBlock />`
  al inicio del body expandido, antes de la técnica.
- `src/features/workouts/components/AerobicBlockRunCard.jsx` — preview a
  nivel block_log en el header + body block (usa el `exercise_id` del
  primer plan_exercise asociado al block aerobic).
- `src/features/workouts/components/CircuitBlockRunCard.jsx` — preview a
  nivel block_log en el header del bloque + por cada ejercicio del circuito
  línea compacta con "Última vez" + badge chat (modo `isCompact`).

**Decisión técnica clave — agrupación por exercise_id global:**

El último log se busca por `plan_exercises.exercise_id` (no por
`plan_exercise_id`). Si Franco hace Press de banca en Día A y Día B (mismo
exercise, distinto plan_exercise_id), el header del Press en Día A va a
mostrar el peso del Press en Día B si fue más reciente. Esto fue lo que
pidió Franco para ver progresión real de peso. La memoria del Q1 original
sugería plan_exercise_id estricto, pero Franco lo overrideo cuando le
mostré las dos opciones.

**Trampa SQL importante:**

`recent_exercise_logs` filtra por `logged_date < selectedDate` (no `<=`),
porque queremos que el preview sea histórico — no que refleje lo que el
alumno acaba de cargar HOY. Lo que cargó hoy ya se ve en el header del
propio card como "✓ 3s · 22.5, 22.5, 20kg · PSE 8".

**Datos confirmados via Supabase MCP (Franco-alumno, plan vigente):**

- 105 workout_logs históricos completados → preview "Última vez" funciona
  para todos los ejercicios del plan.
- 0 workout_block_logs (Franco no tiene aerobic/circuit en su plan
  vigente). El path aerobic/circuit del código no se va a ejercitar con
  este alumno; el smoke ideal es probarlo con un alumno cuyo plan tenga
  bloques de cardio.
- 9 notas `context_type='exercise'` shared en el thread de Franco
  (`f7499966-d4db-47af-b0b0-4221280064bc`), entre 17 y 19 de mayo. Última
  nota coach por exercise + chat completo deberían mostrar contenido real.

## Lint + tests + build

- **Lint**: `npm run lint` → **0 errors, 72 warnings**. Baseline doc 20 era
  69; +3 warnings nuevos del patrón aceptado `react-hooks/set-state-in-effect`
  (uso de useEffect con setState que el codebase ya acepta en múltiples
  lugares).
- **Tests**: `npm run test:run` → **212/212 verdes** en ~12s. Sumé 26 nuevos
  sobre baseline 186, todos en `exerciseHistoryLogic.test.js`.
- **Build**: `npx vite build --outDir dist-verify-q1` → OK, 3261 modules
  transformed en 4.89s. (Nota: `npm run build` directo falla con `EPERM` en
  `dist/` por lock del sandbox — esto es esperado por
  `feedback_sandbox_limits.md`. El build limpio anda igual si se apunta a
  otro outDir o se corre desde la terminal de Franco.)
- **Smoke browser STRENGTH**: **OK end-to-end.** Franco se logueó como alumno
  (`francellone@gmail.com`) y validamos juntos en `/student/workout`:
  1. Header del ExerciseCard (thruster barbell, A1): muestra
     `⤴ 14/05: 15kg · 10r · PSE 9` + badge `💬3` debajo de "Sugerido".
  2. Click en `💬3` abre drawer con los 3 mensajes del chat: coach burbujas
     a la derecha (`bg-primary-50`), alumno a la izquierda (`bg-white`),
     ambos con badge "Ejercicio: thruster barbell". Footer dice
     "Para responder, abrí el panel de Notas desde el menú."
  3. Click en X cierra el drawer.
  4. Expandir el ejercicio muestra arriba el `ExerciseHistoryBodyBlock`:
     "💬 Última nota del coach · hace 5 días" + "yayyy si grabate porfi"
     + botón "Ver chat completo > (3 mensajes)".
  5. Click en "Ver chat completo" desde el body abre el mismo drawer.
  6. Ejercicios sin chat (LANDMINE HIP HINGE, S Row Pulley) muestran
     "⤴ 14/05: 30kg · 10r · PSE 8" pero SIN badge `💬N` — correcto,
     no hay notas tipo `exercise` asociadas.
  7. Ningún preview muestra la fecha de HOY (23/05): todos son históricos
     — la exclusión `logged_date < selectedDate` funciona.
- **Smoke browser AEROBIC**: **PENDIENTE.** Plan vigente de Franco no
  tiene aerobic (`recent_block_logs=0` en query SQL). Código compila + tests
  pasan, pero falta validación visual. Ver P0.1 en §Pendientes.
- **Smoke browser CIRCUIT**: **PENDIENTE.** Plan vigente de Franco no tiene
  circuit. Mismo estado que aerobic. Ver P0.2 en §Pendientes.

## Commits sugeridos (Franco con `--no-verify`)

```bash
cd ~/Desktop/gym_app/gym_app

# Limpieza opcional de residuos vitest/vite (sigue desde handoff 17/20)
rm -f vitest.config.js.timestamp-*.mjs vite.config.js.timestamp-*.mjs

# Commit 1: helpers puros + tests
git add \
  src/features/workouts/exerciseHistoryLogic.js \
  src/features/workouts/exerciseHistoryLogic.test.js
git commit --no-verify -m "feat(workouts): helpers de historia por ejercicio + tests (Q1 prep)"

# Commit 2: componentes UI + integración en TodayWorkoutPage
git add \
  src/features/workouts/components/ExerciseHistoryPreview.jsx \
  src/features/workouts/components/ExerciseChatDrawer.jsx \
  src/features/workouts/components/ExerciseCard.jsx \
  src/features/workouts/components/StrengthBlockRunCard.jsx \
  src/features/workouts/components/AerobicBlockRunCard.jsx \
  src/features/workouts/components/CircuitBlockRunCard.jsx \
  src/features/workouts/components/BlockRenderer.jsx \
  src/features/workouts/pages/TodayWorkoutPage.jsx
git commit --no-verify -m "feat(workouts): Q1 — última nota coach + últimos pesos + chat completo en TodayWorkoutPage (doc 21 Opción C, incluye strength + aerobic + circuit)"

# Commit 3: docs
git add \
  diagnostico_arquitec/21_plan_q1_layout.md \
  diagnostico_arquitec/22_handoff_proximo_agente_2026-05-23_madrugada.md
git commit --no-verify -m "docs(diagnostico_arquitec): plan 21 Q1 layout A/B/C + handoff 22"

git push origin main
```

## Pendientes / bloqueos abiertos

Ordenados por prioridad / riesgo, con tag para que el próximo agente filtre:

### 🔴 P0 — Bloqueantes para cerrar Q1 100%

P0.1. **Smoke browser de AEROBIC.** El path aerobic compila, los tests
puros pasan, pero **NO se validó en el browser con datos reales**. Plan
de Franco (alumno) no tiene aerobic. Posibles caminos:

- anto almanza también tiene un perfil de alumno (id distinto al de coach)
  con planes que históricamente incluyen aerobic — logueate como ella y
  validar.
- Pedirle a Anto que cree un plan dummy con un bloque aerobic asignado a
  un alumno de prueba (cuenta `prueba@*` ya existe en la base).
- Si no hay alumno con aerobic, crear uno via SQL.

Qué validar visualmente:
- Header del `AerobicBlockRunCard` debe mostrar `⤴ fecha: N min · M rondas
  · PSE X` debajo del subtítulo (`format · min · intensity`).
- Si el aerobic tiene `plan_exercises[0]` con `exercise_id`, badge `💬N`
  (probablemente 0 si nunca hubo chat sobre ese ejercicio específico).
- Expandir el bloque debe mostrar el `ExerciseHistoryBodyBlock` arriba de
  la ficha del bloque (`bg-sky-50` "Aeróbico …").

P0.2. **Smoke browser de CIRCUIT.** Idem aerobic. anto almanza tampoco
suele usar circuit. Mismas opciones: alumno con plan dummy.

Qué validar visualmente:
- Header del `CircuitBlockRunCard` debe mostrar la línea de "Última vez"
  block-level (sin badge chat — es deliberado, ver §Diferencias).
- Dentro del body expandido, cada ítem del circuito debe mostrar su línea
  compacta `⤴ fecha: peso/reps/PSE` + badge `💬N` si hay chat (modo
  `isCompact`, font [10px]).
- Click en el badge de un ítem debe abrir el drawer del ejercicio
  correspondiente (no del bloque).

P0.3. **Commit + push pendientes.** 3 commits sugeridos en §Commits
sugeridos. Franco con `--no-verify` desde su terminal.

### 🟠 P1 — Mejoras / V2 conocidas

P1.1. **Composer dentro del drawer.** Read-only V1 fue decisión deliberada
(AskUserQuestion). Si Anto pide responder desde el flow workout, sumar
`<NoteComposer />` debajo de la lista del drawer reusando lo que ya hay
en `features/notes/components/NoteComposer.jsx`. Esfuerzo ~1-2h.
Cambiar el footer del drawer de "Para responder, abrí el panel…" a
mostrar el composer real.

P1.2. **Aerobic con múltiples `plan_exercises[]`.** Solo el primero recibe
badge chat (ver §Decisiones deliberadas #2). Si esto se vuelve común,
considerar:
- Mostrar varios badges chat en el header (`💬3 Trote · 💬1 Bici`).
- O un dropdown "Ver chat de…" con los exercises del bloque.

P1.3. **Circuit sin `ExerciseHistoryBodyBlock`.** Decisión deliberada para
evitar saturación, pero si Anto pide ver la última nota del coach completa
sin abrir el drawer dentro de un circuito, hay 3 opciones:
- (a) Un panel colectivo del bloque con la última nota más reciente entre
  todos los ejercicios del circuito.
- (b) Hacer expandible cada ítem del circuito y meter el body block ahí.
- (c) Mostrar un mini-preview de las primeras 2 líneas de la última nota
  coach inline en la línea compacta del ítem (sin panel completo).

Mi voto sería (c) si surge el pedido.

P1.4. **Notas del alumno como "última nota".** Anto decidió coach-only.
NO cambiar sin pedido explícito de Anto.

### 🟡 P2 — Deuda técnica / nice-to-have

P2.1. **Sin tests RTL para los componentes UI nuevos.** Los helpers están
cubiertos (26 tests en `exerciseHistoryLogic.test.js`). Si se quiere
testear render del drawer / preview, sumar React Testing Library con
mocks de Supabase. ~2-3h.

P2.2. **Cap de query (300 logs + 200 block_logs).** Para alumnos con
históricos largos (>1 año entrenando 4×/semana → ~800+ logs) el cap puede
empezar a faltar. No urgente, pero monitorear. Si se ajusta, también
revisar el cap de 500 en `exerciseNotes`.

P2.3. **Footer del drawer es texto fijo.** Si más adelante se reorganizan
las pestañas del nav inferior, el copy "abrí el panel de Notas desde el
menú" puede quedar desactualizado. Hard-coded en `ExerciseChatDrawer.jsx`.

P2.4. **Realtime del thread del ejercicio.** El cache `notesByExercise`
viene precomputado en `fetchWorkout`. Si el coach manda una nota mientras
el alumno tiene el drawer abierto, el alumno NO la ve hasta refrescar la
página. Si se quisiera realtime, suscribirse al thread con
`subscribeThread` de `notes/api.js` desde el drawer e invalidar el cache.
~1h.

P2.5. **Falta `.gitignore` para `vitest.config.js.timestamp-*.mjs` y
`vite.config.js.timestamp-*.mjs`.** Residuos untracked que se regeneran en
cada sesión, NO commitear. Sigue desde handoff 17. Fix: 2 líneas en
`.gitignore`.

### 🔵 P3 — Sin relación directa con Q1 pero pendiente desde antes

P3.1. **Smoke Q6** (perfil del alumno editable, sigue del handoff 17/20).
Implementado y validado por SQL pero falta smoke + commit. El handoff 22
NO lo abordó.

P3.2. **Tasks comunes del doc 18.** No afectan Q1, sigue del handoff 20:
- Sumar columna `sport` a `profiles` (nullable text). 1 migración chica.
- Refactor del header de `StudentDetailPage` para usar `avatar_url` real.
- Reorganización de tabs (10→7 con "Más ▾"). Decisión: opción suave en V1.

P3.3. **Sin tests para las 4 alertas G2 nuevas** (`computeFatigueStudents`,
`computeLowMotivationStudents`, `computePainStudents`,
`computeStagnationByExercise`). Sigue del handoff 20.

P3.4. **F5 (resumen semanal alumno)** — el componente del banner
motivacional + KPIs del Panel del alumno se pueden reusar cuando llegue
F5. Diseño deliberado de doc 19 (D5). Sigue del handoff 20.

P3.5. **C.6 deferido** — calendario semanal embebido en `StudentPanel`.
Overlap con `MonthlyCalendar` global, baja prioridad. Si Anto pide
específicamente la vista semanal por alumno, reabrir. Sigue del handoff 20.

## Diferencias deliberadas entre strength / aerobic / circuit (Q1)

Franco preguntó explícitamente si las diferencias entre tipos de bloque se
contemplaron al implementar Q1. Sí, pero se resolvieron distinto en cada uno
porque los modelos de datos son distintos. Acá la matriz completa para que
un agente futuro NO confunda los flujos.

### Modelo de datos subyacente

| Tipo | Tablas que se loggean | Unidad de "ejercicio" |
|---|---|---|
| **strength** | 1 `workout_log` por ejercicio (peso/reps/PSE por serie) | Cada `plan_exercise` con su `exercise_id` |
| **aerobic** | 1 `workout_block_log` por bloque (min/rondas/PSE) | Block-level. `block.plan_exercises[0]` suele ser el "ejercicio principal" ("Trote", "Bici"). |
| **circuit** | 1 `workout_block_log` por bloque + N `workout_logs` por ejercicio del circuito | Doble: bloque (stats agregados) + cada item del circuito (su propio `exercise_id`). |

### Qué muestra "Última vez" en el header

| Tipo | Fuente | Formato |
|---|---|---|
| **strength** | `lastLogByExercise.get(exercise_id)` | `formatLastLogSummary` → "22.5kg · 8r · PSE 8" |
| **aerobic** | `lastBlockLogByBlock.get(plan_block_id)` | `formatLastBlockLogSummary` → "20 min · 3 rondas · PSE 7" |
| **circuit (header bloque)** | `lastBlockLogByBlock.get(plan_block_id)` | mismo que aerobic. Badge chat **omitido** acá (no hay 1 ejercicio canónico). |
| **circuit (cada item)** | `lastLogByExercise.get(item.exercise_id)` | mismo que strength, en modo `isCompact` (font [10px]). |

### Qué muestra "Última nota coach + Ver chat completo" (body expandido)

| Tipo | `ExerciseHistoryBodyBlock` (panel rosa con nota completa) | Cómo se abre el drawer |
|---|---|---|
| **strength** | ✅ Sí, antes de la técnica | Badge `💬N` en header (no expand) o botón "Ver chat" en body |
| **aerobic** | ✅ Sí, antes de la ficha del bloque. Solo si `plan_exercises[0]?.exercise_id` existe | Badge `💬N` en header (usa el exercise_id del primer plan_ex) o botón "Ver chat" en body |
| **circuit** | ❌ **NO se sumó** — sería 4-6 paneles apilados dentro del mismo body, saturado | Badge `💬N` por cada item del circuito, en su línea compacta |

### Decisiones deliberadas (no son bugs)

1. **Circuit no tiene panel `ExerciseHistoryBodyBlock`.** Cada ítem del
   circuito tiene su badge chat compacto en la línea de "Última vez", y desde
   ahí se abre el drawer del ejercicio. Si un alumno quiere ver la última nota
   del coach completa sin abrir el drawer, tiene que mirar el badge y abrir
   el drawer (1 click). El razonamiento: 4-6 paneles rosados apilados dentro
   del body de un circuito sería ruido visual fuerte.

2. **Aerobic con MÚLTIPLES `plan_exercises[]` (caso raro).** Solo el primero
   recibe badge chat. Los otros no tienen forma de abrir su chat desde el
   flow workout — el alumno tendría que ir al panel de Notas global. La
   mayoría de los aerobic tienen 0 o 1 `plan_exercise` así que no debería
   ser problema en práctica.

3. **Aerobic sin `plan_exercises[]` (block puro).** No se muestra badge chat
   ni body block. Solo el preview block-level del "Última vez". Coherente con
   el modelo: si no hay exercise_id, no hay thread asociable.

4. **Circuit cuyo block_log NO está completed pero items SÍ.** El header
   del bloque NO muestra "Última vez" (filtro `completed=true`), pero los
   items del circuito sí muestran su línea compacta porque sus
   `workout_logs` están completed. Comportamiento idéntico a strength.

5. **Aerobic/circuit usan el mismo cap de query que strength** (300 logs +
   200 block_logs). Para alumnos con muchas sesiones de cardio podría no
   alcanzar — pero el corte es por fecha más reciente, así que el
   "Última vez" de los últimos 6-12 meses está cubierto holgadamente.

## Decisiones de Anto vigentes (sin cambios)

- Q1 resp 2 ya aplicada: nota del COACH + últimos pesos por alumno (NO notas
  del alumno).
- Q2 resp 1: aplicada en handoff 20 (tildes ✓✓◐).

## Defensa contra confusión futura

- **TodayWorkoutPage sigue siendo la página más densa del proyecto** (~1100
  LOC tras esta sesión, +90 LOC). Cualquier cambio ahí mantiene la regla del
  handoff 20: tests + smoke obligatorios.
- **El preview Q1 vive en 3 lugares**: header del ExerciseCard (siempre
  visible), body expandido del ExerciseCard (al expandir), y en
  Aerobic/Circuit dentro de los respectivos cards. Si un agente futuro toca
  alguno de esos 5 archivos (`ExerciseCard`, `StrengthBlockRunCard`,
  `AerobicBlockRunCard`, `CircuitBlockRunCard`, `BlockRenderer`), debe
  preservar la propagación de los 4 mapas Q1 +  `onOpenChat`.
- **El cache del drawer (notesByExercise) viene precomputado desde
  TodayWorkoutPage**, así que el drawer abre instantáneo. Si en V2 alguien
  sumara realtime al thread del ejercicio, debería invalidar este cache.
- **`exercise_id` global vs `plan_exercise_id`**: doc 21 explica por qué se
  eligió global. Si un alumno tiene un plan con el MISMO ejercicio en dos
  días y nota algo raro, el comportamiento es intencional (no bug).
- **`logged_date < selectedDate` (no `<=`)**: clave para que el preview no
  refleje el log que el alumno acaba de cargar. Si alguien lo cambia a `<=`
  sin saber, la "Última vez" se va a duplicar con la info del header del
  card.

## Trampas técnicas conocidas (siguen del doc 17/20)

- husky/lint-staged falla en sandbox. Commits desde terminal con `--no-verify`.
- `.git/index.lock` huérfano → `rm -f .git/index.lock` antes del commit.
- `notifications.type` (no `kind`). 12 tipos en el CHECK. Si se suma uno:
  ampliar CHECK + TYPE_CONFIG + `getNotificationTargetUrl` en
  `NotificationBell.jsx`.
- `dist/` está locked en el sandbox: build directo falla, usar outDir
  alternativo.
- `vitest.config.js.timestamp-*.mjs` y `vite.config.js.timestamp-*.mjs` son
  residuos untracked. NO commitear. Falta entry en .gitignore.

## Tasks list al cierre

- ✅ Pre-flight (handoff 20 + Supabase + browser francellone + git log)
- ✅ Inspección de TodayWorkoutPage + modelo notes/threads + workout_logs
- ✅ Mini-plan A/B/C de layout Q1 (doc 21) + decisión Franco vía
  AskUserQuestion
- ✅ Implementación Opción C (helpers + componentes + integración + strength
  + aerobic + circuit)
- ✅ Lint (0 errors) + tests (212/212) + build (OK con outDir alt)
- ✅ Smoke browser end-to-end **strength** (Franco-alumno, thruster barbell
  con 3 mensajes + ejercicios sin chat sin badge, ambas entradas al drawer
  funcionan, exclusión `logged_date < selectedDate` verificada)
- 🟡 Smoke browser **aerobic** — pendiente P0.1 (plan de Franco no tiene)
- 🟡 Smoke browser **circuit** — pendiente P0.2 (plan de Franco no tiene)
- ⏭ 3 commits + push (Franco con `--no-verify`) — P0.3
- ⏭ Composer en drawer (P1.1, V2 si Anto lo pide)
- ⏭ Q6 smoke (P3.1, sigue del handoff 17/20)

## TL;DR para el próximo agente

**Lo que está listo y validado:**
- Q1 strength end-to-end (código + tests + build + smoke browser real con
  alumno Franco).
- Última vez + última nota coach + drawer chat funcionan desde 2 entradas
  (badge en header, botón en body expandido).

**Lo que está implementado pero NO smoke-validado:**
- Q1 aerobic — código + tests pasan, falta browser.
- Q1 circuit — código + tests pasan, falta browser.

**Lo que es trabajo activo del próximo agente:**
1. (P0.1) Smoke aerobic con un alumno que tenga ese tipo de bloque.
2. (P0.2) Smoke circuit con un alumno que tenga ese tipo de bloque.
3. (P0.3) Confirmar que los 3 commits de esta sesión se pushearon.

**Lo que NO es trabajo activo pero hay que tener presente:**
- Lista completa P1/P2/P3 en §Pendientes. Ninguno bloquea Q1 strength.
- Las decisiones deliberadas de §Diferencias — NO cambiar circuit ni
  aerobic sin pedido explícito de Anto.
