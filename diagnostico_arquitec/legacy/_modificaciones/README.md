# Carpeta legacy `_modificaciones/`

Este es el contenido que vivía en `_modificaciones/` (raíz del repo) hasta el **21/05/2026**. Se archivó acá para liberar la raíz y dejar trazabilidad.

**Ninguno de estos archivos se importa o aplica desde el código actual.** Sólo se conservan como memoria histórica de las migraciones manuales previas al refactor de mayo.

## Inventario

| Archivo | Tipo | Estado | Origen / impacto |
|---|---|---|---|
| `add_payment_tracking.sql` | Migración SQL | ✅ **Aplicada a producción** | Agregó `last_payment_date date`, `next_payment_due date`, `payment_notes text` a `public.profiles`. Verificado vía `information_schema.columns` el 21/05/2026 — las 3 columnas existen. |
| `migration_borg_per_day.sql` | Migración SQL | ✅ **Aplicada a producción** | Agregó `borg_per_day jsonb` a `public.workout_sessions` + índice GIN. Confirmado en el changelog del refactor (`01_changelog_back.md`) y en `plan_deprecacion_notas_v24.md` sección "DEUDA FANTASMA". |
| `migration_wellbeing.sql` | Migración SQL | ✅ **Aplicada a producción** | Creó `public.wellbeing_logs` (16 filas al 21/05/2026). |
| `TodayWorkoutPage.jsx` | Componente React | ❌ **Huérfano** | Snapshot de la página del 14/04/2026 (1126 líneas). La versión viva en `src/pages/student/TodayWorkoutPage.jsx` tiene 2080 líneas y se modificó por última vez el 18/05. Conviene mantenerlo como referencia histórica pero **NO se debe restaurar** sin antes haber revisado el diff completo. |

## Cómo fue el flujo en su momento

Antes de adoptar Supabase MCP / CLI con tracking de migraciones, las migraciones se redactaban acá (`_modificaciones/`) y se pegaban a mano en el SQL Editor del dashboard de Supabase. El JSX vivía acá como work-in-progress aislado del `src/` productivo hasta que se daba el "go" para integrarlo.

Ese flujo quedó obsoleto a partir del refactor del 15-16/05/2026 (ver `01_changelog_back.md`). Desde entonces:

- Las migraciones nuevas van a `supabase/migrations/YYYYMMDDHHMMSS_NN_descripcion.sql` (convención CLI estándar) y se aplican vía CLI o MCP citando el archivo del repo.
- Los WIPs de UI van en una branch dedicada, no en una carpeta paralela.

## ¿Por qué no se borró todo?

Por trazabilidad. Si alguien busca `last_payment_date` en `git blame` y no encuentra cuándo se introdujo, este archivo le dice por qué (porque se aplicó manualmente, sin commit).

Si en algún momento se decide hacer limpieza dura del repo, este folder se puede eliminar sin riesgo — toda la información ya está consolidada en el changelog del refactor y en la BD productiva.
