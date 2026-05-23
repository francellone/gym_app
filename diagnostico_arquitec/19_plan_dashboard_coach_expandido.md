# Plan — Dashboard del coach expandido (2026-05-23 noche, post-Q2)

> **AVANCE 2026-05-23 noche (post-aprobación C):**
> - ✅ **C.1** Hook `useCoachDashboardFilters` + `DashboardFilterBar` + integración con KPIs y Adherencia.
> - ✅ **C.2** `StudentPanel` (donut por section, KPIs, tildes, banner motivacional, recharts).
> - ✅ **C.3** `UpcomingEvaluations`.
> - ✅ **C.4** `MonthlyCalendar` recibe `controlledSelectedIds` y deshabilita filter bar interno.
> - ✅ **C.5** 4 alertas G2 nuevas (fatigueStudents, lowMotivationStudents, painStudents, stagnationStudents) en `alerts.js` + `useCoachAlerts` (fetcha `wellbeing_logs` y `actual_weight`) + render en `AlertCard`. Umbrales en `ALERT_THRESHOLDS` para tuneo.
> - ⏭ **C.6** Calendario semanal embebido en `StudentPanel` (pendiente).
> - Lint 0 errors, 69 warnings (+5 vs baseline 64 — todos del patrón set-state-in-effect aceptado del codebase).
> - Tests 178/178 verdes (sumé 14 dashboardPeriods + 26 studentPanelLogic; C.5 sin tests por ahora).
> - Smoke browser pendiente — requiere `npm run dev` arriba.
>
> **Limitaciones conocidas que asumí en C.5 (Franco validar):**
> - **Dolor repetido**: keyword search en `wellbeing_logs.notes` ya que no existe tabla específica de dolor zonal. Keywords: `dolor`, `molestia`, `duele`, `me molesta`, `sigue molestando`, `lesion`, `lesión`. Umbral: ≥2 menciones en 21 días. **Aproximación** — cuando llegue tabla específica, reemplazar.
> - **Baja motivación**: numérico (`stress_level ≥ 7` sostenido + combo `stress ≥ 6 + energy ≤ 4`) + keywords sueltas en notes. Sin NLP serio.
> - **Estancamiento**: compara `max(actual_weight)` primera mitad vs segunda mitad de los últimos 21 días, aggregate por alumno (no por ejercicio). Mínimo 6 logs para evitar falsos positivos. Mejora futura: por ejercicio.
> - **Fatiga**: `energy_level ≤ 5` o `muscle_fatigue ≥ 7` en 3+ días dentro de 14 días.
>
> Todos los umbrales en `src/features/dashboard/alerts.js` → `ALERT_THRESHOLDS`. Tuneables sin migración.
>
> ---

> **DECISIÓN 2026-05-23 noche:** Franco aprobó **Opción C** ("vamos con C y las dudas que haya las resuelvo yo"). Las preguntas a Anto sobre umbrales se resolverán incrementalmente durante Fase C.5; las demás fases (C.1-C.4 + C.6) arrancan ya con defaults explícitos.
>
> **Defaults aplicados sin pregunta previa (Franco puede revertir):**
> - **D2:** Default del filtro "Período" = "Plan vigente" si hay alumno con plan activo; sino "Últimos 30 días".
> - **D3:** Persistencia de filtros = URL params primero (`?student=X&plan=Y&period=Z`), localStorage backup si el coach refresca sin params.
> - **D4:** "Panel del alumno" = bloque dentro del dashboard (no ruta nueva).
> - **D5:** Resumen semanal del coach = componente nuevo reutilizable después por F5 (notif domingo alumno).
>
> ---

> **Estado:** Planning only, sin código. Sigue el protocolo "refactors >500 LOC requieren plan documentado".
>
> **Contexto:** Franco después de validar Q2 (tildes por día) pidió llevar el feature al `CoachDashboard` y armar la propuesta completa con filtros (alumno + plan + período) e incorporar los datos que aparecen en las imágenes recibidas:
> 1. `assets/G2_dashboard_coach_alertas_transcripcion.md` — 7 triggers de alertas + bloque resumen semanal del alumno.
> 2. `assets/COACH_calendario_alumno_transcripcion.md` — calendario semanal por alumno con cards multi-tipo.

## 1. Estado actual del `CoachDashboard.jsx`

Hoy renderiza, en este orden:

1. **Header** — saludo + fecha (sin filtros).
2. **Stats grid** — 4 KPIs globales: alumnos activos, planes creados, logs hoy, logs semana.
3. **Alertas de gestión** — 6 tipos hoy: pagos vencidos, planes por vencer, pagos por vencer, sin entrenar, RPE alto, sin plan activo.
4. **Adherencia por alumno** *(Q2 — sumado esta sesión)*: tildes por alumno con plan vigente, click → detalle.
5. **Calendario mensual** *(MonthlyCalendar)* — vista global con filter bar de 1-3 alumnos para comparar.
6. **Actividad reciente** — últimos 10 logs.

**Limitaciones:**

- No hay filtros globales. Cada bloque trae su scope: el calendario filtra alumnos, las demás cards son "todos".
- El período es implícito en cada cálculo (RPE últimos 14 días, inactividad 3+ días, pagos próximos 7 días). El coach no puede expandir/contraer la ventana.
- No hay vista "centrada en un alumno" tipo lo que muestra la maqueta — para eso el coach navega a `/coach/students/:id`.
- Faltan métricas que las imágenes pedían (resumen visual de alumno, próximas evaluaciones, donut, alertas G2 que requieren wellbeing/notas).

## 2. Qué pide Franco

Tres pedidos textuales:

1. **Filtros** en el dashboard: por alumno, por plan dependiente del alumno, por período.
2. **Más datos** que aparecen en las imágenes (G2 + calendario per-alumno).
3. **Propuesta planificada** antes de codear.

Implícitos en la conversación:

- Las tildes Q2 ya están y deben mantenerse.
- La vista debe seguir sirviendo para múltiples alumnos a la vez (no solo "modo individual").
- Mobile-first sigue aplicando (responsive obligatorio).

## 3. Mapeo: qué de las imágenes ya existe, qué falta

### 3.1 De la foto G2 (alertas del coach + resumen semanal alumno)

| Trigger del mockup (7) | Hoy en `alerts.js` | Estado |
|---|---|---|
| 1. Riesgo de abandono | `inactiveStudents` (3+ días sin loguear) | Parcial — la maqueta lo amplía a "días sin abrir app" (no lo trackeamos) y "entrenos incompletos" (Q2 ya nos da parciales) |
| 2. Dolor repetido | — | **Falta**. Requiere `wellbeing_logs` con dolor zonal o tabla nueva |
| 3. Fatiga / recuperación mala | `highRpeStudents` solo cubre PSE alto | Parcial — falta wellbeing (energía baja, recovery malo) |
| 4. Estancamiento | — | **Falta**. Requiere comparar reps/peso entre semanas |
| 5. Baja motivación | — | **Falta**. Requiere análisis de keywords en notas + wellbeing.mood |
| 6. Exceso de exigencia | `highRpeStudents` parcial | Parcial — falta "sube peso muy seguido" + "fatiga alta" combinados |
| 7. Pendientes / recordatorios | `dueSoon` + `planExpiringSoon` + `overdue` + `noActivePlan` | Parcial — falta "check-in mensual" y "evaluación pendiente" |

**Bloque "Resumen semanal alumno"** del G2 (saludo, "Completaste X de Y", 4 KPIs, lista de días con estado, banner motivacional): **no existe**. El `StudentDashboard` muestra heatmap + streak, no el resumen estructurado que pide la maqueta. La maqueta es lo que ve el coach al pinchar un alumno desde el dashboard (no lo que ve el alumno en su propio home — eso sería F5, otro item del backlog).

### 3.2 De la foto calendario coach por alumno (`COACH_calendario_alumno_transcripcion.md`)

Esa maqueta era para **dentro** de la vista del alumno (tab Calendario), no para el dashboard global. Pero contiene **3 widgets** que pueden trasplantarse al dashboard si Franco quiere:

- **Donut semanal** ("10 sesiones / 5 completadas / 5 pendientes" + leyenda por tipo) — útil para una vista "panel del alumno seleccionado" dentro del dashboard.
- **Próximas evaluaciones** (lista compacta con fecha + nombre + badge Pendiente) — útil global.
- **Calendario semanal del alumno** con cards por día — pesado, mejor dejarlo en la vista del alumno (Fase 2 del plan 18).

## 4. Filtros propuestos

Tres filtros con dependencia jerárquica:

```
[ Alumno ▾ ]    [ Plan ▾ (dependiente) ]    [ Período ▾ ]
  · Todos          · Todos los planes           · Últimos 7 días
  · Juan Pérez     · PLAN 11 Franco C           · Últimos 14 días
  · Ana Moran      · PLAN 5 Franco              · Últimos 30 días
  · …              · …                          · Plan vigente (default)
                                                · Custom (date range)
```

**Reglas:**

- "Todos los alumnos" deshabilita el filtro de plan (queda "Todos los planes").
- Cuando se elige un alumno, el dropdown de plan muestra solo los `plan_assignments` de ese alumno (activos + replaced + paused, no archived).
- "Período" siempre disponible. Default = "Plan vigente" cuando hay un alumno seleccionado con plan activo; si no, "Últimos 30 días".
- Los filtros se guardan en URL (`?student=...&plan=...&period=...`) para deep-link y refresh sin perder estado.
- Persistencia en `localStorage` para que la próxima vez que entre el coach mantenga su elección (opcional Fase 2).

**Impacto en cada bloque del dashboard:**

| Bloque | Cómo lo afecta el filtro |
|---|---|
| Stats grid (KPIs) | Si hay alumno seleccionado: KPIs del alumno (logs hoy/semana del alumno, no globales). Si todos: igual que hoy. Período aplica. |
| Alertas | Si hay alumno: solo alertas que aplican a ese alumno (banner colapsado). Si todos: como hoy. |
| Adherencia (Q2) | Si hay alumno: card grande con tildes detalladas + sub-stats. Si todos: lista como hoy filtrada por plan/período. |
| Calendario mensual | El componente ya tiene su propio filter bar. Se sincroniza con el filtro global (selected = filtro). |
| Actividad reciente | Filtra por alumno/plan/período. |

## 5. Opciones A/B/C

### Opción A — Incremental (solo filtros + reordenar)

**Alcance:**

- Sumar barra de filtros (alumno + plan dependiente + período) arriba del dashboard.
- Conectar los filtros a los 4 bloques existentes (KPIs, Alertas, Adherencia, Actividad).
- El calendario mensual ya tiene su filter bar — se sincroniza pero no se reemplaza.
- No se suman bloques nuevos.

**No se hace:**

- Bloque "Panel del alumno" (donut + resumen semanal estilo G2).
- Alertas G2 nuevas (dolor, estancamiento, motivación).
- Próximas evaluaciones.

**Estimado:** 4-6h. Bajo riesgo.

**Pros:**
- Cierra el pedido textual ("filtros") rápido.
- Cero migración BD.
- Reutiliza todo lo existente.

**Contras:**
- No incorpora datos nuevos de las imágenes — solo "filtra lo que ya hay".
- Probable re-pedido inmediato ("y donde están los datos de la foto").

### Opción B — Medio (filtros + 2 bloques nuevos)

**Alcance de Opción A + :**

- **Bloque "Panel del alumno"** (visible solo cuando hay un alumno seleccionado):
  - Donut semanal del período seleccionado: cantidad de sesiones por section (Día A, B, C, D) o por tipo si más adelante hay tipos.
  - Tildes detalladas con desglose por semana.
  - Sub-KPIs: días esperados vs cumplidos, % adherencia, PSE promedio.
  - Banner motivacional opcional (texto computado según adherencia).
- **Bloque "Próximas evaluaciones"** (siempre visible):
  - Lista de las próximas 5 `plan_assignments` con `plan_type='evaluation'`.
  - Si hay filtro de alumno, filtradas a ese alumno.
- Mantenemos las 6 alertas actuales — no sumamos las 4 nuevas de G2.

**No se hace:**

- 4 alertas G2 nuevas (dolor, fatiga full, estancamiento, motivación).
- Calendario semanal por alumno (Fase 2 del plan 18).

**Estimado:** 8-12h. Riesgo medio.

**Pros:**
- Cubre la mayor parte de las imágenes sin meterse con BD.
- Cierra "datos que aparecen en las imágenes" parcialmente.
- Donut + resumen semanal son los componentes más distintivos del mockup.

**Contras:**
- Las alertas G2 nuevas quedan abiertas (requieren wellbeing + análisis de notas → 2-5 días extra cada una).
- No es "el dashboard del mockup completo".

### Opción C — Full (todo lo que piden las imágenes)

**Alcance de Opción B + :**

- **4 alertas G2 nuevas:**
  - Dolor repetido (requiere `wellbeing_logs` con campo de dolor zonal o tabla nueva `pain_logs`).
  - Fatiga / recuperación mala (analiza `wellbeing_logs.energy_level`).
  - Estancamiento (compara `actual_weight`/`actual_reps` entre semanas — ya hay data, solo falta query).
  - Baja motivación (keywords negativas en notas del alumno + wellbeing.mood).
- Calendario semanal por alumno *embebido* dentro del Panel del alumno (compact).
- Persistencia en localStorage de los filtros.

**Estimado:** 3-5 días.

**Pros:**
- Cubre las 2 imágenes 100%.
- Dashboard se vuelve "el centro de mando" que pide la maqueta.

**Contras:**
- Requiere validar umbrales con Anto (preguntas #13 + #14 del doc 13 siguen sin responder — se necesitan números).
- Análisis de notas para "baja motivación" puede ser una rabbit hole sin claridad de keywords.
- Mucha superficie de bug en un solo merge.

## 6. Recomendación

**Voto: Opción B.**

Razones:

1. **A se queda corto**: Franco mencionó explícitamente "otros datos que le interesan salgan en el dashboard". Solo agregar filtros no responde eso.
2. **C tiene blockers de discovery**: las 4 alertas nuevas requieren respuestas de Anto que aún no tenemos (umbrales numéricos exactos, fuente de datos del dolor, criterios de motivación). Avanzar a ciegas es costoso.
3. **B es el punto dulce**: cierra los pedidos textuales + suma los widgets más visibles del mockup (donut + resumen semanal + próximas evals) sin tocar BD y sin esperar a Anto. Las alertas G2 nuevas quedan parkeadas con su propio plan post-B.

**Plan de fases dentro de Opción B:**

1. **Fase B.1** (2-3h) — Barra de filtros + integración con KPIs y Adherencia. Sin bloques nuevos. Validar UX con Franco.
2. **Fase B.2** (3-4h) — Bloque "Panel del alumno": donut + tildes detalladas + sub-KPIs. Solo se renderiza si hay alumno seleccionado.
3. **Fase B.3** (1-2h) — Bloque "Próximas evaluaciones" global o filtrado.
4. **Fase B.4** (1h) — Sincronizar `MonthlyCalendar` con el filtro global de alumno.
5. **Smoke + lint + tests** (1h).

Si en Fase B.1 Anto/Franco quieren parar y validar antes de seguir, queda merge clean a mitad de camino.

## 7. Datos / tablas usadas (sin migración)

Todo lo que necesita Opción B existe ya:

| Bloque | Tablas | Notas |
|---|---|---|
| Filtros | `profiles` (alumnos), `plan_assignments` (planes del alumno) | Ya están en `useCoachCalendarData` |
| KPIs filtrados | `workout_logs` con `student_id` + `plan_id` + rango fechas | Query directa |
| Donut por section | `plan_exercises` + `workout_logs` | Reusa `computeDayTallies` |
| Resumen semanal | `workout_logs` + `plan_assignments` | Misma fuente que streak |
| Próximas evaluaciones | `plan_assignments` con `plan_type='evaluation'` + `start_date >= hoy` | Query directa |
| Sub-KPIs adherencia | `workout_logs` + `getExpectedSessionDates` | Lógica ya existe en `useCoachCalendarData` |

**No requiere migración SQL.**

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El filtro global rompe `MonthlyCalendar` (que tiene su propio filter bar) | Fase B.4 explícita; mantener un único "source of truth" del filtro |
| Performance del fetch global cuando hay muchos alumnos | Indexar consultas + agrupar en 2-3 queries grandes como hicimos en `CoachAdherenceList` |
| El donut "por section" muestra Día A/B/C/D pero el mockup quería multi-tipo (Fuerza/Aeróbico/etc.) | Documentar la diferencia: hoy solo hay 1 tipo (training), el donut por section es la versión disponible. Para multi-tipo necesitamos el modelo de Fase 2 del plan 18 |
| Coach espera 4 alertas G2 nuevas también | Aclarar en doc + en UX que Opción B es paso 1; Opción C requiere preguntas a Anto |
| URL params se vuelven inmanejables si hay muchos filtros | Usar 1 solo objeto `?filters=...` en base64 si crece, hoy 3 alcanza con keys separados |

## 9. Decisiones pendientes (responder antes de Fase B.1)

- **D1.** Confirmar Opción B (o cambio a A/C).
- **D2.** Default del filtro "Período" cuando hay alumno seleccionado con plan: ¿"Plan vigente" o "Últimos 30 días"?
- **D3.** ¿Filtros se guardan en localStorage o solo en URL? Por defecto propongo URL.
- **D4.** El "Panel del alumno" cuando se filtra: ¿es un bloque dentro del dashboard, o redirigimos a una ruta nueva `/coach/dashboard?student=X` que muestra ese panel? Por defecto propongo: bloque dentro del dashboard.
- **D5.** ¿El "Resumen semanal" mostrado al coach es el mismo que se le mostrará al alumno cuando hagamos F5 (notif domingo)? Si es el mismo componente, ya queda preparado para reuso.

## 10. Próximo paso

Franco responde D1-D5 → arranco Fase B.1 (filtros + integración con KPIs/Adherencia).
Si D1 cambia a A o C, ajusto plan y arranco.
