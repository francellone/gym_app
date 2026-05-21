-- ─────────────────────────────────────────────────────────────
-- Migración: campos de seguimiento de pagos en tabla profiles
-- Aplicar en: Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Fecha del último pago registrado por el coach
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_payment_date DATE;

-- Fecha de vencimiento del próximo ciclo de pago
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS next_payment_due DATE;

-- Notas libres sobre pagos (visible solo para el coach)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_notes TEXT;

-- ─────────────────────────────────────────────────────────────
-- Lógica de estado de pago (se computa en frontend, NO se persiste)
--
-- getPaymentStatus(student):
--   - 'overdue'   → next_payment_due < hoy
--   - 'due_soon'  → next_payment_due entre hoy y hoy+7
--   - 'up_to_date'→ next_payment_due > hoy+7
--   - 'no_data'   → campo null / vacío
-- ─────────────────────────────────────────────────────────────
