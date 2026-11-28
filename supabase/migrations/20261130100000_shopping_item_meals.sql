-- ============================================================
-- Link shopping list items to the planned meals they're for, so the
-- list can show "for Chicken & Rice · Fri dinner" and the planner can
-- show which ingredients are already on the list.
-- An item generated from the week's plan can serve several meals.
-- Safe to re-run.
-- ============================================================

alter table shopping_items add column if not exists meal_plan_ids uuid[] not null default '{}';
