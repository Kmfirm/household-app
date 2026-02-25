-- ============================================================
-- Shopping List Items
-- ============================================================
create table shopping_items (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'count',
  category text not null default 'other',
  store text,
  checked boolean not null default false,
  auto_generated boolean not null default false,
  recipe_id uuid references recipes(id) on delete set null,
  created_by uuid references auth.users(id) not null,
  created_at timestamp with time zone default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table shopping_items enable row level security;

create policy "Household members can view shopping items"
  on shopping_items for select
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "Household members can add shopping items"
  on shopping_items for insert
  with check (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "Household members can update shopping items"
  on shopping_items for update
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "Household members can delete shopping items"
  on shopping_items for delete
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );
