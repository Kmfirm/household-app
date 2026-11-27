-- ============================================================
-- Planned leftovers: meal plan slots that eat leftovers from an
-- earlier planned meal (leftover_of) or from the fridge
-- (leftover_id), plus per-household servings settings.
-- Safe to re-run.
-- ============================================================

-- Fridge leftovers may have no recipe
alter table meal_plans alter column recipe_id drop not null;

-- servings = servings eaten at this slot; null means the household default.
-- The app never set this column before (every row holds the default 2), so clear
-- it once while converting it from integer to numeric.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'meal_plans' and column_name = 'servings') = 'integer' then
    alter table meal_plans alter column servings drop not null;
    alter table meal_plans alter column servings drop default;
    alter table meal_plans alter column servings type numeric using null;
  end if;
end $$;

alter table meal_plans add column if not exists is_leftover boolean not null default false;
alter table meal_plans add column if not exists leftover_name text;
alter table meal_plans add column if not exists leftover_of uuid;
alter table meal_plans add column if not exists leftover_id uuid;

-- Removing a planned cook also removes the leftover meals planned from it
alter table meal_plans drop constraint if exists meal_plans_leftover_of_fkey;
alter table meal_plans add constraint meal_plans_leftover_of_fkey
  foreign key (leftover_of) references meal_plans(id) on delete cascade;

alter table meal_plans drop constraint if exists meal_plans_leftover_id_fkey;
alter table meal_plans add constraint meal_plans_leftover_id_fkey
  foreign key (leftover_id) references leftovers(id) on delete set null;

create index if not exists meal_plans_leftover_of_idx on meal_plans (leftover_of);
create index if not exists meal_plans_leftover_id_idx on meal_plans (leftover_id);

-- Which planned meal a fridge leftover came from
alter table leftovers add column if not exists source_meal_plan_id uuid;
alter table leftovers drop constraint if exists leftovers_source_meal_plan_id_fkey;
alter table leftovers add constraint leftovers_source_meal_plan_id_fkey
  foreign key (source_meal_plan_id) references meal_plans(id) on delete set null;
create index if not exists leftovers_source_meal_plan_id_idx on leftovers (source_meal_plan_id);

-- Household planner settings
create table if not exists household_settings (
  household_id uuid primary key references households(id) on delete cascade,
  servings_per_meal numeric not null default 2,
  leftover_days integer not null default 4,
  updated_at timestamp with time zone default now()
);

alter table household_settings enable row level security;

drop policy if exists "Household members can manage settings" on household_settings;
create policy "Household members can manage settings"
  on household_settings for all
  using (
    household_id in (
      select household_id from household_members where user_id = (select auth.uid())
    )
  )
  with check (
    household_id in (
      select household_id from household_members where user_id = (select auth.uid())
    )
  );
