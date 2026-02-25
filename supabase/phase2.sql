-- ============================================================
-- Leftovers
-- ============================================================
create table leftovers (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  source_recipe_id uuid references recipes(id) on delete set null,
  name text not null,
  remaining_servings numeric not null,
  expiration_date date,
  notes text,
  created_by uuid references auth.users(id) not null,
  created_at timestamp with time zone default now()
);

alter table leftovers enable row level security;

create policy "Household members can manage leftovers"
  on leftovers for all
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- Allow leftover_id on meal_plans (make recipe_id nullable for leftover-only meals)
alter table meal_plans add column leftover_id uuid references leftovers(id) on delete set null;
alter table meal_plans alter column recipe_id drop not null;

-- ============================================================
-- Nutrition Profiles
-- ============================================================
create table nutrition_profiles (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  item_name text not null,
  calories numeric,
  protein numeric,
  carbohydrates numeric,
  fat numeric,
  fiber numeric,
  sugar numeric,
  sodium numeric,
  serving_size text,
  servings_per_unit numeric default 1,
  source text default 'manual',
  usda_fdc_id text,
  created_at timestamp with time zone default now()
);

alter table nutrition_profiles enable row level security;

create policy "Household members can manage nutrition profiles"
  on nutrition_profiles for all
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- ============================================================
-- Consumption Logs (per-user nutrition tracking)
-- ============================================================
create table consumption_logs (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  date date not null default current_date,
  item_name text not null,
  servings_consumed numeric not null default 1,
  recipe_id uuid references recipes(id) on delete set null,
  leftover_id uuid references leftovers(id) on delete set null,
  nutrition_profile_id uuid references nutrition_profiles(id) on delete set null,
  calories_total numeric,
  protein_total numeric,
  carbs_total numeric,
  fat_total numeric,
  created_at timestamp with time zone default now()
);

alter table consumption_logs enable row level security;

create policy "Users can manage their own consumption logs"
  on consumption_logs for all
  using (user_id = auth.uid());

create policy "Household members can view all consumption logs"
  on consumption_logs for select
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- ============================================================
-- Receipts
-- ============================================================
create table receipts (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  store_name text,
  purchase_date date,
  total_spent numeric,
  image_path text,
  created_by uuid references auth.users(id) not null,
  created_at timestamp with time zone default now()
);

alter table receipts enable row level security;

create policy "Household members can manage receipts"
  on receipts for all
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );
