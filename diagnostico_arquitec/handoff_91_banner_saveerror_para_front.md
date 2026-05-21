# Handoff 9.1 — Mejora UX del banner `saveError` (auto-close por tipo de error)

**Fecha:** 2026-05-15
**De:** agente del back
**Para:** agente del front
**Origen:** § 9.1 del doc `cambios_back_y_actualizacion_front_requerida.md`
**Criticidad:** 🟢 baja — mejora UX no bloqueante
**Impacto BD:** ninguno (solo lógica del cliente)

---

## 1. TL;DR

Hoy el banner `saveError` en el front se auto-cierra a los 6s indistintamente del tipo de error. Eso está bien para errores **recuperables** (network, throttle) — el alumno reintenta. Pero para errores **no recuperables** (validación del back, RLS, integridad) el alumno necesita leer el mensaje completo y entender qué hacer. Si la sesión se desvanece, queda confundido.

**Propuesta:** diferenciar por `error.code` de PostgREST/Supabase y mantener visible hasta acción del usuario en los errores no recuperables.

---

## 2. Códigos relevantes de PostgREST/Supabase

Lista basada en lo que **realmente** puede tirar el back actual (RPC + constraints + RLS instalados durante el proyecto):

### 2.1. Errores RECUPERABLES — auto-close 6s está OK

| code | Tipo | Cuándo aparece | Mensaje sugerido |
|---|---|---|---|
| `PGRST301` | Auth / JWT expirado | Token expiró, sesión vencida | "Tu sesión expiró. Iniciá sesión de nuevo." |
| `network`/`fetch error` | Conexión perdida | Sin internet, timeout | "Sin conexión. Probá de nuevo." |
| `429` | Throttle / rate limit | Spam de saves muy seguidos | "Demasiadas solicitudes. Esperá un momento." |
| `503`, `504` | Service unavailable / gateway timeout | Supabase caído / lento | "Servidor lento. Reintentando..." |

### 2.2. Errores NO RECUPERABLES — banner persistente + botón "Entendido"/"Reintentar"

| code | Mensaje del back contiene | Significado | Mensaje al usuario |
|---|---|---|---|
| `23514` | `workout_logs_weight_mode_check` | weight_mode inválido | "Modo de peso inválido. Recargá la página." |
| `23514` | `workout_logs_reps_unit_check` | reps_unit no permitido | "Unidad de reps inválida. Recargá la página." |
| `23514` | `bodyweight_no_weights` | tiraste bodyweight con peso | "Si elegiste 'Sin peso', no podés cargar peso. Sacá el peso o cambiá el modo." |
| `23514` | `reps_weights_same_length` | reps y weights con length distinto | "La cantidad de reps no coincide con la de pesos. Revisá los sets." |
| `23514` | `sessions_finished_requires_started` | finished sin started en session | "Error interno de sesión. Avisá al coach." |
| `23514` | `profiles_lesiones_requires_detail` | lesiones=true sin detalle | "Si marcaste que tenés lesiones, completá la descripción o seleccioná al menos una patología." |
| `23514` | `apunta a una plantilla` | front intentó asignar template directo | "Error técnico. Avisá al coach (cod: 23514 template)." |
| `23503` | `Plan ... no existe` / `Alumno ... no existe` | FK rota (UUID inválido) | "Plan o alumno no encontrado. Recargá la página." |
| `23505` | (unique violation) | Ej: alumno con plan duplicado activo | "Ya existe un plan activo de este tipo. Archivá el anterior primero." |
| `22023` | `invalid_parameter_value` | parámetro requerido vino NULL | "Faltan datos para guardar. Completá todos los campos." |
| `02000` | `no_data_found` | UPDATE con log_id inexistente | "El log que querías editar fue borrado. Recargá la lista." |
| `42501` | (RLS denied) | Sin permisos para esa fila | "No tenés permiso para hacer esto. Avisá al coach." |
| `P0001` | (RAISE EXCEPTION custom) | Cualquier exception del PL/pgSQL | usar `error.message` directo |

### 2.3. Casos especiales: tratar como recuperables aunque parezcan errors

| Situación | Razón |
|---|---|
| Insert exitoso pero `error` viene con detalle de notification fallida | El log se guardó OK, la notif es side-effect. No mostrar banner. |
| `409 Conflict` durante upsertSession por race condition | Reintentar 1 vez automáticamente. Si vuelve, mostrar error. |

---

## 3. Implementación sugerida

### 3.1. Helper centralizado

```typescript
// src/utils/errorHelpers.js
const NON_RECOVERABLE_CODES = new Set(['23514', '23503', '23505', '22023', '02000', '42501', 'P0001']);
const NON_RECOVERABLE_PATTERNS = [
  /workout_logs_/,
  /profiles_lesiones_/,
  /sessions_finished_/,
  /apunta a una plantilla/i,
  /linked_assignment_id/i,
];

export function isRecoverableError(error) {
  if (!error) return true;
  const code = error.code || error.status;
  if (NON_RECOVERABLE_CODES.has(String(code))) return false;
  const msg = error.message || error.details || '';
  if (NON_RECOVERABLE_PATTERNS.some(re => re.test(msg))) return false;
  // Network / timeout / auth → recoverable
  return true;
}

export function getFriendlyErrorMessage(error) {
  if (!error) return '';
  const code = String(error.code || error.status || '');
  const msg = error.message || '';
  // Mapping según tabla 2.2 (resumido — implementación completa con switch)
  if (code === '23514' && /bodyweight_no_weights/.test(msg))
    return "Si elegiste 'Sin peso', no podés cargar peso. Sacá el peso o cambiá el modo.";
  if (code === '23514' && /reps_weights_same_length/.test(msg))
    return "La cantidad de reps no coincide con la de pesos. Revisá los sets.";
  if (code === '23514' && /profiles_lesiones_/.test(msg))
    return "Si marcaste que tenés lesiones, completá la descripción o seleccioná al menos una patología.";
  if (code === '23503')
    return "Recurso no encontrado. Recargá la página.";
  if (code === '23505')
    return "Ya existe un registro similar. Archivá el anterior primero.";
  if (code === '42501')
    return "No tenés permiso para hacer esto.";
  if (code === 'PGRST301')
    return "Tu sesión expiró. Iniciá sesión de nuevo.";
  // fallback
  return msg || "Algo salió mal. Probá de nuevo o avisá al coach.";
}
```

### 3.2. Render condicional del banner

```jsx
// Donde hoy hay setTimeout(() => setSaveError(null), 6000):
const friendly = getFriendlyErrorMessage(error);
const recoverable = isRecoverableError(error);

setSaveError({
  message: friendly,
  persistent: !recoverable,
  raw: error, // útil para debugging
});

if (recoverable) {
  setTimeout(() => setSaveError(null), 6000);
}
// Si !recoverable, NO setear timeout. El banner queda hasta que el usuario lo cierre.
```

### 3.3. UI del banner persistente

```jsx
{saveError && (
  <div className={`banner ${saveError.persistent ? 'banner-error-persistent' : 'banner-error-transient'}`}>
    <span>{saveError.message}</span>
    {saveError.persistent && (
      <button onClick={() => setSaveError(null)}>
        Entendido
      </button>
    )}
  </div>
)}
```

---

## 4. Archivos del front a tocar

Según el grep de la sesión anterior, donde se usa banner `saveError` o similar:

- `src/pages/student/TodayWorkoutPage.jsx` (banner principal de save)
- `src/pages/student/IntakeFormPage.jsx` (banner del intake, para 23514 de lesiones)
- `src/pages/coach/student/StudentInfoTab.jsx` (saveEdit del card Salud, para 23514 de lesiones)
- Cualquier otro form que haga RPC y muestre error

---

## 5. Cómo validar

Casos de prueba sugeridos (sin tocar BD real):

1. **Recuperable:** simular `error.code = '503'` → banner aparece 6s, se cierra solo.
2. **No recuperable (lesiones):** intentar guardar perfil con `tiene_lesiones=true` y `patologias=['Ninguna']` sin descripción → banner persiste con mensaje específico, botón "Entendido" cierra.
3. **No recuperable (bodyweight con peso):** intentar guardar log con `weight_mode=bodyweight` y `weights=[80]` → banner persiste.
4. **No recuperable (auth):** simular `error.code = 'PGRST301'` → banner persiste o redirige a login.

---

## 6. Lo que NO tenés que hacer

- Cambiar el back (los errors son los que están). Esta tarea es 100% UI.
- Cambiar el comportamiento del save en sí (si guarda, sigue guardando igual). Solo cambia cómo se muestra el error.

---

## 7. Confirmación

Cuando termines, avisame y validamos juntos los 4 casos de prueba. No requiere migración ni queries del back.
