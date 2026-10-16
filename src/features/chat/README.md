# Chat (v75, 2026-10-16)

Sección **Chat** de la coach (barra lateral, `/coach/chat/:studentId`) y **Chat** de la persona (`/student/chat`, pestaña "Con tu coach").

## De dónde sale cada cosa

- **Mensajes**: el mismo hilo de siempre (`note_threads` / `notes`). Todo lo escrito antes en Notas aparece acá. Los comentarios de registros (`workout_log`, `workout_block_log`) se ven como mensajes con la etiqueta del ejercicio y la fecha.
- **Eventos**: `chat_events` (triggers desde `student_milestones` y desde las omisiones "no sabía cómo"). Los ven las dos partes. La semana completa trae la pregunta automática (6 variantes, `chat.weekQuestion.v0..v5`) y el promedio de bienestar de esa semana contra la anterior (`weeklyWellbeing`).
- **Guardar desde un mensaje** (solo mensajes propios de la coach): RPC `chat_link_note`. Cada copia es una nota con `source_note_id`; en el chat no se muestra como mensaje sino como etiqueta debajo del original. Destinos:
  - nota privada (`coach_private`, filtro "Notas privadas");
  - el ejercicio en este plan (`plan_exercise`, solo ese plan);
  - el ejercicio en todos sus planes (`exercise`);
  - un día del plan (`plan` + `plan_section`), arriba del día en Entrenar.
- **Detección de ejercicio**: `detectExercise` busca nombres completos del catálogo (nombre y nombre en inglés, sin acentos ni mayúsculas, palabras enteras). Gana el más largo.

## Reglas

- En Entrenar el texto guardado en plan y ejercicio a la vez se muestra una sola vez (`workouts/planNotes.js`, `notesForPlan`). Las copias de otro plan no aparecen.
- Editar el mensaje original actualiza las copias (trigger `notes_sync_copies_body`).
- Opción B (Franco, 2026-10-16): la ficha de la persona ya no tiene pestaña Notas (botón "Abrir chat"); la campana no muestra `student_note`, `session_completed`, `week_completed`, `plan_completed` ni `exercise_unclear` (siguen guardadas).
- El número de "Chat" en la barra suma `unread_for_coach` de todos los hilos (mensajes + eventos).

## Archivos

- `chatModel.js` (puro, con tests): línea de tiempo, filtros, semanas ISO, promedios de bienestar, detección y búsqueda en el catálogo.
- `chatText.js`: textos de eventos y de etiquetas.
- `chatApi.js`: consultas, RPCs y realtime.
- `useChatThread.js`, `useCoachChatUnread.js`.
- `components/`: `ChatConversation`, `ChatMessage`, `ChatEventCard`, `ChatComposer`, `LinkSheet`.
- `pages/CoachChatPage.jsx`.
