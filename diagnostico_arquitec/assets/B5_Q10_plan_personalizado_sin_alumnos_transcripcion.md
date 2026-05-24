# Transcripción de captura — B5 + Q10 (24/05)

> Franco compartió esta captura el 24/05 (post-cierre de B3+B4). Cubre dos
> items de la Ronda 3 del doc 13 en una sola pantalla: B5 (botón muerto) y
> Q10 (cartel sin CTA). Pegar el binario `.png` al lado de este archivo con
> nombre `B5_Q10_plan_personalizado_sin_alumnos.png`.

## Contexto
Vista del coach en `PlanDetailPage` para un plan de training **sin alumnos asignados**. Plan ejemplo en la captura: **"Plan 2 — mejorar FC en reposo"**, creado el 24 May 2026, 4 días/semana, 7 ejercicios, 4 secciones, **0 alumnos**.

## Elementos rodeados

### Rodeado en AMARILLO — botón "+ Agregar ejercicio" (item B5)
- Botón naranja grande en la esquina superior derecha del header del plan, al lado del botón "Editar".
- Texto: `+ Agregar ejercicio`.
- **Bug reportado por Anto**: al apretarlo NO pasa nada.
- Anto sugiere: *"capaz si se saca no pasa nada"* — es decir, no se rompe nada si lo eliminamos.

### Rodeado en ROJO — sección "Alumnos asignados" (item Q10)
- Sección debajo de las tabs `Estructura / Progreso`.
- Header: `👥 Alumnos asignados`.
- Cuerpo (en gris claro, parcialmente cortado por el círculo rojo): `personalizado (sin alumnos a asignar).` — el texto completo es probablemente `Plan personalizado (sin alumnos para asignar).` o similar.
- **Pedido de Anto (Q10)**: hoy el cartel es un dead-end. Debería tener un CTA "Asignar alumno" (botón) que abra el flujo de asignación directamente desde acá.

## Otros elementos visibles (contexto UI, no del bug)
- Header del plan con título "Plan 2", subtítulo "mejorar FC en reposo.", metadata "📅 4 días/semana · 7 ejercicios · Creado 24 May 2026", y acciones: ícono basura (eliminar), `Editar`, `+ Agregar ejercicio`.
- Cards de stats: 7 Ejercicios · 4 Días/semana · 0 Alumnos · 4 Secciones.
- Tabs: `Estructura` (activa) · `Progreso`.
- Selector de día: `● Principal Día A (4)` activo · `Principal Día B (2)` · `Principal Día C (0)` · `Principal Día D (2)`.
- Tabla de bloque FUERZA en Día A:
  - A1 Lateral Hop + lateral box jump — 2 series · 3 reps · 1min30seg pausa
  - A1 Sentadilla Con Barra — 3×8 · 60/70/70 kg · 2M · PSE "Muy duro (7-9)"
  - A2 Press Banca Con Barra — 3×8 · 50 kg · 2M
  - B1 S Row Pulley — 3 series · 2M

## Implicancias para el fix

**B5** (1h si sacamos, 3-4h si implementamos modal):
- Archivo: `src/features/plans/pages/PlanDetailPage.jsx`, header del componente.
- Decisión Franco-only (regla 24/05): ¿se elimina el botón o se implementa modal "Agregar ejercicio rápido"? Si se implementa, decidir a qué bloque agrega (default primero, picker, modal con selector de bloque).
- Recomendación: eliminarlo. El flujo natural de "agregar ejercicio" es desde dentro del bloque correspondiente (UI ya existente y funcional).

**Q10** (2h):
- Archivo: `src/features/plans/pages/PlanDetailPage.jsx`, sección "Alumnos asignados" cuando `assignments.length === 0`.
- Reutilizar el modal `AssignToStudentsModal` o equivalente que ya existe en `PlanDetailPage` (ver líneas ~940+ del componente, ya tiene un botón "Asignar" cuando el plan es plantilla).
- Copy del CTA: "Asignar alumno" (botón primario dentro del cartel).
- Edge case importante: el plan de la captura es `is_template=false` (texto dice "personalizado"). La lógica actual del PlanDetailPage oculta el botón "Asignar" para clones (línea ~940 `plan?.is_template !== false`). Hay que decidir si para Q10 levantamos esa restricción (el coach Q10 podría querer asignar el clon a otros alumnos también) o si Q10 sólo aplica a plantillas. **Pregunta Franco-only pendiente**.
