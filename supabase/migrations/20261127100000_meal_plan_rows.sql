-- ============================================================
-- Meal planner rows: allow any meal name (not just breakfast /
-- lunch / dinner / snack) and remember extra rows per household.
-- ============================================================
alter table meal_plans drop constraint if exists meal_plans_meal_type_check;

create table if not exists household_meal_types (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone default now(),
  unique (household_id, name)
);

alter table household_meal_types enable row level security;

drop policy if exists "Household members can manage meal types" on household_meal_types;
create policy "Household members can manage meal types"
  on household_meal_types for all
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
