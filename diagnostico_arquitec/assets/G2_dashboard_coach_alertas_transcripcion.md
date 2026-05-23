# G2 — Transcripción de mockup recibido (foto inline 2026-05-23)

> **Origen:** Franco pegó la imagen inline en chat el 2026-05-23 (sesión late). El binario PNG no se subió como archivo así que esta es transcripción textual. Si llega el PNG hay que guardarlo en este mismo folder como `G2_dashboard_coach_alertas.png`.

## Bloque 1 — TRIGGERS para notificaciones del COACH

> Subtítulo: "Solo lo que requiere tu intervención"

Lista de 7 triggers, cada uno con icono, título, descripción del criterio y un ejemplo de notificación renderizada:

| # | Trigger | Criterio (texto del mockup) | Ejemplo renderizado |
|---|---|---|---|
| 1 | **Riesgo de abandono** | Baja adherencia 2 semanas, días sin abrir la app, entrenos incompletos | 🔴 ⚠️ Franco bajó su adherencia esta semana (1/4 entrenos). |
| 2 | **Dolor repetido** | Misma zona corporal 2-3 veces o intensidad alta | 🟡 ⚠️ Molestia lumbar repetida esta semana (3 registros). |
| 3 | **Fatiga / recuperación mala** | Energía baja, recovery malo, PSE alto sostenido | 🟣 ⚠️ Posible fatiga acumulada (Energía 4-5/10 varios días). |
| 4 | **Estancamiento** | Sin progreso 3 semanas o empeora | 🟢 📉 Sentadilla sin mejoras hace 3 semanas. |
| 5 | **Baja motivación** | Comentarios negativos, "sin ganas", cansancio mental | 🔴 😞 Baja motivación detectada (comentarios y bienestar bajo). |
| 6 | **Exceso de exigencia** | PSE siempre alto + sube peso muy seguido + fatiga alta | 🔵 🔥 Intensidad elevada sostenida (PSE 8-9 en 4 entrenos). |
| 7 | **Pendientes / recordatorios** | Check-in mensual sin completar, evaluación pendiente | 🟡 📋 Check-in mensual pendiente (último hace 3 semanas). |

## Bloque 2 — Resumen semanal (vista alumno)

> Header: 📅 Resumen semanal — Semana 24/11 – 30/11

- Saludo personalizado: "¡Buen trabajo, Sofia! 👋" + título grande "Completaste **3 de 4 días**"
- Barra de progreso + medallón circular "75%"
- 4 KPIs en grid (icono + número + label):
  - 📅 3 Entrenos
  - 🔥 1 Racha actual
  - 🏋️ 4 Total series
  - ⭐ — PR esta semana
- Banner azul con estrella: "Vas muy bien. Mantené la constancia y vas a notar la diferencia en sentadilla y peso muerto." (clickeable, chevron derecho)
- Sección "Detalle rápido" con link "Ver más >" arriba a la derecha
- Lista de días de la semana con estado:
  - ✅ Día A – Fuerza → badge verde "Completado"
  - ✅ Día B – Tren inferior → badge verde "Completado"
  - ⊖ Día C – Empuje → badge naranja "Pendiente"
  - ✅ Aeróbico → badge verde "Completado"
- Footer banner amarillo con 💡: "El próximo lunes empezás con progresión en sentadilla (+2,5 kg sugeridos)."

## Lo que NO cubre esta foto

Doc 13 pedía además **la vista lista "Alumno | Estado"** del coach (ej: `Franco | ⚠️ baja adherencia`, click → detalle alumno). Esta foto no la muestra — falta esa maqueta.

## Decisiones que la foto define (responde parcialmente §G2 doc 13)

✅ **Pregunta 13 (qué alertas v1):** define **7 alertas** (no 5 como propuesta original). Riesgo abandono, dolor repetido, fatiga, estancamiento, baja motivación, exceso exigencia, pendientes.

❌ **Pregunta 13 (umbrales):** describe los criterios en lenguaje natural ("2 semanas", "2-3 veces", "PSE alto sostenido") pero NO da números exactos para SQL. Falta afinar:
- Riesgo abandono: ¿qué % de adherencia exacto? ¿cuántos días sin abrir app?
- Dolor repetido: ¿"2-3 veces" en qué ventana? ¿qué intensidad = "alta"?
- Fatiga: ¿"PSE alto" = >=8? ¿"sostenido" = cuántos días?
- Estancamiento: ¿"sin progreso" definido cómo? ¿peso plano? ¿reps planas?
- Baja motivación: ¿qué keywords contar? ¿bienestar bajo = qué umbral?
- Exceso exigencia: ¿"muy seguido" = cada cuánto?

❌ **Pregunta 14 (on-demand vs cron):** sin respuesta de Anto.

## Definiciones nuevas que aparecen en la foto y no estaban en doc 13

- Trigger **"Pendientes / recordatorios"** (#7) no estaba en la lista original de doc 13. Sumar.
- El **resumen del alumno** (bloque 2) puede ser parte de G2 o un item separado (¿F5 — notif semanal al alumno?). Revisar con Franco.
