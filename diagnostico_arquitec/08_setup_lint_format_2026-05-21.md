# Setup eslint + prettier + husky + lint-staged — gym_app

**Fecha:** 2026-05-21
**Tier:** 3.1 del plan en `04_propuesta_reorganizacion.md`.

## Qué quedó instalado y configurado

### Archivos nuevos

- `eslint.config.js` — flat config para ESLint 9. Reglas de React + Hooks + Vite Refresh. **Las reglas nuevas de `eslint-plugin-react-hooks@7` están como `warn`** (no bloquean commits) para no obligar a refactorizar 30+ sitios heredados. Las únicas como `error` son `react-hooks/rules-of-hooks` y `no-undef` (que sí son bugs reales).
- `.prettierrc.json` — single quote, no semi, trailing comma ES5, 100 columnas, LF.
- `.prettierignore` — excluye `dist/`, `node_modules/`, `public/sw.js`, `supabase/`, `diagnostico_arquitec/`, el wrapper de Cowork.
- `.husky/pre-commit` — corre `npx lint-staged` (sólo sobre archivos staged, no sobre todo el repo).

### Archivos editados

- `package.json`
  - `scripts`: `lint`, `lint:fix`, `format`, `format:check`, `prepare` (husky).
  - `lint-staged`: `eslint --fix` + `prettier --write` sobre `src/**/*.{js,jsx}`; `prettier --write` sobre `src/**/*.css` y `*.{json,md}`.
  - `devDependencies`: eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, prettier, eslint-config-prettier, husky, lint-staged.
- `package-lock.json` — actualizado por `npm install`.

## Baseline actual (`npm run lint`)

**107 problemas: 2 errors, 105 warnings.**

### Los 2 errors

Ambos en `src/features/evaluations/pages/StudentEvaluationsTab.jsx`:

```
580:22  error  'profile' is not defined  no-undef
588:22  error  'profile' is not defined  no-undef
```

**Diagnóstico:** el componente nested `UltimoRegistro` (declarado en línea 513, **sibling** del componente principal `StudentEvaluationsTab`) usa `profile?.id` como `coachId` en su función `saveComments` (líneas 580 y 588). Pero `profile` se declara con `const { profile } = useAuth()` sólo en el componente `StudentEvaluationsTab` (línea 30), no en `UltimoRegistro`.

En runtime, esto se evalúa como `ReferenceError: profile is not defined` cada vez que el coach guarda un comentario de evaluación. **Es un bug real** que probablemente vivió tapado porque el flujo se ejecuta poco. La fix correcta es agregar `const { profile } = useAuth()` dentro de `UltimoRegistro`, o pasar `coachId` como prop desde el componente padre.

**No se aplicó la fix en esta pasada** — requiere validar el flujo de comentarios públicos/privados de evaluación con el modelo multi-coach v31. Queda pendiente para la próxima sesión.

### Los 105 warnings — distribución aproximada

- ~30 `react-hooks/set-state-in-effect` — patrón legítimo viejo (setear estado en efecto al cambiar dependencia). React 19 lo desaconseja porque encadena renders; en React 18 funciona bien. Refactorizable de a poco.
- ~25 `react-hooks/exhaustive-deps` — dependencias de useEffect/useMemo faltantes. Mayormente intencional (refs, funciones definidas inline). Revisar caso por caso.
- ~15 `react-hooks/immutability` — mutaciones in-place en efectos o handlers (`arr[i] = x`). Pasan en prod hoy.
- ~15 `react-hooks/refs` — uso de refs durante render que la regla nueva marca.
- ~10 `no-unused-vars` — variables no usadas o imports muertos. Auto-fixables con `npm run lint:fix`.
- Resto: misc (`react-refresh/only-export-components`, `no-empty`, etc.).

## Cómo usar de acá en adelante

### Día a día

- **No hay que hacer nada distinto.** Husky ya está configurado: cada `git commit` corre `lint-staged` sobre los archivos staged. Si tocás un .jsx, se autoformatea y se le aplica `eslint --fix` antes de pasar al commit. Si quedan errores de ESLint que no se pueden auto-fixear (como el bug del `profile` undefined), el commit se cancela.
- Para ver qué tenés sucio: `npm run lint` (todo el repo) o `npm run format:check` (formato).
- Para fixear lo que se puede automatizar: `npm run lint:fix && npm run format`.

### El primer `npm run format`

Hoy hay **96 archivos** que prettier va a tocar cosméticamente (comillas, semis, ancho de línea). El commit va a ser **grande** pero **cero-bug** — pura forma. **Recomendado: hacer este commit como `chore(format): prettier first pass` en solitario**, así los diffs futuros son legibles.

```bash
cd ~/Desktop/gym_app/gym_app
npm run format
git add -A
git commit -m "chore(format): prettier first pass — 96 archivos reformateados (cero cambio funcional)"
git push
```

Después de esto, prettier sólo toca lo que vos cambiás. Cero ruido cosmético en commits futuros.

### Bypass para emergencias

Si por algo querés commitear sin pasar el hook:

```bash
git commit --no-verify -m "..."
```

Reservar para urgencias reales. El point del setup es no usarlo nunca.

## Pendientes que dejó el lint baseline

| # | Issue | Severidad | Trabajo |
|---|---|---|---|
| 1 | Fix `profile` undefined en `StudentEvaluationsTab.jsx:580,588` | 🔴 bug real | 15 min |
| 2 | Primera pasada de `npm run format` (commit cosmético) | 🟡 | 5 min |
| 3 | Cleanup de `no-unused-vars` con `npm run lint:fix` | 🟢 | 5 min auto |
| 4 | Revisar warnings de `react-hooks/exhaustive-deps` caso por caso | 🟢 estratégico | crece con cada feature |
| 5 | Refactor de `set-state-in-effect` mientras se parte `TodayWorkoutPage` (Tier 2.3) | 🟢 | natural durante el refactor |

## Convención agregada

A partir de hoy:

- Toda PR/commit nuevo debe pasar `npm run lint` (cero errors).
- Toda función o componente nuevo no puede introducir warnings nuevos sin justificación en el código (comentario `// eslint-disable-next-line <regla> -- <razón>`).
- `--no-verify` requiere justificación en el mensaje del commit.

Estas reglas conviven mejor con `CONVENTIONS.md` en raíz (Tier 0 pendiente del propuesta-07).
