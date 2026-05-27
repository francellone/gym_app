# `src/features/notes/` — panel de notas coach↔alumno

Comunicación bidireccional entre coach y alumno. Es la **fuente única** de comentarios desde el refactor v24 (mayo 2026); reemplazó 7 campos de notas dispersos en `profiles`, `workout_logs`, `workout_block_logs` y `evaluation_test_responses`. Soporta hilos, respuestas, filtros, mark-as-read automático, realtime, y notas "espejo" desde otras pantallas.

**Movido a esta ubicación el 21/05/2026** desde `src/{components,hooks,lib,pages}/notes`. Sin cambios funcionales — sólo reorganización.

## Estructura

```
notes/
├── api.js                          Data layer. Encapsula TODO el acceso a note_threads y notes.
│                                   Exporta ~30 funciones: getStudentThread,
│                                   getOrCreateThreadForStudent, listNotes, createNote,
│                                   replyNote, editNote, deleteNote, markThreadRead,
│                                   subscribeThread, listFilterOptions, listAllExercises,
│                                   contextTypeLabel, fetchSingleMirrorBodies,
│                                   fetchEvalMirrorBodies, postWorkoutLogNote,
│                                   postWorkoutBlockLogNote, postEvalCommentNote,
│                                   postEvalResultNote, postPSEDayNote, etc.
├── components/
│   ├── NotesPanel.jsx              Orquestador. Recibe threadId + viewerRole + authorId.
│   │                               Maneja filtros, lista de notas, composer, mark-as-read.
│   ├── NoteCard.jsx                Render de una nota individual (incluye replies, edit/delete inline).
│   ├── NoteComposer.jsx            Input para crear notas (free, exercise, muscle_group, day).
│   └── NotesFilters.jsx            Barra de filtros (temporales, ejercicio, grupo muscular, tags, search).
├── hooks/
│   ├── useNotes.js                 Lista paginada (keyset) + realtime + reload en visibility change.
│   └── useNoteThreadUnread.js      Contador de no leídas para un (student, role) — para badges.
└── pages/
    ├── StudentNotesPage.jsx        Página del alumno (/student/notes).
    └── StudentNotesTab.jsx         Tab del coach dentro de StudentDetailPage.
```

## Quién consume estos módulos

| Consumidor                                          | Importa                                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/App.jsx`                                       | `StudentNotesPage` (page route)                                                                 |
| `src/components/layout/StudentLayout.jsx`           | `useNoteThreadUnread` (badge en navbar del alumno)                                              |
| `src/pages/coach/StudentDetailPage.jsx`             | `StudentNotesTab` + `useNoteThreadUnread` + `fetchSingleMirrorBodies` (badge tab)               |
| `src/pages/coach/EvaluationDetailPage.jsx`          | `fetchSingleMirrorBodies` (renderiza notas mirror)                                              |
| `src/pages/coach/student/StudentEvaluationsTab.jsx` | `fetchEvalMirrorBodies`, `postEvalCommentNote`, `fetchSingleMirrorBodies`                       |
| `src/pages/coach/student/StudentProgressTab.jsx`    | `fetchSingleMirrorBodies`                                                                       |
| `src/pages/student/TodayWorkoutPage.jsx`            | `postPSEDayNote`, `fetchSingleMirrorBodies`, `postWorkoutLogNote`, `postWorkoutBlockLogNote`    |
| `src/pages/student/HistoryPage.jsx`                 | `fetchSingleMirrorBodies`                                                                       |
| `src/pages/student/EvalWorkoutPage.jsx`             | `fetchEvalMirrorBodies`, `postEvalCommentNote`, `postEvalResultNote`, `fetchSingleMirrorBodies` |

Siempre importar con el alias absoluto:

```js
import NotesPanel from '@/features/notes/components/NotesPanel'
import { useNotes } from '@/features/notes/hooks/useNotes'
import { fetchSingleMirrorBodies } from '@/features/notes/api'
```

Internamente (dentro de esta feature) se usa relativo: `import { editNote } from '../api'`.

## Persistencia en Supabase

Dos tablas (ambas con RLS):

- **`note_threads`** — uno por par (coach, student). 10 filas al 2026-05-20. Mantiene `last_message_at`, `unread_for_coach`, `unread_for_student` denormalizados por triggers.
- **`notes`** — 102 filas. `thread_id` + `author_id` + `author_role` + `body` + contexto (`context_type` ∈ `{free, exercise, workout_log, workout_block_log, evaluation_test, evaluation_result, plan_exercise, plan_day}` + `context_id`).

RPCs relevantes:

- `notes_get_or_create_thread(p_coach_id, p_student_id)` — idempotente, crea el hilo si no existe.
- `notes_mark_thread_read(p_thread_id, p_role)` — marca como leídas las notas con respuesta hasta el momento de la llamada.
- `notes_thread_filter_options(p_thread_id, ...)` — devuelve las opciones del filtro (tags / ejercicios usados / grupos musculares).

Triggers automáticos en BD:

- `last_message_at` se actualiza al INSERT.
- Contadores `unread_for_*` se incrementan/decrementan según author_role y mark-as-read.
- Notas mirror se sincronizan desde `workout_logs`, `workout_block_logs`, `evaluation_test_responses` vía triggers (v25d/v25e) — el front no las crea directamente.

## Conceptos clave

- **Mirror notes:** notas que viven en `notes` pero cuya body se mantiene sincronizada con el campo `notes` de otra tabla (ej. `workout_logs.notes`). Son **read-only desde el panel** — editarlas exige ir a la página origen.
- **Free notes:** generadas desde el composer del panel. Estas sí se editan/borran desde el panel.
- **Coach private:** `visibility = 'coach_private'`. El alumno no las ve. Doble protección: RLS + filtrado defensivo en el cliente (`useNotes`).
- **Replies:** 1 nivel de profundidad. Se denormaliza el `parent_note_id` y se quotea en `NoteCard`.
- **Realtime:** `subscribeThread(threadId)` se suscribe al canal `note_threads_thread_<id>`. Inserts/updates entran al estado local del hook.

## Lo que NO meter acá

- Lógica de RLS de Supabase. Eso va en migraciones (`supabase/migrations/`) o en el changelog del back (`diagnostico_arquitec/01_changelog_back.md`).
- Push notifications. Las notas disparan notificaciones via trigger `fn_notify_coach_note` / `fn_notify_form_submitted`, pero eso es trabajo del backend — el front sólo consume `notifications` desde `src/hooks/useNotifications.js`.
- Componentes "generales" de chat que se podrían usar fuera de notas. Si surge ese caso, mover a `src/shared/components/`.

## Historial

- **v24 (16-17/05/2026):** lanzamiento. Tablas + panel read-only para coach.
- **v24b-v24f, v25a-v25f, v26a-v26f:** múltiples iteraciones (visibility, mark-as-read, dual-write, mirror sync, drop legacy columns, multi-coach).
- **m27 (18/05/2026):** legacy notes shim para soportar reads de las columnas viejas durante la transición. `legacy_notes_shim_log` audit table.
- **v31 (18/05/2026):** refactor multi-coach proper (un alumno puede tener varios coaches).
- **m26 (18/05/2026):** completar refactor — drop columnas legacy, dual-write off, writers desde el panel.
- **21/05/2026:** movido a `src/features/notes/` (este refactor estructural — sin cambios funcionales).

Detalles en `../../../diagnostico_arquitec/01_changelog_back.md` y `../../../diagnostico_arquitec/handoff-front-notas-m26.md`.
