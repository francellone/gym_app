# Handoff al front — Refactor de notas (m26 → m27 → m28)

> Documento dirigido al dev del front. Autocontenido: lee esto y vas a tener todo lo que necesitás para refactorizar el flujo de notas sin romper nada en el back.
>
> Estado del back al 2026-05-18: **migrado al modelo unificado de notas con un shim de compatibilidad activo**. El shim te tapa el bug actual, pero hay que migrar el front para poder eliminarlo y dejar la arquitectura limpia.

---

## 1. El problema en una frase

El front escribe notas a **columnas que ya no son la fuente de verdad** (`workout_block_logs.notes`, `workout_logs.notes`, `evaluation_results.notes`). Esas columnas fueron eliminadas en m26 a favor de una tabla unificada `public.notes` con threading coach↔alumno. Eso rompió a los alumnos (no podían cargar HIIT, "marcar completado" no actualizaba). Pusimos un shim que recibe los writes legacy y los transmuta a la tabla nueva, pero el shim es temporal: tu trabajo es migrar las llamadas para que el front escriba directo al modelo nuevo.

---

## 2. Bug original que reportó la usuaria

```
Could not find the 'notes' column of 'workout_block_logs' in the schema cache
```

Pasa cuando el front hace algo como:

```ts
await supabase
  .from('workout_block_logs')
  .upsert({
    student_id,
    plan_id,
    plan_block_id,
    logged_date,
    completed: true,
    notes: 'me costó'   // ← esta columna no existe más en la BD
  });
```

PostgREST consulta su schema cache, no encuentra `notes`, **rechaza el request entero** (no se inserta ni se updatea nada). Por eso la alumna no pudo cargar el HIIT.

El bug "marcar completado no aparece en verde sin refresh" es la misma causa: el upsert falla por la columna `notes`, el estado optimista se mantiene un segundo y luego se revierte cuando llega el error. Al refrescar, una query distinta (un `SELECT` que no envía `notes`) lee el dato real.

---

## 3. Historia: por qué se eliminaron las columnas legacy

Antes de m26 cada tabla tenía su propia columna de comentarios:

```
workout_logs.notes            text
workout_block_logs.notes      text
workout_sessions.borg_notes   text
evaluation_results.notes      text
evaluation_test_responses.student_comment        text
evaluation_test_responses.coach_comment_public   text
evaluation_test_responses.coach_comment_private  text
profiles.payment_notes        text
```

Cada nota vivía aislada en su tabla. Era imposible darle al coach una vista unificada del "diálogo" con su alumno; cada pantalla mostraba un fragmento. Tampoco había threading, ni read receipts, ni notificaciones de "nueva nota", ni distinción entre nota pública y nota privada del coach.

**m26 unificó todo en `public.notes` + `public.note_threads`** (migración real en el repo, versiones `v24` a `v26f`). El nuevo modelo permite:

- Un único thread por par `(coach_id, student_id)`.
- Mensajes con autor, rol, visibilidad (`shared` vs `coach_private`).
- Contexto opcional: una nota puede colgar de un workout_log, un workout_block_log, una evaluation, un ejercicio del catálogo, etc.
- Replies (`parent_note_id`).
- Read receipts (`read_at_coach`, `read_at_student`).
- Tags.
- Notificaciones automáticas (triggers).
- Realtime habilitado.

El "panel de chat" del coach ya usa este modelo. Lo que quedó sin migrar es **el flow de logueo de entrenamiento** (cuando el alumno aprieta "marcar completado" en un ejercicio o bloque y escribe una nota corta).

---

## 4. Estado actual del back (qué podés asumir)

### 4.1. Tablas del modelo nuevo

**`public.note_threads`** — un thread por par único `coach_id + student_id`.

```sql
id                  uuid PK
coach_id            uuid NOT NULL → profiles(id) ON DELETE CASCADE
student_id          uuid NOT NULL → profiles(id) ON DELETE CASCADE
pinned              boolean NOT NULL DEFAULT false
last_message_at     timestamptz
unread_for_coach    integer NOT NULL DEFAULT 0
unread_for_student  integer NOT NULL DEFAULT 0
created_at          timestamptz NOT NULL DEFAULT now()
updated_at          timestamptz NOT NULL DEFAULT now()

UNIQUE (coach_id, student_id)
CHECK (coach_id <> student_id)
```

**`public.notes`** — todas las notas (chat libre + contextualizadas).

```sql
id                uuid PK
thread_id         uuid NOT NULL → note_threads(id) ON DELETE CASCADE
author_id         uuid NOT NULL → profiles(id) ON DELETE SET NULL
author_role       text NOT NULL CHECK in ('coach','student')
body              text NOT NULL CHECK length(trim(body)) > 0
visibility        text NOT NULL DEFAULT 'shared'
                  CHECK in ('shared','coach_private')
                  -- 'coach_private' solo si author_role = 'coach'
context_type      text NOT NULL DEFAULT 'free'
                  CHECK in ('free','workout_log','workout_block_log',
                           'plan_exercise','evaluation_test',
                           'evaluation_result','plan','session_day','exercise')
context_id        uuid          -- NOT NULL si context_type <> 'free'
exercise_id       uuid → exercises(id) ON DELETE SET NULL  -- denormalizado, lo resuelve un trigger
muscle_group      text                                     -- denormalizado, lo resuelve un trigger
block_type        text CHECK in ('strength','aerobic','circuit')
parent_note_id    uuid → notes(id) ON DELETE SET NULL      -- replies
tags              text[] NOT NULL DEFAULT '{}'
read_at_coach     timestamptz
read_at_student   timestamptz
note_date         date                                      -- fecha "del entrenamiento", no de creación
created_at        timestamptz NOT NULL DEFAULT now()
updated_at        timestamptz NOT NULL DEFAULT now()
deleted_at        timestamptz                               -- soft-delete
```

Constraint clave:
```
CHECK (
  (context_type = 'free'  AND context_id IS NULL) OR
  (context_type <> 'free' AND context_id IS NOT NULL)
)
```

### 4.2. Triggers automáticos (cosas que NO tenés que hacer manualmente)

Al insertar una fila en `notes` se disparan automáticamente:

- **`trg_notes_resolve_context`** — popula `exercise_id`, `muscle_group`, `block_type` si el `context_id` apunta a algo que los tiene. Vos solo pasás `context_type` + `context_id`; el resto lo resuelve la BD.
- **`trg_notes_bump_thread_ins`** — actualiza `note_threads.last_message_at` y los contadores `unread_for_coach`/`unread_for_student` del thread.
- **`trg_notify_coach_note`** — si el autor es alumno, crea una fila en `notifications` para el coach.
- **`trg_notify_student_note`** — si el autor es coach y la visibilidad es `shared`, notifica al alumno.
- **`trg_notes_reset_read_on_body_edit`** — si se edita el body, resetea los `read_at_*` (el otro lado tiene que volver a marcar como leído).
- **`trg_notes_updated_at`** — mantiene `updated_at`.

### 4.3. Realtime

`public.notes` está en la publication de realtime. Cualquier INSERT/UPDATE se broadcastea. Si ya tenés una suscripción en el panel de chat, va a recibir también las notas que escribís desde el flow de logueo (con el mismo thread).

### 4.4. RLS (qué le permite el back al cliente)

Sobre `public.notes`:

- **Student** puede leer notas `visibility='shared'` de SU thread.
- **Student** puede insertar notas en SU thread con `author_id = auth.uid()`, `author_role='student'`, `visibility='shared'`.
- **Coach** tiene sus propias policies (no las pegué acá pero podés leer cualquier nota de threads donde es el coach, e insertar con `coach_private` o `shared`).

Sobre `public.note_threads`:

- Solo coach y alumno del par pueden ver/modificar el thread.

### 4.5. El shim de compatibilidad (v27) — qué hace y por qué existe

Mientras el front no migre, hay un shim viviendo en el back:

```
[ workout_block_logs / workout_logs / evaluation_results ].notes  (text)
                              │
                              │  BEFORE INSERT OR UPDATE OF notes
                              ▼
         fn_legacy_notes_shim()
                              │
                              ├──→ public.notes (inserta la fila correcta)
                              │
                              └──→ public.legacy_notes_shim_log (audit)

         NEW.notes := null;   ← la columna legacy NO almacena nada
```

Detalles importantes:

- **Cuando escribís `{ notes: 'x' }` en un upsert a esas 3 tablas, el dato termina en `public.notes`** con `context_type` y `context_id` correctos. No se pierde.
- **La columna `notes` queda en NULL en la tabla legacy.** No la uses para leer.
- **Si la transmutación falla, el INSERT/UPDATE original NO se rompe** (loguea el error en `legacy_notes_shim_log` con `outcome='error'` y sigue). Política explícita: el alumno nunca pierde un entrenamiento por un fallo del shim.
- **El shim es temporal.** Cuando vos termines de migrar y el audit log deje de loguear `outcome='created'` durante 2 semanas, el back va a eliminar las columnas + el trigger + la función en una migración de 6 líneas.

---

## 5. Qué necesitás cambiar en el front

### 5.1. Detectar los lugares afectados

Hacé un grep en el código del front por estos patrones:

```bash
# Cualquier upsert/insert/update que mande "notes" a estas 3 tablas
rg "workout_block_logs" -B 5 -A 30 | rg -B 30 "notes\s*[:=]"
rg "workout_logs"       -B 5 -A 30 | rg -B 30 "notes\s*[:=]"
rg "evaluation_results" -B 5 -A 30 | rg -B 30 "notes\s*[:=]"

# También buscá la versión old explícitamente:
rg "\.from\(['\"]workout_block_logs['\"]\)"
rg "\.from\(['\"]workout_logs['\"]\)"
rg "\.from\(['\"]evaluation_results['\"]\)"

# Y campos antiguos de evaluation_test_responses (esos también se dropearon):
rg "(student_comment|coach_comment_public|coach_comment_private)"

# Y borg_notes en workout_sessions:
rg "borg_notes"

# Y payment_notes en profiles:
rg "payment_notes"
```

Los que sí van a aparecer y debés cambiar:
- Cualquier upsert/update a `workout_logs` que incluya `notes`.
- Cualquier upsert/update a `workout_block_logs` que incluya `notes`.
- Cualquier upsert/update a `evaluation_results` que incluya `notes`.
- Si tu UI tiene comentarios separados (student_comment, coach_public, coach_private) sobre respuestas de evaluación: esos también se dropearon. La nueva forma es notas con `context_type='evaluation_test'` o `'evaluation_result'` y la diferenciación entre privada/pública se hace con `visibility='coach_private'` (solo si el autor es coach).
- `workout_sessions.borg_notes`: dropeada. Si el front la usa, las notas de sesión van a `public.notes` con `context_type='session_day'` o el que prefieras.
- `profiles.payment_notes`: dropeada también según el audit. Si la usás, va a `public.notes` con `context_type='free'`.

### 5.2. La API oficial: 3 RPCs (migración v28)

Para los 3 casos del flow de logueo, el back ya expone RPCs llamables vía `supabase.rpc(...)`:

```ts
// ─── Bloque (HIIT, circuit, aeróbico) ───
const { data: noteId, error } = await supabase.rpc('add_note_for_workout_block_log', {
  p_block_log_id: blockLogId,   // uuid del workout_block_log recién insertado/updateado
  p_body: 'me costó'
});

// ─── Ejercicio individual (strength) ───
const { data: noteId, error } = await supabase.rpc('add_note_for_workout_log', {
  p_workout_log_id: workoutLogId,
  p_body: 'pude subir 2.5kg'
});

// ─── Resultado de evaluación ───
const { data: noteId, error } = await supabase.rpc('add_note_for_evaluation_result', {
  p_eval_result_id: evalResultId,
  p_body: 'no tuve molestias'
});
```

Cada RPC:
- Valida que el body no esté vacío (`error.message: 'note body cannot be empty'`).
- Resuelve el `student_id` desde el contexto.
- Detecta el rol del autor con `auth.uid()` (rechaza si no sos ni el alumno ni el coach asignado).
- Upsertea el thread, inserta en `notes`, devuelve el `id` de la nota.
- Está limitado al rol `authenticated` (no anon).

### 5.3. Para chat libre (no contextualizado) o casos no cubiertos por las 3 RPCs

Si necesitás insertar una nota sin contexto, INSERT directo a `public.notes`:

```ts
// 1) Asegurar thread
const { data: thread } = await supabase
  .from('note_threads')
  .upsert(
    { coach_id, student_id },
    { onConflict: 'coach_id,student_id', ignoreDuplicates: false }
  )
  .select('id')
  .single();

// 2) Insertar nota
await supabase.from('notes').insert({
  thread_id: thread.id,
  author_id: user.id,
  author_role: 'student',       // o 'coach'
  body: 'mensaje libre',
  context_type: 'free',          // sin context_id
  visibility: 'shared'           // o 'coach_private' si sos coach
});
```

Probablemente el panel de chat actual ya hace esto. Reusá ese helper en lugar de duplicar lógica.

### 5.4. Refactor concreto: antes y después

**Antes (lo que rompe hoy):**

```ts
async function markBlockCompleted({ studentId, planId, planBlockId, loggedDate, notes }) {
  const { data, error } = await supabase
    .from('workout_block_logs')
    .upsert({
      student_id: studentId,
      plan_id: planId,
      plan_block_id: planBlockId,
      logged_date: loggedDate,
      completed: true,
      notes,                       // ← acá está el problema
    }, { onConflict: 'student_id,plan_block_id,logged_date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

**Después (modelo definitivo):**

```ts
async function markBlockCompleted({ studentId, planId, planBlockId, loggedDate, notes }) {
  // 1) Upsert SIN notes
  const { data: blockLog, error } = await supabase
    .from('workout_block_logs')
    .upsert({
      student_id: studentId,
      plan_id: planId,
      plan_block_id: planBlockId,
      logged_date: loggedDate,
      completed: true,
    }, { onConflict: 'student_id,plan_block_id,logged_date' })
    .select()
    .single();

  if (error) throw error;

  // 2) Si el alumno escribió una nota, la mandamos por la RPC
  if (notes && notes.trim().length > 0) {
    const { error: noteErr } = await supabase.rpc('add_note_for_workout_block_log', {
      p_block_log_id: blockLog.id,
      p_body: notes,
    });
    // No bloqueamos el flow si la nota falla; logueamos y seguimos.
    if (noteErr) console.warn('failed to attach note', noteErr);
  }

  return blockLog;
}
```

**Lo mismo pero para workout_logs:**

```ts
async function logSetCompletion({ studentId, planId, planExerciseId, loggedDate, payload, notes }) {
  const { data: workoutLog, error } = await supabase
    .from('workout_logs')
    .upsert({
      student_id: studentId,
      plan_id: planId,
      plan_exercise_id: planExerciseId,
      logged_date: loggedDate,
      completed: true,
      ...payload,                  // actual_sets, actual_reps_jsonb, actual_weights_jsonb, perceived_difficulty, etc.
    }, { onConflict: 'student_id,plan_exercise_id,logged_date' })
    .select()
    .single();

  if (error) throw error;

  if (notes?.trim()) {
    await supabase.rpc('add_note_for_workout_log', {
      p_workout_log_id: workoutLog.id,
      p_body: notes,
    });
  }

  return workoutLog;
}
```

### 5.5. Pitfalls comunes

1. **Idempotencia**: si tu UI permite "guardar" varias veces el mismo log con la misma nota, vas a crear varias notas duplicadas en `public.notes`. La nota NO es upsert — cada llamada crea una fila nueva. Manejá esto en el front (deshabilitar el botón mientras el request está en curso, debounce, comparar con el último valor enviado, etc.).

2. **Permisos**: las RPCs validan `auth.uid()`. Si la sesión expiró o sos un coach intentando escribir como alumno (o viceversa), vas a recibir `caller X is neither the student nor the assigned coach`.

3. **Body vacío**: el back rechaza body vacío con `note body cannot be empty`. En el front, no llames a la RPC si la nota está vacía (lo de mi ejemplo `if (notes?.trim())`).

4. **Alumno sin coach**: si el alumno no tiene `coach_id` (cuentas test, alumnos nuevos sin reclamar), la RPC tira `student X has no coach assigned`. El front debería ocultar el input de nota en ese caso, o manejar el error.

5. **Lectura**: si después del upsert hacés un `.select('*')` y esperabas leer el `notes` que mandaste, **no va a venir** (la columna queda NULL). Para mostrar la nota recién creada, leé de `public.notes` (o reusá el optimistic update del front antes de que llegue la confirmación).

---

## 6. Cómo leer notas de un contexto

### 6.1. Notas de un workout_block_log específico

```ts
const { data: notes } = await supabase
  .from('notes')
  .select('id, body, author_role, author_id, created_at, visibility, read_at_coach, read_at_student')
  .eq('context_type', 'workout_block_log')
  .eq('context_id', blockLogId)
  .is('deleted_at', null)
  .order('created_at', { ascending: true });
```

### 6.2. Todas las notas del thread del alumno (chat completo)

```ts
const { data: thread } = await supabase
  .from('note_threads')
  .select('id')
  .eq('coach_id', coachId)
  .eq('student_id', studentId)
  .maybeSingle();

if (thread) {
  const { data: notes } = await supabase
    .from('notes')
    .select('*')
    .eq('thread_id', thread.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
}
```

### 6.3. Mostrar el badge de "no leídas" del alumno

`note_threads.unread_for_student` ya tiene el contador. Suscribite a realtime de `note_threads` o leelo cuando carga la home.

### 6.4. Marcar como leído

Hay una RPC ya creada: `notes_mark_thread_read(p_thread_id uuid)`. Llamala cuando el alumno abre la conversación o cuando pinta el card del bloque.

---

## 7. Cómo verificar que tu refactor funciona

### 7.1. En desarrollo (vos)

Para cada uno de los 3 flows (block_log, workout_log, evaluation_result):

1. Iniciá sesión como un alumno test.
2. Generá un log con una nota.
3. Abrí el SQL editor de Supabase y corré:

```sql
-- Verificá que la nota está en public.notes
select id, context_type, context_id, body, author_role, created_at
from public.notes
where created_at > now() - interval '5 minutes'
order by created_at desc;

-- Verificá que la columna legacy NO se llenó (debería ser NULL)
select id, completed, notes
from public.workout_block_logs
where created_at > now() - interval '5 minutes';

-- Verificá que el audit del shim NO loguea (porque ya no usás esa puerta)
select source_table, outcome, count(*)
from public.legacy_notes_shim_log
where occurred_at > now() - interval '5 minutes'
group by 1,2;
```

Lo que tiene que pasar:
- `public.notes` → tu nota nueva, con `context_type` correcto.
- `workout_block_logs.notes` → NULL.
- `legacy_notes_shim_log` con outcome='created' → **vacío**. Si aparecen filas con `outcome='created'`, todavía hay un path en el front mandando `notes`. Buscá y migralo.

### 7.2. En staging/producción (deploy gradual)

Una vez deployado, monitoreá el audit log:

```sql
select source_table, outcome, count(*), max(occurred_at) as ultimo
from public.legacy_notes_shim_log
where occurred_at > now() - interval '7 days'
group by 1, 2
order by 1, 2;
```

Lo querés ver así (escenario éxito):
```
source_table      | outcome  | count | ultimo
------------------+----------+-------+----------------
(empty result)
```

O eventualmente solo `outcome='skipped_no_coach'` o `outcome='skipped_empty'` (que indican que el shim recibió algo pero no era escribible — son OK porque no son writes válidos).

Lo que **NO** querés ver:
```
workout_block_logs | created  | 5 | <fecha reciente>
```
Eso significa que algún path del front todavía manda `notes` y está triggerando el shim.

---

## 8. Cómo saber que terminaste (definición de DONE)

Cuando se cumplen estas 3 condiciones:

1. ✅ El front ya no tiene **ninguna** referencia a `.notes` en INSERTs/UPDATEs/UPSERTs a `workout_block_logs`, `workout_logs`, ni `evaluation_results`.
2. ✅ Todas las creaciones de nota desde el flow de logueo usan las RPCs `add_note_for_*` (o INSERT directo a `notes` para chat libre).
3. ✅ Durante 14 días corridos, esta query devuelve 0 filas:

```sql
select count(*)
from public.legacy_notes_shim_log
where occurred_at > now() - interval '14 days'
  and outcome = 'created';
```

Cuando se cumplan los 3, avisame en el chat y aplico la migración de cierre (v29):

```sql
-- v29_drop_legacy_notes_shim (lo que YO aplicaré cuando confirmes DONE)
drop trigger trg_legacy_notes_shim on public.workout_block_logs;
drop trigger trg_legacy_notes_shim on public.workout_logs;
drop trigger trg_legacy_notes_shim on public.evaluation_results;
drop function public.fn_legacy_notes_shim();
alter table public.workout_block_logs drop column notes;
alter table public.workout_logs       drop column notes;
alter table public.evaluation_results drop column notes;
-- public.legacy_notes_shim_log queda como histórico (o se mueve a archive).
```

A partir de ese momento, si por error el front intenta escribir `notes` otra vez, va a recibir el error de schema cache original y tendrás que arreglarlo de nuevo. La idea es que cuando dropeemos, **el front ya no toca esas columnas en ningún lado**.

---

## 9. Checklist resumido

- [ ] Grep en el código por `notes:`, `notes =`, `borg_notes`, `student_comment`, `coach_comment_public`, `coach_comment_private`, `payment_notes` en queries a workout/eval/profiles.
- [ ] Por cada upsert/update a `workout_block_logs`, `workout_logs`, `evaluation_results` que mande `notes`: separar en dos calls (upsert sin `notes` + `rpc('add_note_for_*')`).
- [ ] Si el front muestra el `notes` después del upsert: cambiar a leer desde `public.notes`.
- [ ] Si tenés comentarios sobre `evaluation_test_responses`: migrar a notas con context apropiado (puedo crear RPCs adicionales si los necesitás — avisame).
- [ ] Si usás `workout_sessions.borg_notes` o `profiles.payment_notes`: migrar al modelo de notes.
- [ ] Probar los 3 flows en local con un alumno test.
- [ ] Verificar que `legacy_notes_shim_log` no recibe nuevos `outcome='created'` durante el desarrollo.
- [ ] Deploy a staging/prod.
- [ ] Monitoreo 14 días.
- [ ] Avisarme para aplicar v29 (drop final).

---

## 10. Apéndice: dudas frecuentes

**¿Tengo que cambiar el panel de chat?**
No, ese ya usa el modelo nuevo (las migraciones v24-v25 lo dejaron correcto). Solo hay que migrar el flow de logueo de entrenamiento + evaluaciones.

**¿Las notas legacy de antes de m26 se preservaron?**
Sí. Las migraciones de m26 hicieron el backfill: las notas viejas que vivían en `workout_logs.notes` etc. fueron copiadas a `public.notes` antes del drop. Si querés revisar, hay registro de eso en `legacy_notes_shim_log` con `outcome='created'` para entries históricas. (Las que veas con `occurred_at` antiguo son del backfill original.)

**¿Qué pasa si el alumno escribe una nota muy larga?**
`body` es `text` sin límite. Va a entrar igual. Si querés limitar UX, hacelo en el front.

**¿Y si quiero soft-delete una nota?**
`update notes set deleted_at = now() where id = $1`. Hay una policy que permite al autor soft-deletar sus propias notas. Todas las queries de read filtran por `deleted_at is null`.

**¿Cómo edito una nota?**
Update sobre `notes.body`. Hay un trigger `trg_notes_reset_read_on_body_edit` que resetea los read_at del otro lado para forzar re-lectura. Onceale al UX que las ediciones se notan.

**¿Y las notas privadas del coach?**
`INSERT INTO notes (..., visibility = 'coach_private')`. El check constraint exige que `author_role = 'coach'`. Las policies de RLS hacen que el alumno no las vea.

**¿Puedo cambiar el thread una vez creado?**
No. El thread se crea automáticamente la primera vez que un par (coach, alumno) intercambia una nota. Si reasignás el coach del alumno, el thread viejo queda con el coach anterior (intencional: preserva el historial).

**¿Hay un endpoint para listar todas las notas filtrando por exercise, tag, etc.?**
Sí: `notes_thread_filter_options(p_thread_id uuid)` devuelve los filtros disponibles. Para el filtrado real, query directo a `notes` con los WHERE pertinentes (los índices están armados para los casos comunes: `thread_id+created_at`, `context_type+context_id`, `exercise_id`, `muscle_group`, `block_type`, `tags` GIN).

**¿Realtime?**
Sí, `public.notes` está en la publication. Suscribite con:
```ts
supabase.channel(`notes:thread=${threadId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes', filter: `thread_id=eq.${threadId}` }, ...)
  .subscribe();
```

---

**TL;DR**: dejá de mandar `notes` en upserts a `workout_block_logs/workout_logs/evaluation_results`. Usá `supabase.rpc('add_note_for_*')` en su lugar. El shim te tapa hoy; el deploy del front limpio nos permite dropearlo.
