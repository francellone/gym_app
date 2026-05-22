-- Fix: student no podía borrar su nota.
-- Causa: policy "Student read shared notes of own thread" (SELECT) tiene
-- (deleted_at IS NULL) en USING; en UPDATE+RETURNING Postgres exige que el
-- NEW row pase el USING de SELECT → al setear deleted_at = now() viola RLS
-- (error 42501). Coach no se ve afectado porque su SELECT policy no chequea
-- deleted_at.
-- Agregamos policy adicional: el autor siempre puede SELECT sus notas
-- (incluso soft-deleted), sin exponer notas ajenas.

CREATE POLICY "Student select own notes any state"
  ON public.notes
  FOR SELECT
  TO authenticated
  USING (author_id = auth.uid() AND author_role = 'student');
