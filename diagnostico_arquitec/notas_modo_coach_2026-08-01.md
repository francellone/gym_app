# Notas en modo coach — diagnóstico, fix y decisiones pendientes (2026-08-01)

Reporte de Franco: *"cuando la coach completa los ejercicios de su alumno, pero como coach, no ve los comentarios que ha ido dejando"*.

## 1. Causa raíz

`src/features/notes/api.js` — los cuatro writers de notas mirror hardcodeaban la autoría:

```js
authorId: studentId,
authorRole: 'student',
```

`postPSEDayNote`, `postWorkoutLogNote`, `postWorkoutBlockLogNote`, `postEvalResultNote`. Además el lookup del mirror existente filtraba `.eq('author_role', 'student')`.

Se escribieron en el refactor de notas m26 (v24-v26), **antes del modo coach (v33, 2026-07-09)**. `TodayWorkoutPage.saveLog` los llama igual cuando `coachMode` está activo. Resultado: dos daños distintos.

### 1.a — El comentario se perdía en silencio (caso normal)

La RLS de `notes` quedó endurecida en `migration_v24f_mark_thread_read_rpc_and_tighten_coach.sql`:

```sql
CREATE POLICY "Coach insert as self coach"
  ON public.notes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach')
    AND author_id   = auth.uid()
    AND author_role = 'coach'
  );
```

Con la coach logueada escribiendo `author_id = <alumna>` / `author_role = 'student'`:

- la policy del coach no aplica (`author_id <> auth.uid()`),
- la policy del alumno tampoco (`auth.uid()` no es el student del thread).

→ **INSERT rechazado (42501)**. Y el caller solo hacía `console.warn`, así que la coach escribía el comentario, guardaba, y no pasaba nada.

### 1.b — Pisaba el comentario de la alumna (caso peor)

Si la alumna ya había comentado ese log, el lookup `author_role='student'` **sí** encontraba su nota y hacía `updateNote(existing.id, { body })`. La policy `"Coach update notes"` (v24f) es deliberadamente amplia (marcar leído, soft-delete), así que el UPDATE pasaba: **el texto de la alumna quedaba reemplazado por el de la coach, y seguía figurando como escrito por la alumna.**

## 2. Fix aplicado

### Front

- `api.js`: helper `resolveMirrorAuthor({ studentId, authorId, authorRole })`. Los 4 writers aceptan `authorId` / `authorRole` (default `student` + `studentId` → retrocompatible con `EvalWorkoutPage`, que no tiene modo coach). El lookup del mirror filtra por `author.role`, así que la coach nunca toca la nota de la alumna.
- `fetchSingleMirrorBodies({ ..., authorRole })`: filtro opcional. Desde ahora un mismo `context_id` puede tener dos mirrors vivos (alumna y coach); sin filtro ganaba el último que llegaba, no determinístico.
- `TodayWorkoutPage`: `noteAuthorRole` / `noteAuthorId` derivados de `coachMode`, pasados a los 3 writers y a los 3 `fetchSingleMirrorBodies`.
- **Los errores de nota dejan de ser silenciosos**: `showSaveError(t('errors.noteSaveFailed'), noteErr)` en los 3 puntos + clave i18n es/en. Esto es lo que ocultó el bug durante semanas.
- `pickLastPreviewNotePerExercise(notes, { prefer })`: prioridad configurable. Default `'coach'` (vista de la alumna, decisión de Franco del 2026-07-24). En modo coach se invierte a `'student'` — la coach ya sabe lo que escribió ella; lo que necesita ver es el comentario de la alumna. **Es un criterio nuevo, revisable en una línea.**

### Base

`supabase/migrations/20260801150000_notes_guard_body_authorship.sql` — trigger `BEFORE UPDATE OF body` que rechaza editar el texto de una nota ajena. Deja pasar `read_at_*`, `deleted_at` y el resto de las columnas, y no aplica cuando `auth.uid()` es NULL (service_role / definer / backfills). No rompe UI: `NoteCard` ya gatea editar/borrar con `isOwn`.

## 3. Datos: qué se puede corregir y qué no

**No hay notas mal atribuidas que re-etiquetar.** Como la RLS rechazaba el INSERT, esas filas nunca llegaron a existir. Lo perdido, perdido está (el texto nunca salió del browser).

Lo que sí dejó daño es el caso 1.b: comentarios de alumnas sobrescritos. Quedaron como notas normales de la alumna, así que **no se pueden distinguir con certeza ni restaurar** (los backups `archive.*_notes_20260517` son de mayo, previos al modo coach). Se pueden listar los sospechosos para que Anto los mire:

```sql
-- Notas de log editadas después de creadas, sobre logs que cargó la coach.
-- Sospechosas de haber sido pisadas por el modo coach (v33 → 2026-08-01).
SELECT n.id, n.created_at, n.updated_at, n.body,
       wl.logged_date, wl.source, wl.logged_by, p.full_name AS alumna
  FROM public.notes n
  JOIN public.workout_logs wl ON wl.id = n.context_id
  JOIN public.note_threads nt ON nt.id = n.thread_id
  JOIN public.profiles p      ON p.id = nt.student_id
 WHERE n.context_type = 'workout_log'
   AND n.author_role  = 'student'
   AND n.deleted_at IS NULL
   AND wl.source = 'coach'
   AND n.updated_at > n.created_at + interval '1 second'
 ORDER BY n.updated_at DESC;
```

Idem cambiando `workout_log` → `workout_block_log` y `workout_logs` → `workout_block_logs`.

**Antes de nada, verificar que v24f está realmente aplicada en prod** (vive en `legacy/`, o sea pre-CLI):

```sql
SELECT polname, cmd, pg_get_expr(polwithcheck, polrelid) AS with_check
  FROM pg_policy JOIN pg_class c ON c.oid = polrelid
 WHERE c.relname = 'notes'
 ORDER BY polname;
```

Si `"Coach insert as self coach"` NO aparece y sigue viva `"Coach full access on notes"`, entonces el INSERT **sí** entraba y hay notas mal atribuidas para corregir. En ese caso:

```sql
-- SOLO si v24f no estaba aplicada. Re-atribuye a la coach las notas mirror
-- que se crearon durante un registro con source='coach'.
UPDATE public.notes n
   SET author_role = 'coach',
       author_id   = wl.logged_by
  FROM public.workout_logs wl
 WHERE wl.id = n.context_id
   AND n.context_type = 'workout_log'
   AND n.author_role  = 'student'
   AND wl.source      = 'coach'
   AND wl.logged_by IS NOT NULL
   AND wl.logged_by <> n.author_id;
```

(y después recalcular `note_threads.unread_for_coach` / `unread_for_student`, que el trigger `notes_bump_thread` movió para el lado equivocado).

## 4. Decisión pendiente — alcance multi-coach de la RLS

Aparte del bug reportado, la revisión encontró esto en v24f:

```sql
CREATE POLICY "Coach select all notes"
  ON public.notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'coach'));
```

**Cualquier usuario con `role='coach'` puede leer las notas de TODOS los alumnos, no solo las de los suyos.** Lo mismo para UPDATE. Se escribió cuando había un solo coach; después llegó multi-coach (v31) y esto no se revisó. Hoy hay al menos un segundo coach de prueba (Carlos Sosa).

El fix natural es scopear por thread:

```sql
DROP POLICY IF EXISTS "Coach select all notes" ON public.notes;
CREATE POLICY "Coach select notes of own threads"
  ON public.notes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.note_threads nt
       WHERE nt.id = notes.thread_id
         AND nt.coach_id = auth.uid()
    )
  );
```

**No lo aplico todavía** porque hay que confirmar dos cosas antes:

1. que `note_threads.coach_id` esté poblado y correcto en el 100% de los threads (v30 revirtió un realineamiento de esa columna — ver `migration_v30_revert_note_threads_coach_id_realignment.sql`);
2. que ninguna pantalla dependa de que un coach vea threads ajenos.

Query de control:

```sql
SELECT count(*) FILTER (WHERE coach_id IS NULL) AS sin_coach,
       count(*)                                  AS total
  FROM public.note_threads;
```

Es un tema aparte del bug de Anto, pero del mismo tamaño o más.
