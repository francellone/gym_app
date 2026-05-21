# `src/features/forms/intake/` — formularios dinámicos

Builder + renderer de los formularios que usa el coach para conocer al alumno (intake) y los que pide periódicamente para seguimiento (follow-up).

**Movido a esta ubicación el 21/05/2026** desde `/intake-form` (vivía como carpeta hermana de `src/`). El cambio no alteró comportamiento — sólo la ruta de import.

## Estructura

```
intake/
├── schema/
│   ├── question-types.js     Tipos de pregunta soportados (text, number, single_choice, multi_choice, scale, etc.) y sus metadatos.
│   └── default-form.js       Plantillas por defecto (intake completo + follow-up corto) + utilitarios buildFormConfig / buildFollowUpFormConfig / DEFAULT_TEMPLATES.
└── components/
    ├── shared/
    │   └── conditionalLogic.js   Lógica show/hide basada en respuestas previas.
    ├── student/
    │   ├── FormRenderer.jsx      Renderiza un formulario a partir de la config y maneja envío.
    │   └── QuestionField.jsx     Componente por pregunta — un switch por tipo.
    └── coach/
        ├── FormBuilder.jsx       Editor visual del formulario (también pre-vista usando FormRenderer).
        ├── ModuleCard.jsx        Card de un módulo/sección del formulario.
        ├── QuestionEditor.jsx    Editor de una pregunta individual.
        ├── IntroEditor.jsx       Editor del intro del formulario.
        └── TemplateManager.jsx   Selector + duplicador de plantillas guardadas.
```

## Quién consume estos componentes

| Página | Componente importado |
|---|---|
| `src/pages/student/IntakeFormPage.jsx` | `FormRenderer` (student) |
| `src/pages/student/FollowUpFormPage.jsx` | `FormRenderer` (student) |
| `src/pages/coach/FormBuilderPage.jsx` | `FormBuilder` (coach) + `buildFormConfig` |
| `src/pages/coach/FollowUpFormBuilderPage.jsx` | `FormBuilder` (coach) + `buildFollowUpFormConfig` |
| `src/pages/coach/student/StudentInfoTab.jsx` | `buildFormConfig` (para reusar definiciones de campos en la vista de info del alumno) |

Importar siempre con alias absoluto:

```js
import FormRenderer from '@/features/forms/intake/components/student/FormRenderer'
import { buildFormConfig } from '@/features/forms/intake/schema/default-form.js'
```

## Persistencia en Supabase

Tres tablas (todas con RLS):

- `intake_form_templates` — plantillas guardadas por el coach.
- `intake_form_assignments` — qué plantilla se asignó a qué alumno y cuándo vence.
- `intake_form_submissions` — respuestas del alumno + metadata.

Adicionalmente, `process_intake_submission` (función SQL) mapea respuestas seleccionadas a campos de `profiles` (`nivel`, `frecuencia`, `descripcion_lesiones`, etc.) cuando el formulario es de tipo `intake`. Los follow-ups **no** disparan ese mapeo.

## Convenciones internas

- **No** importar React Router ni Supabase desde acá. El módulo es agnóstico: recibe la config y devuelve las respuestas. La página que lo monta se encarga de cargar/guardar contra Supabase.
- **Tipos de pregunta nuevos** se agregan en `schema/question-types.js` (la metadata) y en `components/student/QuestionField.jsx` (el render). Si la pregunta requiere lógica condicional, sumar la regla en `components/shared/conditionalLogic.js`.
- **Plantillas nuevas** se editan vía `FormBuilder`; el coach las guarda en `intake_form_templates`. Los defaults siguen viviendo en `schema/default-form.js` por si hay que regenerar uno.

## Historial relevante

- `legacy/migration_intake_form.sql` (en `supabase/migrations/legacy/`) — DDL original aplicado en abril 2026. No re-aplicar.
- El antiguo `push-intake-form.sh` está en `scripts/legacy/` por trazabilidad; ya no es funcional (la carpeta `intake-form/` que pusheaba no existe más).
