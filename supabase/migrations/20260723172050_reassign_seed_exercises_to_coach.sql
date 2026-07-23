-- Reasigna los ejercicios "sembrados" (created_by NULL, videoteca seed) al coach real.
--
-- Motivo del bug: la politica RLS `coach_manage_own_exercises` (cmd ALL) solo permite
-- editar/borrar ejercicios donde created_by = auth.uid(). Las 88 filas con created_by NULL
-- eran VISIBLES para el coach (via `coach_select_all_exercises`) pero imposibles de borrar:
-- el DELETE afectaba 0 filas y no devolvia error, entonces el front lo sacaba de la lista
-- de forma optimista y el ejercicio "reaparecia" al recargar.
--
-- Fix: pasar esas filas al coach para que RLS lo deje administrarlas. Idempotente:
-- si no quedan filas NULL, es un no-op.
--
-- Aplicado en produccion el 2026-07-23 via MCP; este archivo deja el repo como fuente de verdad.

update public.exercises
set created_by = '4d7b89ef-28af-4407-9d91-b5616e806ce3'  -- Anto Almanza (unico coach real)
where created_by is null;
