# Chat (v75–v77, 2026-10-16)

Sección **Chat** de la coach (barra lateral, `/coach/chat/:studentId`) y **Chat** de la persona (`/student/chat`, pestaña "Con tu coach"; `/student/notes` redirige). Objetivo de Franco: el CHAT es el centro de la comunicación y el seguimiento; el PLAN es donde quedan las decisiones de coaching.

## De dónde sale cada cosa

- **Mensajes**: el hilo de siempre (`note_threads` / `notes`). Todo lo escrito antes en Notas aparece acá. Los comentarios de registros se ven como mensajes con etiqueta "Ejercicio · Plan, Día B · registro del 15/10" (bloques: su nombre).
- **Eventos** (`chat_events`, escritos solo por triggers, texto en el front por kind + payload): día, semana (con la pregunta automática `chat.weekQuestion.v0..v5` y el promedio de bienestar de la semana contra la anterior), plan terminado, mejor marca, `exercise_unclear` ("no sabía cómo") y `exercise_skipped` (cualquier otra omisión, con `reason` y `skip_note`).
- **Guardar desde un mensaje propio de la coach** (RPC `chat_link_note`): copias con `source_note_id` que en el chat se ven como etiquetas debajo del original:
  - nota privada (`coach_private`, filtro "Notas privadas");
  - el ejercicio en este plan (`plan_exercise`);
  - el ejercicio en todos sus planes (`exercise`);
  - un día del plan (`plan` + `plan_section`), arriba del día en Entrenar.
    Las copias se insertan leídas y no notifican; editar el original las actualiza (`notes_sync_copies_body`).
- **Detección de ejercicio** al escribir (`detectExercise`): nombre completo del catálogo (también el inglés), sin acentos, palabras enteras; gana el más largo.

## Chat simple (2026-10-22, pedido de Franco)

- **Coach**: arriba solo "Todo" y "Pendientes" + lupa (`ChatSearchSheet`: ejercicios de la conversación o una palabra). Tocar la etiqueta de un mensaje filtra por ese ejercicio ("Sentadilla ✕"). La persona no tiene filtros.
- **Sin "Va a:"**. Se responde con "Responder" (menú, deslizar, o los botones a la vista en lo pendiente) → "Respondiendo a … ✕".
- **Pesa** (solo coach): elige un ejercicio del plan activo por día (`ExercisePickerSheet`) → "Sobre: Ejercicio · Día A ✕". El mensaje es una nota `context_type='plan_exercise'` (no una copia): la persona lo ve en Entrenar, en ese ejercicio, y lo contesta ahí. Con un filtro de ejercicio activo, la pesa viene puesta sola.
- **Menú corto**: Responder, Listo, Editar, Copiar, Borrar. "Guardar como privada / en el plan / en el día" se sacaron (0 usos); las copias que ya existían se siguen viendo como etiquetas.
- **Entrenar** (`workouts/exerciseChatContext.js`): recuadro "Con tu coach" en la tarjeta (últimos 2 mensajes, siempre uno del otro lado si existe) y caja en el panel del ejercicio. Si el otro lado escribió, es respuesta a su último mensaje; si no, nota nueva `plan_exercise` del día que se ve. No hace falta registrar.

## Pendientes (coach)

- **Respondido** = hay una respuesta, o una nota posterior del otro lado sobre el mismo registro (la coach muchas veces contesta desde Entrenar o la tabla de progreso).
- Cuentan solo los comentarios asociados del otro lado que **piden respuesta** (`asksForReply`: una pregunta, o dolor/molestia) y las omisiones que piden respuesta (nota escrita, molestia o "no sabía"), de los últimos 14 días. También cuenta como respondido escribir después sobre el mismo ejercicio.
- Punto naranja, filtro "Pendientes" y "Listo, no hace falta responder" (`notes.reply_dismissed_at` / `chat_events.reply_dismissed_at`, RPCs `chat_dismiss_reply` y `chat_dismiss_event`).

## No leídos

- El número de "Chat" en la barra suma `note_threads.unread_for_coach` (mensajes + eventos). Los eventos entran leídos para la coach, salvo las omisiones que piden respuesta.
- `chat_recount_threads()` recalcula todos los contadores si alguna vez se descuadran (solo admin, SQL Editor).

## Reglas que quedaron

- Opción B: la ficha ya no tiene pestaña Notas (botón "Abrir chat"); la campana no muestra `student_note`, `session_completed`, `week_completed`, `plan_completed` ni `exercise_unclear` (siguen guardadas).
- En Entrenar, el texto guardado en plan y ejercicio se muestra una sola vez (`workouts/planNotes.js`); las copias de otro plan no aparecen.
- Borrar un mensaje propio: si estaba guardado en el plan, se elige "Solo del chat" o "También del plan".
- Claves propias (regla de Franco): `notes.workout_log_id`, `workout_block_log_id`, `plan_id`, `plan_exercise_id`, todas `ON DELETE SET NULL` (sacar un ejercicio del plan o desmarcar un registro NO borra comentarios). Las deriva siempre `notes_resolve_context`.
- Al volver a marcar un registro desmarcado (mismo ejercicio, mismo día, candidato único) el comentario se reengancha solo (`trg_reattach_log_notes`). Reenganches históricos en `backup_v76_reenganche`.

## Archivos

- `chatModel.js` (puro, con tests): línea de tiempo, filtros, semanas ISO, bienestar, detección, pendientes, preselección, omisiones.
- `chatText.js`: textos de eventos, etiquetas de contexto y de copias.
- `chatApi.js`: consultas, RPCs y realtime. `useChatThread.js`, `useCoachChatUnread.js`.
- `components/`: `ChatConversation`, `ChatMessage`, `ChatEventCard`, `ChatComposer`, `ChatSheets` (pesa y lupa).
- `pages/CoachChatPage.jsx`.
- Migraciones: v75 (`20261016230000`), v76 (`20261016240000`), v77 (`20261016250000`).
