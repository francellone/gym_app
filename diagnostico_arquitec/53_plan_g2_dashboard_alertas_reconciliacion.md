# Plan — G2: Dashboard de alertas del coach (reconciliación contra respuestas de Anto)

Fecha: 2026-06-16. Autor: sesión Cowork (Franco).
Relacionado: `13_pedidos_coach_anto_2026-05-21.md` (§G2 + decisiones 13/14), `19_plan_dashboard_coach_expandido.md` (plan original, Fase C.5).

> **TL;DR**: G2 NO es greenfield. El grueso ya está construido (doc 19, Fase C.5): `alerts.js` con 10 tipos de alerta, hook `useCoachAlerts` que calcula on-demand al cargar el dashboard, cards de alertas + lista de adherencia con tildes. Lo que falta es **reconciliar lo implementado con lo que Anto finalmente pidió** (respuestas a las decisiones 13 y 14 del doc 13). Hay gaps concretos y, sobre todo, sobra ruido. Este doc audita el estado real, mapea gap por gap, y propone 3 opciones de alcance con recomendación.

---

## 1. Estado actual REAL (auditado el 16/06 contra código + DB)

### Lógica de alertas — `src/features/dashboard/alerts.js`
Módulo puro (sin React, sin Supabase). Define `ALERT_THRESHOLDS`, 10 funciones `compute*`, un orquestador `computeAllAlerts`, y los tokens visuales `ALERT_KIND` + `ALERT_RENDER_ORDER`. Las 10 alertas:

| # | Kind | Qué calcula hoy | Umbral actual |
|---|---|---|---|
| 1 | `overdue` | Pagos vencidos (`profiles.next_payment_due` < hoy) | — |
| 2 | `dueSoon` | Pagos por vencer | ≤ 7 días |
| 3 | `planExpiringSoon` | Plan de training que vence | ≤ 7 días |
| 4 | `noActivePlan` | Alumno sin asignación training activa | — |
| 5 | `inactiveStudents` | Días sin loguear | **≥ 3 días** |
| 6 | `highRpeStudents` | PSE alto sostenido | ≥ 8, 3 veces, 14 días |
| 7 | `fatigueStudents` | energía ≤ 5 o fatiga muscular ≥ 7 sostenida | 3+ días en 14 |
| 8 | `lowMotivationStudents` | estrés ≥ 7, o estrés+energía baja, o keywords | 3+ días en 14 |
| 9 | `painStudents` | keywords de dolor en notas + fatiga alta | 1 mención en 21 días |
| 10 | `stagnationStudents` | sin subir max(peso) por ejercicio (1ª vs 2ª mitad de ventana) | 21 días, 3+ logs/ej |

### Orquestación — `src/features/dashboard/hooks/useCoachAlerts.js`
On-demand: 3 fetches (`profiles`+assignments, `workout_logs` con join a ejercicio, `wellbeing_logs`) al montar el dashboard, recalcula con las funciones puras. **Coincide con la decisión 14.c de Anto** (calcular al cargar, no persistir en tabla `coach_alerts` por cron). Tiene `refresh()`.

### UI — `src/features/dashboard/pages/CoachDashboard.jsx`
Renderiza, en este orden: filtros globales → 4 KPIs → **bloque "Alertas de gestión"** (una `AlertCard` por tipo con items, ordenadas por `ALERT_RENDER_ORDER`) → panel del alumno (si hay filtro) → **"Adherencia por alumno"** (`CoachAdherenceList`, tildes ✓✓◐) → próximas evaluaciones → calendario → últimas sesiones.

Cada `AlertCard` agrupa N alumnos de un tipo y su link "Ver" va a `/coach/students` (la lista, no al alumno). `CoachAdherenceList` y `SessionRow` sí linkean a `/coach/students/:id`.

### Lo que NO existe
- **Tests de `alerts.js`**: cero. Los únicos tests del módulo son `dashboardPeriods.test.js` y `studentPanelLogic.test.js`. Las 10 funciones de alerta no tienen cobertura. ⚠️
- **Alerta de adherencia semanal por %** (sesiones completadas / `sessions_per_week`). La adherencia hoy es la lista de tildes, no una alerta con umbral.
- **Vista compacta "Alumno | Estado"** (la del mockup de Anto): hoy las alertas se agrupan por tipo, no hay una fila por alumno con su estado/peor-señal.

---

## 2. Qué pidió Anto finalmente (decisiones 13 y 14 del doc 13)

Texto literal de las respuestas:

> **13a)** baja adherencia: sí, **50% o menos avisar**. Al apretar no me lleva a ningún chat, yo lo hablo por wpp, pero sí **que me lleve al progreso, a la tablita**.
> **13b)** fatiga alta: sí.
> **13c)** dolor: **na, ni nos preocupemos por el dolor entonces**, ya lo tengo con la fatiga más o menos controlado y con el chat preguntando.
> **13d)** días sin entrenar: **4 días sí**.
> **13e)** estancamiento: **¿qué sería lo armado?** (no entendió el término).
> **14)** **c** → calcular al cargar el dashboard (no cron).

**Las 4 alertas que Anto efectivamente quiere v1**: baja adherencia (≤50%), fatiga alta, días sin entrenar (4), estancamiento. Filosofía explícita (doc 13 §G2): *"alertas accionables, no notificaciones innecesarias"*.

---

## 3. Reconciliación: gap por gap

| Lo que pidió Anto | Estado en el código | Gap / acción |
|---|---|---|
| **Baja adherencia ≤50%** | No existe como alerta (solo lista de tildes) | **NUEVO**: `computeLowAdherence` = sesiones completadas en la semana / `sessions_per_week` ≤ 50%. `plans.sessions_per_week` existe ✅ |
| Click alerta → **progreso/tablita**, no chat | `AlertCard` linkea a `/coach/students` (lista) | **CAMBIO**: link por-alumno a su Progreso. Ruta confirmada: `/coach/students/:id?tab=progress` (StudentDetailPage tiene tab `progress` → `StudentProgressTab`). Implica hacer las alertas **clickeables por alumno**, no una tarjeta genérica por tipo |
| **Fatiga alta** sí | `fatigueStudents` ✅ (energía≤5 o fatiga≥7) | Mantener. Posible simplificar a solo fatiga muscular |
| **Días sin entrenar** (Franco 16/06: **3 días hábiles**, que se estira a 4 si el hueco incluye finde) | `INACTIVE_DAYS = 3` (cuenta días corridos) | **CAMBIO**: contar **días hábiles** sin entrenar (no penalizar descanso de sáb/dom). Dispara a 3 hábiles ≈ 4 corridos cuando hay finde en el medio. A confirmar interpretación con Franco |
| **Estancamiento** ("¿qué sería?") | `stagnationStudents` ✅ (por ejercicio) | Mantener; **Franco le explica a Anto** qué es (sin subir peso en 3 semanas) antes de cerrarlo |
| **Dolor** | `painStudents` ✅ implementada | **MANTENER tal cual** (decisión de Franco 16/06: lo deja y lo conversa con Anto, pese a que Anto dijo "no" en 13c) |
| Pagos (overdue/dueSoon/expiring) | implementadas, leen `next_payment_due` | Pertenecen a **G1 (pagos)**, no a G2. La columna existe pero no hay UI de carga → hoy disparan poco. Decisión de alcance abajo |
| RPE alto, baja motivación | implementadas | Anto NO las pidió en su lista final. Candidatas a quitar/ocultar por filosofía "no ruido". Decisión abajo |
| Calcular on-demand | hook on-demand ✅ | Ya cumple 14.c. Nada que hacer |

---

## 4. Datos verificados en prod (16/06, proyecto `bvexjanqmfypmtgoapbt`)

- `plans.sessions_per_week` (integer) **existe** → adherencia calculable.
- `profiles.next_payment_due` (date) **existe** → pagos tienen respaldo, pero dependen de G1 para poblarse.
- `wellbeing_logs` tiene `energy_level`, `muscle_fatigue`, `stress_level`, `notes`, `date`, `user_id`.
- **12 alumnos activos** pero solo **5 asignaciones de training activas** → la alerta `noActivePlan` dispararía para ~7 alumnos = **ruido fuerte** que contradice la filosofía de Anto.
- **wellbeing: solo 24 logs en 21 días** → fatiga/motivación rara vez alcanzan el umbral de 3 días. Señal escasa pero válida cuando llega.
- 323 workout_logs en 31 días.

---

## 5. Opciones de alcance (A/B/C)

### Opción A — Fiel a Anto (recomendada)
Reducir a las **4 alertas que pidió** + ajustes mínimos:
1. Agregar `lowAdherence` (≤50% semanal).
2. `INACTIVE_DAYS` 3 → 4.
3. Quitar de la vista: `painStudents` (Anto dijo no), `highRpeStudents` y `lowMotivationStudents` (no pedidas), `noActivePlan` (ruido: 7/12 sin plan), y pagos (van a G1).
4. Click de cada alerta → progreso del alumno.
5. Tests para las 4 funciones que quedan.

- **Pro**: cumple la filosofía "no notificaciones innecesarias"; el coach ve solo lo accionable. Bajo riesgo (sacar > agregar).
- **Contra**: se "esconde" lógica ya construida (queda en el código, solo fuera de `ALERT_RENDER_ORDER`). Pagos quedan explícitamente para G1.
- **Esfuerzo**: ~media jornada (1 función nueva + tests + ajustes UI/umbral).

### Opción B — Mínimo cambio
Solo lo imprescindible: agregar `lowAdherence`, umbral 4 días, quitar dolor, arreglar click. Dejar RPE/motivación/sin-plan/pagos como están.
- **Pro**: menos decisiones, menos a tocar.
- **Contra**: el dashboard sigue mostrando ruido (7 "sin plan", RPE, motivación) que Anto no pidió → choca con su pedido central.
- **Esfuerzo**: ~3-4h.

### Opción C — Full mockup "Alumno | Estado"
Todo lo de A **+ rediseñar** la sección a la vista compacta del mockup: una fila por alumno con su estado dominante (🔥 progreso / ⚠️ baja adherencia / 😴 sin entrenar / 😪 fatiga), click → progreso. Las cards por tipo pasan a segundo plano o se eliminan.
- **Pro**: es exactamente la maqueta que mandó Anto ("Alumno | Estado"). Más escaneable.
- **Contra**: más diseño y más riesgo; requiere definir prioridad de estado por alumno y conviene tener la foto de WhatsApp de Anto antes (pendiente, doc 13 §fotos). Más test.
- **Esfuerzo**: ~1.5-2 jornadas.

**Recomendación**: **Opción A** ahora (cierra el pedido de Anto con bajo riesgo y respeta su filosofía), y dejar **C** como fase 2 si Anto, al verlo, pide la vista lista. Pedirle la foto del mockup "Alumno | Estado" antes de encarar C.

---

## 6. Cambios concretos (si se elige A)

1. **`alerts.js`**
   - Nueva `computeLowAdherence(students, sessionsByStudent, completedThisWeekByStudent, today)` → `{ studentId, name, completed, target, pct }` con `pct ≤ 50`. Necesita `sessions_per_week` del plan activo y sesiones completadas de la semana en curso (lun-dom).
   - `computeInactiveStudents`: cambiar de "días corridos" a **días hábiles** sin entrenar (no contar sáb/dom). Resultado: dispara a 3 hábiles, que equivale a ~4 corridos cuando el hueco abarca un finde. Mantener `INACTIVE_DAYS` como umbral de días hábiles (=3). Ajustar copy.
   - `ALERT_RENDER_ORDER`: dejar `['lowAdherence','inactiveStudents','fatigueStudents','painStudents','stagnationStudents']` (dolor se mantiene por decisión de Franco). Quitar RPE/motivación/sin-plan/pagos.
   - `computeAllAlerts`: dejar de exponer las quitadas.
2. **`useCoachAlerts.js`**: fetch extra para adherencia — `plan_assignments` activas con `plan.sessions_per_week` + conteo de sesiones completadas de la semana (reutilizar `workout_sessions`/tallies; ojo de no duplicar lo de `CoachAdherenceList`).
3. **`CoachDashboard.jsx` / `AlertCard`**: link por-alumno al progreso. Si la alerta agrupa varios, o se hace fila-por-alumno, o el "Ver" lleva al primero / a la lista filtrada. **Confirmar la ruta real del tab de progreso del alumno en la vista coach** (`StudentDetailPage`, query `?tab=`).
4. **Tests nuevos**: `alerts.test.js` cubriendo lowAdherence (≤50 dispara, >50 no), inactividad a 4 días, fatiga, estancamiento. Cubre el gap de cero-tests.

---

## 7. Decisiones (actualizado 16/06)

- ✅ **Dolor**: se MANTIENE. Decisión de Franco; lo conversa con Anto (Anto había dicho "no").
- ✅ **Click target**: confirmado `/coach/students/:id?tab=progress` (StudentProgressTab).
- 🟡 **Días sin entrenar**: días HÁBILES (3), no corridos. Falta que Franco confirme la interpretación exacta del finde.
- ✅ **Días sin entrenar**: confirmado — **días HÁBILES** (umbral 3), no corridos. Se estira solo cuando el hueco incluye finde.
- ✅ **Alcance** (Franco 16/06): **NO quitar el ruido por ahora**. RPE alto, baja motivación, `noActivePlan` y pagos **se dejan como están**. El cambio se reduce a: agregar adherencia ≤50%, inactividad por días hábiles, click→Progreso, mantener dolor, + tests. (Efectivamente Opción B + dolor.)
- ✅ **Adherencia — "semana"** (default elegido): semana calendario **lun–dom**; día "completado" = tally **entero** (coherente con `computeDayTallies`). Adherencia = días completados / `sessions_per_week` ≤ 50%.
- ⬜ **Estancamiento**: Franco le explica el concepto a Anto y confirma que lo quiere (13e queda abierta; no bloquea código).

---

## 8. Riesgos y mitigaciones

- **Cero tests en `alerts.js`** → cualquier cambio es a ciegas. Mitigación: escribir tests ANTES de tocar (o junto). Es parte del entregable.
- **Wellbeing escaso (24/21d)** → fatiga casi nunca dispara. No es bug; es falta de datos. No bajar umbrales para "forzar" señal.
- **Doble cómputo de adherencia** (alerta nueva vs `CoachAdherenceList`) → reutilizar `computeDayTallies` / un helper común para no divergir.
- **Sandbox**: commit/push se hace desde la Mac de Franco (lock de git). Migraciones: ninguna necesaria para A (todo es front + lógica pura).

---

## 9. Estado de implementación (16/06)

**IMPLEMENTADO en working tree** (sin commit aún — push desde la Mac de Franco):
- `alerts.js`: `computeLowAdherence` (≤50%), `businessDaysBetween` + `computeInactiveStudents` por días hábiles, `ALERT_KIND.lowAdherence` + insertada en `ALERT_RENDER_ORDER`, thresholds nuevos (`LOW_ADHERENCE_PCT=50`). Ruido NO removido (decisión Franco).
- `useCoachAlerts.js`: fetch de `plan.sessions_per_week` + cálculo de `adherenceByStudent` (target = sessions_per_week del plan training activo; completed = días distintos entrenados esta semana lun–dom).
- `CoachDashboard.jsx`: `AlertCard` ahora muestra chips clickeables por alumno → `/coach/students/:id?tab=progress`; copy de `lowAdherence`.
- `alerts.test.js` NUEVO: 13 tests (adherencia, inactividad hábiles, fatiga, estancamiento) — cierra el gap de cero-tests.

**Verificación**: vitest 323/323 (antes 310, +13), eslint 0 errores (3 warnings preexistentes en `fetchStatsAndRecent`), build OK.

**Definición de "completado" en adherencia (v1)**: día distinto con log de training = 1 sesión hecha (coherente con "3 de 4 entrenamientos" de Anto). Si se quiere más estricto (día con tally entero), refinar en una fase 2.

**FIX 16/06 (ventana móvil)**: el cálculo inicial usaba la **semana calendario (lun-dom)** → falso positivo de principio de semana (un martes casi nadie llegó a sus N sesiones aún, disparaba para todos; Franco Cellone daba 1/3·33% siendo que entrena 4×/últimos 7d). Cambiado a **ventana móvil de últimos 7 días** (siempre semana completa). adherencia = días entrenados en últimos 7d / sessions_per_week ≤ 50%. Verificado con datos: Franco pasa de 1/3 a 4/3 → no dispara.

**Pendiente**:
1. Commit `feat(dashboard): alerta adherencia ≤50% + inactividad por días hábiles + click al progreso (G2)` desde la Mac + push.
2. Smoke en prod con browser francellone (sesión coach): ver alerta de baja adherencia con su %, que el chip lleve a `?tab=progress` del alumno, e inactividad sin marcar por descanso de finde.
3. Franco le explica "estancamiento" a Anto (13e).
4. Limpiar residuos de build `dist-verify-*` y los `*.config.js.timestamp-*.mjs` (idealmente sumarlos a `.gitignore`).
