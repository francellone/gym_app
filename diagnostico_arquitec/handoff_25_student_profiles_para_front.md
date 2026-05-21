# Handoff 2.5 — `student_profiles` deprecada: auditoría del front antes de migrar

**Fecha:** 2026-05-15
**De:** agente trabajando sobre Supabase (back)
**Para:** agente del front
**Bug original:** 2.5 del diagnóstico (`diagnostico-supabase.md`)
**Estado del back:** ⏸️ esperando confirmación tuya antes de migrar

---

## TL;DR

La tabla `public.student_profiles` está marcada en su propio `COMMENT` como deprecada ("no leer desde el frontend, no agregar nuevas consultas aquí"). Tiene 4 filas con datos del intake form que en parte ya viven en `profiles` y en parte completan campos vacíos.

**Plan del back:**
1. Migrar lo único que vale de `student_profiles` a `profiles`.
2. Reescribir la función `process_intake_submission()` para que escriba directo a `profiles`.
3. Mover `student_profiles` al schema `archive` (preservando datos, igual que hicimos con la tabla `plan_assignments_backup_20260508`).

**Lo que necesito de vos antes de tocar nada:**
- Confirmar que **el código no llama `supabase.from('student_profiles')`** en ninguna parte (leer o escribir).
- Confirmar que **nadie llama `supabase.rpc('process_intake_submission')`** esperando un efecto particular sobre `student_profiles` (si lo llaman, el efecto va a cambiar: escribirá a profiles directo).

Si encontrás referencias, decime qué hacen y vemos juntos.

---

## Contexto técnico

### Lo que descubrí del lado del back

| Item | Estado |
|---|---|
| `student_profiles` filas | 4 (anabmoran, annto51099, francellone, student1) |
| Views que leen `student_profiles` | 0 |
| Triggers en `student_profiles` | 0 |
| Funciones que **leen** `student_profiles` | 0 |
| Funciones que **escriben** en `student_profiles` | 1: `process_intake_submission()` |
| FKs entrantes hacia `student_profiles` | 0 |
| FKs salientes desde `student_profiles` | 2: → `profiles(id) ON DELETE CASCADE` y → `intake_form_submissions(id) ON DELETE SET NULL` |
| `raw_data` (snapshot del intake) duplicado en otro lado | ✅ Sí, en `intake_form_submissions.profile_snapshot` |

### Conflictos de datos entre las dos tablas

Para los 4 alumnos, la regla de migración que va a aplicar el back es **"priorizar `student_profiles` cuando hay diferencia"** (los datos del intake son la verdad). Esto implica:

| Alumno | Campo | profile actual | sp (intake) | Acción |
|---|---|---|---|---|
| **Ana Moran** | level | `beginner` | `Intermedio (1-3 años)` → `intermediate` | Pisar profile |
| **Ana Moran** | goal | NULL | `Mejorar salud general` | Completar profile |
| **Ana Moran** | weekly_frequency | NULL | `3 veces` → `3` | Completar profile |
| **Ana Moran** | lugar_entrenamiento | NULL | `Gimnasio con equipamiento completo` | Completar profile |
| **Ana Moran** | tiene_lesiones | NULL | `false` | Completar profile |
| **Ana Moran** | patologias | NULL | `['Ninguna']` | Completar profile |
| **anto almanza** | weekly_frequency | `4` | `5 veces` → `5` | Pisar profile |
| **francellone** | (sin conflictos) | — | — | Sin cambios |
| **student1** | level | NULL | `Intermedio (1-3 años)` → `intermediate` | Completar profile |
| **student1** | weekly_frequency | NULL | `3 veces` → `3` | Completar profile |

Si alguno de estos cambios no te cuadra (ej. si sabés que la coach manualmente puso a Ana en "beginner" porque empezó de cero pese al intake), avisame antes de ejecutar.

### Reescritura de `process_intake_submission`

Hoy la función toma un `submission_id`, lee `intake_form_submissions`, y hace `INSERT INTO student_profiles ... ON CONFLICT (student_id) DO UPDATE SET ...`. Lo voy a cambiar para que haga `UPDATE public.profiles SET goal = ..., level = ..., ...` con la misma lógica de mapeo (text → enum, "3 veces" → 3, etc).

**Si el front llama esta función:** seguirá funcionando igual, solo que el efecto va a estar en `profiles` en vez de `student_profiles`. Si el front luego lee `profiles` (lo correcto), no se entera del cambio.

**Si el front llama esta función Y después lee `student_profiles` para confirmar el cambio:** rompe. Por eso te pido que confirmes antes.

---

## Qué tenés que hacer (corto)

```bash
# Buscar referencias en el código front
grep -rn "student_profiles" src/
grep -rn "process_intake_submission" src/
```

**Reportame:**

1. ¿Hay archivos que mencionen `student_profiles`? Si sí, ¿qué hacen?
2. ¿Hay archivos que llamen `process_intake_submission`? Si sí, ¿esperan que escriba en `student_profiles` o solo confían en que "alguna magia" haga lo correcto?
3. ¿Estás de acuerdo con los 8 cambios de datos de la tabla de conflictos (sección anterior)?

Si todo está limpio, ejecuto el plan completo y aviso.

---

## Plan de ejecución del back (cuando confirmes)

Una sola migración atómica:

1. **Migración de datos** — UPDATE de `profiles` con los datos de `student_profiles` (regla: priorizar sp donde haya conflicto). El trigger de auditoría que pusimos hoy (3.5) va a registrar cada cambio en `student_edit_history` con `changed_by = NULL` y un comentario indicando que fue migración sistémica.

2. **Reescritura de `process_intake_submission`** — apunta a `profiles` con los mismos mapeos.

3. **Mover `student_profiles` a `archive`**:
   ```sql
   ALTER TABLE public.student_profiles SET SCHEMA archive;
   ```
   La tabla queda viva con sus 4 filas, fuera del autocomplete de PostgREST. Si algo se rompe inesperadamente, se puede revertir con un `ALTER TABLE archive.student_profiles SET SCHEMA public;`.

4. **Comentario actualizado** en `profiles.goal` / `level` / etc indicando que son la única fuente de verdad post-2026-05-15.

---

## Nota sobre regresión

El health check semanal (`fn_schema_health_check`) **no incluye** un check de "tablas que vivían en public y fueron archivadas". Si en algún momento alguien recrea `student_profiles` en `public`, no se va a detectar automáticamente.

Si querés agregar ese check, decime y lo sumo al health check (1 query más).

---

Cualquier duda o si encontrás algo raro en el front, avisame antes de que ejecute la migración.
