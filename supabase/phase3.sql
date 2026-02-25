-- ============================================================
-- Price History (tracks price per item over time)
-- ============================================================
create table price_history (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  item_name text not null,
  store text,
  price numeric not null,
  price_per_unit numeric,
  unit text,
  purchase_date date not null default current_date,
  created_at timestamp with time zone default now()
);

alter table price_history enable row level security;

create policy "Household members can manage price history"
  on price_history for all
  using (
    household_id in (
      select household_id from household_members where user_id = (select auth.uid())
    )
  );

-- ============================================================
-- Nutrition Goals (per user)
-- ============================================================
create table nutrition_goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  calories numeric,
  protein numeric,
  carbohydrates numeric,
  fat numeric,
  fiber numeric,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table nutrition_goals enable row level security;

create policy "Users can manage their own nutrition goals"
  on nutrition_goals for all
  using (user_id = (select auth.uid()));
