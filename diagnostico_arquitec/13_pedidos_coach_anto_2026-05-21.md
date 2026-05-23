# Pedidos del coach Anto — backlog para próxima sesión

Fecha inicial: 2026-05-21 (noche). Última actualización: 2026-05-21 (madrugada del 22/05) — Anto pasó **22 pedidos** en total entre WhatsApp y chat. Este doc los lista, los categoriza, y propone qué analizar antes de tocar código. **NO implementar nada acá** — usar como punto de partida en la próxima sesión.

---

## Resumen ejecutivo

| Categoría | Items | Esfuerzo total estimado |
|---|---|---|
| 🐞 Bugs (afectan hoy) | 1 | ~2h |
| 🟢 Quick wins UX (alto impacto, scope chico) | 8 | ~2.5 días |
| 🟡 Features medianas | 10 | ~8-10 días |
| 🔴 Features grandes (requieren plan documentado antes) | 3 | ~8-12 días |

**Mi recomendación de orden de ataque:** bug → quick wins (perfil editable + reorder ejercicios + bloques auto + videos en preview + tildes + filtros eval) → features medianas (notif semanal alumno, eval refactor, drag-and-drop) → features grandes (dashboard semanal coach con alertas, pagos, autosave). Detalle abajo.

**Pre-requisito recomendado antes de arrancar features:** mover `archive.student_profiles` a `public` (1h, mini-migración independiente). Varios de los pedidos nuevos tocan profile data (Q6, F8) — necesario hacerlo antes.

---

## Pedidos categorizados

### 🐞 Bugs

#### B1 — Vista previa de plan: bloques de circuito se mezclan con los de fuerza

> *"Cuando mezclo primero fuerza y después un circuito en el mismo día no sé por qué se ponen en el medio de los días de fuerza los de circuito y después abajo están bien en la parte de circuito."*

**Qué analizar antes**:
- Reproducir en producción con un plan que tenga fuerza + circuito en el mismo día. Browser francellone, logueado como Anto.
- Identificar el componente que renderiza la "vista previa" (probablemente `PlanDetailPage.jsx` o un sub-componente en `features/plans/components/blocks/`).
- Ver si el problema es de **ordenamiento** (sort por `order_index` mezclando block_types) o de **agrupamiento** (no agrupa por `block_type` antes de listar).
- Query SQL útil para entender el caso real:
  ```sql
  SELECT b.label, b.block_type, b.order_index, b.activation,
         (SELECT count(*) FROM plan_exercises WHERE block_id=b.id) AS n_exercises
  FROM plan_blocks b WHERE b.plan_id='<plan_problemático>'
  ORDER BY b.order_index;
  ```

**Esfuerzo estimado**: 1-2h. Probablemente un `groupBy` mal hecho o un `sort` que ignora `block_type`.

**Archivos candidatos a tocar**: `features/plans/components/blocks/BlockCard.jsx`, `features/plans/pages/PlanDetailPage.jsx`, `features/plans/helpers.js` (`groupExercisesIntoBlocks`).

---

### 🟢 Quick wins UX (alto impacto, scope chico)

#### Q1 — Últimas notas y últimos pesos visibles en el flujo de entrenamiento

> *"No ver la última nota a menos que entre en la parte de NOTAS. Me gustaría ver cuando entreno en el plan los últimos pesos registrados y último comentario."* (Anto mandó foto por WhatsApp — pedirla)

> *"Notas no están a mano. Está bueno el chat pero estaría bueno que cuando entras a entrenar en tu plan te salgan las notas correspondientes de cada ejercicio sumada a la última nota de la conversación del ejercicio."*

(Son 2 pedidos pero apuntan al mismo lugar — los junto.)

**Qué analizar antes**:
- Mirar la foto que mandó Anto por WhatsApp — tener clara la maqueta visual antes de tocar.
- En `TodayWorkoutPage.jsx`, cada ejercicio se renderiza con `ExerciseCard` o `BlockRenderer`. Identificar dónde inyectar:
  - **último peso registrado**: query a `workout_logs` con `plan_exercise_id` actual, ordenado por `logged_date DESC LIMIT 1`. Mostrar `actual_weights[última_serie]` o el del nuevo modelo `weights_jsonb`.
  - **última nota del ejercicio**: query a `notes` con `context_type='exercise' AND exercise_id=X AND thread_id=Y` ordenado por `created_at DESC LIMIT 1`.
- Decidir cómo se carga: ¿prefetch en la página al cargar el día, o lazy por ejercicio? Para 8-15 ejercicios por día, prefetch en una sola query.
- Decidir si la "última nota" incluye notas del alumno o sólo del coach.

**Esfuerzo estimado**: medio día.

**Archivos candidatos**: `features/workouts/pages/TodayWorkoutPage.jsx`, `features/workouts/components/ExerciseCard.jsx`, nueva función en `features/notes/api.js` (`getLastNotePerExercise(threadId, exerciseIds)`) y en `features/workouts/api.js` (`getLastLogPerExercise(studentId, planId, exerciseIds)`).

---

#### Q2 — Tildes en días completados (DIA A ✓✓✓ = hizo 3 veces)

> *"Como alumno y como coach: me es difícil ver la cantidad de veces que hizo el día la persona, me gustaría que salga algo simple sobre el día como tildes cada vez que el día está completado. Ej: DIA A ✓✓✓ significa que ya lo hizo 3 veces y DIA B sólo 2."*

**Qué analizar antes**:
- ¿Dónde se muestra la "lista de días" del plan asignado? En la app del alumno (`TodayWorkoutPage`) y en el detalle del coach (`StudentDetailPage` → tab de planes).
- **Definición operativa de "día completado"**: ¿es cuando `workout_sessions.finished_at IS NOT NULL` para ese día? ¿o cuando todos los `plan_exercises` del día tienen un `workout_logs` con `completed=true`? Hay que confirmar con Anto.
- Query: `SELECT day_label, count(*) FROM workout_sessions ws JOIN ... WHERE student_id=X GROUP BY day_label`. Necesita decidir cómo se mapea `workout_sessions` a `day_label` (puede que `workout_logs.plan_exercise_id → plan_exercises.day_label` sea la vía).
- Decisión: mostrar tildes (✓✓✓) o numerito (×3)? Anto pidió tildes, pero a partir de 5+ se vuelven ilegibles.

**Esfuerzo estimado**: 3-4h.

**Archivos candidatos**: `features/workouts/pages/TodayWorkoutPage.jsx` (tabs de días en el alumno), `features/students/tabs/StudentPlansTab.jsx` o similar (vista coach), posiblemente helper nuevo en `features/workouts/helpers.js` (`countCompletedSessionsPerDay`).

---

#### Q3 — Notificación de nota debe ser clickeable y llevar al panel de notas

> *"Desde alumno. Como notificación de notas: no hay opción de apretar y que te lleve a las notas."*

**Qué analizar antes**:
- Mirar `features/notifications/NotificationBell.jsx` y `features/notifications/hooks/useNotifications.js`. Ver si las notif tienen `payload` con `thread_id` / `note_id` / target route.
- Si el payload ya tiene la info: solo agregar `onClick` que `navigate('/student/notes')` o al thread específico.
- Si no la tiene: extender el payload de las RPCs `fn_notify_coach_note` / `fn_notify_student_note` para incluir `{thread_id, note_id}`. Migración SQL chica.

**Esfuerzo estimado**: 2-3h (depende de qué tiene el payload hoy).

**Archivos candidatos**: `features/notifications/NotificationBell.jsx`, migración SQL si hay que extender payload.

---

#### Q4 — Desasignar evaluaciones

> *"Evaluación: poder desasignar evaluaciones."*

**Qué analizar antes**:
- Hoy un `plan_assignments` con `plan_type='evaluation'` cómo se "termina"? Probablemente vía trigger `fn_close_eval_on_result` cuando se completa.
- Lo que pide es: el coach puede cancelar una evaluación asignada **sin esperar a que el alumno la cumpla**. Marcar `active=false` (o equivalente).
- Verificar que `plan_assignments_sync_active_flag` no lo pise.
- UI: botón "desasignar" en la lista de evaluaciones del alumno, en la vista del coach.

**Esfuerzo estimado**: 2-3h.

**Archivos candidatos**: `features/evaluations/pages/*` (UI), tal vez RPC nueva `cancel_evaluation_assignment(p_assignment_id)`.

---

#### Q5 — Filtrar ejercicios al armar evaluación tipo "personalizado"/"libre" por tag (carpeta EVALUACIONES)

> *"Evaluación: en la parte de personalizado y libre, luego me pide que busque los ejercicios en una sola lista larga. ¿Es posible de ordenar eso como tengo en la sección fuerza y yo buscarlos en la carpeta de EVALUACIONES (que ya hice ese tag) y me salgan sólo esos?"*

**Qué analizar antes**:
- Anto ya tiene un `exercise_tags` con nombre "EVALUACIONES" (verificar con: `SELECT * FROM exercise_tags WHERE name ILIKE 'eval%' AND coach_id=<antoId>`).
- En el form de crear/editar evaluación personalizada, agregar filtro por tag con default "EVALUACIONES" cuando se está armando una eval.
- Lógica: `JOIN exercise_tag_assignments JOIN exercise_tags WHERE tags.name='EVALUACIONES' AND tags.coach_id=auth.uid()`.

**Esfuerzo estimado**: 2-3h.

**Archivos candidatos**: `features/evaluations/components/forms/CustomForm.jsx` (el "personalizado") y `ScoredForm.jsx` (el "libre"), tal vez `features/exercises/` para reutilizar lógica.

---

#### Q6 — Alumno puede editar info básica del perfil (peso, altura, objetivo) + notif al coach

> *"Desde alumno: NO se puede completar info básica del perfil como peso, altura, objetivo. Quiero que el alumno pueda cambiar eso y que haya una notificación cuando cambia algo de eso."*

**Qué analizar antes**:
- Hoy `profiles` ya tiene los campos (`weight_kg`, `height_cm`, etc.). Verificar si la `ProfilePage` del alumno los muestra como editables o solo lectura.
- RLS: el alumno tiene policy UPDATE sobre su propio `profiles`? Si no, ajustar.
- Notificación al coach: el trigger `fn_audit_profile_changes` YA audita columna por columna en `student_edit_history`. Sumar al trigger una rama que `INSERT INTO notifications` cuando cambian campos críticos (peso/objetivo/lesiones). O hacer un trigger nuevo `fn_notify_profile_change`.
- Decidir qué campos disparan notif (no querés spam por cada vez que cambia el teléfono).

**Esfuerzo estimado**: 3-4h.

**Archivos candidatos**: `features/auth/pages/ProfilePage.jsx`, migración SQL para nuevo trigger / policy, `features/notifications/` para el nuevo `kind: 'profile_change'`.

---

#### Q7 — Bloques con numeración automática (A1, A2) e iguala pausa/series del primero

> *"Dentro de armado de plan: automatizar bloques: si pongo bloque A, que automáticamente el segundo bloque si es A: se ponga número dos y se iguale pausa y series."*

**Qué analizar antes**:
- Verificar cómo se llaman los bloques hoy: `plan_blocks.label` es free text ("A1", "B1", "Activación", "Core") o tiene estructura?
- Lógica: al crear un segundo bloque con `label` que empieza con la misma letra que un bloque existente, autoincrementar (A → A1+A2) y copiar config (pausa, series sugeridas, etc.) del primero.
- Decidir si esto es "auto" o si hay un botón "duplicar bloque" que hace lo mismo más explícito (más claro UX, menos magia).

**Esfuerzo estimado**: 3-4h.

**Archivos candidatos**: `features/plans/components/blocks/AddBlockMenu.jsx`, `BlockCard.jsx`, lógica en `features/plans/helpers.js`.

---

#### Q8 — Vista previa de plan con videos incluidos

> *"Dentro de armado de plan: tener una opción de vista previa con los videos incluidos (hay veces que no estoy segura qué video tiene y tengo que entrar desde la cuenta de alumno para poder ver qué video tiene)."*

**Qué analizar antes**:
- Hoy `exercises` tiene `video_url` (verificar el nombre exacto del campo). La vista previa del plan en el coach no lo muestra.
- Sumar un botón o thumbnail por ejercicio en la vista previa que abra el video (modal o link nuevo tab).
- Considerar performance: si hay 30 ejercicios con thumbnails de YouTube embebidos, puede pesar — usar `loading="lazy"`.

**Esfuerzo estimado**: 2-3h.

**Archivos candidatos**: `features/plans/pages/PlanDetailPage.jsx` (preview), `features/plans/components/PlanExerciseRow.jsx`.

---

### 🟡 Features medianas (scope claro, sin requerir plan A/B/C)

#### F1 — Notificaciones en dashboard cuando alumno cumple evaluación

> *"Evaluación: tener notificaciones en dashboard cuando la persona cumple la evaluación."*

**Qué analizar antes**:
- Hoy hay trigger `fn_close_eval_on_result` que se dispara al completar — verificar si ya emite una notificación o no. Si no, sumar una llamada `INSERT INTO notifications` ahí.
- Verificar `payload` para coherencia con otras notifs.

**Esfuerzo estimado**: ~4h.

**Archivos candidatos**: migración SQL para extender o agregar trigger (`fn_notify_eval_completed`), reutilizar patrón de `fn_notify_session_completed`.

---

#### F2 — Notificaciones en dashboard cuando alumno cumple formulario

> *"Formulario: tener notificaciones en dashboard cuando la persona cumple [el formulario]."* (Anto escribió "evaluación" por typo — el contexto lo aclara con "formulario")

**Qué analizar antes**:
- Ya existe `fn_notify_form_submitted` (lo vi al hacer `api-rpcs.md`). Verificar si está activo y disparando correctamente.
- Si está activo: el bug es que la UI no lo muestra. Revisar `NotificationBell.jsx` y filtros del kind.
- Si no está activo: activar el trigger y validar que se inserte en `notifications`.

**Esfuerzo estimado**: 2-4h. Probablemente sea sólo UI side.

---

#### F3 — Refactor de "tipo de prueba" en evaluaciones (4 sub-pedidos juntos)

> *"Evaluación: cuando elijo un ejercicio me sale TIPO DE PRUEBA. Y hay varios errores en eso..."*
>
> Detalle:
> - **a)** Si elijo MOVILIDAD, podría medir dos cosas distintas (movilidad de tobillo derecha y izquierda) → debería habilitarse un campo de "dos valores".
> - **b)** El que dice "video" no sirve porque le pasan por WhatsApp.
> - **c)** Si pongo "libre", al alumno le aparece un cuadro en blanco obligatorio y después otro abajo opcional que es lo mismo, junto con un cuadro de "unidad" también.
> - **d)** Si pongo "puntaje", le sale al alumno para que diga del 1 al 10 cómo le fue, y eso lo debería poner yo (no el alumno).

**Qué analizar antes**:
- Revisar componentes `features/evaluations/components/forms/*.jsx`: `OneRMForm`, `MaxRepsForm`, `PowerForm`, `CardioForm`, `BodyCompForm`, `ScoredForm`, `CustomForm`. Cada uno es un "tipo de prueba".
- Mapear cuál corresponde a:
  - **(a) movilidad** → probablemente `CustomForm` o uno nuevo `MobilityForm`.
  - **(b) video** → ¿es un campo de upload en alguno? Sacarlo o reemplazar por "link a WhatsApp" / "nota libre".
  - **(c) libre** → `ScoredForm` o `CustomForm`. Los 2 cuadros redundantes deben simplificarse.
  - **(d) puntaje** → revisar `ScoredForm`: hoy el alumno responde 1-10. Hay que invertir: el coach lo ingresa al ver el resultado, no el alumno.
- Decidir si "(d) puntaje" requiere migrar `evaluation_test_responses.response_data` para incluir un campo `coach_score` separado del `student_response`.
- Anto dijo "te lo asigno a vos también así ves lo que digo" — pedir a Franco que **asigne una evaluación a Claude/Franco para reproducir el caso visual antes de tocar**.

**Esfuerzo estimado**: 1-2 días. Toca modelo (posible migración) + UI.

**Recomendación**: hacer un sub-plan documentado `14_plan_eval_refactor.md` con las 4 sub-decisiones (¿qué pasa con video, schema nuevo o no, etc.) antes de tocar código. Es el límite del refactor protocol (>500 LOC posibles).

---

#### F4 — Autosave de series en TodayWorkoutPage

> *"Guardado automático en ejercicios. Problema: cuando salgo de la app o bloqueo celular si escribí sólo el registro de una serie, cuando vuelvo a entrar ya se borró."*

**Qué analizar antes**:
- Hoy el log se guarda **al final** del ejercicio (botón "Guardar"). Si el alumno tipea reps de la serie 1 y bloquea, se pierde porque está en estado local de React.
- Decisión de diseño clave: **dónde persistir el draft**:
  - **Opción A — localStorage**: rápido, no pega BD. Pero si el alumno cambia de dispositivo o limpia caché, se pierde.
  - **Opción B — BD on-blur**: cada vez que termina de tipear un campo, hace `save_workout_log` con `completed=false`. Pega BD por cada blur (overhead). Funciona cross-device.
  - **Opción C — BD on-debounce (recomendado)**: cada N segundos (1.5s) de inactividad sobre un input, hace save. Balance entre A y B.
- ¿`save_workout_log` actual soporta upsert parcial? Sí: si `p_log_id=NULL` crea, si está seteado actualiza. Y `p_completed=false` es legal (el campo existe). Compatible con drafts.
- Riesgo: si el alumno empieza varias series y nunca termina, queda con `completed=false` para siempre. ¿Cómo se distingue de un log "real" incompleto?
- Decisión: ¿el draft se muestra en historial como "registro parcial" o se filtra?

**Esfuerzo estimado**: 1 día (mayoría es diseño + decidir UX). Implementación pura: 4h.

**Recomendación**: doc plan `14_plan_autosave.md` con las 3 opciones (A/B/C) y la decisión sobre cómo identificar drafts vs incompletos legítimos.

---

#### F5 — Resumen semanal automático al alumno (domingo) con adherencia + mensaje motivacional

> *"Notificación semanal automática: domingo. Entrenamientos completados (ej: 3/4), % adherencia, pequeño resumen positivo/motivacional. Que el mensaje cambie según adherencia: buena / media / baja. Mantener mensajes cortos y humanos (no exagerados). Ej: 'Completaste 3 de 4 entrenamientos 💪', 'Buena constancia esta semana'. ⚠️ No mostrar demasiados datos técnicos al alumno."*

**Qué analizar antes**:
- Ya existe `fn_notify_weekly_summary` (lo vi en `docs/api-rpcs.md`). Verificar qué emite hoy: lo más probable es que mande datos técnicos (volumen, RPE) — Anto explícito pide NO eso.
- Refactor del RPC para:
  - Calcular entrenamientos completados vs planificados (`workout_sessions` con `finished_at NOT NULL` / `sessions_per_week`).
  - Calcular % adherencia.
  - Generar mensaje motivacional según rango (ej: >=80% → "buena", 50-79% → "media", <50% → "baja").
- Decidir si el mensaje vive en la BD (tabla `motivational_messages` con pool randomizado) o hardcodeado en el RPC.
- Foto en WhatsApp de Anto: maqueta del notif.

**Esfuerzo estimado**: 4-6h.

**Archivos candidatos**: migración SQL refactor de `fn_notify_weekly_summary`, `features/notifications/` para el rendering nuevo del notif (icono según adherencia, mensaje).

---

#### F6 — Drag-and-drop para reordenar ejercicios en armado de plan

> *"Dentro de armado de plan: poder mover el orden de los ejercicios y que cambien sus números o bloques."*

**Qué analizar antes**:
- Hoy `plan_exercises.order_index` mantiene el orden, pero la UI no permite reordenar visualmente. Verificar.
- Lib: `dnd-kit` (preferido sobre `react-dnd`, más liviano y moderno). Agregar a deps.
- Lógica: al soltar, recalcular `order_index` para todos los items afectados + posiblemente cambiar `block_id` si se movió a otro bloque.
- Atomicidad: si el alumno está viendo el plan en ese momento, el realtime puede mostrar estados inconsistentes — pegar al final con un UPDATE bulk.

**Esfuerzo estimado**: 4-6h (curva inicial de dnd-kit) + 2h reordenar bloques (lo mismo a nivel de bloque, si lo pide).

**Archivos candidatos**: `features/plans/pages/EditPlanPage.jsx`, `features/plans/components/blocks/*Editor.jsx`, sumar deps.

---

#### F7 — Circuito: pausa, tiempo y vueltas a nivel del BLOQUE (no por ejercicio)

> *"Armado plan circuito: opción libre de poner tiempo, pausa y vueltas dentro de un mismo bloque. (Ahora solo me da la opción de tiempo por ejercicios separados.)"*

**Qué analizar antes**:
- Inspeccionar `plan_blocks` con `block_type='circuit'`: ¿qué columnas tiene hoy? ¿`rounds`, `rest_between_rounds`, `work_time`, `rest_time`?
- Si faltan, migración SQL: `ALTER TABLE plan_blocks ADD COLUMN rounds int, rest_between_rounds int, work_seconds int, rest_seconds int`.
- UI: hoy el coach configura tiempo POR ejercicio. Cambiar a configurar a nivel bloque y aplicar a todos los ejercicios del circuito.
- Backward compat: planes ya creados con tiempo por ejercicio — ¿se respeta el dato viejo o se migra?

**Esfuerzo estimado**: 4-6h.

**Archivos candidatos**: migración SQL si faltan columnas, `features/plans/components/blocks/CircuitBlockEditor.jsx`, `features/workouts/components/CircuitBlockRunCard.jsx` (run-side).

---

#### F8 — Historial de peso y objetivo del alumno con fechas

> *(Parte del pedido Q6:)* *"Con el PESO Y OBJETIVO, puede que vayan quedando un registro con fechas y cómo va cambiando."*

**Qué analizar antes**:
- `student_edit_history` YA existe y audita cambios columna por columna en `profiles`. Verificar si captura `weight_kg` y `objetivo` (o el equivalente).
- Si captura: agregar una vista en `ProgressPage` del alumno con el gráfico de evolución (line chart de peso a lo largo del tiempo).
- Si NO captura esos campos: extender el trigger.
- Decidir: ¿el coach también ve este gráfico? Probablemente sí, en `StudentDetailPage`.

**Esfuerzo estimado**: 4-5h (incluyendo el gráfico con recharts).

**Archivos candidatos**: `features/progress/pages/ProgressPage.jsx`, `features/students/tabs/StudentInfoTab.jsx` o `StudentProgressTab.jsx`. Posible migración para extender `fn_audit_profile_changes`.

---

#### F9 — Cuadros de info editable opcionales por sección/bloque (ícono INFO)

> *"Info al tocar cada sección de entrenamiento con cuadro de texto editable y opcional para el coach si quiere explicar para qué sirve. Ej: 'entrada en calor' y un ícono de INFO donde explico qué es."*

**Qué analizar antes**:
- `plan_blocks` ya tiene `notes` o `description`? Verificar. Si no, agregar `description text NULL`.
- UI: en el editor del coach, sumar un campo "Descripción / Para qué sirve" opcional. En el run-side del alumno, mostrar un ícono ℹ️ que abre el texto en tooltip o modal.
- Aplicar también a "secciones" (`day_a`, `day_b`, `activation`, etc.) — verificar si esto es a nivel bloque o sección.

**Esfuerzo estimado**: 4-5h.

**Archivos candidatos**: migración SQL si falta `description`, `features/plans/components/blocks/BlockCard.jsx`, `features/workouts/components/BlockRenderer.jsx` (run-side).

---

#### F10 — Agregar fotos a evaluaciones

> *"Agregar fotos a evaluaciones."*

**Qué analizar antes**:
- ¿Quién sube las fotos: el alumno (foto antes/después de un test físico) o el coach (foto de referencia de cómo hacer el test)? Decisión pendiente con Anto.
- Storage: Supabase Storage tiene un bucket por defecto. Crear bucket `evaluation-photos` con policy ad-hoc (alumno escribe/lee sus propias, coach escribe/lee de sus alumnos).
- Schema: agregar `evaluation_test_responses.photo_url text` o tabla nueva `evaluation_photos` con varias por response.
- UI: upload con preview, ver fotos previas, borrar.
- Compresión client-side antes de subir (las fotos de celular son ~5MB; comprimir a 300KB con `browser-image-compression`).

**Esfuerzo estimado**: 6-8h (Storage + UI upload + compresión + policy).

**Archivos candidatos**: nuevo bucket en Supabase Storage, `features/evaluations/components/forms/*`, posible nueva tabla `evaluation_photos`.

---

### 🔴 Features grandes (requieren plan documentado)

#### G1 — Sistema de pagos: período + alarma mensual + soportar pago de 3-6 meses

> *"Asignación de pagos: poner período de pago y al mismo tiempo una alarma cada mes. Para opciones que me paguen 3 meses o 6."*

**Qué analizar antes**:
- ❓ Feature totalmente nueva. No hay nada en el schema actual sobre pagos. Necesita:
  - Tabla nueva: `payment_subscriptions` (`id`, `student_id`, `coach_id`, `period_months`, `amount`, `start_date`, `next_due_date`, `status`).
  - Tabla nueva (opcional): `payment_records` para historial de pagos efectuados.
  - Cron job: `fn_notify_payment_due()` que corre diario y notifica al coach (y al alumno?) cuando se acerca el próximo vencimiento.
  - UI coach: gestión de subscripciones por alumno.
  - UI alumno: ¿ve sus próximos pagos? ¿confirma cuando paga? — decisión pendiente.
- **¿Integración con pasarela de pago real (Mercado Pago, Stripe)?** Anto no lo dijo claro. Si no, es solo "tracking manual" — más simple.
- Anto dijo "voy a tratar de buscar y priorizar estos meses" — implica que él manualmente lleva la cuenta hoy. La feature reemplaza esa planilla.

**Esfuerzo estimado**: 2-3 días (sin integración con pasarela), 5+ días (con integración).

**Recomendación**: doc plan obligatorio `14_plan_pagos.md` con scope mínimo (MVP) vs nice-to-have. Empezar SIN integración de pasarela — sólo tracking + notif.

---

#### G2 — Dashboard semanal coach con alertas automáticas + vista resumen de alumnos

> *"Quiero un dashboard/resumen semanal por alumno con: adherencia semanal, tendencia (subió/mantuvo/bajó), resumen wellbeing (energía/recuperación/fatiga), alertas automáticas (baja adherencia / fatiga alta / dolor repetido / varios días sin entrenar / estancamiento). Ej: ⚠️ 'Molestia lumbar reportada 3 veces', ⚠️ 'Sin progresos hace 3 semanas'. **La app debería priorizar: alertas accionables - detección de problemas - automatización de seguimiento. No tantas notificaciones innecesarias.** Dashboard simple tipo: Alumno | Estado, Franco | ⚠️ baja adherencia, Ana | 🔥 progreso positivo, Lucas | ⚠️ fatiga alta. Click → detalle del alumno."*

**Qué analizar antes**:
- **Lo que YA existe** (no reinventar):
  - `useCoachAlerts` y `coachAlerts.js` en `features/dashboard/` — verificar qué alertas calculan hoy.
  - `fn_notify_stagnation()` cron — "Sin progresos hace 3 semanas" tipo de alerta ya existe.
  - `wellbeing_logs` ya guarda energía/recuperación/fatiga.
  - `fn_notify_session_completed`, `fn_notify_workout_activity` — base de actividad por alumno.
- **Lo que falta**:
  - Cálculo de adherencia semanal (sessions completadas / sessions_per_week).
  - Cálculo de tendencia (comparar semana actual vs anterior — fórmula explícita pendiente).
  - Detección de "dolor repetido" (parsear notas con keywords como "molestia", "dolor", "lumbar"? o un campo estructurado en wellbeing?).
  - "Varios días sin entrenar" (lo más fácil — diff entre hoy y `max(workout_logs.logged_date)`).
  - Vista lista compacta `Alumno | Estado` (es un refactor de `CoachDashboard.jsx`).
- Foto en WhatsApp de Anto: maqueta de la vista lista — pedirla.
- **Filosofía explícita de Anto**: "alertas accionables, no notificaciones innecesarias". Esto es CRÍTICO. Cada alerta tiene que llevar a una acción concreta del coach (ej. "click → mandar mensaje al alumno" o "click → ver el thread de notas con la molestia").

**Esfuerzo estimado**: 3-5 días. Es el proyecto más estratégico del backlog porque (a) es lo que más ahorra tiempo al coach, (b) toca varias features, (c) requiere muchas decisiones de diseño.

**Recomendación**: doc plan obligatorio `15_plan_dashboard_alertas.md` con:
- Lista cerrada de alertas a soportar (ej. 5: baja adherencia, fatiga alta, dolor repetido, días sin entrenar, estancamiento).
- Por cada alerta: criterio de cálculo (SQL/lógica), umbral, "acción accionable" sugerida.
- Mockup de la vista lista de alumnos.
- Decisión: ¿las alertas son recalculadas on-demand al cargar el dashboard, o se persisten en una tabla `coach_alerts` por cron diario?

---

#### G3 — (parte del eval refactor F3 que escala) — pendiente si se decide rehacer el modelo de `evaluation_test_responses`

Si F3 (refactor de "tipo de prueba") implica cambiar el shape de `response_data` para soportar:
- valores múltiples (movilidad bilateral)
- separación coach_score vs student_response
- distintos tipos de UI por método (mobility, scored, custom, etc.)

→ es un refactor del modelo, no sólo UI. En ese caso entra en G3 con plan documentado.

Si se decide mantener el shape actual y sólo cambiar UI, queda en F3 mediano.

---

## Pre-requisito recomendado antes de empezar

**Mover `archive.student_profiles` → `public`** (1h). Doc 11 §2.1 y `docs/known-exceptions.md` ya lo explican. Razón para hacerlo antes de empezar features:

- F4 (autosave) puede no tocarla, pero G1 (pagos) sí (referencia `student_id`).
- F3 + G2 (eval refactor) probablemente quieran inspeccionar profile.objetivo / nivel — más limpio leerla desde `public.student_profiles` que desde `archive.*`.

Comando aproximado:

```sql
BEGIN;
ALTER TABLE archive.student_profiles SET SCHEMA public;
-- ajustar refs en el front (grep "archive.student_profiles" en src/)
COMMIT;
```

Más posibles renames de policies que pueden quedar con nombres viejos (`coach_read_own_student_profiles`, etc.) — verificar.

---

## Orden sugerido de ataque para próximas sesiones

Actualizado tras la 2da ronda de pedidos de Anto. Orden pensado para maximizar impacto/esfuerzo y empezar por items que NO bloquean a otros:

| Sesión | Items | Esfuerzo |
|---|---|---|
| **1** | Pre-requisito archive → public + **B1** (bug vista previa) + **Q3** (notif clickable) | medio día |
| **2** | **Q6** (perfil alumno editable + notif coach) + **Q8** (videos en preview de plan) + **Q7** (bloques A1/A2 auto) | 1 día |
| **3** | **Q1** (últimas notas/pesos en flow workout) + **Q2** (tildes días) | 1 día |
| **4** | **Q4** (desasignar eval) + **Q5** (filtrar ejercicios por tag) + **F1** + **F2** (notifs eval+form) | 1 día |
| **5** | **F5** (resumen semanal alumno con adherencia + mensaje motivacional) + **F8** (histórico peso/objetivo gráfico) | 1 día |
| **6** | **F6** (drag-and-drop reordenar) + **F7** (circuito tiempos a nivel bloque) | 1 día |
| **7** | **F9** (info editable por sección) + **F10** (fotos en evaluaciones) | 1 día |
| **8** | **F3** — plan documentado `14_plan_eval_refactor.md` + implementación | 1-2 días |
| **9** | **F4** — plan documentado `15_plan_autosave.md` + implementación | 1 día |
| **10** | **G2** — plan documentado `16_plan_dashboard_alertas.md`. **El proyecto más estratégico del backlog** según filosofía de Anto. | 3-5 días |
| **11+** | **G1** — pagos: plan documentado `17_plan_pagos.md` + MVP sin pasarela | 2-3 días |

Total: ~15-20 sesiones de 1-2h cada una, distribuidas en 4-6 semanas si Franco trabaja 1h/día.

**Cláusula importante**: si Anto sigue mandando pedidos (lo cual es probable), parar a revaluar el orden cada 3-4 sesiones. No congelar el plan a 6 semanas — el coach es el que paga las cuentas.

---

## Decisiones pendientes que necesitan input de Anto o Franco antes de tocar código

| # | Decisión | A definir antes de |
|---|---|---|
| 1 | "Día completado" = `workout_sessions.finished_at IS NOT NULL` o = todos los `plan_exercises.completed=true`? | Q2 (tildes) |
| 2 | En la card de "última nota" del flow workout, ¿se muestra sólo nota del coach, sólo del alumno, o ambas? | Q1 |
| 3 | Autosave: ¿localStorage (A), BD on-blur (B), o debounce (C)? | F4 |
| 4 | Refactor eval: ¿qué pasa con el método "video"? Eliminar, o cambiar a "link externo" / "nota libre"? | F3 |
| 5 | Pagos: ¿integración con Mercado Pago/Stripe, o sólo tracking manual? Y ¿el alumno tiene UI propia? | G1 |
| 6 | "Puntaje" en eval: ¿lo ingresa el coach después de ver al alumno? ¿Se mantiene el campo del alumno también? | F3 |
| 7 | Cancelar evaluación: ¿se borra el `plan_assignments` o se marca `active=false`? ¿Y los `evaluation_results` parciales que pudieran existir? | Q4 |
| 8 | Perfil editable: ¿qué campos disparan notif al coach (peso, objetivo, lesiones — sí)? ¿Cuáles no (teléfono, foto)? | Q6 |
| 9 | Bloques con numeración automática (Q7): ¿auto-magia al detectar misma letra, o botón explícito "duplicar bloque"? | Q7 |
| 10 | Mensaje motivacional del resumen semanal (F5): ¿hardcodeado por rango de adherencia, o pool randomizado en tabla `motivational_messages`? | F5 |
| 11 | Circuito (F7): ¿se respeta el dato viejo de "tiempo por ejercicio" en planes existentes, o se migra a tiempo por bloque uniformemente? | F7 |
| 12 | Fotos en evaluaciones (F10): ¿quién sube — alumno, coach o ambos? ¿1 foto o varias por evaluación? | F10 |
| 13 | Dashboard de alertas (G2): ¿qué 5 alertas concretas soportar v1? Y por cada una, el umbral (ej. "baja adherencia" = ¿<50%? ¿<60%?) y la "acción accionable" (¿cuál es?) | G2 |
| 14 | Dashboard de alertas (G2): ¿las alertas se calculan on-demand al cargar dashboard, o las persiste un cron diario en `coach_alerts`? | G2 |

Lo ideal: que Franco haga una pasada con Anto sobre estas 14 preguntas (las primeras 7 ya van con el texto traducido del 21/05). Lleva 30-40 min y desbloquea todo.

respuestas

"1) A 
2) A. DEL COACH, y si se puede los ultimos pesos regisrados por alumno. 
4) A SACALO NOMAS
5) A. el coach lo puntua. 
6) B. Solo guardar en caso q lo hizo y cargo algo. 
7) SOLO llevar la cuenta, que me salga notificacion de que alguien tiene q pagar o se esta por vencer el plan puede ser. Seria yo poner cuando pago y q corra por 1,,3, o 6 meses de opcion. y q a la semana y al dia de q este por terminarse salga notificacion tanto a coach como alumno, 
8) A
9)A 
10) VARIADOS. Te los puedo pasar si lo necesitas. 
11) B-
12) Yo solamente, son varias. si esto es pago, puede ser en la parte de evaluacion una nota de texto donde yo pueda copiar un link de drive para ver las evaluaciones pienso. tipo en el perfil del alumno en evaluaciones 
13) a. si, 50% o menos avisar. al apretar no me lleva a ningun chat, yo lo hablo por wpp, pero si q me lleve al progreso a la tablita. 
b. si
c. na ni nos preocupemos por el dolor entonces, ya lo tengo con la fatiga mas o menos controlado y con el chat preguntando. 
d. 4 dias si. 
e. que seria lo armado?
14. c "

---

## Fotos/screenshots pendientes de Anto (WhatsApp)

Anto mandó varias maquetas/screenshots por WhatsApp que sirven para acertar UI. **Pedirlas y guardarlas en `diagnostico_arquitec/assets/`** antes de empezar el item respectivo:

| Item | Qué se mandó por WhatsApp |
|---|---|
| Q1 | Maqueta de "últimas notas + pesos" en el flow de workout. |
| F5 | Maqueta de cómo se vería la notificación semanal al alumno. |
| G2 | Maqueta del dashboard semanal del coach + la vista lista "Alumno \| Estado". |

Sin esas imágenes la UI se inventa y es probable que Anto pida rehacer. **Bajar tiempo de iteración: pedir foto antes que después.**

---

## Cuando se cierre cada item

- Bug/feature implementada → commit con prefijo `feat:`/`fix:` + scope de la feature (ver `architecture.md` §commits).
- Cuando el item involucre migración SQL → entrada en `01_changelog_back.md`.
- Cuando el item involucre una decisión grande → handoff dedicado (`14_*.md`, `15_*.md`).
- Al cerrar la sesión: actualizar este doc tachando el item resuelto (no borrar, dejar histórico).
