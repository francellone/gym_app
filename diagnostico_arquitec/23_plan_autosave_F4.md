# Plan 23 — F4 Autosave de series en TodayWorkoutPage (Opción A: localStorage)

> Continuación de doc 13 §F4. El item arrastraba pendiente desde el 21/05
> porque Anto no respondió la pregunta #3 del cuestionario (autosave). Franco
> destrabó la decisión el 24/05 madrugada: se elige **Opción A — localStorage**
> sin esperar a Anto, porque la decisión es UX interna del alumno y no afecta
> reports / dashboards del coach.

---

## 1. Contexto y problema

**Pedido literal Anto (doc 13 §F4):**

> *"Guardado automático en ejercicios. Problema: cuando salgo de la app o
> bloqueo celular si escribí sólo el registro de una serie, cuando vuelvo a
> entrar ya se borró."*

**Estado actual del código (verificado 24/05 madrugada en `ExerciseCard.jsx`):**

- `logData` vive 100% en `useState` local del componente (líneas 149-162):
  `actual_sets`, `actual_reps_arr`, `actual_weights_arr`, `perceived_difficulty`,
  `notes`, `completed`, `weight_mode`, `unilateral`, `reps_unit`.
- Los `onChange` de cada input (`handleRepsChange`, `handleWeightChange`,
  `handleSetsChange`) actualizan solo `setLogData` — nunca tocan
  Supabase ni localStorage.
- El único disparador del save es el click en "Guardar" del propio card,
  que llama `attemptSave → doSave → onSaveLog(planEx.id, data)` con
  `p_completed: true` hardcoded en `buildSaveData()` (línea 285).
- Si el alumno cierra el browser / bloquea pantalla / cambia de pestaña antes
  de clickear "Guardar", se pierde el estado completo del card.
- El mismo patrón aplica a `CircuitBlockRunCard.jsx` (ítems del circuito) y a
  `AerobicBlockRunCard.jsx` (campos block-level).

**Por qué es bug-feel para el alumno:** durante una sesión de gym es habitual
bloquear la pantalla entre series para no agotar batería. Hoy esa acción
descarta cualquier número tipeado parcialmente.

---

## 2. Análisis comparativo de las 3 opciones

| Criterio | A — localStorage | B — BD on-blur | C — BD on-debounce 1.5s |
|---|---|---|---|
| Persistencia | Por dispositivo / browser | BD (cross-device) | BD (cross-device) |
| Tráfico de red | 0 hits extra | 1 hit por cada `blur` (~4-8 por ejercicio) | 1 hit por cada pausa ≥1.5s |
| Toca tabla `workout_logs` | No | Sí (`completed=false` rows) | Sí (`completed=false` rows) |
| Toca RPC `save_workout_log` | No | Sí (reusa la actual) | Sí (reusa la actual) |
| Afecta queries existentes que no filtran `completed=true` | No | Sí — auditoría obligatoria | Sí — auditoría obligatoria |
| Afecta dashboards / alertas G2 / adherencia | No | Sí — re-validar todo | Sí — re-validar todo |
| Cleanup de drafts huérfanos | TTL local + barrido al guardar | Requiere cron + UX de historial | Requiere cron + UX de historial |
| Requiere decisión UX adicional de Anto | No | Sí (drafts en historial) | Sí (drafts en historial) |
| Esfuerzo neto | ~4h (1 hook + 1 wire-up + tests) | ~12h (BD policies + UX historial + cleanup) | ~14h (idem B + debounce + cancelación de pending saves) |
| Riesgo de regresión silenciosa | Bajo | Medio-alto | Medio-alto |
| Resuelve el caso real "bloqueo celular 30s entre series" | Sí | Sí | Sí |
| Falla si: cambio de dispositivo | Sí | No | No |
| Falla si: limpieza de caché | Sí | No | No |
| Falla si: PWA en modo privado iOS | Sí (degrada a estado actual) | No | No |

**Lectura horizontal:** B y C son técnicamente más completos en cobertura
("cross-device"), pero el caso real que motiva el ticket — bloqueo de pantalla
entre series — se resuelve idéntico con A y a un orden de magnitud menos de
riesgo estructural.

**Lectura vertical de riesgos de B/C:** ambas opciones escriben filas en
`workout_logs` con `completed=false`. Eso obliga a:

1. Auditar todas las queries que asumen "una fila en `workout_logs` =
   entrenamiento real": `recent_exercise_logs`, alertas G2 (estancamiento,
   fatiga, motivación, dolor), adherencia semanal, historial del alumno,
   dashboards del coach, KPIs del panel del alumno.
2. Definir TTL / cleanup de drafts huérfanos (alumno que abrió 5 ejercicios
   y dejó 3 a medias).
3. Decidir UX: ¿el draft aparece en historial como "parcial"? Si sí, el coach
   ve registros que el alumno nunca consideró válidos. Si no, se pierde la
   señal de "el alumno arrancó pero abandonó".
4. Tener un cron de limpieza de drafts viejos (o un trigger que los descarte
   al insertar el log final del mismo `plan_exercise_id` + `logged_date`).

Cada uno de esos puntos abre múltiples ramas de decisión. Doc 13 estimaba
implementación pura de C en 4h, pero eso ignora la auditoría de queries +
backlog de UX.

---

## 3. Decisión: Opción A — localStorage

**Por qué A:**

- Resuelve el caso real con cero riesgo estructural. Ninguna query de BD
  cambia, ninguna policy RLS cambia, ningún dashboard cambia, ningún cron
  nuevo, ningún tipo de "registro parcial" en historial.
- El draft vive en el dispositivo del alumno hasta que cierra el ejercicio
  con "Guardar" (entonces el save real con `completed=true` corre como hoy y
  el draft se borra) o expira por TTL.
- La superficie de código modificada es chica y aislada: 1 hook nuevo
  (`useLocalStorageDraft`) + wire-up en `ExerciseCard.jsx`. Reversible en
  2 commits si algo se va a la banquina.

**Por qué se descarta C (la "recomendada" originalmente en doc 13):**

- C era recomendada antes de que existiera la matriz de alertas G2 + el
  refactor de notas. Hoy hay 8+ queries que dependen de `completed=true` y
  cualquier una que se nos olvide auditar se convierte en bug silencioso
  (drafts contados como entrenamientos reales).
- El upside cross-device es marginal en uso real: un alumno entrena en su
  celular y vuelve al mismo celular. Cambio de dispositivo durante una sesión
  de gym es escenario teórico, no observado.
- Si en algún momento se vuelve crítico cross-device, A no bloquea C —
  el draft del localStorage se puede migrar a BD sin tocar la UX del alumno.

**Por qué se descarta B:**

- Es estrictamente peor que C en performance (1 hit por blur ≈ 4-8 hits por
  ejercicio vs. 1-3 con debounce) y tiene los mismos riesgos estructurales.
  Si elegimos pegar BD, es por C, no por B.

**Trade-offs aceptados de A (documentados para no re-discutir):**

| Trade-off | Mitigación |
|---|---|
| No cross-device | El TTL corto (8h) limita el tiempo de exposición. Si el alumno cambia de dispositivo, el draft del viejo expira o se borra al primer save manual. |
| Pérdida si limpia caché del browser | Habitual sólo si el alumno explícitamente borra datos. Es una acción consciente. |
| Pérdida si rompe el celular | C tampoco lo cubre (sólo te ahorra ~1.5s de ventana). Out of scope. |
| iOS Safari modo privado bloquea localStorage | Try/catch alrededor del hook — degrada al comportamiento actual (sin draft) sin romper la UI. |

---

## 4. Diseño técnico de la Opción A

### 4.1 Hook nuevo: `useLocalStorageDraft`

Archivo nuevo: `src/features/workouts/hooks/useLocalStorageDraft.js`

**Firma:**

```js
useLocalStorageDraft({ key, value, enabled, ttlMs })
  // → { restoredOnce, clearDraft }
```

**Comportamiento:**

- **Al mount:** lee `localStorage[key]`. Si existe y no está expirado, hace
  callback con el payload (`onRestore`) y setea `restoredOnce=true`. Si está
  expirado, lo borra silenciosamente.
- **Al cambiar `value`:** debounced 400ms, escribe a `localStorage[key]` un
  envelope `{ v: 1, savedAt: ISO, payload: value }`. 400ms es suficiente para
  que la app pueda hacer flush incluso en `beforeunload`.
- **`clearDraft()`:** llama `localStorage.removeItem(key)` y resetea estado.
- **Errores:** todo wrappeado en try/catch. Si Safari privado o cuota
  excedida, loguea `console.warn` una vez por sesión y degrada (no draft).
- **`enabled=false`:** noop. Para casos donde un padre quiera deshabilitar
  draft (ej. cuando el alumno está editando un log YA guardado).

### 4.2 Key del localStorage

**Convención:**

```
gym_app:workout_draft:v1:{studentId}:{planExerciseId}:{loggedDate}
```

Ejemplo:
```
gym_app:workout_draft:v1:9f7c1c7e-...:b3a2-...:2026-05-24
```

**Decisiones de la key:**

- `gym_app:` prefijo namespaceado para no colisionar con otros features.
- `workout_draft:` namespace del feature.
- `v1:` versión del schema. Si en V2 cambia el shape del payload, subimos
  a v2 y barremos las claves v1 al boot.
- `studentId` evita colisiones si el browser está compartido (caso raro,
  pero alumno que se loguea con la cuenta de Anto-coach para probar algo
  no debería contaminar drafts).
- `planExerciseId` granularidad mínima razonable — un draft por ejercicio
  del plan, no por bloque ni por día completo.
- `loggedDate` evita que el draft de hoy contamine la carga de mañana del
  mismo ejercicio (caso real: alumno tipea hoy 10am, vuelve mañana sin
  guardar).

### 4.3 Schema del payload

```ts
{
  v: 1,                            // schema version
  savedAt: "2026-05-24T13:42:11Z", // ISO para TTL
  payload: {
    actual_sets: "3",
    actual_reps_arr: ["10", "8", ""],
    actual_weights_arr: ["22.5", "22.5", ""],
    perceived_difficulty: null,
    notes: "se sintió más liviano",
    weight_mode: "with_weight",
    unilateral: false,
    reps_unit: null,
    // NO incluye `completed` — drafts nunca son completed
  }
}
```

**Qué NO va al draft:**

- `completed`: hardcoded `false` en el draft. Si el log ya está completed,
  el hook se deshabilita (`enabled=!log?.completed`).
- IDs (`log.id`): si el alumno tiene un log previo del día, el draft no debe
  pisarlo silenciosamente — sólo aplica a cards "vírgenes".

### 4.4 TTL

**Valor:** 8 horas desde `savedAt`.

**Razonamiento:**

- Una sesión típica de gym dura 60-90 min. 8h cubre el caso "el alumno arranca
  a las 7am, frena por una urgencia, vuelve a las 13hs a terminar".
- Más de 8h ya no es una sesión interrumpida — es un cambio de día / olvido.
  Restaurar un draft de hace 24h tipearía valores potencialmente desactualizados.
- Si el TTL expira mientras la app está abierta, el próximo flush lo
  sobrescribe con un draft nuevo. No hay caso de zombie persistente.

### 4.5 Ciclo de vida del draft

```
┌─────────────────────────────────────────────────────────────┐
│ Alumno abre TodayWorkoutPage del día D                      │
│   ↓                                                          │
│ Mount ExerciseCard del plan_exercise PE                     │
│   ↓                                                          │
│ Si !log[PE] && hay draft en localStorage[key(PE,D)] ÷ TTL   │
│   → setLogData(draft.payload)                                │
│   → setEditing(true)  // entra directo en modo edición       │
│   → muestra hint "Restauramos lo que estabas cargando"       │
│                                                              │
│ Alumno tipea reps/peso/etc                                   │
│   ↓                                                          │
│ Cada onChange: setLogData(...) → debounced 400ms             │
│   ↓                                                          │
│ flush a localStorage con envelope { v:1, savedAt, payload }  │
│                                                              │
│ Caso A: alumno bloquea pantalla / cambia tab / cierra app    │
│   ↓                                                          │
│ Draft sobrevive en localStorage                              │
│   ↓                                                          │
│ Próxima vez que abre TodayWorkoutPage del mismo día          │
│   → hook restaura el draft (si TTL ok)                       │
│                                                              │
│ Caso B: alumno clickea "Guardar"                             │
│   ↓                                                          │
│ attemptSave → doSave → onSaveLog (RPC con completed=true)    │
│   ↓ (en éxito)                                               │
│ clearDraft() → localStorage.removeItem(key)                  │
│                                                              │
│ Caso C: alumno clickea "Eliminar"                            │
│   ↓                                                          │
│ onDeleteLog (en éxito) → clearDraft()                        │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 Hint de restauración

Cuando el hook restaura un draft, el card debe mostrar un badge sutil arriba
del bloque de inputs:

> 🔄 Recuperamos lo que estabas cargando (hace 12 min) — [Descartar]

- Texto en `text-xs text-slate-500 bg-amber-50 border border-amber-200`.
- Tiempo relativo calculado con `formatRelativeDate` del helper
  `exerciseHistoryLogic.js` (ya existe, reutilizable).
- Botón "Descartar" llama `clearDraft()` y resetea `logData` a la
  inicialización default (sugeridos del coach).
- El hint se oculta automáticamente cuando el alumno empieza a editar
  (primer onChange) o tras 8 segundos.

**Justificación:** sin hint, el alumno se confunde al ver datos que no
recuerda haber tipeado en otra sesión. El badge "Recuperamos" hace explícito
que es una restauración y deja salida fácil.

### 4.7 Conflict resolution: draft vs `log` ya en BD

| Caso | Comportamiento |
|---|---|
| Existe `log[PE]` con `completed=true` Y hay draft local | **El log gana.** El hook ignora el draft, no muestra hint, y se borra el draft (cleanup oportunista). |
| Existe `log[PE]` con `completed=false` (improbable pero posible) Y hay draft local | El log gana (es el más reciente confirmado por el server). Se borra el draft. |
| No existe log Y hay draft local NO expirado | El draft se restaura, se muestra hint. |
| No existe log Y hay draft local expirado | Se borra el draft, no se muestra hint, card vacío con sugeridos del coach. |

### 4.8 Scope V1: solo strength

**V1 (este plan):** solo `ExerciseCard.jsx` (strength). Por qué:

- Es el caso más común y el explícitamente mencionado por Anto.
- `CircuitBlockRunCard.jsx` (533 LOC) y `AerobicBlockRunCard.jsx` (366 LOC)
  tienen state shape distinto (`workout_block_log` vs `workout_log`) y la
  abstracción del hook puede reusarse después pero hay que decidir
  granularidad (¿draft por bloque? ¿por ítem del circuit?).
- Total LOC tocado V1: ~120 LOC nuevos + ~30 LOC modificados. Bajo radar
  del refactor protocol.

**V2 (deferred):** sumar a Aerobic + Circuit cuando V1 esté estable. Plan
separado si surge el pedido.

### 4.9 Cleanup oportunista

Al boot de `TodayWorkoutPage`, después del fetch inicial, barrer keys que:

- Tengan `loggedDate < hoy - 7d` (drafts de la semana pasada que nunca se
  cerraron — basura silenciosa).
- Tengan `studentId !== profile.id` (cambios de cuenta en mismo browser).
- No parseen correctamente (rotos / migrados manualmente).

Esto es defensivo, corre 1 vez por carga, costo despreciable.

---

## 5. Archivos a tocar

### Nuevos

```
src/features/workouts/hooks/useLocalStorageDraft.js     (~80 LOC)
src/features/workouts/hooks/useLocalStorageDraft.test.js (~120 LOC)
src/features/workouts/draftStorage.js                    (~60 LOC, helpers puros)
src/features/workouts/draftStorage.test.js               (~100 LOC)
```

`draftStorage.js` aísla la lógica de key building, schema validation,
TTL check, y cleanup oportunista. Funciones puras testeables sin DOM.

### Modificados

```
src/features/workouts/components/ExerciseCard.jsx        (+~30 LOC)
src/features/workouts/pages/TodayWorkoutPage.jsx         (+~5 LOC para cleanup)
```

En `ExerciseCard.jsx`:

1. Importar `useLocalStorageDraft`.
2. Calcular `draftKey` con `buildDraftKey({ studentId, planExerciseId, loggedDate })`.
3. Llamar al hook con `value: logData`, `enabled: !log?.completed`,
   `onRestore: (payload) => setLogData(payload)`.
4. En `doSave` éxito y `handleDelete` éxito → `clearDraft()`.
5. Render del hint condicional.

En `TodayWorkoutPage.jsx`:

1. Llamar `cleanupStaleDrafts({ studentId, today })` después del fetch inicial.

### NO se toca

- `src/features/workouts/api.js` — la RPC sigue idéntica.
- `src/features/workouts/api.test.js` — sin cambios.
- BD / migrations / RPCs / policies — cero cambios.
- `CircuitBlockRunCard.jsx`, `AerobicBlockRunCard.jsx` — deferred a V2.

---

## 6. Tests

### Unit (vitest, sin DOM)

`draftStorage.test.js`:

- `buildDraftKey` produce la convención esperada.
- `parseDraftEnvelope` rechaza payloads sin `v` o con `v !== 1`.
- `isDraftExpired` con TTL 8h: dentro, exacto, fuera.
- `cleanupStaleDrafts` borra solo claves stale y respeta otras.
- Idempotencia: serializar + deserializar mantiene el payload intacto.

`useLocalStorageDraft.test.js` (con `@testing-library/react`):

- Restaura draft al mount si existe y no expiró.
- No restaura si `enabled=false`.
- Escribe debounced 400ms al cambiar `value`.
- `clearDraft()` borra de localStorage.
- Try/catch funciona si `localStorage` lanza (mock con `Object.defineProperty`).

### Smoke browser (manual, francellone)

Ver §7 checklist abajo.

### Existing suite

- `npm run test:run` debe seguir verde 212/212 (más los nuevos ~40 tests).
- `npm run lint` debe seguir 0 errors. Apuntar a no sumar warnings.

---

## 7. Smoke checklist (browser francellone, alumno francellone@gmail.com)

1. **Restauración básica.** Abrir `/student/workout`, expandir un ejercicio,
   tipear `reps=10, peso=22.5` en serie 1. NO clickear "Guardar". Hard refresh
   (Cmd+Shift+R). El ejercicio debe abrir con el draft restaurado y el hint
   "Recuperamos lo que estabas cargando".
2. **Descartar.** En el escenario anterior, clickear "Descartar". Los inputs
   vuelven a sugeridos del coach. Hard refresh otra vez. El draft no debe
   reaparecer.
3. **Save limpia draft.** Tipear, click "Guardar", verificar en DevTools >
   Application > Local Storage que la key `gym_app:workout_draft:v1:...` se
   eliminó.
4. **Delete limpia draft.** Save → expand → Eliminar → confirmar. Verificar
   en localStorage que la key se eliminó.
5. **TTL expiración.** En DevTools, modificar `savedAt` a hace 9 horas. Hard
   refresh. El draft no debe restaurarse y la key debe haberse eliminado.
6. **Cleanup oportunista.** Crear manualmente una key con `loggedDate` de
   hace 10 días. Refrescar la página. La key debe desaparecer.
7. **iOS Safari privado.** Abrir la app en Safari en modo privado iOS (o
   emular con `Object.defineProperty(window, 'localStorage', { get: () =>
   throw })`). Tipear, refrescar. La UI no se debe romper; el draft no
   restaura (degradación graceful).
8. **Múltiples ejercicios.** Tipear en 2 cards distintos. Refrescar. Los 2
   deben restaurarse independientemente.
9. **Log YA guardado (completed=true) NO restaura draft viejo.** Si el alumno
   ya completó el ejercicio en una sesión previa y por alguna razón hay un
   draft local, el log gana y el draft se borra al mount.
10. **No interfiere con Q1.** Las líneas "⤴ Última vez" + badge `💬N` del
    Q1 madrugada deben seguir funcionando idéntico (no las toca este plan,
    pero verificar visualmente).

---

## 8. Edge cases conocidos

| Edge case | Comportamiento |
|---|---|
| Alumno tiene draft + log con `completed=true` aparece (sync server) | El log gana, draft se borra silenciosamente al mount. |
| `localStorage` lleno (cuota excedida) | Try/catch loguea warn, draft no escribe, UI no se rompe. Alumno queda en el comportamiento actual. |
| Multiples tabs abiertas con el mismo ejercicio | Última escritura gana. No usamos `BroadcastChannel` ni `storage` event en V1 (over-engineering para el caso de uso). |
| Cambio de fecha vía date-picker (`selectedDate`) | La key incluye `loggedDate`, así que el draft de hoy no se mezcla con el de ayer. Cada fecha tiene su propio draft set. |
| Cambio de plan / `plan_exercise_id` cambia | Idem: la key incluye `planExerciseId`. Drafts viejos quedan colgados hasta que el cleanup oportunista los barra (≥7 días). |
| Browser comparte sesión entre alumno y coach (testing) | `studentId` en la key evita contaminación entre cuentas. |
| Draft con shape de v1 cuando el código pasa a v2 | Versionado `v: 1` permite parseo defensivo: si `v !== currentVersion`, se borra. |

---

## 9. Pendientes / V2 (no abordar ahora)

- **P1.1 V2: Aerobic.** Aplicar el mismo patrón a `AerobicBlockRunCard.jsx`.
  Granularidad: 1 draft por `plan_block_id` + fecha. ~3h.
- **P1.2 V2: Circuit.** `CircuitBlockRunCard.jsx`. Granularidad mixta:
  draft por bloque para los campos block-level + draft por ítem del circuito
  para reps/peso de cada exercise. ~5h.
- **P1.3 V2: `beforeunload` flush forzado.** Si el alumno cierra la pestaña
  justo después de un onChange (en la ventana de 400ms del debounce),
  potencialmente pierde lo último tipeado. Forzar flush en `beforeunload`
  con `window.addEventListener`. ~1h.
- **P2.1: Migración a IndexedDB.** Si el caso "más de 10 alumnos en mismo
  device" se vuelve real, IndexedDB tiene cuota más alta y mejor API.
  Refactor del hook con misma interfaz pública. ~4h.
- **P2.2: Sync cross-device opcional.** Si Anto pide explícitamente que el
  draft funcione cross-device, evaluar Opción C diferida (ya con las
  decisiones de UX de historial resueltas). El plan A no bloquea C —
  podemos migrar drafts del localStorage a BD sin tocar la UX del alumno.

---

## 10. Commits sugeridos

```bash
cd ~/Desktop/gym_app/gym_app

# Commit 1: helpers puros + tests
git add \
  src/features/workouts/draftStorage.js \
  src/features/workouts/draftStorage.test.js
git commit --no-verify -m "feat(workouts): helpers de draft local + tests (F4 prep)"

# Commit 2: hook useLocalStorageDraft + tests
git add \
  src/features/workouts/hooks/useLocalStorageDraft.js \
  src/features/workouts/hooks/useLocalStorageDraft.test.js
git commit --no-verify -m "feat(workouts): hook useLocalStorageDraft + tests (F4)"

# Commit 3: wire-up en ExerciseCard + cleanup oportunista
git add \
  src/features/workouts/components/ExerciseCard.jsx \
  src/features/workouts/pages/TodayWorkoutPage.jsx
git commit --no-verify -m "feat(workouts): F4 — autosave local de series en ExerciseCard (Opción A localStorage, doc 23)"

# Commit 4: docs
git add \
  diagnostico_arquitec/23_plan_autosave_F4.md \
  diagnostico_arquitec/24_handoff_proximo_agente_2026-05-24.md  # (cuando exista)
git commit --no-verify -m "docs(diagnostico_arquitec): plan 23 F4 autosave + handoff 24"

git push origin main
```

---

## 11. Acceptance criteria

Para considerar F4 V1 cerrado:

- [ ] `draftStorage.js` + `useLocalStorageDraft.js` con tests verdes (≥30 tests).
- [ ] `npm run test:run` total verde (baseline 212 + nuevos ~40 ≈ 252).
- [ ] `npm run lint` 0 errors. Warnings ≤ baseline 72 + 3 tolerados.
- [ ] Build OK (con `--outDir alt` por el lock de `dist/` en sandbox).
- [ ] Smoke browser §7 — 10/10 escenarios verdes con Franco-alumno.
- [ ] Plan 23 (este doc) commited.
- [ ] Handoff 24 escrito con resultados + pendientes V2.

---

## 12. TL;DR para el próximo agente que retome este plan

**Decisión clave:** F4 se resuelve con Opción A (localStorage) porque
elimina todo el riesgo estructural de B/C sin perder cobertura para el
caso real de Anto (bloqueo de pantalla entre series).

**Implementación:** un hook chico + helpers puros + wire-up en
`ExerciseCard.jsx`. Cero cambios de BD. Scope V1 = solo strength.
Aerobic/Circuit van a V2 si Anto los pide explícito.

**Lo que NO hay que hacer:**

- NO escribir a `workout_logs` con `completed=false`.
- NO tocar la RPC `save_workout_log`.
- NO modificar `recent_exercise_logs` ni ninguna query existente.
- NO sumar drafts en historial / dashboards / alertas G2.
- NO aplicarlo a Aerobic / Circuit en V1 (deferred).
