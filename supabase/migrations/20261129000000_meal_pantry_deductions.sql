-- ============================================================
-- Remember what marking a planned meal cooked took out of the
-- pantry, so undoing it can put exactly that back.
-- [{ id, name, amount, unit }] — amount in the pantry item's unit.
-- Safe to re-run.
-- ============================================================

alter table meal_plans add column if not exists pantry_deductions jsonb;
