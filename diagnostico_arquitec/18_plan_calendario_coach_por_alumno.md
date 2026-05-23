# Plan — Calendario del coach por alumno (mockup 2026-05-23 noche)

> **PIVOTE 2026-05-23 noche (después de evaluación BD + 2do pedido de Anto):**
>
> Tras inspección del modelo (tablas `plan_exercises`, `workout_logs`, `workout_sessions`) y el segundo pedido literal de Anto ("Día A ✓✓✓ = 3 veces, Día B ✓✓ = 2"), se identificó que **lo que realmente pide Anto es Q2 puro**, no la maqueta full del calendario semanal. La foto y Q2 son dos formas de mostrar la misma data (join `workout_logs.plan_exercise_id → plan_exercises.section`); las tildes son la versión chica y de un vistazo, la maqueta es la versión expandida.
>
> **Decisión:** arrancar con Q2 (5-7h), instrumentar en 3 lugares ya existentes. La maqueta full del calendario semanal con multi-tipo + "Asignar sesión" individual queda como **Fase 2** post-validación con Anto.
>
> **Q2 — decisiones de Franco 2026-05-23 noche:**
>
> 1. **Umbral**: 100% estricto. `Entero` = todos los `workout_logs.completed=true` para los ejercicios de ese `section` en esa fecha. `Parcial` = al menos un log con completed=true pero <100%.
> 2. **Símbolo**: tilde lleno + media luna (`Día A ✓✓◐` = 2 enteros + 1 parcial).
> 3. **Cap visual**: ≥5 colapsa a número con indicador de parciales (ej `Día A ×7 (1◐)`).
>
> **Ubicaciones (3):**
>
> - `src/features/dashboard/pages/StudentDashboard.jsx` — debajo del heatmap "Esta semana", widget chico con plan activo. Alumno se ve a sí mismo.
> - `src/features/students/tabs/StudentInfoTab.jsx` — en la card del plan activo. Coach al abrir alumno ve el balance.
> - `src/features/workouts/pages/TodayWorkoutPage.jsx` — al lado de cada botón Día A/B/C/D cuando el alumno elige qué entrenar.
>
> **Estimado:** 5-7h (helper + componente + 3 integraciones + tests + smoke). No requiere plan A/B/C — Q2 es un feature mediana, no refactor grande.
>
> ---

> **Estado:** Planning only, sin código. Sigue el protocolo "refactors >500 LOC requieren plan documentado". Decisiones críticas A/B/C abajo.
>
> **Origen:** mockup pegado inline el 2026-05-23. Transcripción completa en [`assets/COACH_calendario_alumno_transcripcion.md`](assets/COACH_calendario_alumno_transcripcion.md).
>
> **Respuestas de Franco previas al plan:**
> 1. **Modelo:** plan + sesiones conviven (override por día sobre el plan asignado).
> 2. **Plataforma:** responsive full (mobile + desktop), no rompe el "mobile-first" — solo lo amplía.
> 3. **Próximo paso:** este documento.

## 1. Lo que pide el mockup (resumen ejecutivo)

- Vista coach **por alumno** (dentro de `StudentDetailPage`), tab nuevo "Calendario".
- Grid semanal con cards de sesión por día.
- Multi-tipo de sesión: **Fuerza · Aeróbico · Movilidad · Descanso · Circuito** (5 tipos en la maqueta).
- CTA primaria "**+ Asignar sesión**" (override individual sobre el plan, según resp #1 de Franco).
- Cada card: tipo, nombre, duración, estado (✓ Completado / ○ Pendiente).
- Toolbar: Hoy, navegación de semana, range picker, vista (Semana ▾).
- Bloques abajo del calendario: "Próximas evaluaciones" + "Resumen semanal" (donut + chips count).
- Header del alumno enriquecido: foto real, edad, **deporte** (Rugby), altura, peso, badge Activo.
- Sidebar de coach (Inicio, Alumnos, Entrenamientos, Evaluaciones, Calendario, Informes, Biblioteca, Plantillas, Configuración) — pero es scope global, no de este plan.

## 2. Estado actual relevante (validado en BD + código)

### 2.1 Modelo de datos hoy

| Tabla | Columnas relevantes | Notas |
|---|---|---|
| `profiles` | `id, name, email, avatar_url, role, coach_id, weight_kg, height_cm, target_weight_kg, goal, tiene_lesiones, patologias, descripcion_lesiones, weekly_frequency, birth_date, next_payment_due, active` | No tiene `sport`, no tiene `age` (se deriva de `birth_date`) |
| `plans` | template; `plan_type ∈ {training, evaluation}`, `sessions_per_week`, `title`, `description` | No tiene `session_type` por sesión |
| `plan_assignments` | `student_id, plan_id, status ∈ {active, paused, replaced, completed, archived}, plan_type, start_date, end_date, schedule_mode ∈ {fixed, flexible}, preferred_days` | Una sola active de training por alumno (índice parcial único) |
| `plan_exercises` | relación; orden, día (A1/B2), bloque (Activación/Core) | Granularidad: ejercicio dentro de día/bloque, NO sesión "tipo" |
| `workout_sessions` | `student_id, plan_id, logged_date, started_at, finished_at, logged_late, borg_per_day` | **No tiene tipo, ni nombre custom, ni duration_minutes** |

### 2.2 Calendario que ya existe

- `src/features/dashboard/components/MonthlyCalendar.jsx` — calendario **mensual** **global del coach** (todos los alumnos seleccionados). Vista alumno NO existe.
- `src/features/dashboard/hooks/useCoachCalendarData.js` — provee `eventsByDate` (plan_start/plan_end/payment_due/birthday) y `perStudentDays` (expected vs completed). Lógica reutilizable.
- `src/features/dashboard/calendarLogic.js` — utilidades puras (sin React/Supabase) — directamente importables.
- `src/features/plans/assignmentHelpers.js` — `getExpectedSessionDates(assignment, start, end)` y `getScheduleMode(assignment)`.

### 2.3 StudentDetailPage actual

- 9 tabs: `Info | Notas | Planes | Evaluaciones | Formularios | Wellbeing | Progreso | Logs | Historial`.
- Header: avatar con iniciales, name, email, level, goal, 3 stats (peso/días/registros), 2 badges (plan/pago).
- Mobile-first single column. Sin sidebar.
- Sumar tab `Calendario` no requiere refactor del layout — solo agregar entrada a `TABS` y un componente nuevo.

### 2.4 Gap brutal en una línea

> El modelo actual asume "el alumno entrena de un plan único de fuerza X veces por semana". El mockup pide "el alumno tiene una semana con N sesiones de **distintos tipos** mezclando lo derivado del plan con lo que el coach agregó individualmente". El concepto de **sesión individual con tipo y nombre** **no existe**.

## 3. Opciones de arquitectura (A/B/C)

### Opción A — Tabla nueva `scheduled_sessions` (modelo per-session formal)

**Esquema BD:**

```sql
-- Catálogo de tipos (5 inicialmente, extensible)
CREATE TABLE session_types (
  code text PRIMARY KEY,                   -- 'fuerza', 'aerobico', 'movilidad', 'descanso', 'circuito'
  label text NOT NULL,
  color_hex text NOT NULL,
  icon_lucide text NOT NULL,                -- 'Dumbbell', 'Activity', 'Wind', 'Bed', 'Zap'
  display_order int NOT NULL,
  active boolean DEFAULT true
);

-- Sesiones planificadas (lo que se ve en el calendario)
CREATE TABLE scheduled_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  session_type text NOT NULL REFERENCES session_types(code),
  session_name text NOT NULL,                -- 'Día A - Tren superior', 'Trote suave'
  duration_min int,
  source text NOT NULL CHECK (source IN ('plan_derived', 'manual_override')),
  plan_assignment_id uuid REFERENCES plan_assignments(id) ON DELETE SET NULL,
  completed_session_id uuid REFERENCES workout_sessions(id),  -- null = pendiente
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT one_session_per_slot UNIQUE (student_id, scheduled_date, session_name)
);

-- Índices
CREATE INDEX idx_scheduled_sessions_student_date ON scheduled_sessions(student_id, scheduled_date);
```

**Cómo se llena:**

- Cuando se crea/activa un `plan_assignment`, un job (trigger o función) materializa las sesiones esperadas para la duración del plan en `scheduled_sessions` con `source='plan_derived'`.
- Cuando el coach clickea "+ Asignar sesión", inserta una fila con `source='manual_override'`.
- Cuando el alumno completa una sesión, se crea row en `workout_sessions` y se actualiza `scheduled_sessions.completed_session_id`.

**Pros:**
- Modelo limpio, fuente única de verdad para el calendario.
- Multi-tipo nativo, extensible vía `session_types`.
- Permite editar/borrar sesiones derivadas sin tocar el plan.
- Reportes (donut "3 fuerza, 3 aeróbico") triviales con GROUP BY.
- Habilita drag&drop de sesiones entre días si en el futuro hace falta.

**Contras:**
- Migración pesada: hay que materializar el plan para alumnos existentes (job de back-fill).
- 2 tablas nuevas + N migraciones (RLS, índices, FKs).
- Bug surface: si el plan cambia, ¿re-materializamos? ¿Mantenemos versión histórica?
- Riesgo de divergencia entre `plan_exercises` (estructura del plan) y `scheduled_sessions` (instancias).
- Estimado: **3-5 días** (BD + back-fill + refactor de hook + UI + tests).

### Opción B — Extender `workout_sessions` + tabla mini de overrides

**Esquema BD:**

```sql
-- Catálogo igual a Opción A
CREATE TABLE session_types (...);

-- Extender workout_sessions (instancia completada)
ALTER TABLE workout_sessions
  ADD COLUMN session_type text REFERENCES session_types(code) DEFAULT 'fuerza',
  ADD COLUMN session_name text,
  ADD COLUMN duration_minutes int;

-- Solo overrides manuales del coach (sesiones que NO derivan del plan)
CREATE TABLE coach_session_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  session_type text NOT NULL REFERENCES session_types(code),
  session_name text NOT NULL,
  duration_min int,
  notes text,
  created_at timestamptz DEFAULT now()
);
```

**Cómo se computa el calendario:**

- Hook nuevo `useStudentCalendarData(studentId, week)` retorna `Map<date, SessionCard[]>` combinando 3 fuentes:
  1. **Plan-derived** (computed on the fly): `getExpectedSessionDates(active_assignment, week)` ⇒ se mapean a "Fuerza, Día X" según `plan_exercises`.
  2. **Coach overrides**: rows de `coach_session_overrides` para esa semana.
  3. **Completed**: rows de `workout_sessions` con `logged_date` en la semana.
- Merge: cada slot (date+name) puede estar como pendiente (1 o 2), completado (3), o solo override (2 sin 3).

**Pros:**
- Menos disrupción de la BD existente: no se materializa nada masivo.
- Workout_sessions ya tiene flujo de RLS armado; solo sumamos columnas.
- Migración rápida (~2 días BD + back-fill solo para `session_type` de filas existentes).
- Más bajo riesgo que A.

**Contras:**
- Lógica de merge en frontend es más compleja (3 fuentes, no 1).
- Si el coach quiere editar/borrar una sesión "derivada del plan" requiere lógica especial (hoy no se puede sin tocar el plan).
- El donut semanal y reportes son menos triviales (hay que computar la unión en cliente).
- Estimado: **2-3 días** (BD + hook merge + UI + tests).

### Opción C — Solo UI + plan-derived (sin BD, V1 mínima)

**Sin cambios de BD.** Solo nueva UI.

**Componentes nuevos:**
- `src/features/students/tabs/StudentCalendarTab.jsx`
- `src/features/students/components/StudentWeekCalendar.jsx`
- `src/features/students/hooks/useStudentWeekData.js`
- `src/features/students/calendarPresentation.js` — mapea plan + workout_sessions a "session cards" virtuales.

**Datos que muestra:**
- Días esperados del plan (vía `getExpectedSessionDates`) → cards "Fuerza · Día A · 60 min · ○ Pendiente"
- Workout_sessions del alumno → marca esas cards como "✓ Completado"
- "+ Asignar sesión" → en V1 abre modal "Próximamente" o nada. Sin override real.
- Tipos: **todo se muestra como "Fuerza"** porque no hay tipo en BD; deja el feature multi-tipo para una iteración posterior.

**Pros:**
- Cero migración BD.
- Permite iterar UX rápido y validar layout con Anto antes de comprometer el modelo.
- Si después se aprueba Opción A o B, los componentes ya están y solo hay que reemplazar el hook.
- Estimado: **1 día** (UI + hook + tests básicos).

**Contras:**
- No cumple lo que el mockup promete: "asignar sesión" no funciona realmente, multi-tipo no se ve, donut con 1 categoría solo.
- Riesgo de re-trabajo si A/B termina elegido (50-70% del UI sobrevive, el hook se reescribe).
- Coach puede creer que se implementó y pedir features inexistentes.

## 4. Estrategia recomendada por mí (sin tomar la decisión)

> Sólo recomendación. La decisión es tuya.

**Camino sugerido: C → A.**

1. **Iteración 1 (1-2 días)** — Opción C: prototipo navegable con datos reales del plan. Sirve para mostrarle a Anto rápido y validar el layout, los bloques (próximas evals, resumen semanal con donut). El donut puede ya hacerse con datos plan-derived contando "días esperados" en lugar de tipos.
2. **Iteración 2 (3-5 días)** — Opción A: si Anto confirma el layout + Franco confirma el modelo multi-tipo, se materializan las sesiones en `scheduled_sessions` y se reemplaza el hook. El UI se mantiene.

**Por qué no B:**
- B parece "el medio" pero deja una lógica de merge en frontend que es difícil de testear y entender. Si vamos a comprometernos al modelo per-session, mejor hacerlo bien (A) que mezclar dos modelos (B). Salvo que B se justifique por bajo presupuesto de migración, lo cual no se justifica si Franco ya estaba dispuesto a comprometerse a "conviven plan + sesiones" (resp #1).

**Por qué C primero y no A directo:**
- El mockup es una propuesta de UX que aún no fue validada contra usuarios reales (Anto). Comprometer una migración de BD de 3-5 días para algo que puede cambiar de forma cuando Anto lo vea, es costoso.
- C permite iterar UX en 1 día y descubrir cosas que no se ven en la foto (ej: ¿qué pasa con sesiones recurrentes? ¿cómo se asignan templates al calendario? ¿week vs day view?).

## 5. Tareas comunes a todas las opciones (preparatorias)

Independiente de A/B/C, estas se pueden ir cerrando ya:

1. **Sumar columna `sport` a `profiles`** (nullable, text). Migración chica. Habilita mostrar "Rugby" en el header.
2. **Refactor header de `StudentDetailPage`** para usar `avatar_url` real cuando exista (fallback a iniciales). UI puro, 1h.
3. **Reorganización de tabs** (mockup pide 7, hoy hay 9):
   - Opción suave: agregar tab `Calendario`, mantener 10. No tocar nada más.
   - Opción agresiva: colapsar `Formularios + Wellbeing + Logs + Historial` en `Más ▾` (matchea mockup).
   - **Mi sugerencia: opción suave en V1, opción agresiva sólo si Anto pide la limpieza explícitamente.**
4. **Componente reutilizable de donut semanal** (matchea bloque "Resumen semanal" del mockup). Puede usarse también en `CoachDashboard` actual si funciona.

## 6. Preguntas pendientes para Franco (responder antes de empezar)

**Bloqueantes para arrancar Opción C:**
- **P1.** ¿OK con la estrategia C→A? (o preferís A directo, o B)
- **P2.** ¿La columna `sport` en `profiles` es nullable + free-text en V1, o ya querés un catálogo (`sports(id, name)`)? Si free-text alcanza, decisión más rápida.

**Bloqueantes para Opción A (si confirman):**
- **P3.** Los 5 tipos del mockup (Fuerza/Aeróbico/Movilidad/Descanso/Circuito) → ¿son fijos o se prevé que el coach pueda crear los suyos (HIIT, Crossfit, Yoga, etc.)? Esto decide si `session_types` es read-only o editable.
- **P4.** Si el coach edita el plan después de materializar sesiones, ¿re-materializamos? ¿Solo nuevas semanas? ¿Pide confirmación? (Caso clásico de "fuente de verdad ambigua").
- **P5.** "Descanso" como tipo de sesión: ¿se cuenta para `sessions_per_week`? Hoy no existe el concepto.

**Bloqueantes para diseño completo de UI:**
- **P6.** Vista "Día" además de "Semana" — la maqueta solo muestra Semana. ¿Vamos a necesitar vista Día? ¿Mes (ya existe global)?
- **P7.** "Asignar sesión" — ¿abre un modal con form completo (tipo, nombre, duración, día), o es drag de un panel de templates de sesión hacia el día?
- **P8.** Los chips de "Próximas evaluaciones" — ¿vienen de `plan_assignments` con `plan_type='evaluation'` o de otra tabla específica?

## 7. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Anto cambia de opinión sobre layout después de ver C | Re-trabajo UI | Validar con Anto **antes** de pasar a A (gate explícito) |
| Materialización de sesiones (A) genera bug con `plan_assignments` `replaced` | Sesiones huérfanas o duplicadas | Tests SQL del job de back-fill + cleanup script |
| Mobile responsive del calendario semanal complejo | Sub-óptima en pantallas chicas | Usar vista "Día" en mobile + "Semana" en tablet/desktop |
| Multi-tipo rompe reportes existentes (`useCoachCalendarData` asume solo training) | Dashboards rotos | Mantener filter `plan_type='training'` en hook global, multi-tipo solo en el nuevo tab |
| Migración `scheduled_sessions` viola RLS | Datos cross-coach | Replicar policies de `workout_sessions` + smoke RLS tests |

## 8. Próximos pasos sugeridos (acción concreta)

1. Franco responde P1 + P2 (mínimo) → puedo arrancar.
2. Si elige **C primero**: branch + scaffolding del tab + hook + render de plan-derived + tests. ~1 día.
3. Si elige **A directo**: este doc se promueve a "ADR aceptada", arranco migración + back-fill + refactor. ~3-5 días, exige plan secundario por fases (Tier-style como hizo Tier 3.4).
4. Si elige **B**: este doc se actualiza con la decisión + arranque inmediato. ~2-3 días.
