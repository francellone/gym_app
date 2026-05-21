# Diagnóstico arquitectónico y refactor de Supabase — gym_app

**Proyecto:** `bvexjanqmfypmtgoapbt` (gymorg, sa-east-1)
**Período:** 2026-05-14 a 2026-05-16
**Resultado:** los 27 hallazgos del diagnóstico original + 8 grietas detectadas por la auditoría post-refactor → todos resueltos o documentados con decisión consciente. Backend con guardrails automáticos en producción, validado por linter de Supabase.

---

## ¿Qué encontrás en esta carpeta?

Esta carpeta contiene el **diagnóstico original** de la BD, los **handoffs entre el agente del back y el agente del front** durante la ejecución, el **changelog técnico** de lo aplicado, y el **script SQL** del primer fix grande.

No es documentación de uso de la app — es el "registro forense" del refactor: qué se rompía, cómo se decidió arreglarlo, qué quedó hecho y qué quedó pendiente.

---

## Por dónde empezar según lo que necesites

| Si querés... | Leé |
|---|---|
| **Entender qué se hizo a nivel global** | `01_changelog_back.md` (este es el resumen ejecutivo del proyecto) |
| **Saber el diagnóstico original que detonó todo** | `diagnostico-supabase.md` |
| **Las notas raw del primer scan** | `diagnostico-supabase-notas.md` |
| **La auditoría post-refactor + sus 10 fixes aplicados** | `02_auditoria_post_refactor_2026-05-16.md` |
| **El primer fix crítico (templates como assignments)** | `fix_2_1_y_raices.sql` + `handoff_para_agente_front.md` |
| **El contrato actualizado del back ↔ front (RPC, errores, etc.)** | `cambios_back_y_actualizacion_front_requerida.md` |
| **Lo que el front recibió bug por bug** | los archivos `handoff_*_para_front.md` (uno por cada coordinación) |

---

## Mapa completo de archivos

### Input del proyecto (no modificar)

- **`diagnostico-supabase.md`** — diagnóstico arquitectónico inicial. Lista 27 hallazgos clasificados por severidad (🔴 crítico, 🟠 alto, 🟡 medio, 🟢 cosmético). Es el "punto de partida".
- **`diagnostico-supabase-notas.md`** — notas raw que se tomaron durante el scan inicial. Útil para auditoría histórica.

### Estado y decisiones (consultá frecuentemente)

- **`01_changelog_back.md`** ⭐ — timeline detallado de migraciones aplicadas (20 en total), estado actual de la BD, decisiones de diseño tomadas, pendientes. **Es la "biblia" del proyecto consolidada.**
- **`02_auditoria_post_refactor_2026-05-16.md`** — auditoría que se corrió el día después del refactor (revisión externa contra el linter de Supabase). Detectó 8 grietas nuevas; todas resueltas o decididas. Tiene en la sección 8 el detalle de la resolución aplicada.
- **`README.md`** (este archivo) — índice maestro.

### Contrato vivo back ↔ front

- **`cambios_back_y_actualizacion_front_requerida.md`** — doc consolidado de lo que el front debe consumir del back. Centrado en 2.1 (RPC `assign_template_to_student`) pero con sección 9 para mejoras menores pendientes. Sigue siendo referencia activa.

### Scripts SQL

- **`fix_2_1_y_raices.sql`** — script SQL auditable del primer fix grande (templates → instancias + raíces 2.1 y 2.3). El resto de migraciones se aplicó vía MCP de Supabase y queda registrado en el historial de migraciones del propio proyecto.

### Handoffs al agente del front (orden cronológico)

| Archivo | Bug | Resumen |
|---|---|---|
| `handoff_para_agente_front.md` | 2.1 | Templates como assignments — RPC `assign_template_to_student` |
| `handoff_22_sessions_para_front.md` | 2.2 | Workout sessions — pre-creación + started_at/finished_at |
| `handoff_24_actual_reps_weights_para_front.md` | 2.4 | Reps/weights sucios — schema nuevo, RPC `save_workout_log` |
| `handoff_24_respuestas_front.md` | 2.4 | Respuestas del front a las 7 decisiones del handoff anterior |
| `handoff_25_student_profiles_para_front.md` | 2.5 | Consolidación de `student_profiles` en `profiles` |
| `handoff_26_descripcion_lesiones_para_front.md` | 2.6 | Nueva columna `descripcion_lesiones` + CHECK |
| `handoff_91_banner_saveerror_para_front.md` | 9.1 | Mejora UX banner saveError (recuperable vs persistente) |

---

## Estado del proyecto al cierre (2026-05-16)

### Diagnóstico original

- **🔴 Críticos (7/7):** 2.1, 2.2 (parte back), 2.3, 2.4 (Fases 1+2), 2.5, 2.6, 2.7
- **🟠 Altos (7/7):** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
- **🟡 Medios (8/8):** 4.1 a 4.8
- **🟢 Cosméticos:** 5.1 + 5.3 aplicados; 5.2/5.4/5.5 skipped con razón documentada

### Auditoría post-refactor (8 grietas nuevas detectadas, todas atendidas)

- **🔴 Crítico:** view bypassea RLS → resuelto
- **🟠 Altos:** sesiones invertidas en tiempo + policy notifications permisiva + 9 funciones SD sin search_path → resueltos
- **🟡 Medios:** archived apuntando a template + plan_exercises sin block + plans sin creator → resueltos
- **🟢 Bajos:** `_tmp_*` rename + notifs viejas → resueltos
- **Decisiones documentadas (no se atacan a nivel back):** 3 alumnos sin `weight_kg` (front comunica al usuario), is_test opcional, lints de performance (esperar tráfico real)

### Pendientes operativos

- **2.4 Fase 3** — drop de columnas viejas `actual_reps`, `actual_weights`, `actual_weight`. Esperar 1-2 sprints de estabilidad del front antes.
- **9.1** — UX banner saveError. Handoff entregado, esperando implementación del front.
- **Auth dashboard config** — habilitar `auth_leaked_password_protection` en Supabase Dashboard → Authentication.

### Guardrails automáticos activos en producción

- **6 cron jobs** (cleanup diario + 4 notifs + health check semanal ampliado).
- **7 triggers preventivos** (forbid_template, close_eval_on_result, sessions_finished_requires_started, audit_profile_changes, etc.).
- **10 CHECK constraints** que validan coherencia en tiempo de INSERT/UPDATE (incluye el nuevo `sessions_finished_after_started` agregado el 2026-05-16).
- **6 RLS policies** instaladas o ajustadas durante el proyecto.
- **Health check semanal ampliado** que detecta 6 categorías de regresiones y notifica a los coaches.
- **0 funciones SECURITY DEFINER sin `search_path`** (vulnerabilidad de schema hijacking eliminada).
- **0 vistas SECURITY DEFINER** (todas con `security_invoker=on`).

Detalle en `01_changelog_back.md`.

---

## Principios aplicados durante el proyecto

Estos principios guiaron todas las decisiones tomadas. Si vuelve a aparecer un bug nuevo, conviene seguirlos:

1. **No eliminar información — dar consistencia a lo inconsistente.** Cuando había datos sucios, se reorganizaron sin borrar. Las tablas obsoletas se movieron al schema `archive` (no se dropearon). Las columnas vacías sí se removieron solo cuando tenían 0% de uso real y total preservación de la semántica.

2. **Atacar el síntoma + tapar la raíz.** Cada bug crítico recibió dos fixes: limpiar los datos sucios actuales (síntoma) e instalar un trigger/cron/constraint que impide o detecta la reaparición (raíz).

3. **Atomicidad estricta.** Todas las migraciones grandes se aplicaron en transacciones. Si algo fallaba en el medio, la BD revertía sola.

4. **Coordinación explícita con el front.** Cualquier cambio que requiriera ajuste del front se documentó en un handoff con decisiones explícitas y respuestas esperadas antes de tocar nada.

5. **Trazabilidad sin overhead manual.** Triggers automáticos pueblan `student_edit_history`. Migraciones quedan registradas vía MCP. Notificaciones generadas por el health check. El sistema se auto-documenta.

6. **Auditar después de actuar.** Una vez que el refactor base estuvo aplicado, se corrió una auditoría externa (con el linter de Supabase + verificaciones manuales) que detectó 8 grietas finas no cubiertas por las queries de health check. La lección: las queries automáticas son una primera capa, pero un linter externo periódico encuentra cosas que la propia BD no se cuestiona.

---

## ¿Cómo continuar el trabajo?

- **Si aparece un bug nuevo:** crear un nuevo handoff siguiendo la convención `handoff_<bug>_<nombre>_para_front.md`. Documentar decisiones antes de tocar BD.
- **Si el health check semanal emite alertas:** revisar el `data` del notification (es un jsonb con los counts por categoría) y ver el changelog para el contexto.
- **Si querés extender el modelo:** consultar `01_changelog_back.md` para no romper convenciones existentes (ej. `weight_mode`, `unilateral`, herencia exercise → plan_exercise → log).

---

Cualquier duda sobre lo aplicado, el changelog tiene los detalles. Si tu pregunta no está cubierta ahí, probablemente esté en un handoff específico.
