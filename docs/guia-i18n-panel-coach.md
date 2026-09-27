# Guía para traducir el panel de la coach (etapa 2, 2026-09-27)

Pedido de Franco: la coach elige español o inglés en Mi perfil y todo su panel
tiene que salir en ese idioma. Esta guía es la receta que siguen todas las tandas.

## Dónde van las claves

- Cada área tiene su par `src/i18n/locales/coach/<área>.es.json` y
  `<área>.en.json`. Se leen como `t('coach.<área>.<componente>.<clave>')`.
- NO editar `src/i18n/locales/es.json` / `en.json` (el diccionario de la vista de
  la persona). Sí se pueden REUSAR sus claves cuando significan exactamente lo
  mismo (`common.save`, `common.cancel`, `dates.*`, `workout.weightMode.*`, etc.).
- Mismas claves en los dos idiomas, sin valores vacíos (lo controla
  `src/i18n/locales-parity.test.js`).
- Nombres de clave en camelCase, agrupadas por componente:
  `coach.plans.detail.assignButton`.

## Cómo se traduce

- En componentes: `const { t } = useTranslation()` (de `react-i18next`).
  Nunca `import i18n from '@/i18n'` en código nuevo.
- Helpers puros que devuelven texto: reciben `t` por parámetro o devuelven la
  clave y el componente la traduce.
- Interpolación `{{variable}}`; plurales con `count` y claves `_one` / `_other`.
- Texto con negritas o links adentro: `<Trans i18nKey=... components={{ b: <strong /> }} />`
  o dividir en claves.
- Fechas: `format(d, pattern, { locale: dateLocale() })` con `dateLocale` de
  `@/i18n/dateLocale`. Los patrones con palabras ("d 'de' MMMM") van a claves
  (`dates.*` si ya existe una equivalente).
- `alert()`, `confirm()`, `setError('...')`, mensajes de toast, labels en
  arrays de opciones, `placeholder`, `title`, `aria-label`: todo pasa por `t()`.

## Lo que NO se traduce

- Valores que se guardan o se comparan contra la base (status, tipos, `PSE_OPTIONS`,
  `SECTION_LABELS`, prefijos de notas, claves de enums). Se traduce solo lo que
  se muestra; el valor canónico queda en español.
- Texto libre que escribió la coach o la persona (títulos de planes, notas,
  descripciones, nombres de ejercicios: estos ya resuelven por idioma aparte).
- Logs de consola y comentarios.
- La pantalla de registro en modo coach (`src/features/workouts`): ya está
  traducida y corre en el idioma de la persona.

## Lenguaje

- Español en lenguaje neutro: "persona / personas" en vez de "alumno/alumna",
  o reformular. Voseo rioplatense, como el resto de la app ("elegí", "guardá").
- Inglés natural, corto, de app. Glosario fijo:

| Español                      | Inglés                            |
| ---------------------------- | --------------------------------- |
| persona / alumno             | student (o person si suena mejor) |
| plan                         | plan                              |
| plantilla                    | template                          |
| asignar / asignación         | assign / assignment               |
| evaluación                   | evaluation                        |
| formulario de alta           | intake form                       |
| seguimiento (formularios)    | follow-up                         |
| bloque                       | block                             |
| activación / principal       | activation / main                 |
| fuerza / aeróbico / circuito | strength / aerobic / circuit      |
| series / reps / rondas       | sets / reps / rounds              |
| carga / peso                 | weight                            |
| PSE                          | RPE                               |
| 1RM / %1RM                   | 1RM / %1RM                        |
| bienestar (wellbeing)        | wellbeing                         |
| cumplimiento / adherencia    | adherence                         |
| registro (de entrenamiento)  | log                               |
| pago / vencimiento           | payment / due date                |
| archivar / fusionar          | archive / merge                   |

## Tests

- `src/test/setup.js` fuerza español: los tests existentes siguen viendo el
  mismo español. Si un texto cambió por lenguaje neutro, actualizar el test.

## Verificación de cada tanda

- `node scripts/find-hardcoded-es.mjs <carpetas>` en 0 (o cada resto
  justificado: falsos positivos, texto canónico).
- `npx eslint <archivos>` sin errores, `npx prettier --write <archivos>`.
- `npx vitest run <carpetas>` en verde.
