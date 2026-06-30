# `src/features/activities/` — actividades extra por día (cross-training)

Registro de actividades **no vinculadas al entrenamiento** (fútbol, yoga, running, etc.) que hace el alumno cualquier día, entrene o no. Pedido de la coach. Diseño en `diagnostico_arquitec/55_actividades_extra_por_dia.md` (Opción A).

## Estructura

```
activities/
├── README.md
├── api.js                         Data layer + catálogo + helpers puros (testeables)
├── api.test.js                    Tests de catálogo/validación/payload (17)
├── components/
│   ├── ActivityModal.jsx          Modal de alta/edición (controlado por el padre)
│   └── DayActivitiesCard.jsx      Card self-contained: lista + add/edit/delete de un día
└── pages/
    └── StudentActivitiesTab.jsx   Vista coach: carga en cualquier fecha + historial 60 días
```

## Modelo de datos

Tabla **`public.activity_logs`** (migración `20260630224301_activity_logs_cross_training.sql`):

- `student_id`, `date` (NO unique → **N actividades por día**), `activity_type` (enum), `label` (texto libre para `sport_other`/`other`), `duration_min?`, `intensity?` (1–10), `notes?`, `source` (`student`/`coach`), `created_by`.
- Índice `(student_id, date desc)`. Trigger `update_updated_at`.
- **RLS**: alumno CRUD sobre sus propias filas; coach todo vía `public.is_coach()`. Espejo de `wellbeing_logs`.

> El MCP service-role saltea RLS — validar permisos del alumno con browser `francellone`.

## Quién consume

| Consumidor                                      | Importa                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `features/workouts/pages/TodayWorkoutPage.jsx`  | `DayActivitiesCard` — card del día (vista alumno), visible también en días de descanso |
| `features/students/pages/StudentDetailPage.jsx` | `StudentActivitiesTab` — tab "Actividad" (vista coach)                                 |

## Convenciones

- Las funciones async de `api.js` devuelven `{ data, error }`, nunca tiran.
- Los helpers (`ACTIVITY_TYPES`, `requiresLabel`, `validateActivityDraft`, `buildActivityPayload`) son puros → testeados sin Supabase.
- `sport_other` y `other` exigen `label` (validado en front y por CHECK en DB).
- i18n bajo `activities.*` en `src/i18n/locales/{es,en}.json`.

## Deuda / fase 2

- **Chips en `MonthlyCalendar`** del dashboard del coach (mostrar 🏅 en los días con actividad). No implementado.
- **Cruce con carga/alertas**: sumar la actividad extra al contexto de fatiga/adherencia (`features/dashboard/alerts.js`).
- Borrado es hard delete. Si se necesita historial, migrar a `archived_at` (timestamp, no boolean — lección `is_active`).
