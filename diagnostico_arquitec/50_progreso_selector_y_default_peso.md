# 50 — Progreso: selector de ejercicios completo + default inteligente del gráfico de peso

Fecha: 2026-06-13
Autor: agente (sesión Franco)
Relacionado: doc 49 (última vez cross-plan)

## Contexto

Franco: "creo que en progreso solo me aparecen los ejercicios del plan actual" +
"el gráfico de peso me sale como una sola carga, no como volumen o PSE".

Verificado contra datos reales (`francellone@gmail.com`, training only):
- Ejercicios entrenados totales: **64**.
- En la ventana default de 30 días: **46**. En 3m/All: 64.

O sea NO era por plan: `ProgressPage` nunca filtró por plan_id. El selector se
armaba desde los logs de la ventana (`period`, default 30d), así que los ~18
ejercicios no entrenados en el último mes desaparecían → parecía "solo el plan
actual" porque PLAN 12 (07/06) domina lo reciente.

El gráfico de peso "una sola carga": es por **ejercicio seleccionado** (solo
peso>0), mientras volumen/PSE agregan todas las sesiones. Encima el selector
arrancaba en el **primer ejercicio alfabético**, que tras un plan nuevo suele
tener 1 solo registro.

## Cambios (ProgressPage.jsx)

1. **Selector independiente del período.** Nuevo estado `allExercises` + effect que
   trae la lista COMPLETA de ejercicios entrenados del alumno (query liviana de
   todos sus workout_logs, training only, dedup client-side), una vez por alumno.
   El selector (`exercisesForTag`), el reset por etiqueta y el lookup de nombre del
   card "peso máximo" ahora usan `allExercises` en vez de la lista windowed.
   Se eliminó el estado `exercises` (windowed) que quedó sin lecturas.
2. **Default inteligente.** Al primer load, `selectedExercise` se setea al ejercicio
   con MÁS puntos de peso (peso>0) en la ventana actual, con fallback al primero
   alfabético. Antes era siempre el primero alfabético.
3. **Hint de período.** En el gráfico de peso, si `weightData.length <= 1` y el
   período no es "Todo" (365d), se muestra "Pocos registros en este período. Probá
   ampliar arriba (3m / 6m / Todo)." (i18n `progress.widenPeriodHint`, es+en).

## Lo que NO cambió

- El gráfico de peso sigue siendo por ejercicio (es lo correcto) y cross-plan (ya
  lo era). Volumen/PSE siguen agregando por sesión.
- Los datos del chart siguen acotados por `period`. Si el alumno elige un ejercicio
  sin datos en la ventana, ve el empty state + el hint para ampliar.

## Validación

- 310 tests passing (no hay tests específicos de ProgressPage; suite completa verde).
- eslint sobre el archivo: 0 errores (3 warnings preexistentes del patrón del archivo).
- build limpio.
- Smoke en prod pendiente: abrir Progreso del lado alumno, confirmar que el selector
  lista los 64 ejercicios y que el gráfico arranca en uno con historial.
