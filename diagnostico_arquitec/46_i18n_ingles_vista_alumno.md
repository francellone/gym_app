# 46 — i18n: vista del alumno en inglés (switch ES/EN)

**Fecha:** 2026-06-10
**Estado:** Opción A aprobada por Franco. **Fases 1, 2 y 3 implementadas (2026-06-10)** — pendiente commit/push (Franco) y smoke en prod. Queda deuda menor en helpers compartidos (ver "Deuda restante").
**Origen:** pedido de Anto — va a tener clientes angloparlantes.

## Decisiones de Franco (2026-06-10)

- Alcance: **solo la vista del alumno**. El panel de la coach queda en español.
- Idioma: **por alumno**. La coach lo setea al crear/editar el alumno; el alumno puede cambiarlo en su perfil. No es un switch global.

## Relevamiento (2026-06-10)

- No existe ninguna infraestructura i18n. Todos los textos están hardcodeados en español.
- Superficie del alumno (rutas `/student/*` en `App.jsx` + login + layout):
  - `features/workouts` 14 jsx (TodayWorkout, History, ExerciseCard, etc.)
  - `features/dashboard` 7 jsx (StudentDashboard + components)
  - `features/notes` 6 jsx, `features/wellbeing` 2, `features/progress` 1, `features/notifications` 1
  - Forms del alumno: IntakeFormPage, FollowUpFormPage, FormsListPage, intake/components/student (4 jsx)
  - `features/evaluations/pages/EvalWorkoutPage.jsx`, `components/layout` (StudentLayout), `features/auth/pages` (Login, ProfilePage)
  - Utils compartidos: `errorHelpers.js`, helpers con textos de toasts/errores
- Total: **~40 archivos jsx + utils**, estimado **600–900 strings** traducibles.
- DB: no existe columna de idioma en `users`.

## Limitación importante (comunicada a Franco)

Se traduce la **interfaz** (botones, títulos, mensajes, errores). El **contenido cargado por la coach** — nombres de ejercicios, instrucciones, nombres de planes, preguntas de formularios, notas — queda en el idioma en que lo escribió. Para clientes en inglés, Anto debería cargar esos planes/formularios en inglés. (Futuro posible: campos bilingües o auto-traducción de contenido; fuera de alcance acá.)

## Opciones

### Opción A — react-i18next (recomendada)
Librería estándar (i18next + react-i18next). Archivos `src/i18n/es.json` y `en.json` con namespaces por feature. Hook `useTranslation()` en cada componente del alumno.

- ✅ Estándar de facto, interpolación y plurales resueltos, escala si después se quiere traducir el panel coach o agregar idiomas.
- ✅ Migrable por fases: componente sin migrar sigue mostrando español, nada se rompe.
- ❌ +2 dependencias; trabajo mecánico grande (extraer ~600-900 strings).

### Opción B — diccionario propio liviano
Hook `useT()` casero + objetos `es`/`en` por feature. Cero dependencias.

- ✅ Sin deps, simple de entender.
- ❌ Reinventa interpolación/plurales; a la larga se vuelve un mini-i18next mal hecho. Mismo trabajo mecánico de extracción.

### Opción C — auto-traducción del browser / toda la app
Descartada: el browser traduce también los datos (nombres de ejercicios) con calidad impredecible y rompe UX. Traducir toda la app fue descartado por Franco (la coach trabaja en español).

**Recomendación: A.**

## Modelo de datos

Migración:
```sql
alter table users add column language text not null default 'es'
  check (language in ('es','en'));
```
- Coach: selector de idioma en CreateStudentPage y StudentDetailPage.
- Alumno: selector en ProfilePage.
- `AuthContext` ya carga `profile`; el idioma sale de `profile.language` → `i18n.changeLanguage()`.

## Fases (cada una deployable, default 'es' = cero cambio visible)

1. **Infra**: deps + setup i18n + migración DB + selectores de idioma (coach y perfil alumno). Smoke: app idéntica en español.
2. **Núcleo**: StudentLayout, StudentDashboard, TodayWorkoutPage + ExerciseCard y componentes de workout, errorHelpers/toasts. Es el 80% del uso real.
3. **Resto**: Progress, History, Notes, Wellbeing, EvalWorkout, forms del alumno (chrome), Login, notificaciones (templates de texto).
4. **QA**: alumna de prueba en `en` + smoke en prod con browser francellone.

## Fase 1 — qué se hizo (2026-06-10)

- Deps: `i18next` + `react-i18next`. Setup en `src/i18n/index.js` + `src/i18n/locales/{es,en}.json` (fallback es). Import en `main.jsx`.
- `AuthContext.fetchProfile` hace `i18n.changeLanguage(profile.language || 'es')`; logout vuelve a es.
- Migración **aplicada en prod** vía MCP: `profiles.language text not null default 'es' check (es|en)`. Archivo: `supabase/migrations/20260610120000_i18n_profiles_language.sql`. (Nota: la columna vive en `profiles`, no en `users`.)
- Coach: selector "Idioma de la app" en `CreateStudentPage` (card Entrenamiento) y en `StudentInfoTab` (edición + vista + `FIELD_LABELS`/`displayValue` → queda historizado en `student_edit_history`).
- Alumno: card "Idioma de la app" en `ProfilePage` (botones Español/English, guarda y refresca al toque). Primeros strings con `t()`.
- El cambio de idioma NO dispara notif al coach (no está en la lista de `fn_notify_profile_change`), decisión consciente.
- Tests 303/303 OK, build OK.

## Fase 2 — qué se hizo (2026-06-10)

Traducido el núcleo de la vista del alumno (~234 claves es/en sincronizadas):

- **StudentLayout**: nav inferior (nav.*).
- **StudentDashboard**: saludo, banners de formularios (con plurales `_one/_other`), racha, heatmap semanal, tallies, accesos rápidos. Fechas con `t('dates.fullDate')` + `dateLocale()` (`src/i18n/dateLocale.js`, locale date-fns acoplado al idioma).
- **DayTalliesBadge** (compartido con coach — inocuo porque el coach siempre está en 'es'): labels de días, leyenda, tooltips. Se renombró la var interna `t`→`tally` por shadowing.
- **Workouts completo** (TodayWorkoutPage + 11 componentes): ~179 claves bajo `workout.*` y `errors.*`, incluyendo escalas RPE cardio/circuit (`workout.rpe.*`), confirmaciones de desmarcar, warnings de validación, chat de ejercicio, PSE diario, wellbeing.
- `src/test/setup.js` importa `@/i18n` para que los componentes con `useTranslation` rendericen es en tests.
- `evalType.*` traducido con `defaultValue` al label legacy de `evaluations/helpers`.

**Deuda anotada para fase 3** (texto que sigue en español por venir de helpers compartidos):
`SECTION_LABELS`, `WEIGHT_MODES`, `REPS_UNITS`, `CIRCUIT_TYPES`, `INTENSITY_LEVELS`, `AEROBIC_*` (de `plans/helpers.js`); `PSE_OPTIONS`/`PSE_SHORT` (de `workouts/helpers.js`, el label además se persiste en DB); `formatRelativeDate`/`formatLastLogSummary` (de `exerciseHistoryLogic.js`); mensajes clasificados de `useSaveErrorBanner`/`errorHelpers`. Estrategia sugerida: traducir en el punto de render con claves `t('...', { defaultValue })`, sin tocar lo que se persiste.

Verificación fase 2: tests 303/303, build OK, eslint OK, paridad de claves es/en 234/234.

## Fase 3 — qué se hizo (2026-06-10)

Resto de pantallas del alumno (545 claves totales es/en, paridad verificada):

- **ProgressPage** (60 claves, incluye dataKeys de recharts computados para que legend/tooltip salgan traducidos), **HistoryPage**, **EvalWorkoutPage** (modal de borrado con `<Trans>` para negritas), **LoginPage** (su test sigue intacto y pasa), **ProfilePage completo** (validaciones, contraseña, intake, niveles).
- **GOAL_OPTIONS / PATOLOGIAS_OPTIONS**: el VALOR persistido en BD sigue en español; mapas `GOAL_I18N_KEYS`/`PATOLOGIA_I18N_KEYS` traducen solo el display, con defaultValue para valores custom.
- **Notas**: StudentNotesPage + NotesPanel/NoteCard/NotesFilters/NoteComposer (compartidos con coach — inocuo, coach siempre 'es').
- **WELLBEING_METRICS**: se agregaron `labelKey/lowLabelKey/highLabelKey` manteniendo los labels español como fallback; modal, WellbeingCard y ProgressPage usan t(), StudentWellbeingTab (coach) sigue igual.
- **Forms del alumno**: solo chrome (botones, progreso, éxito, validación fallback). Lo que viene de form_snapshot (preguntas de la coach) NO se traduce.
- **NotificationBell**: chrome + tiempos relativos con dateLocale(). El texto de cada notif viene de la DB.

Verificación fase 3: tests 303/303, build OK, eslint limpio, 545/545 claves sincronizadas.

## Pasada post-auditoría (2026-06-10, mismo día) — 3 fixes de idioma mixto

- **`exerciseHistoryLogic.js`**: `formatRelativeDate` (hoy/ayer/hace N días → `dates.rel*`), `formatLastLogSummary` y `formatLastBlockLogSummary` (PSE→RPE, rondas→rounds) ahora usan `i18n.t` con la instancia global. Con lng 'es' el output es byte-idéntico al histórico → los tests existentes pasan sin tocarlos.
- **`utils/errorHelpers.js`**: los ~20 mensajes de `getFriendlyErrorMessage` traducidos vía `errors.friendly.*` con `defaultValue` = texto histórico. Patrón `T(key, fallback)`. El matching de errores sigue sobre el texto crudo del back (sin cambios). Esto cubre también `useSaveErrorBanner`/SaveErrorBanner.
- **`NoteCard.jsx` (buildContextLabel)**: badge de contexto → `t('notes.contextType.<type>', { defaultValue: contextTypeLabel(type) })`. El label canónico sigue en `notes/api.js`.
- Verificación: test temporal en es+en (borrado post-run... el sandbox no pudo borrarlo: **`src/test/tmp_i18n_audit.test.js` hay que eliminarlo antes de commitear**), 303/303 tests, build, lint, 578/578 claves.

## Deuda restante (pasada puntual futura, todo menor)

- `SECTION_LABELS`, `WEIGHT_MODES`, `REPS_UNITS`, `CIRCUIT_TYPES`, `INTENSITY_LEVELS`, `AEROBIC_*`, `BORG_LABELS` (de `plans/helpers.js`).
- `PSE_OPTIONS`/`PSE_SHORT` (workouts/helpers.js — ojo: el label se persiste en DB como `p_perceived_difficulty_label`).
- Estrategia: traducir en el punto de render con `t(key, { defaultValue })`, NUNCA tocar valores persistidos.
- Notificaciones: el title/body se genera y guarda en español al momento del insert. Si Anto quiere notifs en inglés para alumnas EN, hay que generar el texto según `profiles.language` del destinatario (cambio en triggers/funciones SQL) — decisión aparte.

## Riesgos / gotchas

- Strings en archivos `.js` (helpers, errorHelpers, templates de notificaciones) — no solo jsx.
- Fechas formateadas: si se usa date-fns/Intl con locale es, parametrizar por idioma.
- Tests existentes matchean texto en español (`getByText('Guardar')` etc.) — correr vitest en cada fase.
- Notificaciones: el texto se genera al insertar (queda fijo en DB en el idioma del momento). Aceptable para v1; anotarlo.
- Plurales ("1 serie" / "2 series") — i18next lo maneja con `_one`/`_other`.
