-- ============================================================
-- Recipes
-- ============================================================
create table recipes (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  created_by uuid references auth.users(id) not null,
  name text not null,
  total_servings integer not null default 4,
  instructions text,
  notes text,
  rating integer check (rating >= 1 and rating <= 5),
  created_at timestamp with time zone default now()
);

-- ============================================================
-- Recipe Ingredients
-- ============================================================
create table recipe_ingredients (
  id uuid default gen_random_uuid() primary key,
  recipe_id uuid references recipes(id) on delete cascade not null,
  name text not null,
  quantity numeric not null,
  unit text not null default 'count',
  category text
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;

-- Recipes: household members can read
create policy "Household members can view recipes"
  on recipes for select
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- Recipes: household members can insert
create policy "Household members can add recipes"
  on recipes for insert
  with check (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- Recipes: household members can update
create policy "Household members can update recipes"
  on recipes for update
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- Recipes: household members can delete
create policy "Household members can delete recipes"
  on recipes for delete
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- Recipe ingredients: accessible if user can access the recipe
create policy "Household members can view recipe ingredients"
  on recipe_ingredients for select
  using (
    recipe_id in (
      select id from recipes where household_id in (
        select household_id from household_members where user_id = auth.uid()
      )
    )
  );

create policy "Household members can manage recipe ingredients"
  on recipe_ingredients for all
  using (
    recipe_id in (
      select id from recipes where household_id in (
        select household_id from household_members where user_id = auth.uid()
      )
    )
  );
