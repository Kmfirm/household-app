-- ============================================================
-- Meal Plans
-- ============================================================
create table meal_plans (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  date date not null,
  recipe_id uuid references recipes(id) on delete cascade not null,
  meal_type text not null default 'dinner'
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  servings integer not null default 2,
  created_by uuid references auth.users(id) not null,
  created_at timestamp with time zone default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table meal_plans enable row level security;

create policy "Household members can view meal plans"
  on meal_plans for select
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "Household members can add meal plans"
  on meal_plans for insert
  with check (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "Household members can delete meal plans"
  on meal_plans for delete
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "Household members can update meal plans"
  on meal_plans for update
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );
