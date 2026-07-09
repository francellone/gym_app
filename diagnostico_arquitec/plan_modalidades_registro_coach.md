# Plan: modalidades de alumno + registro de entrenamiento por coach

Fecha: 2026-07-09 · Pedido de Anto: soportar 3 modalidades de uso (online / híbrida / solo-coach).
Requisito de Franco: auditoría en el back — **siempre saber quién cargó qué dato**.

---

## 0. Hallazgo de seguridad (se corrige en este plan, prioridad alta)

`save_workout_log` es `SECURITY DEFINER` y **no valida quién la llama**: no compara `auth.uid()` contra `p_student_id` ni contra el coach del alumno. Como bypassea RLS y tiene `GRANT EXECUTE` para `authenticated` (y `anon`), hoy **cualquier usuario logueado puede escribir workout_logs de cualquier alumno**. La doc (`docs/api-rpcs.md` §Workouts) dice "rol esperado: student", pero eso no está impuesto en ningún lado.

El fix es exactamente la autorización que necesita esta feature: caller debe ser **el propio alumno** o **el coach asignado de ese alumno**. Dos pájaros de un tiro.

## 1. Estado actual (verificado en BD de prod y código)

- **Auditoría existente:** `profiles` ya tiene trigger `fn_audit_profile_changes` → `student_edit_history` con `changed_by`. O sea, los datos de perfil YA registran quién cargó qué. Lo que falta es lo mismo para entrenamientos.
- **Precedente en actividades extra:** `daily_activities` ya tiene `source` (`student`/`coach`) + `created_by` (`src/features/activities/api.js:73-89`). Copiamos ese patrón.
- **`workout_logs`:** sin columnas de autoría. RLS: student ALL sobre sus filas; coach SELECT + UPDATE sobre alumnos propios (sin INSERT).
- **`workout_sessions`:** sin autoría. RLS: student ALL; coach solo SELECT. El front la escribe con INSERT directo (no RPC).
- **Front:** `TodayWorkoutPage.jsx` usa `profile.id` (usuario logueado) como student_id en ~17 lugares, pero los componentes hijos (`CircuitBlockRunCard`, `ExerciseCard`) **ya reciben `studentId` por prop** — la parametrización está a mitad de camino.
- **Notificaciones:** `fn_notify_workout_activity` (INSERT en workout_logs) notifica al coach. Si el coach carga, se notificaría a sí misma → hay que filtrar.
- **Modalidad:** no existe ningún campo de tipo/modalidad en `profiles`.

## 2. Diseño

### 2.1 Migración BD (una sola migración, con backfill)

**Autoría en entrenamientos** (mismo patrón que `daily_activities`):

- `workout_logs`: + `logged_by uuid REFERENCES profiles(id)`, + `source text NOT NULL DEFAULT 'student' CHECK (source IN ('student','coach'))`.
- `workout_sessions`: ídem (`logged_by`, `source`).
- Backfill filas existentes: `logged_by = student_id`, `source = 'student'`.

**Fix + extensión de `save_workout_log`:**

```sql
-- al inicio del body:
IF auth.uid() = p_student_id THEN
  v_source := 'student';
ELSIF is_coach() AND EXISTS (SELECT 1 FROM profiles WHERE id = p_student_id AND coach_id = auth.uid()) THEN
  v_source := 'coach';
ELSE
  RAISE EXCEPTION 'No autorizado para registrar entrenamientos de este alumno'
    USING ERRCODE = 'insufficient_privilege';
END IF;
```

En INSERT/UPDATE: `logged_by = auth.uid()`, `source = v_source`. **`source` se deriva del rol, nunca es parámetro** (no spoofeable). En UPDATE, además validar que el log pertenezca a `p_student_id`.

**RLS `workout_sessions`:** + policy INSERT/UPDATE para coach sobre alumnos propios (`with_check` coach-of-student), porque el front escribe sessions directo. Los `workout_logs` siguen escribiéndose solo vía RPC.

**Notificaciones:** `fn_notify_workout_activity` → skip si `NEW.source = 'coach'` (la coach no se auto-notifica). No se notifica al alumno por ahora (en modo solo-coach ni usa la app; en híbrido estuvo presente en la sesión).

**Modalidad:** `profiles` + `modality text NOT NULL DEFAULT 'online' CHECK (modality IN ('online','hybrid','coach_only'))`. Verificar que `fn_audit_profile_changes` la capture (si el trigger enumera columnas, agregarla).

**Hardening extra:** `REVOKE EXECUTE ON save_workout_log FROM anon` (no hay caso de uso sin login).

### 2.2 Front — registro por coach (Fase 2)

- Refactor mínimo de `TodayWorkoutPage`: extraer `profile.id` a una variable `targetStudentId` que por defecto es el usuario logueado, y puede venir de la ruta.
- Nueva ruta coach: `/students/:id/registrar-entrenamiento` que monta la misma página con `targetStudentId = :id` y banner "Registrando por {alumno}".
- Botón "Registrar entrenamiento" en `StudentDetailPage`.
- Historial del alumno: badge "Cargado por tu coach" donde `source='coach'` (reusar patrón visual de `DayActivitiesCard.jsx:142`).
- i18n: todas las strings nuevas en es + en (constantes canónicas de BD en español, como siempre).

### 2.3 Front — modalidad (Fase 3)

- Selector de modalidad en la ficha del alumno (tab de datos personales) + badge en la lista de alumnos.
- Por ahora la modalidad es **informativa + organizativa**. Comportamientos derivados (silenciar notificaciones a alumnos `coach_only`, diferenciar cobro, filtros) quedan como incrementos posteriores — el campo ya deja el concepto instalado.

## 3. Qué NO hacemos

- **Impersonación real** (login como el alumno): inseguro, sin trazabilidad. Descartado.
- Notificar al alumno cuando el coach carga (por ahora).
- Lógica de cobro por modalidad.

## 4. Verificación

- Extender `features/workouts/api.test.js`: caller no autorizado rechazado; coach de otro alumno rechazado; coach propio OK con `source='coach'`.
- Probar en BD: RPC como student (regresión), como coach, como tercero (debe fallar).
- `get_advisors` (security) post-migración.
- Suite completa + smoke test inglés (`src/i18n/english-smoke.test.jsx`).
- Actualizar `docs/api-rpcs.md` (rol esperado de `save_workout_log`: student | coach del alumno).

## 5. Orden de ejecución

1. Migración BD (2.1) — incluye el fix de seguridad, vale la pena aunque el front tarde.
2. Front registro por coach (2.2).
3. Front modalidad (2.3).
4. Verificación + docs (4).
