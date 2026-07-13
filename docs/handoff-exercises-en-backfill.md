# Handoff: backfill SQL de traducciones EN en `exercises.i18n`

> Para el modelo/sesión que tome esta tarea. Leer entero antes de tocar datos.
> Proyecto Supabase: `bvexjanqmfypmtgoapbt` (prod, datos reales de la coach Anto).

## Contexto

El 2026-07-13 se implementaron los ejercicios bilingües: `exercises.i18n jsonb`
con `{ en: { name, description, technique_notes } }`, fallback al canónico ES.
Resolver: `src/features/exercises/exercise-display.js`. El modal de la coach ya
permite cargar las traducciones a mano.

**Objetivo de esta tarea**: poblar `i18n.en` por SQL para los ejercicios que ya
tienen contenido en inglés, y SOLO para esos. Regla de Franco: *rellenar
únicamente cuando haya algo para traducir* — nunca inventar traducciones para
campos vacíos, y no generar traducciones automáticas sin pedido explícito.

## Estado real de los datos (auditado 2026-07-13, 318 ejercicios, i18n=null en todos)

Conviven **dos convenciones** en `description`. Hay que distinguirlas fila por fila:

1. **Convención nueva de Anto (~33 filas, las que tienen description Y technique_notes):**
   `description` = técnica en INGLÉS, `technique_notes` = técnica en ESPAÑOL.
   Son traducciones espejadas (mismo contenido, p.ej. "Setup\n..." / "Posición
   inicial\n..."). Anto lo hizo a mano como workaround antes de que existiera i18n.
2. **Convención vieja (~48 filas, description sin technique_notes):**
   `description` = nota técnica en ESPAÑOL (uso previo del campo). Ejemplos:
   "PESO EN CADERA...", "Trato de levantar hombros...". OJO: hay al menos una
   excepción reciente en inglés ("1/2 Kneel Lateral Bound", 2026-07-12) →
   **no alcanza con la fecha ni con la presencia de nota: hay que clasificar por idioma**.
3. **Nombres**: muchos son bilingües con formato "English / Español" o
   "Español / English" (orden inconsistente), otros solo EN o solo ES.

## Qué hacer

0. **Backup primero** (mismo patrón que forms): `create table exercises_backup_YYYYMMDD as select * from exercises;`
1. **Clasificar** cada fila con description no vacía como EN o ES. Sugerencia:
   traer las filas con `execute_sql`, clasificar el idioma vos mismo (sos un LLM,
   no uses heurísticas SQL frágiles), y armar los UPDATEs por id.
2. **Caso convención nueva (desc=EN + nota=ES)**:
   `i18n = jsonb_build_object('en', jsonb_build_object('technique_notes', description))`
   y luego `description = null` (era la traducción de la nota, no una descripción).
3. **Caso description=ES sin nota**: es una nota técnica mal ubicada. Proponerle a
   Franco moverla: `technique_notes = description, description = null`. NO traducirla.
4. **Caso description=EN sin nota** (raro): `i18n.en.technique_notes = description`,
   `description = null`, y dejar el canónico ES vacío → queda flageado por el
   filtro "Sin nota" de la biblioteca para que Anto lo complete.
5. **Nombres bilingües "X / Y"**: separar → canónico ES en `name`,
   `i18n.en.name` con la parte EN. Como el orden es inconsistente, clasificar
   idioma de cada mitad. Si un nombre es solo EN, dejarlo como está (Anto usa
   nombres EN como canónicos a veces; no romper su búsqueda). Generar una lista
   de los casos dudosos para que Anto revise.
6. **Verificación**: contar antes/después; spot-check 5-10 filas; confirmar que
   ningún `i18n.en.*` quedó con string vacío (el resolver lo ignora, pero ensucia);
   probar en la app con un alumno EN de prueba si es posible.
7. Avisar a Franco que la borre cuando Anto valide (como `intake_form_templates_backup_20260706`, que sigue pendiente de borrar).

## Reglas

- Solo rellenar `i18n.en` con texto EN **que ya existe**. Nada de traducción automática.
- Canónico = español en columnas base. El alumno solo VE traducido.
- UPDATEs por `id` explícito (uuid), nunca por matching de texto.
- Todo por `execute_sql` del MCP de Supabase (es data, no DDL — no usar `apply_migration`).

## Restricciones del entorno (sandbox Cowork)

- NO usar `git stash` ni `npm run build` ni el hook pre-commit (permisos del mount).
  Lint/tests a mano y `git commit --no-verify`. El push lo hace Franco.
- Esta tarea es casi 100% datos; probablemente no toque código. Si toca, correr
  `npx vitest run` (los tests del resolver están en `exercise-display.test.js`).
