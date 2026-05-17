# Plan de deprecación — campos legacy de notas (post v24)

**Estado:** v24 + v24b/c/d/e/f aplicadas en producción entre 2026‑05‑16 y 2026‑05‑17. Backfill OK (10 threads, 64 notas migradas, 49 timestamps únicos en 13 días). Smoke tests G.1–G.5 verdes. Auditoría post‑hotfixes ejecutada y cerrada para Fase A.

## 0. Migraciones aplicadas hasta acá

| Versión | Qué hace | Estado |
|---|---|---|
| `v24` | Crea `note_threads` + `notes` con RLS, triggers, RPC `notes_get_or_create_thread`, backfill de los 6 campos viejos | ✓ aplicada |
| `v24b` | Policy `coach_select_all_exercises` (catálogo compartido) | ✓ aplicada |
| `v24c` | Re‑ancla `created_at` de notas backfilleadas a los timestamps reales de la fila origen (`updated_at` había sido tocado en masa) | ✓ aplicada |
| `v24d` | RPC `notes_thread_filter_options` para que los selectores muestren solo valores con notas en el thread | ✓ aplicada |
| `v24e` | Habilita realtime en `notes` + `note_threads` (`ALTER PUBLICATION supabase_realtime`) | ✓ aplicada |
| `v24f` | RPC `notes_mark_thread_read` (bypasa RLS con SECURITY DEFINER para el alumno) + endurece policies del coach: `Coach select all notes` (SELECT) + `Coach insert as self coach` (INSERT exige `author_id = auth.uid()` y `author_role = 'coach'`) + `Coach update notes` (UPDATE permisivo) | ✓ aplicada |
| `v25a` | Tipo `student_note` en `notifications_type_check` + trigger `fn_notify_student_note` (AFTER INSERT en `notes` para `author_role='student'`). El coach recibe push/badge cuando el alumno escribe. | ✓ aplicada |
| `v25b` | `context_type='exercise'` agregado al enum + rama nueva en `notes_resolve_context`. Permite adjuntar una nota a un ejercicio del catálogo (no a un log/plan específico). El trigger denormaliza `exercise_id = context_id` y `muscle_group` haciendo lookup a `exercises`. | ✓ aplicada |
| `v25c` | Trigger `notes_resolve_context` ahora respeta `muscle_group` enviado por el cliente cuando `context_type='free'`. Habilita "notas de grupo muscular sueltas" (sin atarlas a un ejercicio) que igual aparecen en el filtro por grupo. | ✓ aplicada |
| `v25d` | **Fase C — dual write triggers.** Triggers en `workout_logs` (col `notes`) y `evaluation_test_responses` (`student_comment`, `coach_comment_public`, `coach_comment_private`) que espejan cada save a la tabla `notes`. Update de `notes_bump_thread` para decrementar contadores cuando una nota previamente unread se soft-deletea. Sin cambios de UI: las textareas viejas siguen funcionando idénticamente. | ✓ aplicada |

**Resumen ejecutivo.** v24 creó la única fuente de verdad de comunicación coach↔alumno (`note_threads` + `notes`) y **dejó intactos** los 6 campos viejos donde la comunicación vivía dispersa. Mientras el front todavía los lee/escribe, los dos sistemas conviven. Cuando el front esté 100% migrado a `notes`, los campos viejos se borran con `migration_v26_drop_legacy_notes.sql`.

**Aclaración importante:** no se deprecan tablas completas, solo columnas dentro de tablas que siguen vivas. `profiles`, `workout_logs`, `workout_block_logs` y `evaluation_test_responses` quedan; solo se sueltan columnas específicas.

---

## 1. Qué se va a borrar (y de dónde)

| Tabla | Columna a borrar | Contenido que tenía | Reemplazo en `notes` |
|---|---|---|---|
| `profiles` | `observations` | Observación pública del coach al alumno (un único campo, se sobreescribe) | `notes` con `visibility='shared'`, `context_type='free'`, `author_role='coach'` |
| `profiles` | `coach_notes` | Notas privadas del coach (no visibles al alumno) | `notes` con `visibility='coach_private'`, `context_type='free'`, `author_role='coach'` |
| `workout_logs` | `notes` | Anotación del alumno sobre la ejecución de un ejercicio | `notes` con `context_type='workout_log'`, `context_id=workout_logs.id`, `author_role='student'` |
| `workout_block_logs` | `notes` | Anotación del alumno sobre el registro de un bloque (aeróbico/circuito) | `notes` con `context_type='workout_block_log'`, `context_id=workout_block_logs.id`, `author_role='student'` |
| `evaluation_test_responses` | `coach_comment_public` | Comentario del coach al test, visible al alumno | `notes` con `visibility='shared'`, `context_type='evaluation_test'`, `context_id=test_id`, `author_role='coach'` |
| `evaluation_test_responses` | `coach_comment_private` | Comentario privado del coach al test | `notes` con `visibility='coach_private'`, `context_type='evaluation_test'`, `context_id=test_id`, `author_role='coach'` |
| `evaluation_test_responses` | `student_comment` | Respuesta del alumno al comentario del coach en el test | `notes` con `visibility='shared'`, `context_type='evaluation_test'`, `context_id=test_id`, `author_role='student'` |

**Campos que NO se tocan** (no son comunicación, son contenido del plan):

- `exercises.technique_notes` — instrucciones técnicas del ejercicio en el catálogo.
- `plan_exercises.extra_notes` — instrucción del coach embebida en el plan.
- `plan_blocks.notes` — instrucción técnica del bloque.
- `workout_sessions.borg_notes` y los `{day}_notes` por día — pendiente de decisión arquitectónica aparte (ver §5).

---

## 2. Criterios de aceptación para deprecar

Antes de correr `migration_v26_drop_legacy_notes.sql`, los 4 puntos siguientes tienen que estar verdes:

1. **El front no escribe a ningún campo viejo.** Una búsqueda en `/src` por los nombres de campo no debe devolver `UPDATE`/`INSERT`/`upsert` apuntando a esas columnas. Patrones a grepear:
   ```
   .from('profiles').update(... observations ...
   .from('profiles').update(... coach_notes ...
   .from('workout_logs').upsert(... notes:
   .from('workout_block_logs').upsert(... notes:
   .from('evaluation_test_responses').upsert(... coach_comment_public
   .from('evaluation_test_responses').upsert(... coach_comment_private
   .from('evaluation_test_responses').upsert(... student_comment
   ```
2. **El front no lee de ningún campo viejo.** Mismas búsquedas pero apuntando a `.select(...)` que incluyan esas columnas, y en componentes (`StudentInfoTab`, `TodayWorkoutPage`, `StudentEvaluationsTab`, `EvalWorkoutPage`, `StudentLogsTab`).
3. **Reporte 0-drift por al menos 7 días.** Una query diaria (manual o cron) que compare el contenido de los campos viejos vs el último `note.body` del thread correspondiente. Si el delta es 0 durante una semana, asumimos que nadie está actualizando los viejos por backdoor (otros tools, scripts ad-hoc, etc.).
4. **Backup verificable.** Tomar un dump de las columnas a borrar antes del DROP, guardarlo fuera de la DB (S3, GitHub release, lo que sea). Ya está la convención `schema=archive` en el repo (ver `fix_2_7_archive_backup_and_2_2_sessions_consistency`); aplicar el mismo patrón.

---

## 3. Plan de release (orden + fases del front)

El roadmap del front (de la propuesta original):

- **Fase A — Fundación (read-only).** ✅ Hecha. Coach ve el panel con todo lo backfilleado. Cero cambios de escritura.
- **Fase B — Coach escribe + alumno lee.** Pendiente. Habilita el composer del coach; alumno tiene su tab "Notas". Las notificaciones `coach_comment` empiezan a viajar.
- **Fase C — Inserción inline (dual write).** Pendiente. Las textareas que el alumno usa hoy (TodayWorkoutPage / EvalWorkoutPage) y el coach (StudentEvaluationsTab) siguen funcionando pero ahora cada save hace **doble escritura**: al campo viejo *y* a `notes`. Esto es lo más sensible.
- **Fase D — Single source of truth.** Pendiente. Se invierte el dual-write: solo `notes` se escribe. Los campos viejos pasan a leerse de `notes` (vía vista o lectura directa) hasta el cleanup.
- **migration_v25_deprecate_legacy_notes.sql.** `COMMENT ON COLUMN` agregando `'DEPRECATED v25, leer de notes'` a cada columna del cuadro de §1. No borra nada, solo marca. Permite que un linter o code review atrape lecturas tardías.
- **migration_v26_drop_legacy_notes.sql.** `DROP COLUMN ... CASCADE` para los 7 campos. Se corre solo cuando los 4 criterios de §2 están verdes.

---

## 4. Esqueleto de `migration_v26_drop_legacy_notes.sql`

```sql
-- migration_v26_drop_legacy_notes.sql
-- Borra los campos legacy de notas reemplazados por la tabla `notes` (v24).
-- Pre-requisito: criterios §2 del plan_deprecacion_notas_v24.md verdes.
BEGIN;

-- 1. Backup a schema archive (idempotente)
CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.profiles_notes_20XX (
  id uuid PRIMARY KEY,
  observations text,
  coach_notes  text,
  archived_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archive.profiles_notes_20XX (id, observations, coach_notes)
SELECT id, observations, coach_notes FROM public.profiles
 WHERE observations IS NOT NULL OR coach_notes IS NOT NULL
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS archive.workout_logs_notes_20XX (
  id uuid PRIMARY KEY,
  notes text,
  archived_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archive.workout_logs_notes_20XX (id, notes)
SELECT id, notes FROM public.workout_logs WHERE notes IS NOT NULL
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS archive.workout_block_logs_notes_20XX (
  id uuid PRIMARY KEY,
  notes text,
  archived_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archive.workout_block_logs_notes_20XX (id, notes)
SELECT id, notes FROM public.workout_block_logs WHERE notes IS NOT NULL
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS archive.eval_responses_comments_20XX (
  id uuid PRIMARY KEY,
  coach_comment_public  text,
  coach_comment_private text,
  student_comment       text,
  archived_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archive.eval_responses_comments_20XX
SELECT id, coach_comment_public, coach_comment_private, student_comment, now()
  FROM public.evaluation_test_responses
 WHERE coach_comment_public IS NOT NULL
    OR coach_comment_private IS NOT NULL
    OR student_comment       IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 2. DROP COLUMN
ALTER TABLE public.profiles                  DROP COLUMN IF EXISTS observations;
ALTER TABLE public.profiles                  DROP COLUMN IF EXISTS coach_notes;
ALTER TABLE public.workout_logs              DROP COLUMN IF EXISTS notes;
ALTER TABLE public.workout_block_logs        DROP COLUMN IF EXISTS notes;
ALTER TABLE public.evaluation_test_responses DROP COLUMN IF EXISTS coach_comment_public;
ALTER TABLE public.evaluation_test_responses DROP COLUMN IF EXISTS coach_comment_private;
ALTER TABLE public.evaluation_test_responses DROP COLUMN IF EXISTS student_comment;

COMMIT;

-- POST: cómo restaurar uno (caso de emergencia)
--   ALTER TABLE public.profiles ADD COLUMN observations text;
--   UPDATE public.profiles p SET observations = a.observations
--     FROM archive.profiles_notes_20XX a WHERE a.id = p.id;
```

> Antes de correr v26: re-tomar el backup en ese momento (los nombres `20XX` ajustarlos a la fecha real). El backup que se hace dentro de la migración es la red de emergencia, pero es buen práctica también dumpear a almacenamiento externo.

---

## 4b. Resultado de auditoría 2026‑05‑17

Lo que se cerró en esta tanda:

- 🔴 BLOCKER **B1 (realtime apagado en `notes`)** → resuelto en `v24e`.
- 🟡 DEFECT **D1 (markThreadRead no funciona para alumno)** → resuelto en `v24f` + nueva implementación en `notes.js#markThreadRead` que llama la RPC.
- 🟡 DEFECT **D3 (lógica redundante en `availableMuscleGroups`)** → resuelto en `NotesFilters.jsx`.
- 🟡 DEFECT **D6 (`23:59:59.000` en custom date pierde 999ms)** → `setHours(23,59,59,999)`.
- 🔵 DRIFT **DR1 (código muerto en `notes.js`)** → borrados `listExercisesForFilter`, `listAvailableTags`, `getThreadChannelState`, `resetNotesCaches`, `_exercisesCache`, `_tagsCache`, `TAGS_CACHE_TTL_MS`, `EXERCISES_CACHE_TTL_MS` (~80 líneas).
- 🔵 DRIFT **DR5 (policy coach permitía impersonar alumno)** → resuelto en `v24f` con policy `Coach insert as self coach`.

Lo que quedó como deuda explícita (ver §5):

- 🔵 DRIFT **DR4 (zona horaria en `detectTimePreset`)** → marginal; resucitará si en algún momento persistimos filtros en URL/storage.
- 🟡 DEFECT residual **D4 (filter options stale tras INSERT realtime)** → relevante en Fase B cuando aparezcan tags y ejercicios nuevos por nota.
- 🟡 DEFECT **D2 (sin notificación `student_note` para el coach)** → decisión arquitectónica abierta antes de Fase B.
- 🟡 DEFECT **D5 (`evaluation_test` con `context_id = test_id`)** → re‑anchor a `response_id` diferido a Fase C.
- 🔵 DRIFT **DR6 (`notes_resolve_context` no maneja `session_day`)** → §5.1.

## 4c. Fase B — alcance entregado (2026‑05‑17)

Fase B agrega ESCRITURA al panel y construye el lado del alumno. La Fase A entera era read‑only; ahora ambos lados pueden mandar y leer notas en tiempo real.

**Backend (1 migración aplicada):**

- `v25a` — agregado `student_note` al enum CHECK de `notifications.type` y nuevo trigger `fn_notify_student_note` simétrico al `fn_notify_coach_note` existente. Cuando el alumno inserta una nota (`author_role='student'` y `deleted_at IS NULL`), el coach recibe una notificación con título "<Nombre> te escribió una nota" y un excerpt de 140 chars.

**Frontend nuevo:**

| Archivo | Qué |
|---|---|
| `src/components/notes/NoteComposer.jsx` | **Reescritura completa**: textarea autosize, tags como chips (con sugerencias de `availableTags`), toggle de visibility para el coach (Compartida ↔ Privada), modo reply con quote del padre y botón cancelar, Cmd/Ctrl+Enter para enviar, manejo de error inline. Llama `createNote` o `replyNote` según corresponda. |
| `src/components/notes/NoteCard.jsx` | Botón "Responder" debajo de la burbuja cuando se pasa `onReply`. No aparece en notas borradas. |
| `src/components/notes/NotesPanel.jsx` | Estado `replyingTo`. `fetchOpts` movido a ref para re‑disparar desde realtime (D4): cuando llega un INSERT, se debounce 1.5s y se refresca `listFilterOptions(threadId)`, así los selectores ven ejercicios/tags nuevos sin recargar la página. |
| `src/hooks/useNotes.js` | Acepta `onNoteCreated` callback. Cuando recibe un INSERT por realtime (no UPDATE), llama el callback con la nota nueva. |
| `src/hooks/useNoteThreadUnread.js` | **Nuevo**. Hook que devuelve `{ count, loading }` para `(studentId, role)`. Hace SELECT inicial a `note_threads.unread_for_<role>` y se suscribe vía realtime a INSERT/UPDATE en `note_threads` filtrando por `student_id`. Sirve para badges en menú y en tabs. |
| `src/pages/student/NotesPage.jsx` | **Nueva** página del alumno. Resuelve thread vía `getStudentThread(profile.id)`. Render: header + `<NotesPanel viewerRole="student" />`. Estados de loading / error. |
| `src/App.jsx` | Ruta `/student/notes` (dentro de `StudentLayout`). |
| `src/components/layout/StudentLayout.jsx` | Nueva entrada de menú "Notas" entre Hoy y Progreso. Badge naranja en el ícono con `unreadNotes` (vía `useNoteThreadUnread`). Tipografía del nav ajustada a `text-[11px]` por la sexta entrada. |
| `src/pages/coach/StudentDetailPage.jsx` | Badge naranja en el tab "Notas" mostrando `unread_for_coach` del thread. Realtime, actualiza apenas el alumno escribe. |
| `src/components/notifications/NotificationBell.jsx` | Config de ícono/color para el nuevo tipo `student_note` (naranja, mismo `MessageSquare`). |

**Flujos resultantes verificables:**

- **Coach escribe → alumno recibe**: nota se inserta (RLS valida `author_id=auth.uid()` y `author_role='coach'` por v24f). Trigger `fn_notify_coach_note` (v24) genera notif `coach_comment` para el alumno. Trigger `notes_bump_thread` (v24) actualiza `last_message_at` y suma 1 a `unread_for_student`. Realtime envía INSERT a la suscripción del alumno; si el alumno tiene el panel abierto, ve la burbuja aparecer con borde naranja y dot; el `useNoteThreadUnread` actualiza el badge del menú.
- **Alumno escribe → coach recibe**: simétrico. La nota va con `author_role='student'` y `visibility='shared'` forzados por la policy "Student insert own notes". Trigger `fn_notify_student_note` (v25a) genera notif `student_note` para el coach. El badge del tab "Notas" en `StudentDetailPage` se actualiza por realtime.
- **Reply con contexto heredado**: cuando se clickea "Responder" en una nota, el composer entra en modo reply, hereda `context_type`, `context_id` y `visibility` del padre (a menos que el caller los override). Mostramos quote del padre arriba del textarea con botón "X" para cancelar.
- **Tags y ejercicios nuevos en filtros**: si la primera nota sobre `Bench Press` o con tag `lesión` llega vía realtime, el debounce de 1.5s dispara `fetchOptsRef.current()` y el filtro empieza a listarlos sin reload.

**Cosas que se mantuvieron explícitamente afuera de Fase B:**

- Dual write a campos viejos (`workout_logs.notes`, `profiles.observations`, etc.) — eso es **Fase C**, donde modificamos `TodayWorkoutPage` y `StudentInfoTab` para escribir simultáneamente en `notes` y los campos legacy.
- Borrar columnas viejas — **Fase D + migration_v26**.
- Re‑anclar `context_id` en eval_test responses — D5, diferido.
- Handler de `session_day` en `notes_resolve_context` — DR6, diferido.
- Composer con selector explícito de contexto (ej. "asociar a este ejercicio del plan") — diferido a una Fase B.1; hoy el composer libre crea notas `context_type='free'` salvo en mode reply.
- Edición de bodies y soft‑delete desde la UI — diferido.

## 4d. Fase B+ — context picker (2026‑05‑17, mismo día que B)

Detectado en uso real: el composer de Fase B siempre creaba notas con `context_type='free'`, lo cual significa que si la coach filtraba por un ejercicio y escribía una nota, la nota no aparecía en ese filtro (queda fuera de contexto). Lo arreglamos sumando un selector de contexto y un picker de tags visible.

**Backend (1 migración aplicada):**

- `v25b` — agrega `'exercise'` al enum `context_type` y maneja la rama en `notes_resolve_context`. Caso de uso: comentario directo sobre un ejercicio del catálogo, sin estar atado a un workout_log puntual ni a un plan específico. Diferencia clave con los context_types existentes: `'plan_exercise'` referencia "ese ejercicio dentro de un plan concreto" (vía `plan_exercises.id`); `'exercise'` referencia el ejercicio del catálogo (vía `exercises.id`).

**Frontend:**

| Archivo | Cambios |
|---|---|
| `src/lib/notes.js` | Nueva función `listAllActiveExercises()` (cache módulo 5min) que devuelve el catálogo activo completo, usado por el composer para que el coach pueda adjuntar notas a cualquier ejercicio, no solo los ya presentes en el thread. `CONTEXT_TYPE_LABELS` actualizado para distinguir `'Ejercicio (plan)'` vs `'Ejercicio'` (catálogo). |
| `src/components/notes/NotesPanel.jsx` | Trae el catálogo al montar, lo pasa al composer como `allExercises`. También pasa `defaultExerciseId={filters.exerciseId}` para que cuando el coach esté filtrando por un ejercicio, el composer pre-seleccione ese contexto. |
| `src/components/notes/NoteComposer.jsx` | **Reescritura parcial**. Nuevo chip "Adjuntar a:" arriba del textarea que arranca con el ejercicio del filtro o vacío. Botón "+ Adjuntar ejercicio" / "Cambiar" abre un dropdown con buscador (autocomplete por name y muscle_group). Si hay ejercicio adjunto, la nota va con `context_type='exercise'` + `context_id=<exercise.id>`. Placeholder del textarea cambia a "Comentar sobre <ejercicio>…". En modo reply no aparece (contexto heredado del padre). |
| `src/components/notes/NoteComposer.jsx` | **Tag picker visible**. Junto al input de tags, botón "Ver" que despliega los tags existentes en el thread como chips clickeables, así el usuario no tiene que adivinar qué tags se usaron antes. El autocomplete por typing sigue funcionando para tags que no son del thread. El picker no se cierra al elegir (permite multi‑selección rápida). |

**Flujos resultantes:**

- **Caso 1**: Coach filtra "Press de banca" → composer pre‑selecciona "Adjuntar a: Press de banca" → manda → la nota tiene `exercise_id = <press_id>` y `muscle_group = 'PUSH EXERCISE'` (denorm por trigger v25b) → aparece en el filtro automáticamente.
- **Caso 2**: Coach quiere comentar un ejercicio sin notas previas → click en "+ Adjuntar ejercicio" → busca → selecciona → mismo flujo que el caso 1.
- **Caso 3**: Coach ve el listado de tags ya usados y los aplica con un click en vez de tipear (evita typos tipo `lesion` vs `lesión`).
- **Caso 4** (alumno escribiendo proactivamente sobre un ejercicio): mismo flujo, el composer del alumno también tiene el picker.

**Smoke test post‑deploy:**

```sql
-- Verificado el 2026-05-17: insertar con context_type='exercise' funciona
-- y el trigger denormaliza correctamente.
INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, context_id)
VALUES ('<thread>', '<coach>', 'coach', 'Test', 'shared', 'exercise', '<exercise_id>');
-- Resultado: exercise_id = context_id, muscle_group = <exercises.muscle_group>, block_type = NULL.
```

**Lo que quedó como deuda explícita** (no resuelto en Fase B+, ver §5 abajo):

- **Caso 5** (comentar inline desde otras vistas como `StudentLogsTab` / `EvaluationDetailPage`): drawer o link "Comentar este log" desde cada pantalla relevante. Es un proyecto en sí (cada vista necesita su entry point + pre‑setear contexto). Diferido.
- **Caso 6** (comentar un día / sesión específico): requiere agregar handler para `context_type='session_day'` en el trigger (DR6) + decidir qué entidad referencia `context_id` (¿`workout_sessions.id`? ¿`(student_id, date)`?). Diferido.
- **Caso 7** (comentar un grupo muscular como entidad pura sin ejercicio específico): `muscle_group` no es una entidad estable en la DB (es text label en exercises). Workaround disponible: usar el nombre del grupo como tag (`#PUSH EXERCISE`). No requiere cambios de schema.

## 4e. Fase B++ — tags fuera + 3 contextos (2026‑05‑17)

Pulido del composer post‑uso real:

**Tags removidos del composer.** El campo libre sin curaduría tendía a generar duplicados (`lesion` / `lesión`) y la tag picker era poco descubrible. Se removió el input + chips + picker del `NoteComposer`. La columna `notes.tags` y los índices GIN siguen vivos; las notas legacy con tags se siguen renderizando en `NoteCard` y el filtro por tag en `NotesFilters` sigue funcional (para data existente). Si en el futuro se quiere reintroducir, conviene hacerlo con una taxonomía controlada (`tag_definitions` tabla).

**Context picker con 3 solapas explícitas.** Antes: chip "Adjuntar a:" con un solo ejercicio. Ahora: tabs en el composer con `Observación` (default sin contexto) · `Ejercicio` (picker del catálogo) · `Grupo muscular` (chips con `availableMuscleGroups ∪ exercises.muscle_group`).

**Backend (1 migración aplicada):**

- `v25c` — modifica `notes_resolve_context` para que, cuando `context_type='free'`, **respete** el `muscle_group` que mandó el cliente en vez de pisarlo con NULL. `exercise_id` y `block_type` sí se limpian (no aplican). Es el patrón mínimo que necesitábamos para "nota de grupo muscular suelta" sin agregar entidades nuevas.

**Frontend:**

| Archivo | Cambios |
|---|---|
| `src/lib/notes.js` | `createNote` acepta nuevo parámetro opcional `muscleGroup`. Si `contextType='free'` y `muscleGroup` viene seteado, se incluye en el `INSERT`. En cualquier otro `contextType` el trigger pisa el valor. |
| `src/components/notes/NoteComposer.jsx` | **Reescritura**. Se removió todo lo de tags (input + chips + picker). Estado nuevo: `contextTab` ∈ `'free'|'exercise'|'muscle_group'`. Tres tabs visuales con íconos. La solapa activa muestra su selector específico (picker de ejercicio con buscador, o chips de grupos musculares). Preselección automática desde `defaultExerciseId` o `defaultMuscleGroup`. En modo reply los tabs se ocultan (contexto heredado del padre). |
| `src/components/notes/NotesPanel.jsx` | Computa `composerMuscleGroups = availableMuscleGroups ∪ catalogExercises.muscle_group` para que el composer ofrezca grupos del catálogo aunque el thread no tenga notas previas con ese grupo. Pasa `defaultMuscleGroup={filters.muscleGroup}` al composer (cascada simétrica al ejercicio). |

**Flujos verificados:**

- **Caso 1 (filtro activo de ejercicio)**: solapa `Ejercicio` preseleccionada con el ejercicio del filtro. Mandar → `context_type='exercise'`. ✓
- **Caso 2 (comentar ejercicio sin notas previas)**: solapa `Ejercicio` → picker con catálogo completo. ✓
- **Caso 3 (filtro activo de grupo muscular)**: solapa `Grupo muscular` preseleccionada con el grupo del filtro. Mandar → `context_type='free'`, `muscle_group=<X>`. Aparece en el filtro por grupo. ✓
- **Caso 4 (observación general)**: solapa `Observación`. Mandar → `context_type='free'`, sin denorm. ✓

**Smoke test SQL post‑deploy:**

```sql
-- v25c: free con muscle_group manual respetado por trigger
INSERT INTO public.notes (thread_id, author_id, author_role, body, visibility, context_type, context_id, muscle_group)
VALUES ('<thread>', '<coach>', 'coach', 'test', 'shared', 'free', NULL, 'KNEE DOMINANT');
-- Resultado verificado: muscle_group='KNEE DOMINANT' preservado.
```

**Lo que queda como deuda explícita:**

- **Caso 6** (comentar un día/sesión específico): requiere migración `v26a` que (a) agregue handler para `context_type='session_day'` en el trigger y (b) decida qué entidad referencia `context_id`. Posibles diseños:
  - `context_id = workout_sessions.id` (UUID estable, requiere que la sesión exista).
  - Agregar columna `notes.note_date date` que se setee manualmente para notas `free` (similar al patrón de `muscle_group` en v25c).
  - Combo: usar `session_day` cuando hay sesión y `free + note_date` cuando no.
  Diferido hasta que se priorice. La auditoría DR6 sigue válida.

- **Tags con taxonomía**: si se reintroducen tags, agregar tabla `tag_definitions(id, name, color, created_by)` y CHECK por array contra esa tabla. Mejor que el text array libre.

## 4f. Fase C — dual-write triggers (2026‑05‑17)

Estrategia elegida: **trigger‑based dual‑write** en lugar de modificar la UI de las pantallas legacy (TodayWorkoutPage, EvalWorkoutPage, StudentEvaluationsTab). Cuando el alumno o el coach guardan en los campos viejos, la base de datos automáticamente crea/actualiza la nota equivalente en `notes`. Esto significa:

- **Cero cambios de UI** en Fase C. Los flujos viejos siguen como están.
- **Atomicidad garantizada**: el save al campo legacy y el espejo a `notes` ocurren en la misma transacción.
- **Migración a Fase D simplificada**: en Fase D, cuando reemplacemos las textareas viejas por escritura directa al panel, simplemente desactivamos los triggers y borramos las columnas. Cero riesgo de doble-escritura mientras tanto.

**Backend (1 migración aplicada, ningún cambio de frontend):**

- `v25d` — actualiza `notes_bump_thread` para decrementar contadores en soft-delete + agrega dos triggers de sincronización:
  - `fn_sync_workout_log_to_notes` (AFTER INSERT OR UPDATE OF `notes` en `workout_logs`): cuando el body de la nota del log cambia, soft-deletea cualquier mirror previa y crea una nueva nota en el panel con `context_type='workout_log'`, `context_id=log.id`, `author_role='student'`. Si el body queda vacío, solo se borra la mirror previa.
  - `fn_sync_eval_response_to_notes` (AFTER INSERT OR UPDATE OF `student_comment`, `coach_comment_public`, `coach_comment_private` en `evaluation_test_responses`): mismo patrón, una mirror por columna afectada, con `context_type='evaluation_test'`, `context_id=test_id`. La columna `coach_comment_private` se espeja con `visibility='coach_private'`.

**Idempotencia**: una sola nota viva por (thread, context_type, context_id, author_role, visibility). Si el body no cambió (`IS NOT DISTINCT FROM`), trigger es no-op — no hay UPDATEs innecesarios ni notif spam.

**Flujo de notificaciones**: cuando un trigger inserta una nota nueva, dispara la cadena de v24/v25a:
- `trg_notes_resolve_context` denormaliza `exercise_id` / `muscle_group` / `block_type`.
- `trg_notes_bump_thread_ins` actualiza `last_message_at` y suma 1 al contador del receptor.
- `trg_notify_coach_note` o `trg_notify_student_note` insertan una notificación.

**Smoke test verificado en producción:**

```sql
UPDATE public.workout_logs SET notes = 'test body' WHERE id = '<log>';
-- Resultado: la mirror previa queda soft-deleted, hay una nueva nota
-- viva con body='test body', unread_for_coach aumenta en 1, notif
-- 'student_note' aparece en la campanita del coach.
UPDATE public.workout_logs SET notes = 'test body' WHERE id = '<log>';
-- Re-save con mismo body → no-op por IS NOT DISTINCT FROM (sin spam).
UPDATE public.workout_logs SET notes = NULL WHERE id = '<log>';
-- Resultado: la mirror se soft-deletea, no se inserta nada nuevo,
-- unread_for_coach se decrementa.
```

**Fuera del alcance de Fase C (deuda explícita):**

- **`workout_block_logs.notes`**: la columna existe (v14) pero la UI del alumno no la usa hoy. Backfill v24 sí espejó las que había. No agregamos trigger porque no hay flujo de escritura activo; si en algún momento se cablea desde el front, sumar `fn_sync_workout_block_log_to_notes` siguiendo el mismo patrón que `workout_logs`.
- **`workout_sessions.{day}_notes`**: 7 columnas día‑por‑día con notas del PSE. Requiere decidir antes (a) si el contexto correcto es `'session_day'` con `context_id=workout_sessions.id`, (b) si conviene agregar columna `notes.note_date` para fechas sin sesión, o (c) si simplemente queda como `'free'` con `muscle_group` denormalizado. Bloqueante para Fase D drop de esas columnas. Diferido.
- **`profiles.observations` / `profiles.coach_notes`**: estos son coach‑side y se editan desde `StudentInfoTab`. Pertenecen semánticamente más a Fase D (donde se va a reemplazar el UI por un panel embebido), porque cada save de `observations` no es un "evento nuevo" sino una actualización de una observación corriente — mirror plano tipo upsert puede confundir al coach que esperaba ver historial. Si igual querés mirror para tener consistencia, agregamos trigger en Fase D antes del UI swap.

## 4g. Fase C+ — editar y borrar notas en panel (2026‑05‑17)

Faltaba en Fase B/C la posibilidad de editar y borrar notas desde el panel. Agregado en frontend (backend ya tenía `softDeleteNote` desde v24 y las policies de UPDATE desde v24f).

**Frontend (2 archivos):**

| Archivo | Cambios |
|---|---|
| `src/lib/notes.js` | Nueva función `updateNote(noteId, { body })`. RLS: coach puede editar cualquier nota (policy 'Coach update notes'), alumno solo las suyas (policy 'Student update own notes'). `updated_at` se setea por trigger automático. |
| `src/components/notes/NoteCard.jsx` | Menú "⋮" en el header de la burbuja con opciones **Editar** y **Borrar**. Solo visible si la nota es propia (`note.author_id === currentUserId`) Y es panel‑authored (`context_type ∈ {free, exercise}`). Modo edición inline: textarea con Save/Cancel + shortcut Cmd+Enter / Esc. Borrado pide confirmación con `window.confirm`. Indicador "· editada" cuando `updated_at > created_at + 2s`. |
| `src/components/notes/NotesPanel.jsx` | Pasa `currentUserId={authorId}` a cada `NoteCard`. |

**Regla clave**: las notas espejadas desde campos legacy (context_type `workout_log`, `workout_block_log`, `evaluation_test`, `plan_exercise`) son **read‑only desde el panel**. Razón: el source of truth es el campo legacy, y los triggers v25d re‑sincronizan en cada save. Si el alumno quiere editar su nota de un workout_log, lo hace desde TodayWorkoutPage (la textarea espeja automáticamente al panel). Cuando lleguemos a Fase D y reemplacemos esas textareas por escritura directa al panel, los context_type van a ser editables sin problema porque ya no habrá un campo legacy compitiendo por ser source of truth.

**Flujo de borrado integrado con realtime y contadores**:
1. Usuario clickea "Borrar" → `softDeleteNote` setea `deleted_at = now()`.
2. Trigger `notes_bump_thread` (actualizado en v25d) detecta el UPDATE de `deleted_at` y decrementa `unread_for_<role>` si la nota estaba unread.
3. Realtime envía el UPDATE → el hook `useNotes` detecta `deleted_at != null` y la remueve del listado local.

**Flujo de edición**: `updateNote` actualiza el body. Trigger `notes_updated_at` setea `updated_at = now()`. Realtime envía el UPDATE → `useNotes` mergea el body actualizado. NoteCard re‑renderiza con "· editada".

## 5. Casos abiertos / no resueltos

1. **`workout_sessions.{day}_notes` (`monday_notes`, etc.) y `borg_notes`.** No están en el backfill de v24 porque (a) la estructura por día no está documentada limpiamente en `schema.sql`, (b) el flujo de PSE/Borg está mezclado con la sesión y conviene resolver eso en su propia migración. Posibles caminos:
   - Reescribir el flujo PSE para que el "comentario del día" sea una `note` con `context_type='session_day'` y `context_id=session.id`. Esto convierte 7 columnas en 1 tipo de contexto.
   - O dejarlos como están si el equipo decide que el PSE es métrica + observación de la sesión y no comunicación. En ese caso, sacarlos del scope de deprecación y mantenerlos como columnas dedicadas.
   Decidir antes de Fase C.

2. **`muscle_group` NULL en 25 de 60 notas backfilleadas (workout_log).** No es bug del trigger: 25 ejercicios del catálogo `exercises` tienen `muscle_group` vacío. El filtro "por grupo muscular" en el panel no los va a encontrar. Acción sugerida: hacer un cleanup del catálogo (asignar `muscle_group` a esos 25) antes de comunicar la feature a usuarios. Query para diagnóstico:
   ```sql
   SELECT e.id, e.name FROM public.exercises e
    WHERE e.muscle_group IS NULL OR trim(e.muscle_group) = ''
    ORDER BY e.name;
   ```

3. **Sin tipo `student_note` en `notifications.type`.** Hoy el coach NO recibe push cuando el alumno escribe (solo se incrementa `note_threads.unread_for_coach`). Se decidió diferir a v25. Cuando se haga, hay que recrear el CHECK del enum (no es `ENUM` real, es `CHECK IN`).

4. **`get_coach_id()` asume único coach.** Si en algún momento se agregan más coaches, el modelo de `note_threads` lo soporta (FK por `coach_id`), pero el backfill de v24 usó solo el primero. Documentar o crear migración futura para crear threads del segundo coach con cada alumno.

5. **`coach_private` y soft-delete del padre en replies.** Si una nota privada se borra (soft) y tiene replies, los replies quedan con `parent_note_id` apuntando a una nota oculta. El front (`NoteCard`) ya muestra "Mensaje eliminado" en ese caso. No hay migración pendiente.

---

## 6. Referencias

- `supabase/migration_v24_notes.sql` — la migración que creó `note_threads` + `notes` + backfill.
- `src/lib/notes.js` — data layer del front, fuente de verdad de queries contra v24.
- `diagnostico_arquitec/diagnostico-supabase.md` §6 (fila "Notas privadas del coach") — diagnóstico previo que ya identificaba la dispersión.
- Smoke tests G.1–G.5 — definidos en la spec del backend agent (round 1 de la implementación), ejecutados al aplicar v24.
