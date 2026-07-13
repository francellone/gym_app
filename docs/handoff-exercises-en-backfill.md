# Handoff: reordenar + traducir la biblioteca de ejercicios (`exercises`)

> Para el modelo/sesión que tome esta tarea. Leer entero antes de tocar datos.
> Proyecto Supabase: `bvexjanqmfypmtgoapbt` (prod, datos reales de la coach Anto).
> Ante cualquier duda no cubierta acá: preguntarle a Franco, no improvisar.

## Semántica de campos (definida con Franco 2026-07-13 — es LA referencia)

- `name` — nombre canónico en ESPAÑOL. `i18n.en.name` = nombre en inglés.
- `description` — **QUÉ es**: qué trabaja, para qué sirve, equipamiento. Corta
  (1-3 líneas). El alumno la ve solo si toca "ver más". Opcional.
- `technique_notes` — **CÓMO se hace**: posición inicial, ejecución, errores a
  evitar. El alumno la ve SIEMPRE al abrir el ejercicio. Es el campo esencial
  ("completo" = video + nota técnica).
- `i18n jsonb` = `{ en: { name, description, technique_notes } }` — traducciones
  EN, fallback al canónico ES. Resolver: `src/features/exercises/exercise-display.js`.

## Contexto y estado real de los datos (auditado 2026-07-13; 318 ejercicios, i18n=null en todos)

Antes de que existiera `i18n`, Anto improvisó: en las fichas nuevas (~33) puso la
técnica en INGLÉS en `description` y la técnica en ESPAÑOL en `technique_notes`
(textos espejados, ej. "Setup\n..." / "Posición inicial\n..."). En fichas viejas
(~48 con description y sin nota) `description` tiene la nota técnica en ESPAÑOL
(uso previo del campo), con al menos una excepción en inglés ("1/2 Kneel Lateral
Bound", 2026-07-12). Los nombres mezclan "English / Español" y "Español / English"
con orden inconsistente, o un solo idioma.

## Objetivo (decisión de Franco 2026-07-13)

Dejar la biblioteca **entera** ordenada y bilingüe:

1. **Cada texto en el campo que corresponde según la semántica de arriba y según
   idioma**: texto ES en columnas canónicas, texto EN en `i18n.en`. Casi todo lo
   que hoy vive en `description` es "cómo se hace" → va a `technique_notes` (si
   está en ES) o a `i18n.en.technique_notes` (si está en EN). `description` queda
   vacía salvo que el texto sea realmente un "qué es".
2. **Traducir TODO lo que no tenga traducción** (borradores para que Anto revise):
   - Nota/descripción solo en ES → generar `i18n.en.*`.
   - Texto solo en EN → generar el canónico ES (el canónico no puede faltar).
   - Nombres: canónico ES + `i18n.en.name`. Los "X / Y" se separan clasificando
     el idioma de cada mitad. Si el nombre existe en un solo idioma, traducirlo
     para el otro. OJO: el nombre canónico es el que Anto usa para buscar en su
     biblioteca y en el editor de planes — ante nombres EN muy instalados como
     jerga de gym ("Leg Press", "TRX Row"), conservarlos como canónico Y como
     `i18n.en.name`, no inventar castellanizaciones forzadas.
3. Los pares espejados existentes (desc EN + nota ES) NO se retraducen: se mueve
   la versión EN de Anto a `i18n.en.technique_notes` tal cual (es su traducción).

## Procedimiento

0. **Backup**: `create table exercises_backup_YYYYMMDD as select * from exercises;`
1. Traer todas las filas con `execute_sql` (id, name, description, technique_notes).
2. Clasificar idioma y semántica de cada texto VOS mismo (sos un LLM — nada de
   heurísticas SQL frágiles). Armar por fila el estado final de los 3 campos
   canónicos + `i18n.en`.
3. UPDATEs por `id` explícito (uuid), en lotes razonables. Es data, no DDL →
   `execute_sql`, no `apply_migration`.
4. **Verificación**: counts antes/después (ningún ejercicio pierde texto: lo que
   tenía algo, sigue teniendo al menos lo mismo repartido entre ES y EN);
   ningún `i18n.en.*` con string vacío; spot-check de 10 filas variadas
   (par espejado, vieja ES, nombre "X / Y", sin textos). Si se puede, probar en
   la app con un alumno EN.
5. Avisar a Franco: queda a revisión de Anto (los textos generados son borradores)
   y la tabla backup se borra cuando ella valide.

## Reglas

- Canónico = español en columnas base (obligatorio si existe contenido); el alumno
  solo VE traducido. Traducciones generadas = borrador a revisar por Anto.
- No tocar `video_url`, defaults, tags, ni `plan_exercises` (para `extra_notes`
  hay handoff aparte: `docs/handoff-extra-notes-i18n.md`).
- Registrar en un archivo (o en el aviso final a Franco) la lista de casos dudosos.

## Restricciones del entorno (sandbox Cowork)

- NO usar `git stash`, `npm run build` ni el hook pre-commit (permisos del mount).
  Lint/tests a mano y `git commit --no-verify`. El push lo hace Franco.
- Tarea casi 100% de datos; si se toca código, correr `npx vitest run`.
