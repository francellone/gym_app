# Handoff próximo agente — 2026-05-23

Sesión corta de cierre de items del backlog del doc 13 (pedidos Anto). Se cerraron B1, Q3, Q8.

## Pre-flight al arrancar

1. Leer este doc.
2. Confirmar Supabase MCP apunta a `bvexjanqmfypmtgoapbt` (gymorg, sa-east-1).
3. Browser conectado: usar **francellone** (`deviceId 5c324fc5-b1e8-4e0f-b5bd-ab5054057e08`).
4. Working dir: `~/Desktop/gym_app/gym_app/` (atención: hay un padre `~/Desktop/gym_app/` que NO es el repo y rompe `vite` si Franco hace `cd` ahí).
5. Para dev local: `cd ~/Desktop/gym_app/gym_app && npm run dev` — Vite arranca en `http://localhost:5173`.

## Items cerrados esta sesión

### B1 — preview del coach mezclaba bloques (fix)

- **Archivo**: `src/features/plans/pages/PlanDetailPage.jsx`.
- **Causa**: `groupedBySection` filtraba `plan_exercises` solo por `section`, sin `block_type`. La tabla "Fuerza" recibía todos los ejercicios de la sección, incluidos los del bloque `circuit`/`aerobic`. Por eso aparecían "en el medio" Y duplicados en su card propia.
- **Fix**: eliminado `groupedBySection`. Se introdujo `strengthExercisesBySection`, derivado de `blocksBySectionTyped[s.id].strength` con `flatMap(b.plan_exercises).sort(order_index)`.
- **Nota**: `TodayWorkoutPage.jsx` (vista alumno) NO tenía el bug — usa `blocksBySection` + `BlockRenderer` que respeta `block_type`. Si se ve un patrón similar a futuro, comparar con `TodayWorkoutPage` como referencia correcta.
- **Plan de prueba**: `PLAN 1 💪🏼🥳` (`96649948-1c85-4dbd-a937-e23c79a557c9`, día A y día B) tiene strength + circuit en el mismo día.

### Q3 — notif de nota clickeable (front-only)

- **Archivos**: `src/features/notifications/components/NotificationBell.jsx`, `src/features/students/pages/StudentDetailPage.jsx`.
- **Hallazgo clave**: el payload de las notif (`notifications.data jsonb`) **ya viene poblado** por los triggers `fn_notify_coach_note` / `fn_notify_student_note` con `thread_id`, `student_id`, `context_id`, `exercise_id`, `context_type`. **No requirió migración SQL.**
- **Cambios**:
  - `getNotificationTargetUrl(notification)` mapea tipo → URL. Hoy cubre `coach_comment → /student/notes` y `student_note → /coach/students/{student_id}?tab=notas`. El resto cae a `null` (solo marca leída, sin navegar).
  - `NotificationItem` ahora recibe `onNavigate`, marca como leída y dispara `handleNavigate(url)` que cierra el panel y `navigate()`.
  - `StudentDetailPage` lee `?tab=...` con `useSearchParams` y valida el id contra `TABS` antes de aplicarlo. El tab de notas del coach se llama `'notas'` (no `'notes'`).
- **Extender el mapeo a más tipos** (plan_assigned, form_submitted, etc.) cuando haga falta — la infra ya está. Solo agregar `case` al switch.

### Q8 — link a video en preview de bloques aeróbico y circuito

- **Archivo**: `src/features/plans/pages/PlanDetailPage.jsx`.
- **Hallazgo**: `ExerciseRow` (strength) ya tenía el botón con `<ExternalLink size={11}>` y clase `plan-ex-video-btn`. **Faltaba en `AerobicBlockSummary` y `CircuitBlockSummary`** — Anto reportaba "tengo que entrar desde la cuenta de alumno" porque esos bloques directamente no exponían el link.
- **Fix**: agregado el mismo patrón en aeróbico (junto al ejercicio principal) y circuito (junto al nombre de cada item). Size `12` para que sea un toque más visible en el primer uso.
- **Cobertura BD**: 200/276 ejercicios (72%) tienen `video_url` válida.

## Commits de esta sesión (en main, sin PR)

```
fix(plans): preview coach — separar bloques por tipo + link a video en aeróbico/circuito (B1, Q8)
feat(notifications): notif clickeable navega al panel de notas (Q3)
docs(diagnostico): doc 13 — backlog pedidos Anto 2026-05-21
```

## Bloqueos abiertos

- **Q1 (últimas notas/pesos en flow workout)**: bloqueado por foto/maqueta de Anto por WhatsApp. Anto YA respondió decisión (respuesta 2 = "A. DEL COACH, y si se puede los últimos pesos registrados por alumno"). Falta solo la maqueta visual antes de arrancar para no inventar UI y rehacer.
- **Foto de F5 y G2** también pendientes (doc 13, sección "Fotos/screenshots pendientes"). No bloquean esta tanda inmediata, pero pedirlas al mismo tiempo que la de Q1 si se va a la próxima ronda completa.

## Próximo paso recomendado

Orden propuesto:

1. **Q7** (bloques A1/A2 auto + iguala pausa/series del primero) — Anto respuesta 9=A (auto-magia al detectar misma letra). Esfuerzo 3-4h, scope chico, alto valor para el armado de planes. **No requiere decisión ni foto.**
2. **Q6** (perfil editable + notif coach) — Anto respuesta 8=A. **Pre-requisito recomendado antes**: mover `archive.student_profiles → public` (1h, ver doc 11 §2.1 y doc 13 §"Pre-requisito"). Sin esto, varios items tocan `archive.*` y queda inconsistente.
3. **Q1** apenas llegue la foto.

Alternativa si Anto presiona algo distinto: respetar pedido, validar contra doc 13 + respuestas de Anto en el propio doc 13 (sección "respuestas" ~línea 310).

## Decisiones de Anto vigentes (extraídas del doc 13)

Anto respondió 13 de las 14 preguntas pendientes (skip la #3 de autosave). Decodificación contra el cuestionario del doc 13:

| # | Tema | Decisión |
|---|---|---|
| 1 | Día completado (Q2) | A — `workout_sessions.finished_at IS NOT NULL` |
| 2 | Última nota en workout (Q1) | A — solo coach + últimos pesos por alumno |
| 3 | Autosave (F4) | SIN RESPUESTA — re-preguntar |
| 4 | Método "video" en eval (F3) | SACAR |
| 5 | Pagos (G1) | Solo tracking, sin pasarela; notif a coach+alumno al vencer (1 semana antes y al día) |
| 6 | Puntaje en eval (F3) | A — el coach puntúa, no el alumno |
| 7 | Cancelar eval (Q4) | (respuesta 6 de Anto fue ambigua: "B. solo guardar si cargó algo" — no encaja con esta pregunta, re-preguntar) |
| 8 | Perfil editable, qué dispara notif (Q6) | A — peso/objetivo/lesiones disparan notif |
| 9 | Bloques numeración auto (Q7) | A — auto-magia al detectar misma letra |
| 10 | Mensaje motivacional (F5) | Variados — Anto puede mandar pool |
| 11 | Circuito tiempos (F7) | B — migrar a tiempo por bloque (no respetar dato viejo por ejercicio) |
| 12 | Fotos en evaluaciones (F10) | Sube solo coach, varias. Idea alterna: nota de texto con link Drive |
| 13 | Dashboard alertas (G2) — qué alertas v1 | a) baja adherencia <50% → llevar a la tablita de progreso. b) fatiga alta sí. c) dolor: skip. d) días sin entrenar: 4. e) "estancamiento" no entendió la pregunta — re-preguntar. |
| 14 | Alertas: on-demand o cron (G2) | C (otra) — necesita aclarar qué quiso decir |

## Trampas técnicas aprendidas en esta sesión

1. **El path del repo es `~/Desktop/gym_app/gym_app/`, NO `~/Desktop/gym_app/`.** El padre existe y tiene un `package.json`/`node_modules` propios (legacy o scaffolding), por lo que `npm install` y `vite` arrancan sin error pero fallan al servir `/src/main.jsx` porque ahí no existe `src/`. Si Franco se equivoca de `cd`, el síntoma es "Vite ready" + 404 en `/src/main.jsx` al refrescar el browser.
2. **`useSearchParams` de react-router** es la vía limpia para deep-link a una tab interna sin cambiar la routing definition. Se valida el valor contra una whitelist (en este caso, `TABS`) antes de aplicarlo, para evitar tabs inexistentes vía URL.
3. **Pre-fix de bug de render: comparar siempre la vista del coach contra la del alumno.** En este repo varias features tienen dos pantallas (PlanDetailPage vs TodayWorkoutPage; etc). La del alumno suele estar mejor escrita porque el alumno es el caso de uso primario; sirve como referencia de "cómo debería verse".
4. **El tab del coach se llama `'notas'` (con S)**, no `'notes'`. Buscar exact match si se hace deep-link.
5. **Vite/Vitest deja archivos `*.config.js.timestamp-<n>-<hash>.mjs`** en el repo después de recargar config. Aparecen untracked. **No commitearlos** — falta entrada en `.gitignore` (TODO de cleanup).

## Tasks list al cierre

Todas completadas (11/11). Próxima sesión arranca con task list nuevo desde Q7 / Q6 / Q1.
