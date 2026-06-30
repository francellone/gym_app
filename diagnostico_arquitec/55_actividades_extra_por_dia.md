# 55 — Actividades extra por día (cross-training) — plan + decisión

**Fecha:** 2026-06-30
**Pedido (coach):** poder registrar, en cada día —entrene o no— si el alumno hizo **otras actividades no vinculadas al entrenamiento** (fútbol, yoga, running, etc.).
**Estado:** **IMPLEMENTADO** (30/06). Decisión de Franco: Opción A. Migración aplicada a prod; código en working tree pendiente de commit/push desde la Mac. Falta smoke en prod con browser `francellone`.

---

## 0. Registro de implementación (30/06)

- **Migración aplicada a prod** (MCP): `supabase/migrations/20260630224301_activity_logs_cross_training.sql`. Verificado: tabla 12 cols, enum 9 valores, 5 policies, RLS on. Sanity de constraints OK (CHECK `label_required` dispara; 0 filas residuales).
- **Módulo nuevo** `src/features/activities/`: `api.js` (+ `api.test.js`, 17 tests), `components/ActivityModal.jsx`, `components/DayActivitiesCard.jsx`, `pages/StudentActivitiesTab.jsx`, `README.md`.
- **Alumno**: `DayActivitiesCard` montada en `TodayWorkoutPage` (debajo de Wellbeing), visible también en días de descanso, carga retroactiva habilitada (`canEdit=true`).
- **Coach**: tab **"Actividad"** en `StudentDetailPage` (carga en cualquier fecha + historial 60 días).
- **i18n**: claves `activities.*` en `es.json` y `en.json`.
- **Verificación**: suite **348/348** (+17), eslint 0 errores, `vite build` OK (3305 módulos; el EPERM en `dist/` es la limitación del sandbox, no del código).
- **Decisión de diseño**: se permite carga **retroactiva** del alumno (registrar actividades de días pasados), no solo del día actual.
- **Pendiente**: smoke en prod (alumno carga + coach ve; RLS con browser `francellone`); chips en `MonthlyCalendar` (fase 2).

---

## 1. Contexto del modelo real (verificado 2026-06-30)

- **`wellbeing_logs`** — registro **por (`user_id`, `date`)** UNIQUE, independiente del plan. Modal en `TodayWorkoutPage` + tab de tendencias del coach (`StudentWellbeingTab`). Es el patrón "dato diario suelto" que aplica acá.
- **`workout_sessions`** — una por (alumno, día), atada al `plan_id` y **pre-creada solo en días de entreno** (según `schedule`/`preferred_days` del plan). Los días de descanso **no tienen fila**.
- **`workout_logs`** — un log por (alumno, ejercicio, día).
- El "día de entrenamiento" sale del `schedule` del plan; los días libres no son una entidad hoy.
- El coach ya tiene `MonthlyCalendar` por alumno (`src/features/dashboard/`) — superficie natural para mostrar estas actividades.

**Conclusión:** lo pedido es un dato **por alumno y fecha, desacoplado del plan**, con **N actividades por día** (un día puede tener fútbol *y* yoga). No encaja en `workout_sessions` (atada al plan) ni en `wellbeing_logs` (UNIQUE por día → 1 registro).

---

## 2. Opciones evaluadas

### Opción A — Tabla dedicada `activity_logs` ✅ ELEGIDA
Tabla nueva espejo de `wellbeing_logs`, **sin UNIQUE por fecha** (N por día). Catálogo chico de tipos + texto libre + métricas opcionales.
- **Pro:** escala a analítica real (carga semanal total = entreno + extra, frecuencia por tipo, contexto para alertas de fatiga/adherencia). RLS idéntico al de wellbeing. No toca el modelo de plan.
- **Contra:** la de más trabajo (tabla + RLS + UI alumno + vista coach). Riesgo: **bajo**.

### Opción B — Extender `workout_sessions` (`session_type` + `activities jsonb`)
Unificar el "día" como entidad y permitir filas de días sin entreno.
- **Contra:** `workout_sessions` está atada al `plan_id` y pre-creada solo en días de entreno; meter días libres choca con el guard anti-overlap de planes (el que difirió el bug de calendario en doc 54). Rompe un invariante. Riesgo: **medio-alto**. Descartada.

### Opción C — MVP sobre `wellbeing_logs` (campo `activities`)
Reaprovecha modal + tab existentes, casi cero backend.
- **Contra:** UNIQUE por (alumno, día) → 1 registro/día; acopla bienestar con actividad; analítica pobre. Útil solo como paso 1. Descartada como destino.

---

## 3. Especificación de la Opción A

### 3.1 Esquema (migración nueva `supabase/migrations/`)

```sql
-- Tipos de actividad: catálogo controlado + 'other' con texto libre
create type public.activity_type as enum (
  'football', 'yoga', 'running', 'swimming', 'cycling',
  'pilates', 'hiking', 'sport_other', 'other'
);

create table public.activity_logs (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  date          date not null default current_date,
  activity_type public.activity_type not null,
  label         text,                                  -- requerido cuando type in ('sport_other','other')
  duration_min  int  check (duration_min is null or duration_min between 1 and 1440),
  intensity     int  check (intensity is null or intensity between 1 and 10), -- escala tipo RPE
  notes         text,
  source        text not null default 'student' check (source in ('student','coach')),
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- N por día permitido (sin unique sobre (student_id,date))
create index activity_logs_student_date_idx on public.activity_logs (student_id, date desc);

-- 'other'/'sport_other' exige label no vacío
alter table public.activity_logs add constraint activity_logs_label_required
  check (activity_type not in ('sport_other','other') or (label is not null and length(trim(label)) > 0));

create trigger activity_logs_updated_at
  before update on public.activity_logs
  for each row execute function public.update_updated_at();
```

> Nota: usar `update_updated_at()` con `search_path = public, pg_temp` como el resto (ver fix 21/05). El enum permite indexar/agrupar para analítica; `'other'` cubre lo no catalogado sin frenar a la coach.

### 3.2 RLS (espejo de `wellbeing_logs`)

```sql
alter table public.activity_logs enable row level security;

-- Alumno: CRUD solo sobre sus propias filas
create policy activity_student_select on public.activity_logs
  for select using (student_id = auth.uid());
create policy activity_student_insert on public.activity_logs
  for insert with check (student_id = auth.uid() and created_by = auth.uid());
create policy activity_student_update on public.activity_logs
  for update using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy activity_student_delete on public.activity_logs
  for delete using (student_id = auth.uid());

-- Coach: ve y edita todo (usar el helper de rol existente, p.ej. is_coach())
create policy activity_coach_all on public.activity_logs
  for all using (public.is_coach(auth.uid())) with check (public.is_coach(auth.uid()));
```

> Verificar el nombre real del helper de coach en las policies vigentes antes de aplicar (reusar el mismo que `wellbeing_logs` para no divergir). **Recordatorio:** el MCP service-role saltea RLS — validar permisos del alumno con el browser `francellone`, no por SQL.

### 3.3 UI

**Alumno (`features/workouts/` o nuevo `features/activities/`):**
- Card "Otras actividades de hoy" en `TodayWorkoutPage`, **visible también en días de descanso** (no depende de que haya `workout_session`). Acceso secundario en `HistoryPage` para cargar en fechas pasadas.
- Modal de alta rápida: tipo (chips del catálogo) → si `other/sport_other` pide label → duración y intensidad opcionales → nota opcional. Input mínimo (regla UX del proyecto).
- Lista de las actividades ya cargadas del día con editar/borrar.

**Coach (`features/dashboard/` + ficha del alumno):**
- Chips/íconos de actividad extra en los días del `MonthlyCalendar`.
- Mini-tab o sección "Actividad extra" en `StudentDetailPage`: lista por fecha + frecuencia por tipo en el período.
- (Fase 2, opcional) sumar la carga extra al cálculo de carga/contexto de alertas de fatiga.

### 3.4 i18n
Claves nuevas bajo `activities.*` en `src/i18n/locales` (es + en, la vista alumno ya está i18n — doc 46).

### 3.5 Casos borde / reglas
- Día de descanso sin `workout_session`: la card **no** debe asumir que existe la sesión; consulta `activity_logs` por `(student_id, date)` directo.
- Borrado: hard delete simple (no es dato crítico tipo log de entreno). Si más adelante se quiere historial, migrar a `archived_at` (lección `is_active` doc 27/05 — soft-delete por timestamp, no boolean).
- No genera notas mirror ni notifica al coach (igual que wellbeing). Si luego se quiere alertar, va por `notifications`/`notify-cron`.

---

## 4. Plan de implementación (checklist)

1. Migración `activity_logs` + enum + índice + constraint + trigger.
2. RLS (reusar helper de coach real) + smoke RLS con browser `francellone` (alumno no ve a otro alumno; coach ve todo).
3. API `features/activities/api.js` (list por alumno+rango, upsert, delete) + tests.
4. UI alumno: card + modal en `TodayWorkoutPage` (y acceso en `HistoryPage`).
5. UI coach: chips en `MonthlyCalendar` + sección en `StudentDetailPage`.
6. i18n es/en.
7. Suite verde + build + smoke en prod (browser `francellone`).
8. Commit conventional en español con item de backlog; `git push` desde la Mac (sandbox no pushea).

> Si el front supera ~500 LOC de cambio, esta misma doc cumple el protocolo de plan documentado. Anto valida la UX final.
