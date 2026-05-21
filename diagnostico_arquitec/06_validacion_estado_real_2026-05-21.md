# Validación estado real vs documentación — gym_app

**Fecha:** 2026-05-21
**Insumo:** auditorías `02_*`, `03_*`, `04_*`, handoff `05_*`.
**Objetivo:** pasada externa que **mira lo que realmente hay** (repo + Supabase + app prod), lo compara con lo que la doc dice, y deja constancia de los puntos en que la doc miente o se quedó vieja.
**Método:** `git status`/`git log` sobre `~/Desktop/gym_app/gym_app`, MCP Supabase sobre `bvexjanqmfypmtgoapbt`, browser `francellone` sobre `https://gym-appv2.vercel.app/`.

---

## TL;DR

El refactor está casi todo aplicado y commiteado (commit `c403764`, 20/05 23:11 UTC-3). La estructura del front quedó como dice el handoff. Pero hay **siete divergencias entre doc y realidad**, dos de ellas con olor a riesgo:

- **CRÍTICA:** 5 tablas en `archive.*_notes_20260517` quedaron con **RLS deshabilitada**. Cualquiera con el anon key puede leerlas/modificarlas. Ninguna doc lo menciona.
- **MEDIA:** `vite.config.js` tiene 4 aliases fantasma (`@pages`, `@hooks`, `@contexts`, `@services`) apuntando a directorios que ya no existen, y el `src/README.md` los recomienda. Bomba de tiempo silenciosa.

El resto son inconsistencias menores que conviene corregir para que la próxima auditoría sea más rápida.

---

## 1. Lo que validé — corte por corte

### 1.1 Repo (host: `~/Desktop/gym_app/gym_app`)

| Check | Resultado |
|---|---|
| `git status` limpio | ✅ Sin pendientes |
| Branch | `main` |
| Último commit | `c403764 refactor: reorganización completa de src/ a features/ + cleanup repo + Supabase fixes` |
| `src/features/` | 12 directorios, coincide con el handoff |
| `src/{components,utils,lib}` | Sólo lo transversal (layouts, `SendToStudentModal.jsx`, `errorHelpers.js`, `supabase.js`) |
| Total JS/JSX en `src/` | 92 archivos |
| `src/pages/`, `src/hooks/`, `src/contexts/`, `src/services/` | **No existen** (correcto, todo migrado) |

### 1.2 Supabase (`bvexjanqmfypmtgoapbt`)

| Check | Resultado |
|---|---|
| Migraciones registradas | 48 (la doc del 20/05 decía 47; +1 por `20260521003919_fix_search_path_six_functions`) |
| Tablas en `public` | 24, todas con RLS habilitada |
| Tablas en `archive` | 7 — **5 sin RLS** (ver §3.1) |
| Edge functions | 2 activas (`create-student` v11, `notify-cron` v8) |
| Advisors security | 97 entradas: 0 ERROR, 95 WARN, 2 INFO |
| Funciones con `search_path` mutable | **0** (la doc del 20/05 decía 6; fix aplicado correctamente) |
| `auth_leaked_password_protection` | Sigue WARN (no se habilitó en Dashboard) |

### 1.3 App productiva (`https://gym-appv2.vercel.app/coach`)

| Check | Resultado |
|---|---|
| Login coach (Anto) | ✅ funciona, sesión persistida |
| Dashboard render | ✅ Muestra 5 alumnos activos, 25 planes, 65 logs/semana |
| Alertas | ✅ "3 sin entrenar 3+ días", "3 con esfuerzo alto", "1 sin plan activo" |
| Calendario mensual | ✅ Render OK |
| Actividad reciente | ✅ últimos logs de Ana Moran 19/05 |
| Navegación sidebar | ✅ 7 links: Dashboard, Alumnos, Planes, Ejercicios, Evaluaciones, Formulario alta, Seguimiento |
| Errores en consola | 0 |
| Warnings en consola | 3 benignos: `Multiple GoTrueClient instances` (esperable por `supabaseIsolated`) + 2 future flags de React Router v7 |

---

## 2. Tabla de divergencias doc ↔ realidad

| # | Doc dice | Realidad | Severidad |
|---|---|---|---|
| 1 | "Las 5 tablas en `archive` están bien" (auditoría `03_*` §4 menciona sólo `plan_assignments_backup_20260508` y no marca problema en las 5 backups de notas) | **5 tablas `archive.*_notes_20260517` con RLS DESHABILITADA**: contienen 66 filas con notas históricas que el anon key puede leer | 🔴 ALTA |
| 2 | Handoff `05_*` §"Estado del repo" celebra "Vite con path aliases (`@`, `@lib`, `@utils`, `@components`, `@pages`, `@hooks`, `@contexts`, `@services`)" | **4 de esos 8 alias apuntan a directorios borrados**: `@pages`, `@hooks`, `@contexts`, `@services`. `src/README.md` los recomienda. Si alguien los usa, ESBuild explota silenciosamente | 🟠 MEDIA |
| 3 | Auditoría `03_*` §2: "**No existe** `supabase/schema.sql`. **No existe** `supabase/seed.sql`" | **AMBOS EXISTEN** en el repo desde el `initial commit`. `schema.sql` 280 LOC, `seed.sql` 153 LOC, plus `seed_exercises_videoteca.sql` 174 LOC | 🟡 BAJA (la doc subestimó) |
| 4 | Auditoría `03_*` §1: "no hay path aliases en Vite" | Aliases sí están (`vite.config.js` actualizado el 20/05) — la doc del 20/05 quedó vieja del mismo día | 🟢 cosmética |
| 5 | Auditoría `03_*` §4: "`push_subscriptions` Aún sin alumnos suscritos (0)" | Hoy **3 filas** | 🟢 vida normal |
| 6 | Auditoría `03_*` §3.4: la convención CLI debería ser `supabase/migrations/YYYYMMDDHHMMSS_NN_descripcion.sql` | La nueva migración estrenó la carpeta `supabase/migrations/` pero **sin el sufijo `_NN_`**: `20260521003824_fix_search_path_six_functions.sql`. Inconsistente con la convención propuesta | 🟢 menor (decidir si se sigue `_NN_` o no) |
| 7 | Handoff `05_*` §"Pendiente operativo" #2: "Cleanups manuales acumulados — si quedó alguno sin correr, `git status` te lo va a marcar" | `git status` está **limpio** — Franco ya corrió los `rm` | ✅ resuelto |

---

## 3. Detalle de los hallazgos importantes

### 3.1 🔴 Las 5 tablas `archive.*_notes_20260517` con RLS deshabilitada

Query de evidencia:

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'archive' AND rowsecurity = false;
```

Resultado:

| Tabla | Filas |
|---|--:|
| `archive.profiles_notes_20260517` | 4 |
| `archive.workout_logs_notes_20260517` | 59 |
| `archive.workout_block_logs_notes_20260517` | 1 |
| `archive.eval_responses_comments_20260517` | 0 |
| `archive.evaluation_results_notes_20260517` | 2 |

**Total:** 66 filas con texto libre histórico de notas — comentarios, observaciones, lesiones de los alumnos, archivados durante el refactor m26 (migración `v26d_drop_legacy_notes_columns`).

**Por qué importa:** la advisory de Supabase (`rls_disabled`, level `critical`) las marca como "fully exposed to the anon and authenticated roles used by Supabase client libraries — anyone with the anon key can read or modify every row". El anon key está en la build pública (`https://gym-appv2.vercel.app/`), así que técnicamente cualquiera con DevTools y ganas puede leer esos 66 registros.

**Fix sugerido (DDL):**

```sql
ALTER TABLE archive.profiles_notes_20260517             ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.workout_logs_notes_20260517         ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.workout_block_logs_notes_20260517   ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.eval_responses_comments_20260517    ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.evaluation_results_notes_20260517   ENABLE ROW LEVEL SECURITY;
-- Sin crear policies = nadie (ni anon ni authenticated) lee nada; sólo service_role.
-- Si querés permitir lectura al coach desde la app, agregás policy SELECT con auth.uid().
```

Esto coincide con cómo está `archive.plan_assignments_backup_20260508`: RLS prendida sin policies, sólo accesible vía service_role.

**Recomendación de aplicación:** migración nueva `supabase/migrations/20260521XXXXXX_enable_rls_on_archive_notes_backups.sql`. Si el anon NO necesita acceder (lo más probable: son backups), no hace falta ninguna policy — la RLS habilitada sin policy es deny-by-default.

### 3.2 🟠 Aliases fantasma en `vite.config.js`

Archivo actual:

```js
resolve: {
  alias: {
    '@': path.resolve(__dirname, 'src'),
    '@lib': path.resolve(__dirname, 'src/lib'),
    '@utils': path.resolve(__dirname, 'src/utils'),
    '@components': path.resolve(__dirname, 'src/components'),
    '@pages': path.resolve(__dirname, 'src/pages'),         // ← no existe
    '@hooks': path.resolve(__dirname, 'src/hooks'),         // ← no existe
    '@contexts': path.resolve(__dirname, 'src/contexts'),   // ← no existe
    '@services': path.resolve(__dirname, 'src/services'),   // ← no existe
  },
}
```

Y `src/README.md:45` recomienda usarlos:

> "Imports: preferir aliases `@/`, `@lib/`, `@utils/`, `@components/`, `@pages/`, `@hooks/`, `@contexts/`, `@services/` (definidos en `vite.config.js`)."

Hoy nadie los usa (`grep -r "@pages\|@hooks\|@contexts\|@services" src/` solo matchea la línea del README). Pero apenas alguien tipee `import { useNotes } from '@hooks/useNotes'` por costumbre, el build pasa (Vite resuelve el alias a `src/hooks/`) y falla en runtime con "module not found" porque la carpeta no existe.

**Fix sugerido:**

```js
resolve: {
  alias: {
    '@': path.resolve(__dirname, 'src'),
    '@features': path.resolve(__dirname, 'src/features'),
    '@lib': path.resolve(__dirname, 'src/lib'),
    '@utils': path.resolve(__dirname, 'src/utils'),
    '@components': path.resolve(__dirname, 'src/components'),
  },
}
```

Y actualizar `src/README.md` para que mencione `@features/` en vez de los cuatro fantasmas.

### 3.3 🟡 `supabase/schema.sql` y `seed.sql` existen — la auditoría dijo que no

La auditoría `03_*` los listó como inexistentes y el SETUP nuevo los borra del flujo. Pero **están en el repo desde el `initial commit`**. Contenido:

- `schema.sql` (280 LOC): el DDL inicial — `create extension uuid-ossp`, `create table profiles`, etc. Es el snapshot pre-migraciones.
- `seed.sql` (153 LOC): inserts de ejercicios con placeholder `COACH_USER_ID`.
- `seed_exercises_videoteca.sql` (174 LOC): otros inserts.

**No es que la doc esté "mal" funcionalmente** — el flujo de hoy es migraciones, no `schema.sql`. Pero la auditoría se equivocó al decir que no existen. La verdad útil es: **estos archivos son legado del primer setup, hoy desactualizados, y conviene moverlos a `supabase/legacy/` o borrarlos** para que ningún recién llegado se confunda y los corra.

### 3.4 🟢 Naming de migraciones — inconsistencia menor

La auditoría proponía `YYYYMMDDHHMMSS_NN_descripcion.sql` (con el `_NN_` para ordenar varias del mismo timestamp). La que se estrenó usó `YYYYMMDDHHMMSS_descripcion.sql` (sin `_NN_`). Es la convención del CLI de Supabase real (`supabase migration new`) — más limpio que el `_NN_` propuesto. **Recomendación:** actualizar la convención escrita en `04_propuesta_reorganizacion.md` para sacar el `_NN_` y dejar lo que el CLI genera por default.

---

## 4. Inventario de pendientes vivos (post-validación)

### Inmediatos (esta semana)

1. **Aplicar fix de RLS** en las 5 tablas `archive.*_notes_20260517` (§3.1).
2. **Limpiar `vite.config.js`** y `src/README.md` para sacar los 4 aliases fantasma y sumar `@features` (§3.2).
3. **Decidir destino** de `supabase/schema.sql`, `seed.sql`, `seed_exercises_videoteca.sql` (§3.3): mover a `supabase/legacy/` o borrarlos.
4. **Habilitar `auth_leaked_password_protection`** en Dashboard → Authentication (pendiente desde 16/05).

### Cortos (próximas 2 semanas — siguen del plan original)

5. **Tier 2.3** — partir `TodayWorkoutPage` (2080 LOC) + `EvalWorkoutPage` (1855 LOC) con un hook común `useWorkoutSession(planId, mode)`. Sigue siendo el refactor con mejor ratio.
6. **Tier 3.1** — `eslint` + `prettier` + `husky` + `lint-staged`. 30K LOC sin lint es deuda creciente.

### Estratégicos (mes+)

7. **Tier 3.2** — `vitest` + 5 tests UI críticos (login, plan create, log save, note create, notification bell).
8. **Tier 3.3** — TypeScript gradual empezando por `lib/` y `features/*/helpers.js`.
9. **Tier 3.4** — `er-diagram.mermaid` + `docs/api-rpcs.md` (documentación del modelo).
10. **Revisión uno por uno** de las 47 funciones `SECURITY DEFINER` expuestas a `anon` (`anon_security_definer_function_executable`): para cada una decidir si necesita `REVOKE EXECUTE ON FUNCTION … FROM anon`.

---

## 5. Convenciones a fijar antes de seguir creciendo

(Esto es input para la sección 6 que sigue al próximo doc: cómo manejar el proyecto a escala.)

- **Migraciones nuevas:** `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql` (sin `_NN_`, formato CLI default). Funciones nuevas SIEMPRE con `SET search_path = public, pg_temp`. `SECURITY DEFINER` con `REVOKE EXECUTE … FROM PUBLIC` + `GRANT … TO authenticated` salvo que necesite anon.
- **Archivos legacy en `supabase/`:** todo lo que no esté en `migrations/`, `functions/`, `tests/` y no sea un README, debería estar en `supabase/legacy/` con un README que explique de cuándo es y por qué se preserva.
- **Frontend imports:**
  - Dentro de una feature → relativos (`../api`, `../hooks/useNotes`).
  - Cross-feature → alias absoluto (`@/features/notes/api`).
  - Shared lib/utils → alias (`@/lib/supabase`).
  - `@features` como atajo opcional para `@/features`.
- **Backups de tablas:** cuando se crea un backup en `archive.*`, **siempre** habilitar RLS (aunque sea sin policies). Documentarlo en el comentario de la migración.
- **profiles:** nunca DELETE — siempre `active=false` + `is_test=true`.
- **Plan_assignments:** no INSERT directo para plan_id que sea plantilla → RPC `assign_template_to_student`.
- **Crear alumnos:** sólo vía edge function `create-student` con `supabaseIsolated`.

---

## 6. Lo que NO se tocó en esta pasada

- Nada del repo de clubes deportivos (sigue intacto, sólo se usa como referencia conceptual).
- No se aplicó ninguna migración a Supabase ni se modificó código del front. Todo este documento es **diagnóstico**; las acciones quedan para que las decidas y apliques vos.
- No se borraron los 11 nuevos `vite.config.js.timestamp-*.mjs` que Vite recrea cada `dev` — están gitignored, son ruido visual, los podés borrar con `rm vite.config.js.timestamp-*.mjs` cuando quieras.
