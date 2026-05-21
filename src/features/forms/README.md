# `src/features/forms/` — formularios dinámicos

Cubre los dos tipos de formularios de la app:

1. **Intake** — el alumno lo completa una vez al ingresar (datos personales, lesiones, objetivos, preferencias). Dispara `process_intake_submission` que mapea respuestas a campos de `profiles`.
2. **Follow-up** — el coach lo asigna periódicamente para chequear progreso/sensaciones. No dispara mapeo a `profiles`.

Ambos comparten el mismo motor (`FormBuilder` para editar, `FormRenderer` para responder); difieren sólo en el `kind` y en el dispatch de "qué hacer al enviar".

**Estructura consolidada el 21/05/2026.** `intake/` ya se había movido el día antes; las 6 pages que orquestan la feature se sumaron en esta pasada.

## Estructura

```
forms/
├── intake/                         Motor compartido (a pesar del nombre, lo usan intake + follow-up):
│   ├── components/
│   │   ├── student/                FormRenderer, QuestionField
│   │   ├── coach/                  FormBuilder, ModuleCard, QuestionEditor, IntroEditor, TemplateManager
│   │   └── shared/                 conditionalLogic
│   └── schema/                     question-types, default-form (buildFormConfig, buildFollowUpFormConfig, DEFAULT_TEMPLATES)
└── pages/
    ├── FormBuilderPage.jsx         /coach/form-builder — editar la plantilla de intake (única por coach).
    ├── FollowUpFormBuilderPage.jsx /coach/follow-up-forms/:id — editar una plantilla de follow-up.
    ├── FollowUpFormsPage.jsx       /coach/follow-up-forms — listar plantillas de follow-up + enviarlas.
    ├── IntakeFormPage.jsx          /student/intake — el alumno responde su intake.
    ├── FollowUpFormPage.jsx        /student/form/:assignmentId — el alumno responde un follow-up específico.
    └── FormsListPage.jsx           /student/forms — listado de formularios pendientes/enviados.
```

> Nota: la carpeta `intake/` queda con ese nombre por compatibilidad histórica. Funcionalmente es "el motor de form-builder", no exclusiva de intake. Renombrarla a `builder/` está como deuda menor (requiere actualizar ~7 imports).

## Quién consume

| Consumidor | Importa |
|---|---|
| `src/App.jsx` | Las 6 pages como routes |
| Las pages entre sí | `intake/components/*` y `intake/schema/*` con alias `@/features/forms/intake/...` |
| `src/pages/coach/student/StudentInfoTab.jsx` | `buildFormConfig` (reusa los labels del intake para mostrar la info del alumno) |

Tab del coach **StudentFormsTab** sigue en `src/pages/coach/student/` por ahora — se moverá cuando se haga la feature `students/`.

Importar con alias:

```js
import IntakeFormPage from '@/features/forms/pages/IntakeFormPage'
import FormRenderer from '@/features/forms/intake/components/student/FormRenderer'
import { buildFormConfig } from '@/features/forms/intake/schema/default-form.js'
```

## Persistencia en Supabase

Tres tablas (RLS) compartidas entre intake y follow-up — el `kind` discrimina:

- **`intake_form_templates`** (3 filas al 2026-05-20) — plantillas guardadas por coach (intake o follow-up).
- **`intake_form_assignments`** (3 filas) — qué plantilla se asignó a qué alumno + estado (pendiente/completada).
- **`intake_form_submissions`** (3 filas) — respuestas concretas. La columna `responses` es jsonb.

Funciones SQL relevantes:

- `process_intake_submission(submission_id)` — sólo intake. Mapea respuestas (nivel, frecuencia, lesiones, etc.) a columnas de `profiles`.
- `enforce_follow_up_template_limit` — trigger que limita la cantidad de plantillas follow-up activas (con `search_path = public, pg_temp` desde el fix del 21/05).

## Patrón de uso

### Intake
1. Coach: `/coach/form-builder` arma su intake (una sola plantilla por coach).
2. Al crear un alumno, el sistema le asigna ese intake automáticamente.
3. Alumno: `/student/intake` lo responde una vez.
4. El trigger procesa y popula `profiles`.

### Follow-up
1. Coach: `/coach/follow-up-forms` lista plantillas. Puede crear nuevas (`/follow-up-forms/new`) o editar existentes (`/follow-up-forms/:id`).
2. Desde la lista, el coach envía la plantilla a un alumno (crea `intake_form_assignment` con `kind='follow_up'`).
3. Alumno: `/student/forms` ve los pendientes, abre `/student/form/:assignmentId` y responde.

## Lo que NO meter acá

- **Tab `StudentFormsTab`** (vista del coach de los formularios de un alumno específico). Vive en `src/pages/coach/student/StudentFormsTab.jsx` y se moverá a `src/features/students/` cuando hagamos esa feature.
- **Renombrar `intake/` a `builder/`** — está como deuda menor; cuando se haga, actualizar todos los imports `@/features/forms/intake/...`.
