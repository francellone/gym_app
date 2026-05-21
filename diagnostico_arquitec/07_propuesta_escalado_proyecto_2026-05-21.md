# Cómo manejar el proyecto a escala — gym_app

**Fecha:** 2026-05-21
**Insumo:** `06_validacion_estado_real_2026-05-21.md` (estado real ya establecido) + patrones del repo `Aplicación para clubes deportivos` (referencia, **no se toca**).
**Audiencia:** vos, Franco, y el próximo Claude que abra el repo.
**Principio rector:** la app nació desordenada y la migración del 20/05 puso el frontend en cintura. Para que ese orden no se erosione, hay que fijar **convenciones explícitas**, agregar **guardrails automáticos** y **separar las decisiones** de los cambios.

---

## 0. Resumen — qué cambia y en qué orden

Tres capas, atacarlas en este orden:

1. **Convenciones escritas** — `CONVENTIONS.md` en raíz (y un `supabase/CONVENTIONS.md` corto). Sin código nuevo, pura definición. Cero riesgo, alto retorno cuando vuelvas al repo en 2 meses.
2. **Guardrails automáticos** — lint + format + smoke tests + pre-commit. Una vez configurados, el desorden ya no entra por descuido.
3. **Higiene continua** — handoffs estructurados, READMEs por feature, ER diagram en mermaid, una sola fuente de verdad para cada decisión.

---

## 1. Convenciones escritas (Tier 0, hoy mismo)

### 1.1 `CONVENTIONS.md` en raíz

Un archivo de ~150 líneas con todo lo que un nuevo agente o vos en el futuro necesitan saber para no romper cosas. Estructura sugerida:

```
# Convenciones del proyecto — gym_app

## Branching
## Commits
## Frontend (organización por feature, imports, aliases)
## Backend Supabase (migraciones, funciones, RLS, backups)
## Datos sensibles y reglas de oro (no DELETE en profiles, etc.)
## Cuándo usar `supabaseIsolated`
## Cómo desplegar (vercel auto + edge functions a mano)
```

El contenido tiene que ser **prescriptivo** ("haz esto") y **breve** ("por qué", una línea). Si necesita más de una línea de justificación, va en un doc aparte y se enlaza.

### 1.2 `supabase/CONVENTIONS.md` (corto, embebido)

Específico de DB. Para que cuando el próximo agente vaya a tocar SQL no tenga que leer 47 migraciones para entender el estilo. Mínimo:

```
- Nombre de migración: YYYYMMDDHHMMSS_descripcion.sql (CLI default).
- Toda función nueva: SET search_path = public, pg_temp.
- SECURITY DEFINER → REVOKE EXECUTE FROM PUBLIC + GRANT TO authenticated (o anon si lo necesita).
- Backups en `archive.*` SIEMPRE con RLS habilitada, aunque sin policies (deny-by-default).
- profiles: NO DELETE. Soft delete vía active=false + is_test=true.
- plan_assignments con plan_id=plantilla: usar RPC assign_template_to_student, nunca INSERT directo.
- Alumnos nuevos: edge function create-student (nunca INSERT directo en profiles).
- Tablas nuevas: documentar el propósito en COMMENT ON TABLE.
```

### 1.3 Documentar las "reglas que nadie escribió"

Hay varias reglas implícitas que viven sólo en handoffs o en tu cabeza:

- "borrar" = `active=false + is_test=true`
- excepción de `student1@gmail.com` (113 logs históricos de evaluación)
- legacy de notas en `archive.*_notes_20260517`
- el shim de `legacy_notes_shim_log` se monitorea hasta que `outcome='created'` deje de aparecer

Conviene un `docs/known-exceptions.md` con cada una. Cada vez que aparece una excepción nueva, se suma una línea. **Tres líneas escritas hoy ahorran tres horas de "¿por qué pasa esto?" mañana.**

---

## 2. Layout estable del repo

Hoy:

```
gym_app/
├── CLAUDE.md
├── CONVENTIONS.md                 ← agregar
├── SETUP.md                       ← ya actualizado
├── README.md (raíz)               ← falta, ver §4.3
├── package.json, vite.config.js, tailwind.config.js, etc.
├── public/
├── scripts/                       ← donde vivir scripts de deploy/legacy
├── src/                           ← organizado por feature, OK
│   ├── App.jsx, main.jsx, index.css
│   ├── README.md
│   ├── components/                ← sólo transversales
│   ├── features/                  ← 12 features, cada una con README
│   ├── lib/                       ← supabase.js
│   └── utils/                     ← errorHelpers.js
├── supabase/
│   ├── README.md
│   ├── CONVENTIONS.md             ← agregar
│   ├── migrations/                ← la nueva convención CLI
│   │   └── legacy/                ← migración intake_form vieja
│   ├── functions/                 ← edge functions (create-student, notify-cron)
│   ├── tests/                     ← rls_smoke_tests.sql
│   ├── legacy/                    ← ← mover acá schema.sql, seed.sql, seed_exercises_videoteca.sql + migration_v*.sql sueltas
│   └── (migration_v*.sql sueltas) ← LIMPIAR: mover a legacy/
├── docs/
│   ├── api-rpcs.md                ← agregar (Tier 3.4)
│   ├── er-diagram.mermaid         ← agregar (Tier 3.4)
│   ├── known-exceptions.md        ← agregar
│   └── architecture.md            ← agregar (1 página: stack, deploy, flow)
└── diagnostico_arquitec/          ← histórico, no se modifica
```

Diferencia clave con el estado actual: una carpeta `docs/` única para todo lo que es "documentación viva del modelo" (vs `diagnostico_arquitec/` que es histórico de refactors). Hoy esos dos roles están mezclados.

---

## 3. Git workflow

### 3.1 Branching

Como sos un dev solo y la app está en prod, mantener simple:

- `main` = producción, deploya automático a Vercel.
- Trabajo del día: directo sobre `main` para fixes triviales (cambio de string, css, etc.).
- Para refactors o features nuevas: branch `feat/<tema>` o `fix/<tema>`, merge a `main` cuando funciona local + manual smoke (logueá como coach, abrí algo, agregá una nota).
- `v2` ya no se usa — considerar borrarlo o renombrar a `archive/v2-2026-04` y dejar nota en `CONVENTIONS.md`.

### 3.2 Commits

Convención simple, **opcional** pero útil:

- `feat(<feature>):` algo nuevo
- `fix(<feature>):` arreglo
- `refactor(<feature>):` movimiento sin cambio de comportamiento
- `chore:` housekeeping (deps, gitignore, format)
- `docs:` solo doc

Cuando un commit toca >1 feature, prefijo `refactor:` o `chore:` sin scope. Esto se alinea con los commits previos del repo (`feat(notes):`, `refactor(notes):`, `fix(m26):`, etc.) — ya lo venís haciendo, formalizarlo en `CONVENTIONS.md`.

### 3.3 Tags para hitos productivos

Cuando algo grande llega a prod (Tier 2.3 partido, TS migrado, lint configurado), `git tag v2026.05.21-features-reorg`. Permite hacer `git diff` entre versiones grandes sin caer en commits puntuales.

---

## 4. Guardrails automáticos (Tier 3.1)

### 4.1 ESLint + Prettier — instalación mínima

```bash
npm i -D eslint @eslint/js eslint-plugin-react eslint-plugin-react-hooks \
        eslint-plugin-react-refresh prettier eslint-config-prettier
```

`eslint.config.js` (flat config):

```js
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default [
  { ignores: ['dist', 'dist-verify', 'node_modules', '**/*.config.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
    settings: { react: { version: 'detect' } },
  },
  prettier,
]
```

`.prettierrc.json`:

```json
{ "semi": false, "singleQuote": true, "trailingComma": "es5", "printWidth": 100 }
```

`package.json` scripts:

```json
"lint": "eslint src/",
"format": "prettier --write src/",
"format:check": "prettier --check src/"
```

**Costo:** 1 hora primer setup + 1 hora primera pasada de `lint --fix` y `format` (probablemente toque varios archivos cosméticamente).

### 4.2 Husky + lint-staged para pre-commit

```bash
npm i -D husky lint-staged
npx husky init
```

`.husky/pre-commit`:

```
npx lint-staged
```

`package.json`:

```json
"lint-staged": {
  "src/**/*.{js,jsx}": ["eslint --fix", "prettier --write"]
}
```

Esto evita commits sucios sin pedir nada a quien commitea.

### 4.3 README en raíz

Hoy hay `SETUP.md` y `CLAUDE.md`. Falta un `README.md` que sea lo primero que ve quien clona el repo. Mínimo:

```markdown
# gym_app

App mobile-first para coach (Anto) + alumnos (~5 activos).
Prod: https://gym-appv2.vercel.app/

## Documentos clave
- `SETUP.md` — cómo correr local y operar la BD
- `CONVENTIONS.md` — reglas de código, commits, migraciones
- `src/README.md` — guía del frontend por feature
- `supabase/README.md` — guía del backend
- `docs/known-exceptions.md` — casos raros documentados
- `diagnostico_arquitec/` — histórico de refactors y handoffs

## Comandos rápidos
- `npm run dev` — server local
- `npm run build` — build prod
- `npm run lint` — chequeo
- `npm run format` — prettier write
```

---

## 5. Testing — empezar chico, crecer cuando duela

### 5.1 RLS smoke tests (ya existe el archivo)

`supabase/tests/rls_smoke_tests.sql` ya tiene 6 tests. Convertir esto en un hábito: **cada migración que toca policies suma 1 test acá**. No hace falta CI todavía — basta con correrlo a mano antes de aplicar la migración a prod:

```bash
supabase db reset                                       # opcional, sobre branch
psql $DATABASE_URL -f supabase/tests/rls_smoke_tests.sql
# Verificar que todos los NOTICE: OK aparezcan
```

### 5.2 Vitest + 5 tests UI mínimos (Tier 3.2)

Cuando estabilices el lint:

```bash
npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/ui
```

Cobertura inicial sugerida (1 día de trabajo):

| Test | Por qué |
|---|---|
| `Login → coach redirect` | Detecta si Auth o redirect rompió |
| `Plan create → aparece en lista` | Detecta si CRUD de planes rompió |
| `Log save desde TodayWorkout` | El feature más usado de la app |
| `Note create coach→alumno` | Comunicación crítica, alto riesgo de regresión |
| `NotificationBell muestra unread` | Realtime, muy fácil de romper |

Después se suman tests cuando aparece un bug — cada bug = 1 test de regresión. Crecimiento orgánico, no aspiracional.

---

## 6. Patrones del repo de clubes que vale la pena adoptar

Sin copiar nada literal (no debo tocar ese repo), los patrones que la auditoría 03 ya identificó como aplicables:

| Patrón | Estado en gym_app | Acción |
|---|---|---|
| Migraciones `YYYYMMDDHHMMSS_descripcion.sql` en `supabase/migrations/` | Ya estrenado en `20260521003824_*` | Seguir igual. Mover las `migration_v*.sql` sueltas a `supabase/legacy/` |
| `supabase/tests/rls_smoke_tests.sql` con `NOTICE: OK` | Ya existe con 6 tests | Crecer 1 test por policy que se toque |
| `er-diagram.mermaid` | No existe | Crear (Tier 3.4) — herramientas: `dbdocs.io`, `supabase-schema-visualizer`, o a mano leyendo `list_tables --verbose` |
| `api-design.md` o `docs/api-rpcs.md` | No existe | Crear — listar cada RPC con firma, quién la llama, qué hace |
| Layout `features/{auth,…}/{application,data,presentation}` por capas | gym_app usa features pero no separa data/presentation | **No copiar** — gym_app es más chico, agregar capas internas hoy es overkill. Reevaluar si una feature supera 20 archivos |
| README en cada subcarpeta significativa | Ya hecho en `src/features/*/README.md` (Tier 2.6 parcial) | Faltan: raíz, `docs/`, `supabase/legacy/` |
| `SETUP.md` paso a paso con troubleshooting | Ya hecho en el draft del 20/05 | Listo, agregar sección "errores comunes" cuando aparezcan |
| Decisión de stack documentada (`stack-recommendation.md`) | No existe | Crear `docs/architecture.md` corto: por qué Vite, por qué Supabase, por qué no TS todavía |

---

## 7. Rituales para que el orden no se erosione

### 7.1 Al cerrar cada sesión de trabajo grande

Antes de cerrar el editor:

1. `git status` — todo commiteado o stash.
2. `npm run lint && npm run build` — todo verde.
3. Si tocaste DB o policies: correr `rls_smoke_tests.sql`.
4. Si la sesión fue >2h o tocó múltiples features: escribir un `diagnostico_arquitec/NN_handoff_*.md` corto (10-30 líneas) — qué hiciste, qué quedó pendiente, qué archivo abrir mañana. El handoff `05_*` es el modelo: minimal pero suficiente para retomar sin contexto.

### 7.2 Revisión mensual (15 min)

Una vez por mes, correr esta checklist:

```
□ git status limpio en main
□ supabase advisors: 0 ERROR, revisar nuevos WARN
□ git log --oneline -20 ¿hay commits sin convención?
□ ls src/features/ ¿alguna feature crece desproporcionada?
□ docs/known-exceptions.md ¿alguna excepción ya se resolvió y se puede borrar?
□ npm outdated ¿algo crítico?
```

Si algo de esto falla, te aviso y abrís un mini-ticket. Sin eso, el desorden se acumula silencioso.

### 7.3 Cuando aparezca un agente nuevo (Claude o humano)

Pedirle:

1. Leer `README.md` raíz → `CONVENTIONS.md` → último `diagnostico_arquitec/NN_handoff_*.md`.
2. `git status` y `git log --oneline -10`.
3. Recién después de eso, atacar lo pedido.

---

## 8. Roadmap concreto sugerido (próximas 3 semanas)

### Esta semana

- **Aplicar fix RLS** en `archive.*_notes_20260517` (es el hallazgo crítico de §06).
- **Limpiar aliases fantasma** en `vite.config.js` + `src/README.md`.
- **Mover** `supabase/schema.sql`, `seed.sql`, `seed_exercises_videoteca.sql` y los 44 `migration_v*.sql` sueltos a `supabase/legacy/` con README.
- **Escribir** `CONVENTIONS.md` raíz (~150 líneas) + `supabase/CONVENTIONS.md` (~30 líneas).
- **Escribir** `README.md` raíz (~40 líneas).
- **Habilitar** `auth_leaked_password_protection` en Supabase Dashboard.

### Próxima semana

- **Tier 2.3** — partir `TodayWorkoutPage` + `EvalWorkoutPage` con hook común. Es el refactor con mejor ratio costo/beneficio que queda.
- **Tier 3.1** — eslint + prettier + husky + lint-staged.

### Semana 3

- **Tier 3.4** — `er-diagram.mermaid` + `docs/api-rpcs.md` + `docs/known-exceptions.md` + `docs/architecture.md`.
- **Revisión** de las 47 RPCs expuestas a anon (decidir REVOKE caso por caso).

### Cuando haya 1 día libre

- **Tier 3.2** — vitest + 5 smoke tests UI.
- **Tier 3.3** — empezar TS gradual (modo `allowJs`).

---

## 9. Lo que conviene NO hacer

- **No hacer un refactor "big bang"** del frontend a TypeScript ni de las migraciones viejas a la nueva convención. Cada uno por bloque chico, mergeado, validado.
- **No copiar la separación `data/application/presentation`** del repo de clubes. gym_app es más chico; agregar 3 capas dentro de cada feature suma fricción sin retorno.
- **No agregar CI/CD pesado todavía**. Vercel ya deploya en cada push. Para tests, basta con `npm run lint && npm test` local antes de commitear. Cuando haya >1 dev o aparezca el primer bug que un test hubiera atajado, ahí sí.
- **No reescribir las migraciones legacy.** Renombrar `migration_v2.sql` rompe la trazabilidad mental. Dejarlas en `supabase/legacy/` con README.
- **No tocar el repo de clubes** para nada. Sólo referencia conceptual.

---

## 10. Cómo medir si está funcionando

Tres señales simples a los 3 meses:

1. **Cuando volvés al repo después de 2 semanas sin tocarlo, ¿podés retomar leyendo solo `README.md` + último handoff?** Si sí, el orden funciona.
2. **Cuando aparece un bug en prod, ¿sabés en qué feature buscar en <30 segundos?** Si sí, el layout funciona.
3. **¿Cuántas migraciones aplicaste en prod sin pasar antes por `rls_smoke_tests.sql`?** Idealmente 0.

Si las tres dan ok, vamos bien. Si alguna falla, refinamos las convenciones.
