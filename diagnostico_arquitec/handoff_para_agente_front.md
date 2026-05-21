# Handoff para el agente del front

**Fecha:** 2026-05-15
**De:** agente trabajando sobre Supabase (back) + diagnóstico de arquitectura

---

## Quién soy y qué hice

Soy el agente que trabajó sobre la base de datos del proyecto. Esta tarde hice tres cosas:

1. **Migración de los 8 `plan_assignments` que apuntaban a plantillas** (bug 2.1 del diagnóstico). Cada uno se transformó en una instancia personal del alumno con todo su historial intacto (workout_logs, sessions, block_logs, evaluation_results re-apuntados al clon). Las 11 plantillas quedaron intactas, listas para reutilizar.

2. **Instalé 2 triggers que tapan las raíces del problema:**
   - `trg_close_eval_on_result`: cuando se carga un `evaluation_results`, la `plan_assignment` correspondiente pasa a `status='completed'` sola. Ya no hace falta cerrar manualmente.
   - `trg_pa_forbid_template`: **rechaza cualquier `INSERT`/`UPDATE` en `plan_assignments` que apunte a `is_template=true`**. Este es el que hoy bloquea tu flujo viejo si el front no se actualiza.

3. **Creé la RPC `assign_template_to_student`** en Supabase (la "Opción B" de la doc). Es la que tenés que llamar desde el front.

Toda la auditoría está en estos archivos del repo:
- `diagnostico_arquitec/diagnostico-supabase.md` — diagnóstico completo
- `diagnostico_arquitec/fix_2_1_y_raices.sql` — script SQL ejecutado
- `diagnostico_arquitec/cambios_back_y_actualizacion_front_requerida.md` — contrato completo del back y por qué el front DEBE actualizarse (sección 5.2 tiene los ejemplos de uso de la RPC con código TypeScript listo)

---

## Respondiendo a tu pregunta original

> ¿Qué enfoque usamos para clonar la plantilla antes de asignarla?

**Opción B — RPC en la base**, ya creada y disponible. **Una sola RPC sirve para training y evaluation** (lee el `plan_type` de la plantilla y propaga).

Reemplazá los `INSERT INTO plan_assignments` directos en los 3 lugares por una llamada a `supabase.rpc('assign_template_to_student', { p_template_id, p_student_id, ... })`. Ejemplos exactos en la sección 5.2 del doc `cambios_back_y_actualizacion_front_requerida.md`.

---

## Por dónde continuar

1. **Leé la sección 5.2 del doc `cambios_back_y_actualizacion_front_requerida.md`.** Tiene la firma, los 3 ejemplos de uso (training, eval independiente, eval linkeada a training) y la tabla de errores que puede tirar la RPC.

2. **Refactorizá los 3 puntos del front que identificaste:**
   - `StudentPlansTab.jsx` — asignación de plan training principal.
   - `StudentEvaluationsTab.jsx` — eval del dropdown.
   - Modal "asignar evaluaciones asociadas" en `StudentPlansTab.jsx` — usa `p_linked_assignment_id` con el id del training al que se linkea la eval.

3. **Buscá en el código otros `INSERT` o `UPDATE` sobre `plan_assignments`** que pasen un `plan_id`. Si alguno puede recibir un template, también va por la RPC. Si solo trabaja con instancias existentes (status changes, archivar, etc.), no toques.

4. **Probá los 4 casos de la sección 6 del doc** (al menos los dos primeros: caso ok + caso "edición de plantilla no contamina alumnos").

---

## Detalle clave sobre el comportamiento

- **La notificación al alumno (`fn_notify_plan_assigned`) sigue disparándose normal** después de llamar la RPC — la RPC hace el INSERT en `plan_assignments` por dentro, así que el trigger AFTER INSERT corre.
- **Si pasás `p_linked_assignment_id` con un assignment de otro alumno o que no sea training, la RPC te tira error claro.** No tenés que validar en el cliente, el back valida.
- **La RPC corre con `SECURITY DEFINER`**, así que bypassa RLS para clonar plans/blocks/exercises. No tenés que preocuparte por permisos.
- **No hay race condition**: la RPC es atómica. Si algo falla en el medio (clonar blocks, clonar exercises, crear assignment), Postgres revierte todo automáticamente. No hay forma de dejar un clon huérfano sin assignment.

---

## Si algo no anda

Cualquier duda sobre el back, el contrato de la RPC, o si querés que cree alguna función helper adicional, avisame y la sumamos. Lo que SÍ está fuera de mi alcance es modificar el código del front — eso es tu cancha.
