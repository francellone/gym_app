# Plan Tier 3.2 — Vitest + 5 tests UI mínimos

Fecha: 2026-05-21 (tarde-noche). Continuación del handoff `10_*`. Antes de tocar código, validamos estado y proponemos tres caminos.

---

## 1. Verificación de estado (lo que coincide con el handoff)

| Chequeo | Esperado por handoff | Realidad observada | OK |
|---|---|---|:--:|
| Branch | `main`, working tree clean, último commit es el handoff `10_*` | `e752fb9 docs(handoff): cierre sesion 21/05 PM` | ✅ |
| `package.json` | sin vitest/testing-library/jsdom | confirmado, slate limpio | ✅ |
| Proyecto Supabase | `bvexjanqmfypmtgoapbt`, sa-east-1, Postgres 17.6 | `ACTIVE_HEALTHY`, 17.6.1.084 | ✅ |
| Conteos prod | 5 alumnos, 25 planes, 460 logs, 102 notas, 79 notifs | profiles=14 (5 alumnos + coaches + tests), plans=26, plan_assignments=18, workout_logs=460, notes=102, notifications=79 | ✅ |
| Browser francellone | logueado como `anto.au.almanza@gmail.com` en `/coach` | sidebar Dashboard/Alumnos/Planes/Ejercicios/Evaluaciones/Formulario alta/Seguimiento/Notif + Cerrar sesión. 5 cards de alumno visibles. | ✅ |
| Migrations recientes | `20260521003919 fix_search_path_six_functions` + `20260521135103 enable_rls_on_archive_notes_backups` aplicadas | confirmadas en `supabase_migrations.schema_migrations` | ✅ |
| Multiclub rollback | tablas borradas | `information_schema.tables` no devuelve nada con `multi%` o `%club%` | ✅ |
| `archive.*_notes_20260517` | RLS habilitada, deny-by-default (sin policies) | 5 tablas con `row_security=true`, `pg_policies` no devuelve filas para ninguna | ✅ |

---

## 2. Cosas raras encontradas (advertencias para Franco)

### 🟠 2.1 — `archive.student_profiles` viola la convención del handoff

El handoff dice:
> Backups en `archive.*` SIEMPRE con RLS habilitada. Sin policies = deny-by-default, solo `service_role`.

La realidad: existe `archive.student_profiles` con:
- 4 filas vivas
- 13 columnas operacionales: `objetivo_principal`, `nivel_experiencia`, `frecuencia_semanal`, `lugar_entrenamiento`, `tiene_lesiones`, `patologias`, `nombre`, `apellido`, etc. → es perfil **extendido** de alumno (data del intake)
- 2 policies activas:
  - `coach_read_own_student_profiles` (SELECT) — `is_coach() AND EXISTS(SELECT 1 FROM profiles WHERE id=student_id AND coach_id=auth.uid())`
  - `student_manage_own_student_profiles` (ALL) — `student_id = auth.uid()`

Esto no es un backup: es una **tabla operacional mal ubicada en `archive`**. Riesgos:
- Los `rls_smoke_tests.sql` no la cubren (los tests viven en `supabase/tests/` con scope `public.*`).
- Si alguien hace un `DROP SCHEMA archive CASCADE` para limpiar backups, se llevan data viva.
- Hay una tercera tabla, `archive.plan_assignments_backup_20260508`, que sí parece un backup real (sin policies, `row_security=true`).

**No bloquea Tier 3.2**, pero merece atención propia. Recomendación: mover a `public.student_profiles` con una migration `20260521_NN_move_student_profiles_out_of_archive.sql` (rename + ajustar refs en el front).

### 🟡 2.2 — Conteo de "RPCs anon" en el handoff: 47 → realidad 27 callable

El handoff dice "47 RPCs expuestas a `anon`". La query real:

```sql
SELECT (kind), COUNT(*)
FROM (...) GROUP BY 1;
-- callable_rpc: 27 (24 SECURITY DEFINER + 3 invoker)
-- trigger_fn : 27 (no son llamables desde PostgREST)
```

Las **27 callable** son las que importan para hardening. Varias son legítimamente públicas (`_intake_*` para el form de alta sin login, `process_intake_submission`). Cuando llegue Tier "RPC anon hardening", el universo real es ~24, no 47.

### 🟢 2.3 — Sin cambios estructurales detectados desde el handoff

`git status` clean, `git log` muestra `e752fb9` (handoff PM) como HEAD, no hay commits intermedios. Todo lo demás del handoff `10_*` es válido.

---

## 3. Decisión de stack — Tier 3.2

Tres caminos, con honestidad sobre trade-offs:

### Opción A — Vitest + RTL + manual mocks de Supabase ⭐ recomendada

```
devDependencies a sumar:
  vitest                         ^2.1
  @vitest/ui                     ^2.1   (opcional, dev only)
  jsdom                          ^25
  @testing-library/react         ^16
  @testing-library/jest-dom      ^6
  @testing-library/user-event    ^14
```

Archivos a crear:
- `vitest.config.js` — environment jsdom, setupFiles, alias compartidos con `vite.config.js`.
- `src/test/setup.js` — importar `@testing-library/jest-dom`, mocks globales (matchMedia, IntersectionObserver).
- `src/test/mocks/supabase.js` — factory `createSupabaseMock()` que devuelve un objeto chaineable (`from().select().eq().maybeSingle()` etc.) controlable por test. Patrón ya probado en otros repos.
- 5 tests scoped:

| # | Test | Tipo | LOC estimado | Cubre |
|---|------|------|--------------|-------|
| 1 | `src/features/auth/pages/LoginPage.test.jsx` | component | ~60 | render del form, submit válido llama `signIn`, error muestra "Email o contraseña incorrectos" |
| 2 | `src/features/notes/api.test.js` | unit puro | ~80 | `createNote` valida body vacío, `contextType='free'` nulifica `context_id`, `coach_private` rechaza student. Es la mejor pieza para testear sin UI. |
| 3 | `src/features/notifications/hooks/useNotifications.test.jsx` | hook | ~90 | carga inicial, `markAsRead` optimistic + rollback en error, badge count se actualiza |
| 4 | `src/features/plans/assignmentHelpers.test.js` | unit puro | ~50 | funciones puras existentes — ningún mock necesario |
| 5 | `src/features/workouts/saveWorkoutLog.test.js` | integration light | ~70 | wrap del `supabase.rpc('save_workout_log', ...)` en un helper testeable; validar shape de args (16 params) |

Modificaciones a archivos existentes:
- `package.json` — sumar scripts `test`, `test:ui`, `test:run`, deps dev.
- `eslint.config.js` — incluir `**/*.test.{js,jsx}` en el scope con globals de vitest (`describe`, `it`, `expect`, `vi`).
- `.husky/pre-commit` — opcional: agregar `npm run test:run` (rápido, ~3-5s con 5 tests). Si baja demasiado la velocidad del commit, dejarlo solo para CI.

**Pros**: rápido (~3s todos los tests), 0 infra de red, fácil de extender, no rompe nada del dev loop.
**Contras**: los mocks chainables de supabase-js requieren cuidado (`.eq().maybeSingle()` etc.) — si el front cambia el patrón de query, hay que actualizar el mock factory.

**Esfuerzo**: 1 día (8h aprox). Incluye scaffold + los 5 tests + integración con husky.

### Opción B — Vitest + RTL + MSW (Mock Service Worker)

Igual que A pero los mocks son a nivel HTTP — interceptan `fetch` a la URL de Supabase REST y devuelven JSON. Más fiel a la realidad (los tests dejan de saber que existe `supabase-js`).

**Pros**: tests más robustos a refactors del client; reutilizables para futuros tests de integración.
**Contras**: ~2 días por la curva de MSW + setup de handlers por endpoint; overkill para 5 tests smoke.

Recomendación: **no ahora, sí cuando tengamos 20+ tests** y la complejidad de mantener mocks chainables empiece a doler.

### Opción C — Pausar 3.2, atacar primero cleanup de warnings (106 → ~40)

Atacar los warnings primero porque:
- `npm run lint:fix` resuelve los `no-unused-vars` (los más triviales) en 1 comando, sin tocar lógica.
- Los `react-hooks/immutability` se fixean convirtiendo `async function X()` declaradas post-`useEffect` en `const X = useCallback(...)`.
- Los `react-hooks/exhaustive-deps` se evalúan caso por caso (varios son justificados con `// eslint-disable-next-line`).

**Pros**: 1-2h, gana señal en el lint, baja ruido para futuras sesiones.
**Contras**: justamente los `exhaustive-deps` que se "fixean" pueden meter bugs sutiles (cambio de timing de `useEffect`) sin tests debajo que avisen. Acá entra la lección 5 del handoff (el pre-commit cazó `SCORES not defined`): los warnings de hooks **son la categoría donde un test smoke salva la cara**.

Por eso recomiendo invertir el orden: A primero, luego cleanup, luego docs.

---

## 4. Plan A en detalle (si decís "dale A")

### Paso 1 — Setup base (sin tocar tests todavía)

```bash
cd ~/Desktop/gym_app/gym_app
npm install --save-dev vitest@^2.1 jsdom@^25 \
  @testing-library/react@^16 \
  @testing-library/jest-dom@^6 \
  @testing-library/user-event@^14
```

Crear `vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@features': path.resolve(__dirname, './src/features'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@components': path.resolve(__dirname, './src/components'),
    },
  },
})
```

Crear `src/test/setup.js`:
```js
import '@testing-library/jest-dom/vitest'

// matchMedia mock — varios componentes lo consultan
window.matchMedia ||= (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
})
```

Agregar scripts en `package.json`:
```json
"test": "vitest",
"test:run": "vitest run",
"test:ui": "vitest --ui"
```

Actualizar `eslint.config.js` para que los `.test.*` no marquen `describe`/`it`/`expect` como undefined.

### Paso 2 — Mock factory de Supabase

`src/test/mocks/supabase.js`:
```js
import { vi } from 'vitest'

export function createSupabaseMock() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: undefined,
  }

  return {
    from: vi.fn(() => chain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
    },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    _chain: chain,
  }
}
```

### Paso 3 — Los 5 tests (en orden de menor a mayor complejidad)

1. **`src/features/plans/assignmentHelpers.test.js`** — empezar acá porque son funciones puras, sin mock. Build de confianza.
2. **`src/features/notes/api.test.js`** — siguiente más simple: API layer, mock supabase, sin React.
3. **`src/features/notifications/hooks/useNotifications.test.jsx`** — primer hook con `renderHook`.
4. **`src/features/auth/pages/LoginPage.test.jsx`** — primer component test full.
5. **`src/features/workouts/saveWorkoutLog.test.js`** — el más invasivo; requiere extraer la llamada `supabase.rpc('save_workout_log', {...})` a un helper en `src/features/workouts/api.js` (que hoy no existe). Bonus colateral: documenta la firma de 16 params.

### Paso 4 — Integración con husky

Una vez los 5 tests pasen verde:
```bash
# .husky/pre-commit (Franco lo hace a mano por la limitación del sandbox)
npx lint-staged
npm run test:run
```

Si el tiempo total del pre-commit pasa de 8s, mover `test:run` solo a CI (GitHub Actions). Por ahora arrancamos con pre-commit local.

### Paso 5 — Smoke manual (Franco)

Después del último commit del batch 3.2:
```bash
cd ~/Desktop/gym_app/gym_app
npm run test:run        # debe pasar 5/5
npm run lint            # debe seguir en 0 errors, ~106 warnings
npm run build           # debe seguir generando 1519.37 kB raw
```

Y un smoke en browser (login → ver dashboard → abrir bell → crear nota desde panel) para validar que el refactor del paso 3.5 (extraer helper de `save_workout_log`) no rompió nada en prod.

### Output esperado (commits)

| Commit propuesto | Files | Mensaje |
|---|---|---|
| 1/3 | 4 | `chore(test): setup vitest + RTL + jsdom + mock supabase factory (Tier 3.2 — paso 1)` |
| 2/3 | 5 | `test(features): 5 tests smoke (login, notes/api, useNotifications, assignmentHelpers, saveWorkoutLog)` |
| 3/3 | 2 | `chore(test): integrar npm run test:run en pre-commit + actualizar handoff 11` |

---

## 5. Cosas que NO vamos a hacer en este tier (para evitar scope creep)

- Tests E2E (Playwright/Cypress) — son otro tier, otro stack.
- Coverage > 50% — explícitamente 5 tests scoped, no boil the ocean.
- Mockear realtime (`channel().on().subscribe()`) más allá de stubs — el realtime se testea a mano.
- Fixear los warnings del lint en el mismo batch — eso es Tier siguiente.
- Mover `archive.student_profiles` — eso es otra mini-migration (ver §2.1), no parte de 3.2.
- Habilitar `auth_leaked_password_protection` (pendiente del 16/05) — toggle manual en dashboard, sigue siendo TODO de Franco.

---

## 6. Pregunta para Franco

**¿Plan A, B o C?**

Mi voto: **A**. Si decís "dale A", arranco con el paso 1 (npm install + configs). Te paso el comando para correr y arrancamos.

Si querés modificar el scope (por ejemplo: cambiar uno de los 5 tests por otro, o saltearte el saveWorkoutLog porque querés tocar primero ese código), avisame antes del paso 1.

---

## 7. Estado al cierre del paso 1+2+3 (Plan A ejecutado)

Decisión: **Plan A**. Implementado y validado en el sandbox.

### Archivos creados

| Archivo | LOC | Rol |
|---|--:|---|
| `vitest.config.js` | 27 | config de vitest, aliases idénticos a vite.config.js |
| `src/test/setup.js` | 47 | matchers de jest-dom + stubs (matchMedia, IntersectionObserver, Notification) + env vars de Supabase |
| `src/test/mocks/supabase.js` | 132 | factory `createSupabaseMock()` con chain thenable (`chain.then` es `vi.fn()` para programar respuestas por await) |
| `src/features/workouts/api.js` | 65 | extracción de `buildSaveWorkoutLogArgs` + `extractNoteBody` (testeable, documenta los 16 params de la RPC) |
| `src/features/plans/assignmentHelpers.test.js` | 280 | 45 tests sobre máquina de estados, normalización, picking, date math, adherencia |
| `src/features/notes/api.test.js` | 130 | 8 tests sobre `createNote` (validaciones cliente, denormalización, error mapping) |
| `src/features/notifications/hooks/useNotifications.test.jsx` | 130 | 6 tests sobre el hook (load, markAsRead optimistic + rollback, channel cleanup) |
| `src/features/auth/pages/LoginPage.test.jsx` | 110 | 5 tests sobre el form (render, submit, error, toggle, disabled state) |
| `src/features/workouts/api.test.js` | 150 | 14 tests sobre el builder de RPC args |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `package.json` | +5 devDeps (vitest, jsdom, @testing-library/{react,jest-dom,user-event}) + 3 scripts (`test`, `test:run`, `test:ui`) |
| `eslint.config.js` | nuevo block para `src/**/*.test.{js,jsx}` + `src/test/**` con globals de vitest, off de `no-unused-vars` |
| `src/features/workouts/pages/TodayWorkoutPage.jsx` | reemplazar el inline rpcArgs por `buildSaveWorkoutLogArgs(...)` + `extractNoteBody(...)` |
| `src/features/auth/pages/LoginPage.jsx` | accesibilidad: `htmlFor`/`id` en label/input para email y password |
| `src/features/notifications/hooks/useNotifications.js` | bugfix: capturar snapshot de rollback desde closure (no desde dentro del updater de setState). El patrón viejo era frágil en React 18 + tests con act; lo expuso el test del rollback. Ver comentario inline en el archivo. |

### Resultados (corrido en sandbox)

```
Test Files  5 passed (5)
Tests       78 passed (78)
Duration    ~6.3s

Lint        0 errors, 94 warnings (handoff cerró con 106; colateral: useNotifications dejó de warneear exhaustive-deps al fixearle las deps en el bugfix)

Build       NO se pudo correr en el sandbox: vite intenta hacer rmSync de dist/
            y el sandbox no puede borrar archivos preexistentes (lección 2 del handoff 10).
            Franco lo corre en su terminal.
```

### Bugfix colateral encontrado

`useNotifications.markAsRead` / `markAllAsRead` capturaban el snapshot para rollback **dentro del callback de setState** (`setUnreadCount(prev => { prevUnread = prev; ... })`). En React 18 el updater puede ejecutarse diferido — en producción funcionó por timing, pero en tests con `act` el rollback se ejecutaba antes de que el updater hubiera corrido, dejando `prevUnread = undefined`. Si en prod un `markAsRead` fallaba y React batchea diferente, el estado quedaba undefined.

Fix: capturar `prevNotifications`/`prevUnread` desde el closure ANTES de llamar a `setState`. Mismo comportamiento user-facing, snapshot estable, deps de useCallback actualizadas. Sin tests, este bug probablemente nunca se hubiera notado. Confirmación clara de que Tier 3.2 paga rápido — handoff 10 ya documentaba el caso `SCORES not defined` cazado por el lint del 3.1, ahora sumamos uno cazado por los tests del 3.2.

### Comandos para Franco

```bash
cd ~/Desktop/gym_app/gym_app

# 1. Instalar deps nuevas (vitest, jsdom, RTL, etc.)
npm install

# 2. Correr los 78 tests
npm run test:run
# Esperado: 5 test files, 78 tests passing, ~6s

# 3. Validar lint y build
npm run lint     # 0 errors, ~94 warnings (vs 106 del handoff 10)
npm run build    # debe seguir generando 1519.37 kB raw / 395.83 kB gzip

# 4. Si todo OK, git status para ver el diff
git status
git diff --stat
```

### Commits sugeridos (3)

```bash
# Commit 1: setup base
git add vitest.config.js src/test/ package.json package-lock.json eslint.config.js
git commit -m "chore(test): setup vitest + RTL + jsdom + mock supabase factory (Tier 3.2 — paso 1)"

# Commit 2: bugfix + accesibilidad + extracción de helper
git add src/features/notifications/hooks/useNotifications.js \
        src/features/auth/pages/LoginPage.jsx \
        src/features/workouts/api.js \
        src/features/workouts/pages/TodayWorkoutPage.jsx
git commit -m "fix(notifications): capturar snapshot de rollback desde closure (markAsRead/markAllAsRead) + chore: htmlFor en LoginPage + refactor(workouts): extraer buildSaveWorkoutLogArgs"

# Commit 3: tests
git add src/features/plans/assignmentHelpers.test.js \
        src/features/notes/api.test.js \
        src/features/notifications/hooks/useNotifications.test.jsx \
        src/features/auth/pages/LoginPage.test.jsx \
        src/features/workouts/api.test.js \
        diagnostico_arquitec/11_plan_tier_3_2.md
git commit -m "test(features): 5 tests smoke (assignmentHelpers, notes/api, useNotifications, LoginPage, workouts/api) — Tier 3.2 cerrado"
```

### Pendiente del Tier 3.2 (para próxima sesión)

- Agregar `npm run test:run` al `.husky/pre-commit` (decidir si va antes o después de lint-staged). En sandbox no se puede tocar `.husky/_/`, lo dejo para Franco. Si el tiempo de pre-commit pasa de 8s, mover a CI sólo.
- (Opcional) Workflow de GitHub Actions para CI: `npm ci && npm run lint && npm run test:run && npm run build`. Ya que hoy no hay CI, vale la pena armarlo en otra sesión cortita.

### Pendiente NO relacionado pero detectado en la verificación (recordatorios)

- `archive.student_profiles` mal ubicada (ver §2.1). Mini-migration aparte.
- 47 → 27 RPCs callable por anon (ver §2.2) cuando se ataque el hardening tier.
- Sigue pendiente `auth_leaked_password_protection` (toggle manual en Supabase Dashboard, del 16/05).

