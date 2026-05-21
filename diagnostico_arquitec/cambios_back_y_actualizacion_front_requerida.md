# Cambios aplicados en el back y por qué el front DEBE actualizarse

**Proyecto:** `bvexjanqmfypmtgoapbt`
**Fecha:** 2026-05-15
**Migración aplicada:** `fix_2_1_y_raices_template_assignments`
**Archivo SQL auditable:** [`fix_2_1_y_raices.sql`](./fix_2_1_y_raices.sql)

---

## 1. TL;DR — Lectura de 30 segundos

Se ejecutó una migración en Supabase que **corrige el bug crítico 2.1** (asignaciones apuntando a plantillas) y **tapa las raíces de 2.1 y 2.3** con dos triggers. Ningún dato fue eliminado: los 8 assignments problemáticos fueron migrados a clones personales que conservan todo el historial.

**Efecto colateral importante:** el back ahora **rechaza activamente** cualquier intento del frontend de asignar una plantilla directo a un alumno. Hasta que el front se ajuste, el flujo "asignar plan a alumno nuevo" va a fallar con un error explícito.

**Prioridad:** actualizar el frontend antes de la próxima alta de alumno.

---

## 2. Qué se hizo en el back (resumen ejecutivo en simple)

### 2.1. Función helper `migrate_assignment_off_template(assignment_id)`

Toma un `plan_assignment` que apunta a una plantilla y hace todo el trabajo de:

1. Clonar el plan (con sus `plan_blocks` y `plan_exercises`).
2. Re-apuntar `workout_logs`, `workout_sessions`, `workout_block_logs` y `evaluation_results` al clon.
3. Re-apuntar el propio assignment al clon.
4. Devolver el `plan_id` del clon.

Esta función queda disponible en la BD para uso futuro.

### 2.2. Backfill (limpieza de datos existentes)

- **8 assignments** que apuntaban a plantillas fueron clonados a instancias personales. Los 422 workout_logs, 40 workout_sessions, 9 workout_block_logs y 6 evaluation_results se preservaron 100%.
- **5 evaluaciones** que tenían results pero seguían `status='active'` se cerraron (`status='completed'`).

### 2.3. Trigger `trg_close_eval_on_result` (raíz del bug 2.3)

Cuando se inserta un nuevo `evaluation_results`, la `plan_assignment` correspondiente pasa a `status='completed'` automáticamente. No depende del frontend.

### 2.4. Trigger `trg_pa_forbid_template` (raíz del bug 2.1 — ⚠️ es el que bloquea el front actual)

Antes de cualquier `INSERT` o `UPDATE` en `plan_assignments`, valida que `plan_id` apunte a una instancia (no a una plantilla). Si la regla se viola, la BD aborta la operación con este error:

```
plan_assignments.plan_id apunta a una plantilla (plan_id=<uuid>).
Cloná la plantilla a una instancia primero
(usá public.migrate_assignment_off_template o el flujo del frontend).
ERRCODE: check_violation
```

---

## 3. El nuevo contrato de la BD (lo que el front tiene que entender)

| Operación | Antes | Ahora |
|---|---|---|
| `INSERT INTO plan_assignments (plan_id=<template_id>, ...)` | ✅ Funcionaba (con el bug) | ❌ **Falla con `check_violation`** |
| `INSERT INTO plan_assignments (plan_id=<instance_id>, ...)` | ✅ Funcionaba | ✅ Funciona |
| `UPDATE plan_assignments SET plan_id=<template_id>` | ✅ Funcionaba | ❌ **Falla con `check_violation`** |
| Cargar `evaluation_results` para una eval activa | ⚠️ La eval quedaba `active` | ✅ La eval se cierra sola (`completed`) |

**Reglas inmutables ahora:**

1. Una `plan_assignment` **NUNCA** puede apuntar a un `plans.is_template = true`.
2. Una evaluación con `evaluation_results` cargados **NUNCA** queda `status='active'`.

---

## 4. Por qué el front DEBE actualizarse (y urgente)

### Riesgo concreto

El flujo de UI actual probablemente hace algo como:

```typescript
// CÓDIGO ACTUAL — VA A FALLAR
await supabase
  .from('plan_assignments')
  .insert({
    student_id: studentId,
    plan_id: templateId,   // ← apunta al template directo
    plan_type: 'training',
    start_date: today
  });
```

A partir de ahora, ese insert va a fallar con `ERROR: check_violation` y la coach va a ver un mensaje rojo cuando intente asignar un plan.

### Por qué se hizo igual (y no se va a revertir)

El trigger es la **defensa de la BD** contra el bug. Removerlo significaría aceptar que el bug vuelva a aparecer (5 alumnos editados en silencio cada vez que la coach toque una plantilla). El back está bien. **El front es el que tiene que adaptarse al contrato correcto**, que es como debió haber sido desde el principio.

### Qué pasa si no se actualiza

- Las altas nuevas de alumnos rompen (la coach no puede asignar planes a alumnos nuevos).
- La asignación de evaluaciones a alumnos rompe (mismo motivo).
- Los alumnos existentes con sus instancias clonadas siguen funcionando perfecto.

---

## 5. Qué tiene que hacer el frontend

### 5.1. Cambio principal — flujo "asignar plan a alumno"

**Antes:**

```typescript
// 1. Coach elige una plantilla de la biblioteca
// 2. Coach elige un alumno
// 3. Frontend hace: INSERT INTO plan_assignments (plan_id = template.id, ...)
```

**Después:**

```typescript
// 1. Coach elige una plantilla de la biblioteca
// 2. Coach elige un alumno
// 3. Frontend CLONA la plantilla a una instancia personal del alumno:
//      a. INSERT INTO plans (..., is_template=false, ...) RETURNING id AS new_plan_id
//      b. INSERT INTO plan_blocks (plan_id = new_plan_id, ...) por cada block de la template
//      c. INSERT INTO plan_exercises (plan_id = new_plan_id, block_id = mapped, ...) por cada ejercicio
// 4. Frontend hace: INSERT INTO plan_assignments (plan_id = new_plan_id, ...)
```

### 5.2. Opción elegida e implementada: RPC `assign_template_to_student` ✅

**Status:** ✅ Implementada en producción el 2026-05-15 (migración `add_rpc_assign_template_to_student`).

La RPC reusa la lógica probada de `migrate_assignment_off_template` (que migró los 8 assignments del backfill sin perder datos) pero adaptada para crear desde cero un assignment apuntando a un clon recién creado de una plantilla. **Cubre training y evaluation por igual** (lee `plan_type` de la plantilla y propaga al clon).

**Firma:**

```typescript
supabase.rpc('assign_template_to_student', {
  p_template_id:           string,       // uuid de la plantilla (REQUIRED)
  p_student_id:            string,       // uuid del alumno (REQUIRED)
  p_start_date?:           string,       // 'YYYY-MM-DD', default current_date
  p_end_date?:             string | null,
  p_schedule_mode?:        'flexible' | 'fixed',  // default 'flexible'
  p_preferred_days?:       Json | null,
  p_linked_assignment_id?: string | null,  // solo para evals linkeadas a un training
})
// Returns: { assignment_id, plan_id, template_id, student_id }
```

**Ejemplo training** (StudentPlansTab — asignación de plan principal):

```typescript
const { data, error } = await supabase.rpc('assign_template_to_student', {
  p_template_id: selectedTemplateId,
  p_student_id:  studentId,
  p_start_date:  startDate,  // opcional
});
if (error) throw error;
// data.assignment_id y data.plan_id ya están listos
```

**Ejemplo evaluation independiente** (StudentEvaluationsTab):

```typescript
const { data, error } = await supabase.rpc('assign_template_to_student', {
  p_template_id: evalTemplateId,
  p_student_id:  studentId,
});
```

**Ejemplo evaluation linkeada a un training** (modal "evals asociadas" en StudentPlansTab):

```typescript
const { data, error } = await supabase.rpc('assign_template_to_student', {
  p_template_id:           evalTemplateId,
  p_student_id:            studentId,
  p_linked_assignment_id:  trainingAssignmentId,  // el plan training al que se linkea
});
```

**Atributos de la RPC:**

- ✅ Atómica (todo o nada).
- ✅ `SECURITY DEFINER` — bypassa RLS para clonar plans/blocks/exercises.
- ✅ Grant a `authenticated` (cualquier usuario logueado puede llamarla; el back valida que el `student_id` exista y tenga `role='student'`).
- ✅ Dispara `fn_notify_plan_assigned` (AFTER INSERT en plan_assignments) → el alumno recibe la notificación como antes.
- ✅ Respeta `plan_assignments_validate_link` → si pasás `linked_assignment_id`, valida que el linked sea del mismo alumno y de tipo training.

**Errores que puede tirar:**

| `code` | `message` contiene | Significado |
|---|---|---|
| `23503` | `Plan ... no existe` | template_id inválido |
| `23514` | `no es una plantilla` | pasaron un instance_id en vez de template_id |
| `23503` | `Alumno ... no existe o no tiene role=student` | student_id inválido o no es student |
| `23514` | `linked_assignment_id solo aplica a evaluación` | el link solo va con evals |
| `P0001` | `linked_assignment_id debe pertenecer al mismo alumno` | el training linkeado es de otro alumno |
| `23514` | `apunta a una plantilla` | nunca debería pasar usando esta RPC, pero si pasa: el front intentó algún path viejo en paralelo |

### 5.3. Manejo del error en UI

Si llega un `check_violation` con el mensaje `apunta a una plantilla`, el frontend debe mostrar un mensaje de error claro y, eventualmente, ofrecer "asignar plantilla → clonar primero". Pero si todo se hace bien, este error no debería aparecer nunca.

```typescript
try {
  await assignTemplateToStudent({ templateId, studentId, startDate });
} catch (e) {
  if (e.code === '23514' && e.message.includes('plantilla')) {
    // No debería pasar si usamos la RPC, pero por las dudas
    showError('No se puede asignar una plantilla directo. Reportá este caso.');
  } else {
    throw e;
  }
}
```

### 5.4. Otros lugares del front que pueden estar tocando esto

Buscar todas las referencias en el código frontend a:

- `.from('plan_assignments').insert(`
- `.from('plan_assignments').update(`

Y verificar que ninguno esté pasando un `plan_id` que pueda ser una plantilla. Si alguno lo hace, debe ir por el nuevo flujo de clonado.

---

## 6. Plan de validación sugerido (antes de mergear a main)

Sin necesidad de tocar producción, en un entorno de staging o local:

1. **Caso ok** — Asignar una plantilla a un alumno nuevo vía nuevo flujo:
   - Verificar que se creó una nueva fila en `plans` con `is_template=false`.
   - Verificar que `plan_blocks` y `plan_exercises` del clon coinciden en cantidad con la plantilla.
   - Verificar que `plan_assignments.plan_id` apunta al clon, no a la plantilla.
   - Verificar que la plantilla original quedó intacta (mismo `updated_at`).

2. **Caso edición de plantilla no contamina alumnos** — Asignar la misma plantilla a 2 alumnos, editar la plantilla, verificar que los planes de los 2 alumnos no cambiaron.

3. **Caso eval que se cierra sola** — Asignar una evaluación a un alumno, cargar un `evaluation_results`, verificar que `plan_assignments.status` pasó a `'completed'` sin intervención manual.

4. **Caso de defensa** — Intentar manualmente vía SQL ejecutar:

   ```sql
   INSERT INTO plan_assignments (student_id, plan_id, ...)
   VALUES ('<algún alumno>', '<id de una plantilla>', ...);
   ```

   Debe fallar con `check_violation` y el mensaje conocido. Si pasa, el trigger no está activo.

---

## 7. Apéndice — UUIDs útiles para debugging del frontend

**Templates que siguen vivas** (las 11 originales, sin cambio):

```sql
SELECT id, title, plan_type FROM public.plans WHERE is_template = true ORDER BY title;
```

**Instancias creadas por la migración del 2026-05-15** (8 clones):

```sql
SELECT id, title, plan_type, substring(description from 'template_id=([0-9a-f-]+)') AS origen_template_id
FROM public.plans
WHERE is_template = false AND description LIKE '%[Clonado de%'
ORDER BY title;
```

**Helper function disponible para reuso:**

```sql
-- Por si en algún caso de emergencia hay que migrar un assignment manualmente:
SELECT public.migrate_assignment_off_template('<assignment_id>');
```

---

## 8. Próximos pasos

- ✅ **Crear la RPC `assign_template_to_student`** — hecho 2026-05-15.
- ✅ **Refactorizar el front** para que use esa RPC en los 3 lugares (`StudentPlansTab.jsx`, `StudentEvaluationsTab.jsx`, modal "evals asociadas") — commit `10f4ffb`.
- ✅ **Bug 2.2 sub-raíz B** (logs retroactivos + surfacing de errores) — commit `d3c840f`.
- ⏳ **Atacar bugs 2.4 (datos sucios actual_reps/weights), 2.5 (`student_profiles` deprecada), 2.6 (`tiene_lesiones` contradicción)** cuando haya capacidad.

---

## 9. Mejoras pequeñas no críticas (post-mortem, ver cuando bajemos lo crítico)

Items que surgieron como mejoras de UX/calidad pero no bloquean nada. Revisar cuando estén cerrados los bugs críticos pendientes.

### 9.1 Banner `saveError` con auto-close de 6s (front, 2.2)

**Detectado:** commit `d3c840f` — el banner de error que avisa al alumno cuando falla `upsertSession` / `saveDayPSE` se auto-cierra a los 6 segundos.

**Por qué importa:** un banner de error con auto-close puede ser confuso si el alumno mira el celular tarde — ve algo rojo desvaneciéndose y no entendió qué pasó ni qué hacer.

**Regla típica de UX:**
- **Errores recuperables** (network, rate limit): auto-close OK, mensaje "reintentá".
- **Errores no recuperables** (`check_violation`, RLS, `23514`, `42501`): persistir con botón "Entendido" o "Reintentar". Sin auto-close.

**Sugerencia de implementación:** diferenciar por `error.code` en el `saveError`. Para códigos no recuperables, dejar el banner visible hasta que el alumno lo cierre manualmente.

**Severidad:** baja. El fix principal (no swallow → throw → banner) ya garantiza que el alumno se entera. Esta mejora solo refina la persistencia visual.
