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

## A qué va cada mensaje ("Va a:")

- Botón que abre una lista: **General**, **Sin responder** (hasta 6, últimos 14 días) y **Otro mensaje…** (se toca la burbuja o el evento). Si se elige "Otro mensaje" y se manda sin tocar nada, no se envía y avisa.
- Responder hereda el contexto del mensaje (`replyNote`): una respuesta a un comentario de registro aparece también en Entrenar y en la tabla de progreso. Responder una omisión crea una nota con el contexto de ese registro.
- **Preselección** (solo la coach): el comentario o la omisión que pide respuesta, si es lo último de la conversación y tiene menos de 48 h. Si no, General. La persona arranca siempre en General, con una sugerencia que puede tocar.
- El destino se **congela** apenas hay texto escrito.
- Celular: deslizar a la derecha responde (no desde el borde, por el gesto de volver de Android); mantener apretado abre el menú. Computadora: flecha al pasar el mouse.
- Respuestas a un solo nivel (front + trigger `notes_flatten_parent`).

## Pendientes (coach)

- **Respondido** = hay una respuesta, o una nota posterior del otro lado sobre el mismo registro (la coach muchas veces contesta desde Entrenar o la tabla de progreso).
- Cuentan los comentarios asociados del otro lado y las omisiones que piden respuesta (nota escrita, molestia o "no sabía"), de los últimos 14 días. Con toda la historia eran 335, casi todos informativos.
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
- `components/`: `ChatConversation`, `ChatMessage`, `ChatEventCard`, `ChatComposer` (con el selector "Va a"), `LinkSheet`.
- `pages/CoachChatPage.jsx`.
- Migraciones: v75 (`20261016230000`), v76 (`20261016240000`), v77 (`20261016250000`).
