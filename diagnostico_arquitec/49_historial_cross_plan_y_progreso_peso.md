# 49 — "Última vez" cross-plan + diagnóstico del gráfico de peso

Fecha: 2026-06-13
Autor: agente (sesión Franco)
Relacionado: doc 21 (Q1 "última vez" + chat), doc 48 (trazabilidad prescripción)

## Síntoma reportado (Franco)

> "Cuando veo un ejercicio no me aparece todo el historial sino el historial
> asociado a un plan, por lo menos del lado del student. Tipo último peso del
> ejercicio. Y en progreso, cuando veo peso me sale una sola carga, no como en
> volumen o PSE."

Dos cosas distintas. Verificadas contra datos reales del alumno
`francellone@gmail.com` (`d7a1ceb5-...`, 397 logs, 3 planes, abril→hoy).

---

## Hallazgo 1 — "Última vez" del card era plan-scoped (BUG → corregido)

`TodayWorkoutPage.jsx` alimentaba el header "última vez: Xkg · Yr" con una query
que filtraba `.eq('plan_id', assignData.plan_id)`. O sea, solo miraba logs del
**plan activo**. Cuando un ejercicio se arrastra a un plan nuevo (mesociclo
nuevo), su historial del plan anterior dejaba de verse.

Además el reductor `pickLastLogPerExercise` mapeaba `plan_exercise_id →
exercise_id` usando solo los `plan_exercises` del plan activo, así que aunque se
quitara el filtro de la query, igual descartaría logs de otros planes.

NO era una regresión: el filtro está desde el commit original de Q1 (`8be6792`).
Lo que cambió es la situación de Franco: ahora tiene un plan nuevo (PLAN 12,
creado 07/06) y por primera vez un mismo ejercicio cruza dos planes.

La doc de Q1 decía "por exercise_id global", pero la implementación nunca fue
cross-plan: era cross-día dentro del mismo plan. **Diferencia doc vs. realidad.**

### Prueba (Sentadilla Con Barra)

Un solo `exercise_id` de catálogo (`3f22fc33`) compartido entre PLAN 11 y PLAN 12:

| Fecha | Plan | Pesos |
|---|---|---|
| 10/06 | PLAN 12 (activo) | 30·40·40·40 |
| 25/05 | PLAN 11 | 25·30·30 |
| 18/05 | PLAN 11 | 25·30·30 |
| 11/05 | PLAN 11 | 25·30·30 |
| 04/05 | PLAN 11 | 25·30·30 |

El header en PLAN 12 solo mostraba el 10/06; los 4 de PLAN 11 quedaban invisibles.
Confirmado que el `exercise_id` ES el mismo entre planes → la causa es el filtro,
no ejercicios duplicados.

### Fix aplicado

1. `TodayWorkoutPage.jsx` query `recentExerciseLogs`: se quita `.eq('plan_id', …)`
   y se embebe `plan_exercise:plan_exercises!plan_exercise_id(exercise_id)` en el
   select. Ahora trae logs completos de TODOS los planes del alumno.
2. `exerciseHistoryLogic.js` `pickLastLogPerExercise`: resuelve el `exercise_id`
   desde el join embebido (`log.plan_exercise.exercise_id`) con fallback al mapa
   `planExercises` (para no romper tests ni otros callers).

### Lo que NO se tocó

- `recentLogs` (tildes Q2 de día completado): sigue plan-scoped. Correcto: las
  tildes son sobre el plan activo.
- `recentBlockLogs` (aerobic/circuit "última vez"): sigue plan-scoped. Los
  block_logs se agrupan por `plan_block_id`, que es específico de cada plan; los
  bloques no tienen identidad cross-plan estable como `exercise_id`. Queda como
  deuda menor si alguna vez se quiere "última vez" cross-plan para bloques.

---

## Hallazgo 2 — Gráfico de peso "una sola carga" (NO es bug)

`ProgressPage.jsx` arma los gráficos con dos lógicas distintas:

- **Peso** (`weightData`, línea ~283): filtra por `selectedExercise` → un solo
  ejercicio, y solo logs con peso > 0. Un punto por fecha de ese ejercicio.
- **Volumen / PSE** (`volumeData` / `pseData`): agregan TODAS las sesiones del
  período por fecha. Muchos más puntos.

Por eso peso "se ve vacío/una sola carga" y volumen/PSE se ven llenos: son
escalas distintas (por-ejercicio vs por-sesión).

Encima:

- El selector de ejercicio arranca en el **primero alfabético** (`exList[0]`), que
  puede ser uno con un solo log en la ventana.
- La ventana default son **30 días**. PLAN 12 arrancó el 07/06, así que casi todos
  los ejercicios del plan nuevo tienen 1 solo log → 1 punto.
- Ejercicios bodyweight (peso 0) → gráfico de peso vacío.

Importante: el gráfico de peso **sí es cross-plan** (no filtra por plan, solo por
ventana temporal). Sentadilla muestra 3 puntos en 30d y los 5 con 3m/6m/All.

### Opcional (no implementado todavía)

- Default de `selectedExercise` más inteligente: elegir el ejercicio con más
  puntos de peso en la ventana, en vez del primero alfabético.
- Hint visual cuando el ejercicio elegido tiene ≤1 punto ("poco historial en este
  período, probá 3m/6m").

---

## Validación

- Tests `exerciseHistoryLogic.test.js` + caso nuevo cross-plan (join embebido).
- Smoke en prod pendiente: abrir Sentadilla del lado alumno y confirmar que el
  header muestra la última vez del plan anterior.
