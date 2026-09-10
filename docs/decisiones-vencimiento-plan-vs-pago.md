# Vencimiento del plan vs. vencimiento del pago

Diseño acordado con Franco el 10/09/2026, a pedido de las coaches
("que se pueda distinguir el vencimiento del plan del vencimiento del pago").
Este documento es el canónico: si el código y este archivo difieren, gana este
archivo hasta que se actualice explícitamente.

---

## 1. Punto de partida (medido en la base, 10/09/2026)

| Hecho | Dato |
|---|---|
| Alumnos (role=student) | 34 |
| Alumnos con `next_payment_due` cargado | 8 |
| Asignaciones totales / activas | 84 / 28 |
| Asignaciones **activas** con `end_date` | **0 de 28** |
| Asignaciones `replaced` con `end_date` | 21 de 21 |

**El hallazgo central: `plan_assignments.end_date` no es una fecha de
vencimiento, es la fecha de cierre de la asignación.** Se escribe
`end_date = hoy` al reemplazar (`handleReplaceConfirm`) o al completar
(`changeStatus`), y se limpia a `null` al reactivar. Es siempre una fecha del
pasado y nunca está presente en un plan vivo.

Consecuencias, todas silenciosas:

- `computePlanExpiringSoon` (alertas del dashboard, umbral 7 días) filtra por
  `end_date` de la asignación activa → **nunca disparó**.
- El evento `plan_end` del calendario mensual → **nunca se pinta**.
- El cron diario `fn_notify_expiring_plans` (job 2, 10:00 UTC) busca
  `active = true AND end_date = CURRENT_DATE + 7` → **nunca generó una fila**,
  a pesar de tener tipo declarado, `TYPE_CONFIG`, textos i18n y tests.
- `plans.duration_weeks` está cargada en 24 de las 26 asignaciones activas de
  training y solo se usa en el formulario de armado. Nadie la vuelve fecha.

Del lado del pago: `profiles.last_payment_date`, `next_payment_due`,
`payment_notes` (migración `add_payment_tracking.sql`, 04/2026). Es el único
vencimiento que el coach ve. No hay historial (cada pago pisa al anterior), no
hay monto y no hay ciclo declarado, aunque en los datos ya conviven intervalos
de 21 días a 3 meses.

---

## 2. Decisiones

**D1. El vencimiento del plan se DERIVA de la duración; la fecha manual es la
excepción.** `expected_end_date = start_date + duration_weeks * 7 - 1 día`. Si
el plan no tiene `duration_weeks`, la asignación es *abierta* (sin vencimiento)
y así se muestra, no como error.

*Por qué:* la coach ya carga la duración al armar el plan. Pedirle la fecha otra
vez es pedir dos veces el mismo dato y garantizar que se contradigan.

**D2. `end_date` y `expected_end_date` son cosas distintas y no se pisan.**
`end_date` (cierre real) queda como está y sigue alimentando el motor de
informes, que mide *hasta cuándo el plan estuvo vigente de verdad*. Un plan
puede seguir usándose después de su fecha esperada: eso no es un error, es lo
normal, y el informe debe seguir contándolo.

*Por qué:* si el informe pasara a usar `expected_end_date`, cada plan estirado
perdería sus días previstos y el cumplimiento saldría inflado.

**D3. El pago pasa a tabla propia con historial, y `profiles.next_payment_due`
/ `last_payment_date` quedan como caché derivado.** Las columnas no se borran ni
cambian de significado: las mantiene un trigger sobre `payments`. Todo lo que
hoy las lee (`getPaymentStatus`, chips y filtros de la lista, alerta del
dashboard, evento `payment_due` del calendario) sigue funcionando sin tocar una
línea.

*Por qué:* es la forma de tener historial sin una migración de front en cascada.
El caché es lectura; la verdad está en `payments`.

**D4. Los dos vencimientos son independientes en la base. El enganche vive en la
UI y es opcional.** Al registrar un pago, si el alumno tiene un plan activo cuya
vigencia termina antes del período pagado, se ofrece extenderla con un checkbox
**desmarcado por defecto**. Aceptar equivale a fijar la fecha a mano (pasa a
manual, con auditoría).

*Por qué:* pagar y entrenar son ciclos que en este negocio no coinciden (hay
pagos de 21 días y planes de 8 semanas). Acoplarlos en la base haría que
corregir un cobro moviera el entrenamiento de alguien.

**D5. El primer aviso de vencimiento de plan va SOLO al coach.** El cron
`fn_notify_expiring_plans` hoy le escribe también al alumno ("Tu plan vence en 7
días"). Como nunca disparó, activarlo con datos reales estrenaría esa
notificación en los celulares de las alumnas sin que nadie la haya visto nunca.
El texto al alumno queda escrito pero apagado hasta que Anto lo revise.

**D6. Migrar no puede pintar el dashboard de rojo el día 1.** Con la fórmula de
D1 sobre los datos de hoy: 26 asignaciones activas de training, 2 sin duración,
**7 ya vencidas**, 3 vencen dentro de 7 días, 14 vigentes. Las 7 vencidas son
planes viejos que siguen andando, no una urgencia. El backfill marca esas filas
con `expected_end_source = 'backfill'` y la UI las muestra como *vencido
(estimado)* hasta que la coach confirme o corrija la fecha.


**D7. `end_date` se renombra a `closed_at`, en dos pasos.** El nombre miente y esa
mentira ya costó tres features que nunca funcionaron, así que se corrige. Pero un
rename directo rompe la app en producción: la migración corre en segundos y el
bundle viejo sigue en los celulares de las alumnas pidiendo `end_date` hasta que
Vercel termina el deploy y se renueva el service worker. Entonces:

- **v48 (esta tanda)**: se agrega `closed_at`, se copia el contenido de `end_date`
  y un trigger mantiene las dos columnas sincronizadas en los dos sentidos. El
  bundle viejo escribe `end_date` y funciona; el nuevo escribe `closed_at` y
  funciona. Nadie ve nada raro.
- **v49 (después de verificar el deploy en vivo)**: se borra `end_date` y se saca
  el trigger de sincronización.

*Por qué en dos pasos:* es el mismo motivo por el que existe esta tanda. Una
columna cuyo nombre no dice lo que guarda es una trampa; una migración que corre
antes que el deploy es una caída.

**D8. El solapamiento de períodos de pago lo impide la base, con mensaje
traducido en la UI.** Dos filas de `payments` del mismo alumno no pueden cubrir
días en común: cobrar dos veces el 1 al 30 de septiembre es siempre un error de
carga, no un caso de negocio. Se implementa con `EXCLUDE USING gist` sobre
`daterange(period_start, period_end, '[]')` particionado por `student_id`
(requiere la extensión `btree_gist`), y `enrichRpcError` traduce el código `23P01`
a "Ese período ya está cubierto por otro pago registrado".

*Por qué en la base y no solo en la UI:* la validación de pantalla se saltea desde
cualquier otra vía de escritura, y un cobro duplicado corrompe el
`next_payment_due` derivado, que es lo que dispara las alertas. La UI igual avisa
antes de guardar para que la coach no se coma un error crudo.

**D9. Las notas de pago son del coach y el alumno no las ve.** Hoy viven en
`profiles.payment_notes`, y la política `select_own_profile` deja que el alumno
lea su propia fila entera: la etiqueta "privadas" de la pantalla no es verdad.
Las notas se mudan a `payments.notes` (tabla con RLS de coach y sin política para
el alumno) y la columna del perfil se elimina después de migrar las 3 filas que
la usan. La fecha `next_payment_due` se queda en el perfil como caché derivado y
sigue siendo legible por el alumno, que es información sobre su propia cuota.

## 2.bis Mapa del rename (D7)

`end_date` significa cierre real de la asignación. Puntos de contacto a migrar a
`closed_at` en el mismo commit que la v48:

| Archivo | Qué hace con la columna |
|---|---|
| `plans/pages/StudentPlansTab.jsx` | escribe el cierre al reemplazar / completar, lo limpia al reactivar, lo muestra en la fila |
| `plans/assignmentHelpers.js` | `select` de asignaciones, mapeo `endDate`, recorte de ventana |
| `dashboard/alerts.js` | **cambia de columna**: pasa a `expected_end_date` |
| `dashboard/hooks/useCoachAlerts.js` | `select` |
| `dashboard/hooks/useCoachDashboardFilters.js` | `select` |
| `dashboard/hooks/useCoachCalendarData.js` | `select` + filtro `or(...)` de ventana |
| `dashboard/calendarLogic.js` | evento `plan_end` → **pasa a `expected_end_date`**; el recorte de ventana sigue con el cierre |
| `dashboard/components/UpcomingEvaluations.jsx` | `select` |
| `dashboard/components/StudentPanel.jsx` | lectura |
| `reports/fetchReportData.js`, `reports/reportEngine.js` | **siguen con el cierre real** (D2), solo cambia el nombre |
| `components/SendToStudentModal.jsx` | vencimiento del envío |
| `notifications/utils/resolveNotificationText.js` | payload `end_date` de `plan_expiring` → **pasa a la fecha esperada** |
| tests de los anteriores | fixtures |

La RPC `assign_template_to_student` conserva el parámetro `p_end_date` (cierre) en
la v48 y se renombra a `p_closed_at` recién en la v49, junto con el borrado de la
columna, para no tener que coordinar RPC y bundle a la vez.

---

## 3. Modelo de datos

### 3.1 Vigencia del plan (etapa A)

```sql
alter table plan_assignments
  add column expected_end_date  date,
  add column expected_end_source text not null default 'derived'
    check (expected_end_source in ('derived','manual','backfill'));
```

- `derived` → la recalcula el trigger ante cualquier cambio de `start_date` o
  `plan_id`.
- `manual` → la fijó la coach; el trigger no la toca nunca más.
- `backfill` → la puso la migración; se comporta como `derived` pero la UI la
  muestra como estimada.

Trigger `trg_pa_sync_expected_end` BEFORE INSERT OR UPDATE OF
`start_date, plan_id, expected_end_date`:

- si `expected_end_source <> 'manual'` → recalcula desde `duration_weeks`
  (null si el plan no tiene duración);
- si la escritura trae `expected_end_date` explícita y distinta de la derivada →
  marca `expected_end_source = 'manual'`.

`assign_template_to_student` no necesita parámetro nuevo: el trigger completa la
fecha con la duración del clon. El parámetro existente `p_end_date` sigue
significando cierre y en la práctica se sigue llamando con `null`.

> ⚠️ `assign_template_to_student` clona con **lista explícita de columnas**
> (regla ya documentada en `block-model-impact-analysis`). Toda columna nueva de
> `plan_blocks` / `plan_exercises` debe sumarse ahí. Acá no aplica porque las
> columnas nuevas son de `plan_assignments`, que se inserta aparte.

### 3.2 Pagos (etapa B)

```sql
create table payments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references profiles(id) on delete restrict,
  coach_id      uuid not null references profiles(id) on delete restrict,
  paid_on       date not null default current_date,
  period_start  date not null,
  period_end    date not null,
  amount        numeric(12,2),
  currency      text not null default 'ARS',
  method        text,
  notes         text,
  source        text not null default 'coach'
                  check (source in ('coach','backfill')),
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (period_end >= period_start),
  exclude using gist (
    student_id with =,
    daterange(period_start, period_end, '[]') with &&
  )   -- D8: requiere `create extension if not exists btree_gist`
);
```

Claves propias, siguiendo la regla: el pago guarda **su** `coach_id`, no lo
deduce de `profiles.coach_id`, que puede cambiar mañana y reescribiría la
historia. `RESTRICT` en las dos FK: un pago sin alumno no es nada, así que el
alumno no se borra, se desactiva (ya existe `profiles.active`).

Ciclo declarado en el perfil, para proponer el período siguiente:

```sql
alter table profiles
  add column payment_cycle_days integer;  -- null = sin ciclo fijo
```

Trigger `trg_payments_sync_profile` (AFTER INSERT/UPDATE/DELETE) mantiene el
caché:

- `profiles.last_payment_date = max(paid_on)`
- `profiles.next_payment_due  = max(period_end) + 1`

El UPDATE sobre `profiles` lo hace el coach, así que `fn_notify_profile_change`
corta temprano (`v_changer = coach_id`) y no genera notificaciones de rebote.
Igual conviene respetar el GUC `app.bulk_maintenance` en el backfill.

### 3.3 RLS

`payments`: una sola política, `coach_manage_own_payments`, `ALL`, con
`is_coach() and coach_id = auth.uid()`. **Sin política para el alumno**, o sea
que no ve ni una fila.

Por D9, `profiles.payment_notes` se migra a `payments.notes` y **se elimina** en
la etapa B: mientras exista, la política `select_own_profile` deja que el alumno
lea las notas que la pantalla llama "privadas". `next_payment_due` se queda como
caché y sigue siendo legible por el alumno, que es información sobre su propia
cuota.

### 3.4 Backfill

- 24 asignaciones activas con duración → `expected_end_date` derivada,
  `expected_end_source = 'backfill'`.
- 8 perfiles con datos de pago → una fila en `payments` con
  `period_start = last_payment_date`, `period_end = next_payment_due - 1`,
  `amount = null`, `notes = payment_notes`, `source = 'backfill'`.
- Ensayo obligatorio con `BEGIN` + `DO` + `RAISE EXCEPTION` antes de aplicar
  (receta de `auditoria-fks-tablas-de-hechos`).

---

## 4. UX

**Dos semáforos hermanos, nunca idénticos.** Mismos cuatro colores, iconografía
distinta: calendario para el plan, círculo/billete para el pago. Dos badges
iguales uno al lado del otro se leen como uno solo.

| | Plan | Pago |
|---|---|---|
| Función | `getPlanExpiryStatus(assignment)` | `getPaymentStatus(student)` (ya existe) |
| Estados | vigente · vence pronto (≤7d) · vencido · sin fecha (plan abierto) | al día · vence pronto · vencido · sin registro |
| Fuente | `plan_assignments.expected_end_date` | `profiles.next_payment_due` (caché de `payments`) |

- **Ficha del alumno**: dos bloques hermanos, *Plan* (vigencia, fecha, "estimada"
  si es backfill, botón cambiar fecha) y *Pagos* (último pago, próximo
  vencimiento, historial desplegable, botón registrar pago).
- **Editor de asignación**: campo "Vence el" prellenado en gris con la fecha
  derivada y la leyenda "8 semanas desde el inicio"; link *Cambiar fecha* la
  vuelve manual; link *Volver a la fecha calculada* deshace.
- **Lista de Alumnos**: el chip de plan pasa de binario a temporal
  ("Con plan · vence 12/09"); filtros nuevos *plan por vencer* y *plan vencido*
  junto a los de pago que ya existen.
- **Dashboard**: `computePlanExpiringSoon` empieza a funcionar leyendo
  `expected_end_date`; la tarjeta ya está escrita.
- **Calendario mensual**: `plan_end` pasa a `expected_end_date` (evento futuro,
  que es lo que el coach necesita ver) y convive con `payment_due`, con marcas
  distintas.
- **Registrar pago**: fecha, período cubierto (propuesto por `payment_cycle_days`
  o por el período anterior), monto opcional, medio, nota. Si hay plan activo que
  vence antes del fin del período pagado, checkbox desmarcado
  *"Extender la vigencia del plan hasta el DD/MM"*.

---

## 5. Orden de trabajo

1. **Etapa A — vigencia del plan.** Migración + trigger + backfill + `status.js`
   + ficha + lista + dashboard + calendario. Cierra sola y es verificable.
2. **Etapa B — pagos.** Tabla + RLS + trigger de caché + backfill + bloque de
   pagos con historial.
3. **Etapa C — enganche opcional** al registrar un pago.
4. **Etapa D — notificaciones.** Reapuntar el cron a `expected_end_date`, solo
   coach (D5); el aviso al alumno queda apagado hasta que Anto revise el texto.

## 6. Decisiones abiertas

Ninguna del diseño inicial: las tres que quedaban se cerraron como D7, D8 y D9
(10/09/2026). Queda por definir, ya en la etapa B, si el monto es obligatorio o
sigue siendo opcional cuando la coach registra el pago.
