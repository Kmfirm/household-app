alter table meal_plans
  add column if not exists ingredient_overrides jsonb not null default '{}'::jsonb;
