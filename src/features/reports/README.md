# `src/features/reports/` — informe de progreso descargable

Informe por alumno que genera la coach, como **HTML autocontenido descargable**
(abre offline, el PDF sale de imprimirlo). Sin IA: métricas determinísticas;
las plantillas de texto (etapa siguiente) serán condicionales y editables.

## Estructura

```
reports/
├── README.md
├── reportEngine.js          Motor PURO: filas → informe estructurado. Sin red/JSX/i18n.
├── reportEngine.test.js     Una trampa de datos conocida = un test con su nombre.
├── fetchReportData.js       Historia completa del alumno + plan_assignments (fetchAllRows SIEMPRE).
├── exportReportHtml.js      Export: serializa la PANTALLA renderizada + CSS embebido + interacción vanilla.
├── exportReportHtml.test.js
└── pages/
    └── CoachReportPage.jsx  /coach/students/:id/informe — única ruta de la feature.
```

## Accesos

- Botón **Informe** en el header de la ficha del alumno (`StudentDetailPage`).
- Botón **Informe** en el panel del alumno del dashboard del coach
  (`dashboard/components/StudentPanel.jsx`), incluida la variante sin plan activo.

## Decisiones que encarna el motor (2026-08-29, Franco — ver memoria del proyecto)

1. **Sección primero**: `activation` vs días. El 55% de las series históricas
   son activación; mezclarlas hace que el gráfico de volumen sea de calentamiento.
2. **Volumen = series por patrón de movimiento** (`exercise_tags`, el vocabulario
   de Anto), solo sobre trabajo principal. Serie multi-tag cuenta entera en cada
   patrón (~1% de solapamiento): barras comparables, nunca torta que suma 100.
3. **Kilos solo POR ejercicio** (progresión/récords/estancamientos), jamás
   tonelaje total: el total mide palanca (69% eran 8 máquinas), no esfuerzo.
4. Progresión = `computeProgression` (definición única de la app). BW → reps.
5. `source='coach'` es dato del alumno (27% de los logs). Evaluaciones afuera.
6. Días de solo bloque (aeróbico/circuito) cuentan asistencia.
7. Módulo sin datos en el período = apagado (`report.modules`).
8. **Cumplimiento vs plan vigente** (`expectedTrainingDays`): previsto por DÍA =
   `sessions_per_week/7` del plan de entrenamiento vigente según
   `plan_assignments` (si dos se pisan gana el `start_date` más nuevo; sin plan
   ese día = 0 previsto — huecos y pre-arranque no son incumplimiento;
   evaluaciones y `archived` no suman).
9. **Completos vs solo activación**: día completo = tiene algún log fuera de la
   sección activación o un bloque; si todo es activación, es parcial (cuenta
   asistencia pero se distingue — caso Andrea). Hoy el cumplimiento cuenta
   cualquier día entrenado; si debe contar solo completos es 1 línea (decisión
   abierta con Anto).

⚠️ Un % negativo de progresión puede ser cambio de prescripción, no retroceso
(caso real: PM rumano 30→10 kg al cambiar el esquema). Rótulos neutros en la UI
("Mayor cambio", "Sin cambios"); el juicio lo pone la coach.

## Contrato

`buildReport({from, to, logs, blockLogs, sessions, wellbeing, assignments,
tagsByExercise})` recibe la **historia completa** (recorta período/previo/
historia adentro; los récords se definen contra toda la historia previa) y
devuelve `{period, previous, attendance, activation, mainWork, exercises,
highlights, effort, blocks, wellbeing, modules}`. `attendance` incluye
`fullDays/partialDays/bestStreak/expectedDays/compliancePct` y el detalle
semanal con `expected`.

`fetchReportData(supabase, studentId)` arma exactamente ese input. Escala hoy:
~750 logs máx/alumno. TODO con `fetchAllRows` + orden estable.

## Export (regla de oro: UNA implementación por gráfico)

`downloadReportHtml` clona `#report-root` ya renderizado y arma un `.html` sin
ninguna URL externa: `collectPageCss` embebe todo el CSS de la app,
`stripNonExport` saca los controles `print:hidden`, `makeCollapsible` vuelve
cada sección un `<details>` nativo, `buildToc` arma el índice con anclas,
`injectSvgTitles` mete tooltips `<title>` posicionales en los SVG de Recharts
(los grupos `.recharts-bar-rectangle` existen aunque el valor sea 0, así el
índice no se corre; para líneas el caller filtra los null porque `connectNulls`
saltea puntos), y `SORT_SCRIPT` hace ordenable la tabla `[data-export-sortable]`.
**Prohibido reimplementar gráficos en el export** — divergen en silencio.

## Verificado contra datos reales (2026-08-29)

Catalina, 4 semanas, motor vs SQL independiente: asistencia 14=14, series de
activación 184=184, PUSH 27=27, PSE 7.3=7.3. (Los logs con `plan_exercise_id`
NULL —36 en Catalina— cuentan series/asistencia y caen al bucket sin-tag.)
Pantalla, cumplimiento y export verificados en vivo.

## Pendiente

- Plantillas condicionales de texto ("Resumen del período", "Lectura del
  período", "Para el próximo período" de la maqueta), bilingües por claves
  i18n, con preview editable de la coach (su texto integrado sin marcas).
- Informe de 1 página del cliente (mismo motor, solo métricas relativas).
- Decisión: ¿el cumplimiento cuenta días parciales? (ver punto 9).
- Módulo e1RM (cadena oneRm.js real → Epley fallback) si Anto lo pide.
