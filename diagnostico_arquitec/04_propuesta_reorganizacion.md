# Propuesta de reorganización — gym_app

**Fecha:** 2026-05-20
**Insumo:** `03_auditoria_estructura_2026-05-20.md`
**Estado:** PROPUESTA. Ningún cambio aplicado todavía. Cada bloque está pensado para que puedas decir "sí / no / parcial" por separado.
**Principio rector:** mantener el espíritu de los cinco principios que ya quedaron escritos en `README.md` del refactor de BD (no eliminar, atacar síntoma + raíz, atomicidad, coordinación explícita, auditar después de actuar).

---

## 0. Cómo leer este documento

Cada propuesta tiene:

- **Qué cambia** — la modificación concreta.
- **Por qué** — el problema que resuelve.
- **Costo** — cuánto trabajo / riesgo implica.
- **Recomendación** — orden sugerido y dependencias.

Las **Tier 1** son de bajo riesgo / alto retorno y se pueden encarar esta semana sin miedo. Las **Tier 2** son refactors estructurales que conviene hacer en bloques aislados. Las **Tier 3** son apuestas a más largo plazo.

---

## TIER 1 — Cambios de bajo riesgo / alto retorno (1-2 días)

### 1.1 Reescribir `SETUP.md` con la realidad

- **Qué cambia:** reemplazar `SETUP.md` por una versión que documente el flujo real (Vite + React, Supabase con migraciones reales, Edge Functions, push, intake, follow-up forms, notes). Inspirado en el `SETUP.md` de clubes deportivos.
- **Por qué:** quien lee hoy `SETUP.md` ejecuta pasos que fallan (busca `schema.sql` y `seed.sql` que no existen) y no se entera de la mitad de las features.
- **Costo:** 1-2 horas. Ningún riesgo de regresión.
- **Recomendación:** prioridad 1. Si querés conservar el viejo, archivarlo como `SETUP_legacy_v1.md`.

### 1.2 Versionar `diagnostico_arquitec/` (commit ya)

- **Qué cambia:** `git add diagnostico_arquitec/ && git commit`. 17 archivos sin tracking pasan al repo.
- **Por qué:** todo el contexto del refactor de BD vive ahí. Si la carpeta se pierde, perdés meses de decisión documentada.
- **Costo:** 5 min.
- **Recomendación:** sin discusión.

### 1.3 Borrar archivos sueltos en raíz

- **Qué cambia:** eliminar `.env.local.tmp`, `commit_message_v24.txt`. (Los 43 vite timestamps ya fueron borrados en esta pasada.)
- **Por qué:** ruido visual en cada `ls`. Riesgo cero (los valores del `.tmp` son literalmente `x` y el commit ya está en git).
- **Costo:** 30 segundos.
- **Recomendación:** hacelo desde Finder o `rm` con tu user; el sandbox no tiene permiso.

### 1.4 Agregar path aliases en Vite

- **Qué cambia:** `vite.config.js` queda:

  ```js
  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'
  import path from 'node:path'

  export default defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@lib': path.resolve(__dirname, 'src/lib'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@pages': path.resolve(__dirname, 'src/pages'),
        '@hooks': path.resolve(__dirname, 'src/hooks'),
      },
    },
  })
  ```

- **Por qué:** los 19 archivos con `../../../` quedan legibles. Refactorizar más fácil después.
- **Costo:** 10 minutos por el cambio + un rato para reemplazar imports en archivos críticos (no urgente, se hace gradualmente).
- **Recomendación:** sumar el alias YA. Convertir imports cuando se toque cada archivo, no en una sola pasada masiva.

### 1.5 Convención de migraciones de acá en adelante

- **Qué cambia:** las migraciones futuras se nombran `YYYYMMDDHHMMSS_NN_descripcion.sql` y viven en `supabase/migrations/` (no más en `supabase/` flat). Lo viejo se respeta como está.
- **Por qué:** convención CLI estándar, consistente con clubes deportivos.
- **Costo:** cero. Solo cambia el naming a partir de mañana.
- **Recomendación:** dejar el resto sin renombrar para no romper historial mental. Cuando el equipo (vos) ya esté en modo CLI, considerar consolidar.

### 1.6 Recuperar el SQL de `multiclub_*` desde Supabase

- **Qué cambia:** bajar el contenido de las cuatro migraciones (`multiclub_01_core_tables`, `multiclub_02_trigger_and_rls_helpers`, `multiclub_03_rls_users`, `rollback_multiclub_tables`) y guardarlas en `diagnostico_arquitec/legacy_multiclub_experiment/` con un `README.md` explicando que se aplicaron 19/05 y se rollearon 25 min después.
- **Por qué:** sin ese SQL no podés reproducir el estado, ni saber qué probaste, ni evitar repetir el experimento idéntico.
- **Costo:** 15 minutos.
- **Recomendación:** hacerlo aunque no se siga la idea de multiclub — es trazabilidad.

### 1.7 Fix mecánico de las 6 funciones con `search_path` mutable

- **Qué cambia:** una migración nueva que hace `ALTER FUNCTION … SET search_path = public, pg_temp` sobre las 6 funciones del linter (`migrate_assignment_off_template`, `update_wellbeing_updated_at`, `_intake_map_nivel`, `_intake_parse_frecuencia`, `enforce_follow_up_template_limit`, `update_updated_at`).
- **Por qué:** la auditoría del 16/05 dejó 0 funciones con esa grieta; aparecieron 6 nuevas creadas después. Hay que cerrar el agujero.
- **Costo:** 20 minutos.
- **Recomendación:** aprovechar y dejar el patrón documentado en un `supabase/CONVENTIONS.md` (toda función `SECURITY DEFINER` debe declarar `SET search_path = …`).

---

## TIER 2 — Refactors estructurales (1-2 semanas, en bloques aislados)

### 2.1 Mover `intake-form/` adentro de `src/`

- **Qué cambia:** `intake-form/` (afuera de `src/`) → `src/features/forms/intake/`. Ajustar los 7 imports `../../../intake-form/…` a `@features/forms/intake/…`. Mover `intake-form/supabase/migration_intake_form.sql` a `supabase/migrations/legacy/`.
- **Por qué:** la carpeta hermana es la mayor anomalía estructural del repo y de la confusión.
- **Costo:** 1-2 horas (mover + buscar/reemplazar + build smoke).
- **Recomendación:** hacerlo el mismo día que se sumen los aliases (TIER 1.4).

### 2.2 Reorganizar `src/` por dominio (gradual)

Hoy `src/` es por tipo:

```
src/
├── components/     {dashboard, layout, notes, notifications, plan, wellbeing, workout}
├── pages/          {coach/, student/}
├── hooks/          {useCoachAlerts, useCoachCalendarData, useNoteThreadUnread, useNotes, useNotifications}
├── utils/          {assignmentHelpers, calendarLogic, …}
├── services/       {pushService}
├── lib/            {notes, supabase}
└── contexts/       {AuthContext}
```

Propuesta — pasar a `src/` por feature (siguiendo el espíritu del proyecto de clubes):

```
src/
├── app/                          App.jsx, main.jsx, router, providers
├── shared/
│   ├── components/               layouts, NotificationBell, etc.
│   ├── hooks/                    useNotifications
│   ├── lib/                      supabase.js
│   └── utils/                    errorHelpers, etc.
├── features/
│   ├── auth/                     AuthContext, LoginPage
│   ├── plans/                    plan editor, blocks, plan helpers
│   ├── workouts/                 TodayWorkoutPage, EvalWorkoutPage, RPEScale, sessions
│   ├── exercises/                ExercisesLibraryPage, exercise utils
│   ├── students/                 StudentsPage, StudentDetailPage + tabs
│   ├── progress/                 ProgressPage, calendarLogic
│   ├── notes/                    notes lib + UI + hook
│   ├── notifications/            notifications data + bell
│   ├── forms/
│   │   ├── intake/               (lo que hoy es intake-form/)
│   │   └── follow-up/
│   ├── wellbeing/
│   └── evaluations/
└── pages/                        opcional — sólo si el router queda separado de las features
```

- **Por qué:** los archivos relacionados quedan juntos. Cada feature es un módulo con sus propios datos, componentes, hooks y, eventualmente, tests. Refactorizar uno a la vez se vuelve trivial. La curva de quien entre al repo baja drásticamente.
- **Costo:** 1-2 días si se hace una feature por commit (recomendado), no en una sola pasada gigante.
- **Recomendación:** **hacerlo gradual**. Mover una feature por vez (sugiero arrancar por `notes/` o `forms/` que ya están relativamente delimitadas). Cada movimiento es un commit. Si rompe algo, se revierte ese commit y listo.

### 2.3 Partir los archivos gigantes (`TodayWorkoutPage`, `EvalWorkoutPage`)

- **Qué cambia:** extraer un hook común `useWorkoutSession(planId, mode)` con la lógica compartida (carga del plan del día, manejo de sesiones, lectura/escritura de logs, RPE, notas). Dejar los componentes solamente con render.
- **Por qué:** son 2080 + 1855 = 3935 líneas con duplicación. El test mental para tocar uno es enorme.
- **Costo:** 1 día. Requiere ojos frescos.
- **Recomendación:** después de 2.2, cuando ambas páginas estén en `features/workouts/`.

### 2.4 Smoke tests de RLS

- **Qué cambia:** un `supabase/tests/rls_smoke_tests.sql` que abra un `SET LOCAL ROLE`/`SET request.jwt.claims` simulando coach/student/anon y verifique que cada tabla devuelve lo esperado. Mismo formato `NOTICE: OK test N …` que usa clubes deportivos.
- **Por qué:** 24 tablas con RLS, 6 RLS policies ajustadas en el refactor, cero verificación automatizada. Una regresión silenciosa hoy se descubre cuando se rompe en prod.
- **Costo:** 2-3 horas para una primera versión que cubra los casos críticos (profiles, plans, plan_assignments, workout_logs, notes, notifications).
- **Recomendación:** dejar el archivo aunque sea con 5-6 smoke tests al principio. Crece con el tiempo.

### 2.5 Borrar `_modificaciones/` (o moverlo a `diagnostico_arquitec/legacy/`)

- **Qué cambia:** mover `migration_borg_per_day.sql`, `migration_wellbeing.sql`, `add_payment_tracking.sql` y `TodayWorkoutPage.jsx` a `diagnostico_arquitec/legacy/_modificaciones/` con un `README.md` que diga: "estos archivos fueron ensayo previo a las migraciones aplicadas; el SQL ya pasó por Supabase, el JSX no se usa".
- **Por qué:** `_modificaciones/` está al lado de `src/` y `supabase/` como si fuera tercera carpeta de trabajo, pero ya es solo memoria.
- **Costo:** 15 minutos.

### 2.6 README en subcarpetas clave

- **Qué cambia:** `src/README.md`, `supabase/README.md`, `src/features/notes/README.md`, etc., cada uno con 10-30 líneas que cuenten qué hay y qué no.
- **Por qué:** te lo agradecés en 3 meses.
- **Costo:** 30 minutos por carpeta.

---

## TIER 3 — Apuestas a largo plazo (1-3 meses)

### 3.1 Linter + formatter + pre-commit

- **Qué:** `eslint` + `prettier` (config básica) + `husky` + `lint-staged`.
- **Costo:** 1-2 horas la primera setup, después corre sólo.
- **Por qué:** 30K LOC sin lint es un mes-llave que tarde o temprano explota.

### 3.2 Tests de UI mínimos (Vitest + RTL)

- **Qué:** `vitest` (ya usás Vite) + `@testing-library/react` + 5 tests críticos: login, plan create, log save, note create, notification bell.
- **Costo:** 1 día.
- **Por qué:** misma razón que RLS smoke tests pero para el front.

### 3.3 Migrar gradualmente a TypeScript

- **Qué:** activar TS en modo `allowJs`, ir convirtiendo archivo por archivo empezando por `lib/` y `utils/`.
- **Costo:** 1 semana para llegar a 50%, 1 mes para llegar a 90%.
- **Por qué:** los archivos de 1000+ líneas son el escenario clásico donde TS paga por sí mismo. No es urgente, pero está sobre la mesa.

### 3.4 Documentar el modelo (ER + API)

- **Qué:** generar `er-diagram.mermaid` desde el schema vivo (vía `pg_dump` + script o herramienta) y un `docs/api-rpcs.md` listando cada RPC con su firma, quién la puede llamar y para qué se usa.
- **Costo:** medio día.
- **Por qué:** ya tenés 95 RPCs `SECURITY DEFINER` y nadie va a leer las 47 migraciones para entenderlos.

### 3.5 Política Web Push real

- **Qué:** decidir si push se mantiene como feature o se da de baja. Hoy `push_subscriptions` tiene 0 filas → la feature está en standby. Si se mantiene, completar el flujo de prompt al alumno; si no, considerar dropear la tabla.
- **Costo:** depende de la decisión.

---

## Recomendación final — orden sugerido

1. **Hoy / mañana:** TIER 1.1 (SETUP), 1.2 (commit diagnóstico), 1.3 (borrar basura), 1.4 (aliases), 1.6 (recuperar multiclub).
2. **Esta semana:** TIER 1.5 (convención migraciones), 1.7 (fix search_path), 2.1 (mover intake-form), 2.5 (mover _modificaciones).
3. **Próximas 2 semanas:** TIER 2.2 (reorg gradual por feature), 2.6 (READMEs).
4. **Cuando duela:** TIER 2.3 (partir archivos gigantes), 2.4 (smoke tests RLS).
5. **Cuando sea estratégico:** TIER 3.

---

## Lo que sigue intocable

- La carpeta de `Aplicación para clubes deportivos`. No se mira para copiar específicos; sólo como referencia de patrones.
- El historial de migraciones aplicadas en Supabase. No renombrar nada que ya esté registrado.
- Cualquier RLS policy o trigger productivo, sin pasar antes por un handoff explícito como los que tenés en `diagnostico_arquitec/handoff_*_para_front.md`.
