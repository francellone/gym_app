# Plan de trabajo — idioma de la app para la coach (ES/EN)

Fecha de arranque: 2026-09-08. Pedido de Anto: _"poder ver desde coach en inglés
cuando registro a un alumno en inglés, así puedo mostrarles el celu y que
entiendan"_. Decisión de Franco: **cada coach elige el idioma de SU panel con un
botón, y elige aparte el idioma de la pantalla de registro del alumno.** Las
traducciones al inglés se entregan como borrador y las revisa Anto.

---

## 0. Punto de partida (medido en el código el 2026-09-08)

- El idioma sale del perfil de quien está logueado: `AuthContext.jsx:103`
  → `i18n.changeLanguage(profiles.language || 'es')`.
- La pantalla del pedido es el modo coach de la v33: ruta
  `/coach/students/:id/workout`, que monta el MISMO `TodayWorkoutPage` de la
  alumna con `coachMode = Boolean(routeStudentId)`.
- El subárbol de la alumna ya está traducido (auditoría i18n de julio): 0 textos
  visibles sueltos en `src/features/workouts`. Los nombres y notas técnicas de
  ejercicios ya resuelven por idioma con las 318 filas de `exercises.i18n`.
- Los diccionarios tienen 762 claves y están sincronizados ES/EN.
- El panel del coach tiene **740 textos visibles hardcodeados en español**.

| Área                                                      | Textos |
| --------------------------------------------------------- | ------ |
| `features/plans`                                          | 232    |
| `features/students`                                       | 131    |
| `features/evaluations`                                    | 109    |
| `features/forms` (builder + seguimiento)                  | 94     |
| `features/dashboard`                                      | 60     |
| `features/exercises`                                      | 38     |
| `features/reports`                                        | 29     |
| `features/wellbeing` + `features/notes` (vistas de coach) | 21     |
| `components/layout/CoachLayout`                           | 5      |

---

## Etapa 1 — Interruptor 2: idioma de la pantalla de registro

> **Estado: implementada el 2026-09-08.** lint 0 errores, 779/779 tests, build OK.
> Falta pushear y verificar en vivo con Anto.
> Tests: `src/features/workouts/CoachModeLanguage.test.jsx` (con prueba negativa
> hecha: sin la instancia clonada, 2 de 6 fallan) y `src/i18n/dateLocale.test.js`.

**Qué resuelve:** Anto entra a registrar por una alumna que habla inglés y la
pantalla que le muestra en el celu sale en inglés, sin que su panel cambie.

**Regla de diseño (la más importante de todo el plan):** el idioma de esa
pantalla NO puede ser el idioma global de i18next. Si lo fuera, cuando en la
etapa 2 Anto ponga su panel en inglés, la pantalla de registro se iría a inglés
aunque la alumna hable español, y al revés. Se resuelve con una **instancia
clonada** (`i18n.cloneInstance`) provista por contexto solo para esa ruta. Mismo
criterio que ya usa el informe cliente, que se renderiza en el idioma de la
alumna mientras el marco queda en español.

**Idioma inicial:** `profiles.language` de la alumna. El selector es la salida de
emergencia (mostrarle algo en inglés a alguien con el perfil en español). No se
persiste: al volver a entrar vuelve al idioma de la alumna, que es lo correcto
por defecto.

**Piezas:**

1. `src/features/workouts/CoachModeLanguage.jsx` — provider + hook.
   Trae `profiles.language` de la alumna, mantiene el estado del idioma, crea la
   instancia clonada y envuelve a los hijos en `I18nextProvider`.
2. `src/features/workouts/components/CoachModeLangToggle.jsx` — botón ES/EN.
   Se pinta dentro del banner de modo coach del header. Devuelve `null` si no hay
   contexto, así la ruta de la alumna no se entera de que existe.
3. `src/App.jsx` — la ruta `students/:id/workout` pasa a montar el provider.
4. **Fugas a la instancia global** (esto es lo que rompe si no se toca): hay
   helpers que importan el i18n global en vez de usar el del contexto, y con
   provider seguirían saliendo en español.
   - `src/i18n/dateLocale.js` → `dateLocale()` y `formatShortDate()`.
   - `src/features/workouts/exerciseHistoryLogic.js` → `formatLastLogSummary`,
     `formatLastBlockLogSummary`, `formatRelativeDate` (los textos de
     "Última vez", "hoy/ayer/hace N días", PSE y rondas).
   - `src/utils/errorHelpers.js` → `getFriendlyErrorMessage` / `buildErrorBanner`
     (los mensajes de error al guardar).
     Criterio: parámetro opcional al final (`t` o `lng`) con default a la instancia
     global. Los tests existentes y los llamadores de la vista alumna no cambian.

**Fuera de alcance de esta etapa:** el marco del coach (nav, ficha, planes) sigue
en español. Es la etapa 2.

**Verificación:**

- Guardia de regresión: el modo coach en inglés no muestra texto en español
  (mismo patrón que `src/i18n/english-smoke.test.jsx`).
- Tests unitarios de los 3 helpers tocados con `t` explícito.
- `npm run lint`, `npm run test:run`, `npm run build`.
- En vivo con Anto: entrar a registrar por una alumna con perfil `en` y confirmar
  que sale en inglés, y por una con perfil `es` y confirmar que sale en español.

---

## Etapa 2 — Interruptor 1: el panel de la coach en inglés

**Piezas transversales (una sola vez, antes de traducir nada):**

1. Botón ES/EN en el header de `CoachLayout`, que guarda `profiles.language` y
   hace `changeLanguage` sobre la instancia global (mismo camino que ya usa
   `ProfilePage` para la alumna). Para la coach ese campo hoy no se usa para
   nada más, así que no hay migración de datos.
2. Namespace `coach.*` en los locales, con subclaves por área
   (`coach.plans.*`, `coach.students.*`, …) para que el diff de cada tanda sea
   legible y Anto pueda revisar por bloque.
3. Editar los locales con round-trip de python (`indent=2`,
   `ensure_ascii=False`), que es lo que evita ruido de diff.

**Orden de las tandas** (por dónde le sirve a Anto mostrar el celu, no por
tamaño):

| #   | Tanda                                                | Textos | Por qué en ese orden                                 |
| --- | ---------------------------------------------------- | ------ | ---------------------------------------------------- |
| 1   | `CoachLayout` + wellbeing y notas en vistas de coach | 26     | El marco y lo que abre primero                       |
| 2   | `features/students` (ficha, alta, tablas)            | 131    | Es la pantalla desde la que muestra todo             |
| 3   | `features/plans`                                     | 232    | Le muestra el plan armado a la alumna                |
| 4   | `features/dashboard`                                 | 60     | Su pantalla de inicio                                |
| 5   | `features/exercises`                                 | 38     | Biblioteca                                           |
| 6   | `features/evaluations`                               | 109    | Menos frecuente frente a la alumna                   |
| 7   | `features/forms`                                     | 94     | El builder es trabajo de escritorio                  |
| 8   | `features/reports`                                   | 29     | El informe cliente YA sale en el idioma de la alumna |

**Reglas que se respetan en cada tanda (no negociables):**

- Las constantes en español de los helpers (`PSE_OPTIONS`, `PSE_SHORT`,
  `SECTION_LABELS`, `DAY_SHORT_LABELS`) son **canónicas para la base**: se
  traduce el display con `t()`, nunca el valor que se guarda.
- El texto libre que escribió la coach (títulos de planes, notas, descripciones)
  no se traduce nunca.
- En cada archivo que se toca, el español se deja además en **lenguaje neutro**
  ("persona", no "alumna/alumno"): es el pendiente viejo y este es el momento
  barato para saldarlo. Va en el mismo commit que la tanda, no en uno aparte.
- Cada tanda suma sus componentes al smoke test en inglés.
- Cada tanda entra con `lint` + `test:run` + `build` en verde y se pushea sola,
  para que Anto pueda revisar traducciones de a bloques.

**Entrega a Anto:** al cerrar cada tanda, listado de las claves nuevas con su
español y su inglés, para que marque las que quiere cambiar. Mismo circuito que
funcionó con el backfill de ejercicios.

---

## Riesgos anotados

- **Idioma mezclado.** Si alguien resuelve la etapa 2 cambiando el idioma global
  desde el modo coach, la pantalla de la alumna se va con él. Por eso la
  instancia clonada de la etapa 1 va primero.
- **Fugas nuevas.** Todo helper que importe `@/i18n` directo vuelve a romper el
  aislamiento. Regla: en componentes, el `i18n` sale de `useTranslation()`; en
  helpers puros, el idioma o la `t` entran por parámetro.
- **Traducción de lo que va a la base.** Ver las constantes canónicas de arriba.
- **Volumen.** 740 textos no se hacen de una sentada. El valor está en cerrar
  tandas verificadas, no en abrir todo a la vez.
