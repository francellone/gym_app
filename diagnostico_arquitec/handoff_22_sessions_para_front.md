# Handoff 2.2 — Workout sessions: qué hace falta en el front

**Fecha:** 2026-05-15
**De:** agente trabajando sobre Supabase (back)
**Para:** agente del front
**Bug original:** 2.2 del diagnóstico (`diagnostico-supabase.md`)

---

## TL;DR

El back ya hizo todo lo que podía hacer para 2.2: limpió las inconsistencias históricas, instaló constraints + cleanup automático + health check semanal. **Quedan 2 sub-raíces que viven en el flujo del front** y necesitan tu intervención para tapar el bug definitivamente.

Si no se arreglan, los crons del back van a seguir tapando síntomas semana a semana (cleanup diario cerrando sessions abandonadas) pero la app sigue generando los mismos problemas.

---

## Estado actual

### Lo que ya hizo el back (✅ no tocar)

1. **Limpieza histórica** (2026-05-15):
   - 7 sessions phantom (vacías) eliminadas.
   - 6 sessions con logs pero sin `started_at`/`finished_at` → backfilled con `started_at = min(log.created_at)` y `finished_at = max(log.updated_at)`.
   - 5 sessions abiertas >24h → cerradas con `finished_at = max(log.updated_at)` o `started_at + 90min`.
   - 3 sessions con `finished_at` sin `started_at` → corregidas.

2. **Constraint instalado**:
   ```sql
   ALTER TABLE public.workout_sessions
     ADD CONSTRAINT sessions_finished_requires_started
     CHECK (finished_at IS NULL OR started_at IS NOT NULL);
   ```
   Si alguien intenta insertar/actualizar una session con `finished_at NOT NULL` y `started_at NULL`, la BD rechaza con `check_violation`.

3. **Cron diario de cleanup**: `cleanup_abandoned_sessions_daily` corre cada día a las 2 AM ARG y cierra automáticamente las sessions con `started_at < now() - 24h` y `finished_at NULL`.

4. **Cron semanal de health check**: `schema_health_check_weekly` corre cada lunes 10 AM ARG y, si detecta sessions abandonadas residuales (>48h sin cerrar), notifica a todos los coaches.

### Lo que el front todavía hace mal (⚠️ requiere tu fix)

Mirando los datos pre-cleanup, identifiqué 2 patrones rotos:

#### Sub-raíz A: el front PRE-CREA sessions como "calendario futuro"

**Síntoma:** aparecen sessions con `started_at IS NULL`, `finished_at IS NULL`, **0 workout_logs asociados**, `created_at` en o cerca del `logged_date`.

**Lectura:** cuando se asigna un plan a un alumno, en algún punto del flujo se crean N sessions por adelantado, una por cada día previsto. Si el alumno no entrena ese día, queda una huella vacía.

**Por qué es problema:** ensucia métricas de adherencia, contamina queries que esperan que una session signifique "el alumno entrenó", y la cantidad crece linealmente con cada plan asignado.

#### Sub-raíz B: el front NO marca `started_at` / `finished_at`

**Síntoma:** aparecen sessions con `started_at IS NULL`, `finished_at IS NULL`, **pero con workout_logs asociados** (a veces 14 logs cargados).

**Lectura:** el alumno entró, cargó todos sus logs del día, pero la session nunca se actualizó con los timestamps. El flow no tiene un "iniciar sesión" implícito (al primer log) ni un "cerrar sesión" explícito (al marcar terminada).

**Por qué es problema:** sin `started_at` y `finished_at`, no se puede calcular duración de la sesión, no se puede ordenar correctamente por hora, y el cleanup diario no las puede cerrar (porque busca `started_at NOT NULL`).

---

## Qué tenés que hacer

### Opción recomendada: lógica implícita basada en logs

El back recomienda **no agregar UI nueva** (botones de "iniciar"/"finalizar" sesión). En vez de eso, derivar todo desde los logs:

#### 1. Eliminar la pre-creación de sessions

**Buscar en el código:** cualquier `INSERT INTO workout_sessions` que NO esté ligado a la carga de un log. Probablemente está en el flujo de asignación de plan (cuando se calcula el calendario de futuras sesiones).

**Acción:** removerlo. Las sessions se crean solo cuando hay actividad real.

#### 2. Crear la session al primer log (upsert)

Cuando el front inserta un `workout_log`, antes (o al lado) debe asegurar que existe la session correspondiente para `(student_id, plan_id, logged_date)`:

**Opción 2.A: vía RPC nueva (recomendada, atómica)**

Pedile al back que cree:

```sql
CREATE OR REPLACE FUNCTION public.upsert_workout_session(
  p_student_id  uuid,
  p_plan_id     uuid,
  p_logged_date date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- Intenta encontrar la session existente
  SELECT id INTO v_session_id
    FROM public.workout_sessions
   WHERE student_id = p_student_id
     AND plan_id    = p_plan_id
     AND logged_date = p_logged_date
   LIMIT 1;

  IF v_session_id IS NULL THEN
    -- Crear nueva con started_at = now()
    INSERT INTO public.workout_sessions (student_id, plan_id, logged_date, started_at)
    VALUES (p_student_id, p_plan_id, p_logged_date, now())
    RETURNING id INTO v_session_id;
  ELSE
    -- Si existe pero started_at es NULL, marcarlo ahora
    UPDATE public.workout_sessions
       SET started_at = now()
     WHERE id = v_session_id
       AND started_at IS NULL;
  END IF;

  RETURN v_session_id;
END;
$$;
```

Y el front llama `supabase.rpc('upsert_workout_session', { p_student_id, p_plan_id, p_logged_date })` **antes** de insertar el log.

**Opción 2.B: sin RPC, directo desde el front**

Antes del `INSERT INTO workout_logs`, el front hace:

```typescript
// Asegurar que existe la session
const { data: existing } = await supabase
  .from('workout_sessions')
  .select('id, started_at')
  .eq('student_id', studentId)
  .eq('plan_id', planId)
  .eq('logged_date', loggedDate)
  .maybeSingle();

if (!existing) {
  await supabase.from('workout_sessions').insert({
    student_id: studentId,
    plan_id: planId,
    logged_date: loggedDate,
    started_at: new Date().toISOString(),
  });
} else if (!existing.started_at) {
  await supabase.from('workout_sessions')
    .update({ started_at: new Date().toISOString() })
    .eq('id', existing.id);
}

// Recién ahora, insertar el log
await supabase.from('workout_logs').insert({ ... });
```

Más código en TS, pero no requiere RPC nueva. Riesgo de race condition si dos logs llegan a la vez (muy improbable en este caso).

**Recomendación:** Opción 2.A (RPC). Avisame y la armo.

#### 3. Cerrar la session al "terminar"

Cuando el alumno marca la rutina como terminada en la UI (ya existe ese botón "Marcar como completado" en `StudentPlansTab.jsx` o similar), el front debe:

```typescript
await supabase.from('workout_sessions')
  .update({ finished_at: new Date().toISOString() })
  .eq('student_id', studentId)
  .eq('plan_id', planId)
  .eq('logged_date', loggedDate);
```

Si el alumno nunca marca "terminado", el **cron de cleanup diario del back** la cierra automáticamente 24h después (con `finished_at = max(log.updated_at)`).

---

## Plan de validación

Después de los cambios, probá:

1. **Caso ok**:
   - Asignar un plan a un alumno nuevo.
   - Verificar que **NO** se crearon sessions pre-cargadas (`select count(*) from workout_sessions where student_id = <new>` debe dar 0).
   - El alumno carga su primer log del día.
   - Verificar que apareció **una** session con `started_at = now()` y `finished_at = NULL`.
   - El alumno carga más logs.
   - La session sigue siendo la misma, `started_at` no se actualiza.
   - El alumno marca "terminado".
   - La session pasa a `finished_at = now()`.

2. **Caso edge: alumno se va sin marcar terminado**:
   - El alumno carga logs, no marca terminado.
   - Al día siguiente 2 AM, el cron del back cierra la session con `finished_at = max(log.updated_at)`.
   - Verificar en `workout_sessions` que la session quedó cerrada.

3. **Caso defensa**: intentar manualmente vía SQL:
   ```sql
   INSERT INTO public.workout_sessions (student_id, plan_id, logged_date, finished_at)
   VALUES ('<alumno>', '<plan>', current_date, now());
   ```
   Debe fallar con `check_violation` (la constraint sessions_finished_requires_started lo impide).

---

## Métricas a vigilar (las consulta el health check semanal, pero las podés correr vos)

```sql
-- Sessions phantom (deben tender a 0 después de tu fix)
select count(*) from public.workout_sessions ws
where started_at is null and finished_at is null
  and not exists (select 1 from public.workout_logs wl
                  where wl.student_id=ws.student_id and wl.plan_id=ws.plan_id
                    and wl.logged_date=ws.logged_date);

-- Sessions con logs pero sin started_at (deben tender a 0)
select count(*) from public.workout_sessions
where started_at is null
  and exists (select 1 from public.workout_logs wl
              where wl.student_id=workout_sessions.student_id
                and wl.plan_id=workout_sessions.plan_id
                and wl.logged_date=workout_sessions.logged_date);

-- Sessions abandonadas residuales >48h (el health check semanal va a notificar si esto >0)
select count(*) from public.workout_sessions
where started_at is not null and finished_at is null
  and started_at < now() - interval '48 hours';
```

Si las primeras dos métricas se mantienen en 0 una semana después de tu deploy, la raíz quedó tapada.

---

## Resumen para vos

| Tarea | Responsable | Prioridad |
|---|---|---|
| Eliminar pre-creación de sessions al asignar plan | Vos | 🔴 alta |
| Crear session en el primer log (con `started_at = now()`) | Vos | 🔴 alta |
| Cerrar session cuando el alumno marca "terminado" | Vos | 🟠 media (el cron del back es backup) |
| Pedirle al back la RPC `upsert_workout_session` si vas por 2.A | Back | 🟢 a demanda |

Cualquier duda sobre el contrato del back o si necesitás más helpers SQL, avisame.
