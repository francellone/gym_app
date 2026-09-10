# Decisiones: catálogo de ejercicios, borrado y archivado

Registro de decisiones de diseño tomadas entre el 6 y el 10 de septiembre de 2026,
a partir de los 201 registros huérfanos (v41), la auditoría de FKs (v45) y el
rediseño del borrado del catálogo (v46/v47). Cada decisión trae el porqué, para que
quien la revise más adelante pueda cambiarla sabiendo qué estaba resolviendo.

---

## D1. Toda tabla de hechos guarda sus propias claves

**Decisión.** Un registro que produjo una alumna o una coach (entrenamiento, respuesta
de evaluación, registro de bloque, historial de prescripción) guarda directamente el
`exercise_id` del catálogo y una copia del nombre, aunque se pueda derivar por join.
Las FKs desde tablas de hechos hacia configuración del plan (`plan_exercises`,
`plan_blocks`, `evaluation_tests`, `plans`) son `ON DELETE SET NULL`, nunca `CASCADE`.
Las FKs desde tablas de hechos hacia `exercises` son `ON DELETE RESTRICT`.

**Por qué.** Un hecho es "Andrea hizo sentadilla el 27/07 con 12 kg". Si para saber
qué ejercicio fue depende de que sobreviva una fila de configuración, cualquier
edición del plan lo convierte en basura. Pasó: 201 registros quedaron sin ejercicio
recuperable; 113 de ellos por un plan borrado, el resto por ediciones de plantilla que
borran y recrean casilleros. La redundancia acá no es duplicación sucia, es lo que
hace que el hecho se sostenga solo. (v41, v45)

**Cómo se aplica.** Antes de poner `SET NULL` o `CASCADE` en una FK nueva desde una
tabla de hechos, preguntarse qué queda del hecho cuando el padre no está. Si la
respuesta es "nada", el hecho necesita su propia copia de la clave, un backfill y un
trigger que la complete en toda escritura futura (no alcanza con la RPC).

---

## D2. El catálogo no se borra: se archiva, se fusiona o, si nadie lo referencia, se elimina

**Decisión.** "Eliminar" un ejercicio del catálogo son tres verbos distintos:

- **Archivar**: "no lo quiero usar más". `exercises.archived_at` / `archived_by`.
  Sale de los selectores y de la vista normal de la biblioteca, sigue existiendo para
  todo lo que ya lo referencia. Reversible.
- **Fusionar**: "lo tengo repetido". Una RPC transaccional repunta todas las
  referencias del duplicado al canónico y deja el origen como lápida archivada con
  `merged_into_id`. Queda auditoría en `exercise_merges`.
- **Eliminar**: solo cuando `exercise_usage()` da cero en todo. La base lo garantiza
  con `RESTRICT` (v41/v45); la UI solo ofrece el botón cuando corresponde.

**Por qué.** Mientras el catálogo se pueda borrar físicamente, cada tabla de hechos
nueva es un `RESTRICT` más, y cada `RESTRICT` es una coach que no puede limpiar su
biblioteca. Archivar resuelve el 90% de los casos ("ya no lo uso") sin tocar historia.
Fusionar resuelve el caso real que archivar no cubre: el 10/09/2026 había 21 grupos de
ejercicios con nombre idéntico y 5 con el mismo video y distinto nombre.

**Qué NO cambia con la fusión.** La prescripción vive en `plan_exercises` (series,
reps, kilos, descanso, %RM, notas del casillero). Fusionar cambia la identidad del
ejercicio (nombre, video, nota técnica) y une el historial; la alumna sigue viendo
prescripto exactamente lo mismo. El aviso al coach dice eso, no "tienen que ser
exactamente iguales".

---

## D3. Un solo catálogo para todos los coaches; sin "compartir" por ahora

**Decisión.** No se construye visibilidad por coach (`private` / `shared`) en el
catálogo. Cualquier coach ve todo, puede archivar y puede fusionar cualquier par que
vea, con la auditoría como red. La biblioteca muestra el nombre del creador como
etiqueta cuando quien mira no es el creador.

**Por qué.**

1. Al 10/09/2026 hay tres cuentas coach y los 388 ejercicios son de una sola (Anto,
   incluidos los 88 semilla que se le reasignaron en julio). El catálogo compartido ya
   existe de hecho.
2. Un catálogo privado por defecto produce el problema que estamos resolviendo: la
   segunda coach arranca de cero, crea "Sentadilla" y "Remo", y ya hay duplicados entre
   cuentas que no se pueden fusionar sin cruzar dueños.
3. La decisión de fondo sobre qué ve un coach de otro está pendiente para siete tablas
   (alcance multi-coach de la RLS). Resolverla solo para ejercicios sería inconsistente:
   se podría esconder un ejercicio pero no el plan que lo usa.
4. Si algún día hace falta, es aditivo: una columna `visibility` y un filtro en el mismo
   fetch donde hoy se filtran los archivados. No hay nada que hacer hoy para dejar esa
   puerta abierta, salvo no cerrarla.

---

## D4. Los planes con hechos se archivan, no se borran

**Decisión.** `plans.archived_at`. Un plan con registros, sesiones, evaluaciones o
asignaciones se archiva; uno sin nada se elimina. `plan_assignments.plan_id` pasa a
`ON DELETE RESTRICT` como candado duro. Un plan con una asignación **activa** no se
puede archivar: primero se reemplaza o se cierra la asignación desde la ficha de la
alumna, después se archiva.

**Por qué.** Borrar un plan era la causa de 113 de los 191 huérfanos irrecuperables
(una alumna, 27/03 a 04/04/2026) y además se llevaba `plan_assignments`, que es la
historia de qué plan tuvo cada alumna y cuándo (la tabla de Progreso v42 la usa para
las marcas de plan). Bloquear el archivado con asignación activa evita dejar a una
alumna sin plan sin que nadie lo haya decidido explícitamente; la alternativa
(archivar cierra la asignación) es más cómoda pero esconde una decisión con
consecuencias para la alumna detrás de un botón de limpieza.

---

## D5. Borrar un usuario borra toda su historia (decisión explícita, no bug)

`student_id` es `ON DELETE CASCADE` en todas las tablas de hechos y `profiles.id`
cascadea desde `auth.users`. Se mantiene así a propósito: es el camino para borrar de
verdad a una persona. Para "ya no entrena" existe `profiles.active` (v40). No hay
botón de borrar perfil en la app.

---

## D6. Cómo se ensaya una migración contra producción sin dejar rastro

Receta usada en v45 y v46: `BEGIN;` + la migración completa + un bloque `DO` que
ejecuta los borrados que hoy rompen y termina en `RAISE EXCEPTION` con un jsonb de
resultados. La excepción revierte todo (migración incluida) y el resultado vuelve en
el mensaje de error. Después se verifica que no quedó nada aplicado y recién ahí se
corre en serio con `apply_migration`. Regla de fondo: cero filas de prueba en la base.
