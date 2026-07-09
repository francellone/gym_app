# Auditoría i18n — pre-lanzamiento en inglés (2026-07-09)

Barrido exhaustivo de la vista del alumno buscando texto que solo existe en español. El panel del coach queda en español a propósito (decisión doc 46) y se excluye.

## Estado de la arquitectura

- Idioma activo: `profiles.language` (coach lo setea; alumno lo cambia en ProfilePage). **No hay auto-detección** por navegador ni país: `lng: 'es'` fijo en `src/i18n/index.js`, la pantalla de login es siempre en español.
- Switch de idioma: existe en ProfilePage, solo post-login.
- `es.json` y `en.json` están sincronizados (0 claves faltantes en ambos sentidos).
- Fechas en vista alumno: OK, usan `dateLocale()` + claves `dates.*`.
- ProfilePage GOAL/PATOLOGIAS: OK, patrón canónico + display via `t()` con `defaultValue`.

## Hallazgos — bloquean lanzamiento en inglés

| #   | Archivo                                               | Qué                                                                                                                                                           | Dónde lo ve el alumno                         |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | `src/features/workouts/helpers.js:9-35`               | `PSE_OPTIONS` y `PSE_SHORT` (20 labels: "Muy fácil"…"Máximo")                                                                                                 | DailyPSEModal, ExerciseCard                   |
| 2   | `src/features/workouts/components/RPEScale.jsx:9-140` | `RPE_CARDIO` (y escala circuito): `short` y `desc` de cada nivel ("muy suave", "podés cantar"…). El componente ya usa `useTranslation` pero las constantes no | Escalas RPE en bloques aeróbico/circuito      |
| 3   | `src/features/plans/helpers.js:48-60`                 | `BORG_LABELS` (11 labels)                                                                                                                                     | ProgressPage (gráficos del alumno)            |
| 4   | `src/features/plans/helpers.js:514-549`               | `SECTION_LABELS` (nombres de secciones/días)                                                                                                                  | TodayWorkoutPage (título del día, activación) |
| 5   | `src/App.jsx:45,68`                                   | "Cargando..." / "Iniciando..."                                                                                                                                | Pantallas de carga al entrar                  |

## Hallazgos — importantes, no bloqueantes

| #   | Archivo                  | Qué                                                                                                                                                                                     |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | `index.html:2,8`         | `lang="es"` y meta description en español (visible en SEO/compartir)                                                                                                                    |
| 7   | `public/manifest.json:4` | description del PWA en español (visible al instalar en el teléfono)                                                                                                                     |
| 8   | Login pre-auth           | Sin `profiles.language` aún, todo el flujo pre-login queda en español. Opciones: detectar `navigator.language` como default pre-login, y/o agregar toggle ES/EN en la pantalla de login |

## Menores / por diseño

- `AuthContext.jsx:89`: mensaje de error de dev ("useAuth debe usarse...") — solo consola, ignorar.
- `SendToStudentModal.jsx`, `StudentWellbeingTab.jsx`, evaluaciones (`toLocaleDateString('es-AR')`): componentes del coach, en español por diseño.
- `localeCompare('es')` en sorting: sin impacto visible.

## Archivos verificados limpios (ya migrados a t())

LoginPage, StudentLayout, IosInstallBanner, FormRenderer, QuestionField, resolve-form-language, NotificationBell, resolveNotificationText, StudentNotesPage, NoteCard, DayTalliesBadge, errorHelpers, TodayWorkoutPage (salvo SECTION_LABELS), HistoryPage, ProfilePage.

## Resolución (2026-07-09, misma sesión)

Todo lo bloqueante quedó resuelto (tests 380/380 y build OK):

1. ✅ Display migrado a claves i18n: `workout.pseShort.*` (DailyPSEModal), `workout.sections.*` (TodayWorkoutPage via `sectionLabel()`), `progress.borgLabels.*` (ProgressPage), `workout.aerobicZones.*` + `workout.intensity.*` (AerobicBlockRunCard), `workout.circuitTypes.*` (CircuitBlockRunCard). Hallazgos nuevos durante la implementación: AEROBIC_ZONES, INTENSITY_LEVELS y CIRCUIT_TYPES también mostraban español al alumno.
2. ✅ RPEScale ya estaba migrado (claves `workout.rpe.*` existían); las constantes con texto español que quedan en helpers/RPEScale son **canónicas para la DB** (ej. `p_perceived_difficulty_label`, prefijo de notas PSE) y no se tocan a propósito.
3. ✅ Loaders de App.jsx → `common.loading` / `common.initializing`.
4. ✅ Pre-login: `navigator.language` decide el default (en→inglés, resto→español), con preferencia persistida en localStorage (`gymcoach_pre_login_lang`); toggle ES/EN en LoginPage; logout vuelve al default pre-login; `<html lang>` se sincroniza en runtime. `profiles.language` sigue mandando post-login.
5. ✅ Meta description y manifest ahora bilingües.
6. Tests: `src/test/setup.js` fuerza `changeLanguage('es')` porque jsdom reporta `navigator.language = 'en-US'`.
