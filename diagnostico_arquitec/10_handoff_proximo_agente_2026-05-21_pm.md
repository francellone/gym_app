# Handoff para retomar — gym_app, 2026-05-21 (PM)

Cierre de la sesión del 21/05 después del refactor Tier 2.3. Reemplaza al handoff `05_*` (que es de las 01:00 AM del mismo día y ya quedó parcialmente obsoleto por todo lo que hicimos durante el día).

> **Por qué este archivo en vez de la memoria persistente de Claude:** el sandbox de Cowork tiene el directorio de memoria montado read-only. Los handoffs en `diagnostico_arquitec/` cumplen mejor el rol — viven en git, los lee cualquier agente futuro (Claude o humano), no dependen del entorno de ejecución.

---

## TL;DR — qué pasó hoy (jueves 21/05, PM)

**6 commits productivos en `main`** (sumados al `c403764` del 20/05):

| Commit | Tema | Files |
|---|---|--:|
| `3082ea1` | fix RLS en `archive.*_notes_20260517` (5 tablas) + limpiar 4 aliases fantasma de `vite.config.js` + docs validación 06/07 | 5 |
| `fbaf16b` | `git mv` 47 `migration_v*.sql` + `schema.sql` + `seed.sql` a `supabase/legacy/` con README | 50 |
| `4358ef3` | **Tier 3.1 cerrado** — eslint v9 + prettier + husky + lint-staged + doc 08 | 7 |
| `e2e619e` | **TodayWorkoutPage refactor** (2269→1050 LOC) + fix bug `profile undefined` en UltimoRegistro + **prettier first pass colateral sobre 92 archivos** | 104 |
| `ffaedb0` | **EvalWorkoutPage refactor** (2257→684 LOC) en 12 sub-componentes + fix bug `SCORES not defined` cazado por pre-commit | 14 |
| `c449974` | Cierre Tier 2.3 — extraer `useSaveErrorBanner` + `<SaveErrorBanner />` (TodayWorkoutPage 1050→993 LOC) | 3 |

**Estado consolidado:**
- TodayWorkoutPage: 2269 → 993 LOC (-56%)
- EvalWorkoutPage: 2257 → 684 LOC (-70%)
- Total: 4526 → 1677 LOC (-63%), 22 sub-componentes nuevos, todos ≤290 LOC
- Bundle prod: **idéntico** (1519.37 kB raw / 395.83 kB gzip)
- Pre-commit cazó 2 bugs antes de prod (`profile undefined`, `SCORES`)
- `0 errors`, 106 warnings en `npm run lint` (mayormente reglas nuevas de `eslint-plugin-react-hooks@7`)

---

## Estado del repo (post-c449974)

```
src/
├── App.jsx, main.jsx, index.css, README.md
├── components/{layout/, SendToStudentModal.jsx}      transversales
├── lib/supabase.js
├── utils/errorHelpers.js
└── features/
    ├── auth/                AuthContext + LoginPage + ProfilePage
    ├── dashboard/           CoachDashboard + StudentDashboard + MonthlyCalendar + alerts + calendarLogic + hooks
    ├── evaluations/         helpers (con calc1RM/calcPower/calcVO2max/etc) + 4 pages
    │   └── components/
    │       ├── MethodBadge, ResultBox, NumInput, SexSelector, ScoreButton  (UI atómicos)
    │       └── forms/{OneRMForm,MaxRepsForm,PowerForm,CardioForm,BodyCompForm,ScoredForm,CustomForm}.jsx
    ├── exercises/           ExercisesLibraryPage
    ├── forms/               intake builder + 6 pages
    ├── notes/               api + 4 components + 2 hooks + 2 pages
    ├── notifications/       NotificationBell + useNotifications + pushService
    ├── plans/               helpers + assignmentHelpers + typeFilters + 12 components + 6 pages
    ├── progress/            ProgressPage
    ├── students/            helpers + status + dashboardLogic + 3 pages + 5 tabs + StudentProgressTableView
    ├── wellbeing/           WellbeingModal + StudentWellbeingTab
    └── workouts/
        ├── pages/{TodayWorkoutPage,HistoryPage}.jsx
        ├── components/{ValidationWarning,DailyPSEModal,WellbeingCard,ExerciseCard,StrengthBlockRunCard,BlockRenderer,AerobicBlockRunCard,CircuitBlockRunCard,RPEScale,SaveErrorBanner}.jsx
        ├── hooks/useSaveErrorBanner.js
        └── helpers.js       PSE_OPTIONS, PSE_SHORT, pseColor, isBlockCompleted, isSectionCompleted

supabase/
├── README.md, CONVENTIONS.md (pendiente — ver §pendiente)
├── functions/{create-student, notify-cron}/index.ts
├── migrations/                          convención CLI estándar
│   ├── 20260521003824_fix_search_path_six_functions.sql
│   ├── 20260521135103_enable_rls_on_archive_notes_backups.sql
│   └── legacy/migration_intake_form.sql
├── tests/rls_smoke_tests.sql            6 smoke tests (crecer 1 por policy nueva)
└── legacy/                              schema.sql + seed.sql + 44 migration_v*.sql históricas

diagnostico_arquitec/
├── 01_changelog_back.md                 biblia del back, pre-mayo
├── 02-04_*                              auditorías + propuesta original
├── 05_handoff_proximo_agente_2026-05-21.md           handoff AM (parcialmente obsoleto)
├── 06_validacion_estado_real_2026-05-21.md           doc vs realidad
├── 07_propuesta_escalado_proyecto_2026-05-21.md      cómo escalar el proyecto
├── 08_setup_lint_format_2026-05-21.md                Tier 3.1
├── 09_replan_tier_2_3_2026-05-21.md                  por qué partir el monolito y no hacer hook común
└── 10_handoff_proximo_agente_2026-05-21_pm.md        este archivo
```

---

## Lecciones aprendidas hoy (importantes para el próximo agente)

1. **El handoff anterior (05_*) tenía premisas falsas.** Decía "70% de duplicación entre TodayWorkoutPage y EvalWorkoutPage" — la realidad era ~10-15%. Al mapear con grep antes de tocar código, se descubrió que un `useWorkoutSession(planId, mode)` compartido habría sido anti-patrón (50+ params, mucho `if mode === ...`). Solución correcta documentada en `09_replan_tier_2_3`: partir cada archivo internamente en sub-componentes sin compartir hook. **Moraleja**: validar premisas del handoff anterior antes de ejecutar; los handoffs envejecen y a veces apuntan en direcciones equivocadas.

2. **El sandbox de Cowork no puede borrar/mover archivos preexistentes.** Pasó con `dist/`, con los `git mv` masivos, con `.husky/pre-commit`. **Solución**: cada vez que un refactor mueve algo, terminar con un bloque ```bash``` para que Franco lo corra a mano.

3. **`lint-staged` con primera pasada de prettier toca TODO el repo.** En el commit `e2e619e`, lo que iba a ser 11 archivos terminó siendo 104 porque prettier reformateó (con cambios cosméticos) todos los `.jsx` modificados en el working tree. **Para evitarlo en el futuro**: la primera vez después de instalar prettier, hacer un commit explícito `chore(format): prettier first pass` en solitario, antes de cualquier otro refactor. Esto ya pasó, no se repite.

4. **El lint baseline tenía 2 errors viejos (`profile is not defined` en `UltimoRegistro`).** Bloquearon el primer commit del refactor. **Tienen que arreglarse antes de habilitar el pre-commit** o el primer commit con husky activo va a fallar. En esta sesión se fixearon directamente.

5. **Pre-commit cazó un bug que yo introduje en el refactor (`SCORES` no definido en `ScoredForm`).** Al extraer `ScoreButton` me llevé `SCORE_COLORS` pero olvidé la constante hermana `SCORES = [0,1,2,3]`. Sin el lint hubiera sido un crash en runtime apenas el coach abriera una evaluación FMS. **Confirmación del valor del Tier 3.1** — el lint paga por sí mismo en el primer mes.

6. **No crear hooks "shared" para un solo consumidor.** El doc 09 prometía `useSaveErrorBanner` compartido entre Today y Eval. Al mapear, solo Today lo necesitaba (Eval usa otro patrón). Se extrajo a `src/features/workouts/hooks/` (no a `src/` global). Promover a transversal solo si aparece un segundo consumidor real.

---

## Estilo de trabajo de Franco (actualizado)

- Confía en autonomía. "Sigamos" / "vamos" / "dale" → ejecutar próximo paso sin preguntar.
- Cuando algo no le cierra, pregunta directo y espera evidencia concreta (query SQL, output de browser, conteos).
- Feedback corto y conciso. No darle largos pre-ambles, acción + comando shell para él.
- Tipea desde teléfono o con prisa — interpretar typos con buena fe.
- No es desarrollador formal — aterrizar explicaciones técnicas con "qué hace cada cosa" y "qué tiene que correr él".
- Mac con zsh: pegar comentarios `#` en multi-linea le tira ruido (`zsh: command not found: #`). Inofensivo pero feo. Evitarlo.
- Hace los cleanups y commits a mano en su terminal. Vos sólo proponés y aplicás vía Write/Edit/sed.
- **NUEVO 21/05 PM**: antes de un refactor grande (≥1000 LOC), pasarle un plan documentado en `diagnostico_arquitec/NN_*.md` con 3 opciones (A recomendada, B alternativa, C pausar). No tocar código hasta que diga "vamos con A".
- **NUEVO 21/05 PM**: antes del próximo refactor importante, pedirle un smoke test ("Hace test") es buen patrón — él prefiere validar entre batches que descubrir bugs al final.

---

## Pendiente operativo (post-c449974)

### Inmediato (esta semana)

- **Cleanup de `dist-batch*` y vite timestamps** — sandbox-only. Comando:
  ```bash
  cd ~/Desktop/gym_app/gym_app
  rm -rf dist-claude-verify* dist-batch* dist-verify 2>/dev/null
  rm vite.config.js.timestamp-*.mjs 2>/dev/null
  ```

- **Habilitar `auth_leaked_password_protection`** en Supabase Dashboard → Authentication. Toggle manual, no MCP. Pendiente desde el 16/05.

### Próximas 2 semanas (orden recomendado)

1. **Tier 3.2 — vitest + 5 tests UI mínimos** (login, plan create, log save, note create, notification bell). 1 día. Cierra el ciclo de guardrails que arrancó con el Tier 3.1. El próximo bug que el lint no cace, lo cazaría un test.

2. **Cleanup de warnings del lint** (106 → ~40). Atacar los más recurrentes:
   - `react-hooks/immutability` cuando una función `async function X()` se declara después del `useEffect` que la usa → convertir a `const X = useCallback(...)`.
   - `no-unused-vars` (auto-fixable con `npm run lint:fix`).
   - `react-hooks/exhaustive-deps` cuando es genuinamente reemplazable.

3. **Tier 3.4 — `er-diagram.mermaid` + `docs/api-rpcs.md` + `docs/known-exceptions.md`**. Medio día. Documentación que se aprecia en 3 meses cuando volvés al repo.

### Estratégico (mes+)

4. **Revisar las 47 RPCs expuestas a `anon`** (`anon_security_definer_function_executable` en advisors). Por cada una: ¿necesita anon o se le aplica `REVOKE EXECUTE … FROM anon`? Hardening de seguridad.

5. **`CONVENTIONS.md` + `supabase/CONVENTIONS.md`** (Tier 0 pendiente del doc 07). 1-2h. Reglas escritas para el "yo del futuro".

6. **Migración gradual a TypeScript** (Tier 3.3 del plan original). No urgente; pesarlo cuando se ataquen archivos sin reducir todavía.

---

## Convenciones vivas (resumen — NO romper)

- **Supabase migrations**: `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql` (sin `_NN_`, formato CLI default). Toda función nueva con `SET search_path = public, pg_temp`. `SECURITY DEFINER` con `REVOKE EXECUTE FROM PUBLIC` + `GRANT TO authenticated`.
- **Backups en `archive.*`** SIEMPRE con RLS habilitada. Sin policies = deny-by-default, solo `service_role`.
- **Frontend imports**: dentro de una feature, relativos (`../api`, `../hooks/X`). Cross-feature, alias absoluto (`@/features/notes/api`). Shared lib/utils con alias (`@/lib/supabase`). Aliases válidos hoy: `@`, `@features`, `@lib`, `@utils`, `@components`.
- **`profiles`** no tiene policy DELETE — "borrar" = `active=false` + `is_test=true`.
- **No INSERT directo en `plan_assignments`** para plan_id de plantilla → RPC `assign_template_to_student`.
- **Crear alumnos** sólo vía edge function `create-student` con `supabaseIsolated`.
- **App de clubes deportivos: NUNCA modificar.** Sólo referencia conceptual.
- **Pre-commit (husky + lint-staged)**: corre `eslint --fix` + `prettier --write` sobre archivos staged. `--no-verify` reservado para emergencias documentadas.
- **Para refactors grandes (>500 LOC)**: documentar plan en `diagnostico_arquitec/NN_*.md` antes de tocar código.

---

## Datos y URLs clave (sin cambios desde el handoff 05)

- App prod: https://gym-appv2.vercel.app/
- Supabase: https://supabase.com/dashboard/project/bvexjanqmfypmtgoapbt (sa-east-1, Postgres 17.6)
- Repo: https://github.com/francellone/gym_app (branch default `main`, `v2` legacy)
- Coach principal: `anto.au.almanza@gmail.com` (id `4d7b89ef-28af-4407-9d91-b5616e806ce3`, 5 alumnos)
- Browser para validación: **francellone** (deviceId `5c324fc5-b1e8-4e0f-b5bd-ab5054057e08`), NO el otro.
- Conteos productivos (al cierre 21/05 PM): 5 alumnos, 25 planes activos, 460 workout_logs, 102 notes, 79 notifications.

---

## Para el próximo agente — instrucciones de arranque

1. Leer este archivo (`10_handoff_proximo_agente_2026-05-21_pm.md`) — IGNORAR el `05_*` que quedó parcialmente desactualizado.
2. Leer `01_changelog_back.md` (biblia del back) si vas a tocar BD.
3. Leer el README de la(s) feature(s) que vas a modificar — están en `src/features/<x>/README.md`.
4. Correr `git status` y `git log --oneline -10` para ver estado.
5. Confirmar con Franco qué quiere atacar — si dice "sigamos" o "vamos", elegí el próximo paso del §"Pendiente operativo" sin pedir clarificación adicional.

**Si vas a hacer un refactor de >500 LOC**: mapear primero con grep, documentar plan en un nuevo `diagnostico_arquitec/NN_*.md` con 3 opciones, pasárselo a Franco, esperar OK explícito antes de tocar código.

**Si vas a tocar el flujo de evaluaciones tipo custom o el panel de comentarios coach↔alumno**: el componente `UltimoRegistro` está en `src/features/evaluations/pages/StudentEvaluationsTab.jsx` (línea ~569). Hoy tiene su propio `useAuth()` dentro (no hereda del padre) — necesario para `coachId: profile?.id` en `saveComments`. Si lo movés a otro archivo, mantenelo o pasalo como prop.
