# Handoff 2.6 — Nuevo campo `descripcion_lesiones` + CHECK constraint

**Fecha:** 2026-05-15
**De:** agente del back
**Para:** agente del front
**Bug original:** 2.6 del diagnóstico (`diagnostico-supabase.md`)
**Estado del back:** ✅ ejecutado

---

## TL;DR

El back resolvió la contradicción semántica entre `tiene_lesiones` y `patologias` agregando una columna nueva (`profiles.descripcion_lesiones`) y un CHECK que la BD valida. **El front tiene que ajustarse en 3 puntos** para soportar el nuevo campo y manejar el error.

---

## Qué hizo el back

1. **Nueva columna:** `profiles.descripcion_lesiones text` (nullable).
2. **Dato poblado para el caso real (Franco):** `"Dolor en el pecho parece quye es movbilidad"` (texto literal del usuario, con typos preservados).
3. **CHECK constraint nuevo** (`profiles_lesiones_requires_detail`):

   ```sql
   CHECK (
     tiene_lesiones IS NULL
     OR tiene_lesiones = false
     OR (descripcion_lesiones IS NOT NULL AND trim(descripcion_lesiones) <> '')
     OR (patologias IS NOT NULL AND NOT (patologias <@ ARRAY['Ninguna']::text[]))
   )
   ```

   **En palabras simples:** si alguien marca `tiene_lesiones=true`, la BD exige que haya detalle — o en `descripcion_lesiones` o en `patologias` (con algo distinto de `['Ninguna']`). No se puede tener "tengo algo" sin decir qué.

4. **Función `process_intake_submission` actualizada:** ahora lee `descripcion_lesiones` del JSON del intake (si el front lo envía). Si no lo envía, no rompe — pero si el alumno marca `tiene_lesiones=true` con `patologias=['Ninguna']`, el INSERT/UPDATE final va a fallar con el CHECK.

---

## Qué tiene que hacer el front

### 1. Agregar el campo al formulario de intake (`IntakeFormPage.jsx`)

Después del check "¿Tenés alguna lesión o patología?" (`tiene_lesiones`), si el usuario marca `true` y NO selecciona patologías reales (queda en `['Ninguna']`), aparece un **textarea obligatorio** para describir la lesión.

```jsx
{tieneLesiones && patologias.length === 0 && (
  <Field
    name="descripcion_lesiones"
    label="Describí la lesión"
    placeholder="Ej: Dolor en rodilla derecha, problemas de movilidad de hombro..."
    required
    multiline
  />
)}
```

**Clave del JSON del intake:** `descripcion_lesiones` (string). La función `process_intake_submission` ya lee esa clave.

### 2. Mostrar/editar el campo en la UI de edición del alumno (StudentDetailPage o similar)

Donde sea que la coach edita el perfil del alumno, agregar el campo `descripcion_lesiones`. Read/write directo a `profiles.descripcion_lesiones` (no requiere RPC).

```jsx
<TextField
  label="Descripción de lesiones"
  value={profile.descripcion_lesiones || ''}
  onChange={...}
  multiline
  helperText="Si el alumno tiene lesiones pero no patologías médicas, describí acá cuáles."
/>
```

### 3. Manejar el error del CHECK constraint en UI

Si el front intenta insertar/actualizar un perfil con `tiene_lesiones=true` sin detalle, Supabase devuelve:

```json
{
  "code": "23514",
  "message": "...profiles_lesiones_requires_detail...",
  "details": "Failing row contains (...)"
}
```

**Sugerencia de manejo:**

```typescript
if (error?.code === '23514' && error?.message?.includes('profiles_lesiones_requires_detail')) {
  showError('Si marcaste que tenés lesiones, completá la descripción o seleccioná al menos una patología.');
} else {
  // resto
}
```

---

## Validaciones a hacer post-deploy

1. **Intake con `tiene_lesiones=true` + `patologias=['Ninguna']` + sin descripción:**
   - El form NO debe permitir submit (validación cliente)
   - Si por algún motivo llega al back, la BD lo rechaza con `23514`
2. **Intake con `tiene_lesiones=true` + `descripcion_lesiones='Algo'`:**
   - Funciona OK, queda registrado
3. **Intake con `tiene_lesiones=true` + `patologias=['Hipertensión']`:**
   - Funciona OK aunque no haya descripcion_lesiones (las patologías reales ya satisfacen el CHECK)
4. **Edición de perfil de Franco desde la UI de la coach:**
   - Debe aparecer `descripcion_lesiones` con el valor `"Dolor en el pecho parece quye es movbilidad"`. La coach puede corregir los typos si quiere.

---

## Datos actuales del back

| Alumno | tiene_lesiones | descripcion_lesiones | patologias |
|---|---|---|---|
| anto almanza | false | NULL | `['Ninguna']` |
| **francellone** | **true** | **"Dolor en el pecho parece quye es movbilidad"** | `['Ninguna']` |
| student1 (test) | true | NULL | `['Hipertensión', 'Diabetes tipo 1']` |
| Resto de alumnos | NULL | NULL | NULL |

Los 3 alumnos con `tiene_lesiones` poblado cumplen el CHECK actual. Franco se podría corregir typos cuando quiera (desde UI).

---

## Notas adicionales

- El trigger de auditoría que pusimos en 3.5 va a registrar **cualquier cambio en `descripcion_lesiones`** automáticamente en `student_edit_history`. Vos no tenés que hacer nada para esto.
- Si el agente del front ya tenía el handoff de 2.5 abierto, este de 2.6 es un complemento — los dos comparten flujo de intake.

---

Cualquier duda o si encontrás algo raro al implementar, avisame.
