# Handoff próximo agente — 2026-06-16 (sesión G2 dashboard de alertas)

Resumen de lo hecho hoy y lo que queda. Leer junto al **doc 53** (`53_plan_g2_dashboard_alertas_reconciliacion.md`), que es el plan/registro detallado de G2.

## Contexto de la sesión
Franco eligió retomar **G2 (dashboard de alertas del coach)**. Hallazgo clave: G2 NO era greenfield, ya estaba ~90% hecho (doc 19, "Fase C.5"). El trabajo fue **reconciliar lo construido con las respuestas finales de Anto** (doc 13, decisiones 13/14) + refinar el cálculo de adherencia tras feedback de Franco.

## Hecho y PUSHEADO (en `origin/main`)
1. **`b7ac14f`** — feat(dashboard): alerta adherencia + inactividad días hábiles + click al progreso (G2).
   - Alerta de baja adherencia, inactividad por **días hábiles** (no penaliza finde), alertas clickeables por-alumno → `/coach/students/:id?tab=progress`, se mantuvo dolor (decisión Franco), no se quitó el "ruido" (RPE/motivación/sin-plan/pagos quedan).
   - `alerts.test.js` nuevo. Smoke prod OK.
2. **`a2f801a`** — chore(docs): handoffs 39/44/47/50/51 + migración RLS cross-plan (doc 51) que estaba sin trackear.
3. **`9f13aec`** — docs: estado Q11/Q5 (doc 13) + i18n (doc 46).
4. **`b9f80d0`** — feat(dashboard): **adherencia por semanas cerradas + alerta de declive**.
   - Tras feedback de Franco: la adherencia se mide sobre **semanas cerradas (lun-dom terminadas)**, nunca la semana en curso. Dos alertas: `lowAdherence` (última semana cerrada <100%, "cualquier falta" — decisión Franco) y `adherenceDecline` (3 semanas cerradas en baja estricta, ej. 100→67→33). Smoke prod OK: Franco Cellone ya no aparece (el falso 33% era por medir la semana en curso); anto 50%.

## Hecho pero SIN COMMIT (working tree) — ⚠️ pendiente de push
**Panel del alumno (StudentPanel) — adherencia por semanas cerradas TOTALES.**
- La métrica del panel (KPIs Esperados/Completados/Adherencia + banner motivacional) tenía el mismo bug de semana en curso (Franco daba 67% en "últimos 14 días").
- Reescrita con `computeClosedWeeksAdherence` (en `studentPanelLogic.js`): semanas cerradas **totalmente contenidas en el período**, contando entrenos de **TODOS los planes** del alumno (no solo el activo — pedido de Franco: "semanas cerradas totales, no del plan actual"), target = `sessions_per_week` del plan seleccionado, completed capeado por semana. Sin semanas cerradas en el período → "—" + banner neutro.
- Donut / tildes / PSE / progreso por ejercicio: SIN cambios (siguen plan-scoped por período).
- Verificado: studentPanel 39 tests (+5), suite **331/331**, eslint 0 err, build OK.
- **Archivos**: `src/features/dashboard/studentPanelLogic.js`, `src/features/dashboard/studentPanelLogic.test.js`, `src/features/dashboard/components/StudentPanel.jsx`, `diagnostico_arquitec/53_*.md` (y este 54).
- **Commit pendiente** (correr desde la Mac):
  ```
  cd "/Users/francocellone/Desktop/gym_app/gym_app" && git add src/features/dashboard/studentPanelLogic.js src/features/dashboard/studentPanelLogic.test.js src/features/dashboard/components/StudentPanel.jsx diagnostico_arquitec/53_plan_g2_dashboard_alertas_reconciliacion.md diagnostico_arquitec/54_handoff_proximo_agente_2026-06-16.md && git commit -m "feat(dashboard): adherencia del panel del alumno por semanas cerradas totales" && git push origin main
  ```
- Falta smoke en prod del panel tras pushear (seleccionar un alumno en el dashboard y ver el % corregido).

## Pendiente / decidido NO hacer ahora
- **Calendario — planes viejos no se ven (DIFERIDO por Franco 16/06).** `useCoachCalendarData` cuenta los días "Cumplido" filtrando `plan_id` SOLO del plan activo (guard deliberado anti-overlap de planes `replaced` + `plan_id` legacy de evaluaciones, ~líneas 170-184). Por eso no aparecen los entrenos de planes anteriores. Fix propuesto (NO aplicado): contar sesiones de TODOS los planes con `plan_type='training'` (join), sin restringir al activo; riesgo menor de falso "día extra" en semanas de transición de planes flexibles. Retomar cuando Franco quiera.
- **Explicar "estancamiento" a Anto** (decisión 13e quedó abierta): es "sin subir el peso máximo en ~3 semanas por ejercicio". Franco lo iba a charlar con Anto.

## Backlog sugerido para próximas sesiones (doc 13)
- **F13** — cuadro de texto + link de Drive en evaluaciones (decisión 12).
- **F5** — resumen semanal automático al alumno (domingo).
- **F8** — histórico de peso corporal con gráfico.
- Limpieza fase 2 evals (doc 37): dropear `evaluation_tests` legacy.

## Notas operativas
- Commit/push siempre desde la Mac de Franco (el sandbox tiene el `.git/index.lock` y no puede autenticar GitHub). `dist-verify-*` y `*.config.js.timestamp-*.mjs` son residuos (ya en `.gitignore`).
- Smokes con browser **francellone** (deviceId 5c324fc5…), sesión como coach (Anto).
