# `src/features/reports/` — informe de progreso descargable

Informe por alumno que genera la coach (dos salidas previstas: informe técnico
para ella + informe de 1 página para la persona), como **HTML autocontenido
descargable**. Sin IA: métricas determinísticas + plantillas condicionales.

## Estructura

```
reports/
├── README.md
├── reportEngine.js        Motor PURO: filas → informe estructurado. Sin red/JSX/i18n.
├── reportEngine.test.js   Una trampa de datos conocida = un test con su nombre.
└── fetchReportData.js     Trae la historia completa del alumno (fetchAllRows SIEMPRE).
```

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

⚠️ Un % negativo de progresión puede ser cambio de prescripción, no retroceso
(caso real: PM rumano 30→10 kg al cambiar el esquema). El guardrail es el
preview editable de la coach, no el motor.

## Contrato

`buildReport({from, to, logs, blockLogs, sessions, wellbeing, tagsByExercise})`
recibe la **historia completa** (recorta período/previo/historia adentro; los
récords se definen contra toda la historia previa) y devuelve
`{period, previous, attendance, activation, mainWork, exercises, highlights,
effort, blocks, wellbeing, modules}`.

`fetchReportData(supabase, studentId)` arma exactamente ese input. Escala hoy:
~750 logs máx/alumno. TODO con `fetchAllRows` + orden estable.

## Verificado contra datos reales (2026-08-29)

Catalina, 4 semanas, motor vs SQL independiente: asistencia 14=14, series de
activación 184=184, PUSH 27=27, PSE 7.3=7.3. (Los logs con `plan_exercise_id`
NULL —36 en Catalina— cuentan series/asistencia y caen al bucket sin-tag.)

## Pendiente

- Vistas (pantalla coach + preview editable) y export HTML autocontenido
  (serializar el SVG de Recharts ya renderizado — UNA implementación por gráfico).
- Plantillas condicionales de texto, bilingües por claves i18n.
- Módulo e1RM (cadena oneRm.js real → Epley fallback) si Anto lo pide.
