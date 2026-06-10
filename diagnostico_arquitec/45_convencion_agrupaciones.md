# Convención de agrupaciones (supersets) y pausas — para coaches y para el código

Fecha: 2026-06-10. Origen: pedido de la coach Anto (vía Franco), ronda 6, ítem **B9** (ver doc 13).

## El concepto (para futuros coaches)

Cuando armás un día de fuerza podés **agrupar** ejercicios con una **letra**:

- La **letra** (A, B, C…) define un grupo / serie compuesta (superset).
- El **número** (A**1**, A**2**, A**3**) es el orden dentro del grupo.
- Los ejercicios de un mismo grupo se hacen **encadenados, sin pausa entre ellos**: hacés A1, después A2, después A3, y recién ahí descansás.
- La **pausa es del grupo** (después de terminar la vuelta), **no entre serie y serie** de cada ejercicio.

Por eso, cuando cargás el **descanso** de un ejercicio que tiene letra, ese descanso es la pausa del bloque entero. Lo cargás en el primer ejercicio del grupo (el nº1) y el sistema lo **hereda** a los demás (A2, A3…). En el editor te aparece un cartel recordándotelo apenas le asignás una letra.

Si un ejercicio **no tiene letra** (o tiene una letra que usás una sola vez), es un ejercicio **suelto**: ahí el descanso sí es **entre series**, como toda la vida.

### Ejemplo

```
Bloque A (superset, sin pausa entre ellos):
  A1  Sentadilla        3×8
  A2  Remo              3×10
  → al terminar A2: descansá 1m30s y repetí la vuelta   ← pausa del grupo

Hamstring Curl          3×12  · descanso 1min entre series   ← ejercicio suelto
```

## Cómo lo ve el alumno

En el día de entrenamiento, los ejercicios de un mismo grupo se muestran **dentro de un sub-bloque "Bloque A · sin pausa entre ejercicios"**, y la pausa aparece **una sola vez al pie del grupo** ("al terminar el bloque: descansá X y repetí la vuelta"). Los ejercicios sueltos muestran su pausa como "descanso X entre series".

Antes (bug B8, junio 2026) la pausa no se mostraba; el primer fix la mostró pero colgada de cada ejercicio, lo que daba a entender que era entre series. B9 lo corrige reagrupando.

## Cómo está modelado (para el código)

- En la **base** sólo existe `plan_exercises.block_label` (texto, ej. `"A1"`) y `block_id`. **No** hay columnas `block_letter`/`block_number`: el front las parsea del `block_label` al cargar el editor.
- La **herencia** de pausa/series del nº1 al resto la hace `inheritFromFirstBlockmate` en `src/features/plans/helpers.js` (sistema Q7 de auto-numeración A1/A2).
- El **agrupamiento del run-side** lo hace `groupStrengthExercises` en `src/features/workouts/helpers.js`: parte la lista ordenada de un bloque strength en items `solo` / `group` (letra + número consecutivos). Una letra que aparece sola → `solo`.
- Datos al 2026-06-10 (training): **72 grupos multi-ejercicio** reales vs 26 letras usadas una sola vez. La convención se usa mucho.

### Archivos
- `src/features/workouts/helpers.js` — `parseBlockLetter`, `groupStrengthExercises` (+ tests en `helpers.test.js`).
- `src/features/workouts/components/StrengthBlockRunCard.jsx` — render del sub-bloque y el pie de pausa.
- `src/features/workouts/components/ExerciseCard.jsx` — prop `restScope` (`'set'` muestra "entre series"; `'group'` no muestra la pausa, la pone el pie del grupo).
- `src/features/plans/components/PlanExerciseRow.jsx` — cartel al coach cuando el ejercicio tiene letra.

### Gotchas
- La pausa del grupo se toma del **primer `rest_time` no vacío** del grupo (normalmente el nº1). Si el coach deja todos vacíos, no se muestra pie de pausa.
- El agrupamiento es por letras **consecutivas**. Si quedan A1 … B1 … A2 (no consecutivos), no se agrupan: hay un warning de orden en el editor (`DayBlocksOrderWarning`) que ayuda a compactar.
- `block_label` puede ser texto libre (`"Activación"`, `"Core"`): no matchea letra+número → se trata como suelto, sin romperse.
