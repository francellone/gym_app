# Plan: formularios bilingües (es/en)

**Fecha:** 2026-07-06 · **Estado:** ✅ implementado (fases 1-6 completas el 2026-07-06)

> Implementación: `resolve-form-language.js` (+ tests), renderer/perfil del alumno,
> hook `useCoachFormLanguages` + `LanguageModeCard`, columna `profiles.forms_bilingual`,
> builder con campos EN + `hidden_for` + stale, consentimiento EN built-in, y las 3
> plantillas de Anto pre-traducidas en BD (backup en `intake_form_templates_backup_20260706`).

## Contexto y decisión

Anto tiene alumnos en español e inglés. El contenido de los formularios (intake + follow-up) es texto del coach y no pasa por i18n. Se evaluaron plantillas duplicadas vs. plantilla bilingüe; se eligió **plantilla bilingüe** porque las respuestas guardan el string literal de la opción y `process_intake_submission` + `_intake_map_nivel` + `_intake_parse_frecuencia` parsean español — duplicar plantillas rompería el mapeo a `profiles` y generaría deriva de contenido.

**Principio rector: el alumno VE traducido, pero se GUARDA el valor canónico.** Así la lógica condicional, el mapeo SQL y la lectura del coach quedan intactos.

La habilitación del modo bilingüe es **derivada** (el coach tiene alumnos con `profiles.language` distintos) **+ toggle manual** para adelantarse. Coaches monolingües no ven ningún cambio.

## Modelo de datos (aditivo, dentro del jsonb `config`)

```js
// Plantilla
config: {
  name_i18n: { en: 'Monthly form' },              // opcional
  intro: { ..., i18n: { en: { content: '...' } } },
  modules: [{
    ...,
    i18n: { en: { title: 'Personal data' } },
    questions: [{
      ...,                                         // label/options canónicos, sin cambios
      i18n: {
        en: {
          label: 'What is your main goal?',
          placeholder: '...',
          options: ['Lose fat', ...],              // paralelo por índice a options canónicas
          stale: false,                            // true si el canónico cambió después de traducir
        },
      },
      hidden_for: ['en'],                          // pregunta desactivada para ese idioma (opcional)
    }],
  }],
}
```

Notas:

- Campo de traducción vacío ⇒ se muestra el canónico (fallback siempre).
- `hidden_for` es simétrico: sirve para preguntas solo-español (`['en']`) y solo-inglés (`['es']`, el coach la redacta en inglés como canónico y la oculta para es).
- Si el coach agrega/quita/reordena opciones canónicas con traducción existente ⇒ marcar `i18n.en.stale = true` y avisar en el builder.

### Reglas para que `hidden_for` no rompa nada

1. El filtro se aplica **antes** de la validación ⇒ una pregunta `required` oculta para el idioma del alumno no bloquea el envío (mismo camino que ya usa la lógica condicional).
2. Pregunta condicional cuyo `dependsOn` está oculto ⇒ el padre queda sin responder ⇒ `shouldShowQuestion` ya la oculta hoy. Sin cambios.
3. Respuestas faltantes en el intake ⇒ `process_intake_submission` usa `COALESCE`, tolera claves ausentes. Sin cambios.
4. Módulo que queda sin preguntas visibles para un idioma ⇒ no se renderiza.

## DB (único cambio de esquema)

- `profiles.forms_bilingual boolean default null` — `null` = automático (derivado de los idiomas de los alumnos), `true` = forzado por el coach. Migración vía `apply_migration`.

## Fases

### Fase 1 — Núcleo: `resolveFormForLanguage(config, lang)`

Función pura en `src/features/forms/intake/schema/` (junto a `default-form.js`):
entrada config + idioma → salida config resuelta: aplica `i18n`, filtra `hidden_for`, elimina módulos vacíos, y adjunta a cada pregunta `displayLabel` / `displayOptions` **manteniendo `options` canónicas como valores**. Testeable con vitest sin UI. Es la pieza de la que depende todo lo demás.

### Fase 2 — Renderer del alumno

- `QuestionField`: mostrar `displayOptions[i]` / `displayLabel`, seguir guardando `options[i]` canónica (hoy hace `handleChange(option)` con el mismo string — este es el punto exacto del cambio).
- `FormRenderer` / `IntakeFormPage` / `FollowUpFormPage`: resolver el `form_snapshot` con el `language` del alumno.
- `FormsListPage` y headers: `name_i18n` si existe.
- Validación de required sobre el form ya resuelto (regla 1).

### Fase 3 — Habilitación

- Util/hook `useCoachFormLanguages`: idiomas distintos entre los alumnos del coach + override `profiles.forms_bilingual`.
- Toggle en `ProfilePage` (ya tiene la sección de idioma del coach): "Formularios multiidioma: Automático / Activado".
- Banner en el builder cuando se detecta el primer alumno de otro idioma sin traducciones cargadas.

### Fase 4 — Builder del coach (solo visible en modo bilingüe)

- `QuestionEditor`: campos "English version" para label/placeholder/opciones + switch "no mostrar esta pregunta en inglés" (`hidden_for`). Lo mismo espejo para preguntas solo-inglés.
- `IntroEditor`: intro EN. `ModuleCard`: título EN. `FormBuilder`/`TemplateManager`: nombre EN de la plantilla.
- Marcado y aviso de traducciones `stale` al editar opciones canónicas.

### Fase 5 — Datos de Anto

Traducir como borrador las 3 plantillas existentes (intake "Formulario principal", los 2 follow-ups) directo en su `config`, para que Anto solo revise y ajuste.

### Fase 6 — Verificación

- Vitest: `resolveFormForLanguage` (traducciones, fallbacks, hidden_for, módulos vacíos, required oculto no bloquea, condicional con padre oculto).
- `npm run lint` + `npm run test:run`.
- Flujo manual end-to-end: alumno EN responde intake → respuestas canónicas en `intake_form_submissions` → `profiles` poblado correcto.

## Limitaciones conocidas

- Asignaciones ya enviadas tienen `form_snapshot` sin traducciones ⇒ alumnos EN con pendientes viejos los ven en español (solo afecta pendientes actuales).
- Textos de notificaciones al alumno se generan en SQL en español — **pendiente aparte**, anotado en memoria, se encara después de esta feature.
