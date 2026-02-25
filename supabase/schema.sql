-- ============================================================
-- Households
-- ============================================================
create table households (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  invite_code text unique not null default upper(substring(gen_random_uuid()::text from 1 for 6)),
  created_at timestamp with time zone default now()
);

-- ============================================================
-- Household Members
-- ============================================================
create table household_members (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text default 'member' check (role in ('admin', 'member')),
  joined_at timestamp with time zone default now(),
  unique(household_id, user_id)
);

-- ============================================================
-- Pantry Items
-- ============================================================
create table pantry_items (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  created_by uuid references auth.users(id) not null,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'count',
  category text not null default 'other',
  storage_location text not null default 'pantry',
  brand text,
  expiration_date date,
  estimated_freshness_days integer,
  store_of_purchase text,
  purchase_price numeric,
  price_per_unit numeric,
  barcode text,
  date_added timestamp with time zone default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table households enable row level security;
alter table household_members enable row level security;
alter table pantry_items enable row level security;

-- Households: members can read their household
create policy "Members can view their household"
  on households for select
  using (
    id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- Households: any authenticated user can create
create policy "Authenticated users can create households"
  on households for insert
  with check (auth.uid() is not null);

-- Household members: members can view others in same household
create policy "Members can view household members"
  on household_members for select
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- Household members: authenticated users can insert (join)
create policy "Authenticated users can join households"
  on household_members for insert
  with check (auth.uid() = user_id);

-- Pantry items: household members can read
create policy "Household members can view pantry"
  on pantry_items for select
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- Pantry items: household members can insert
create policy "Household members can add pantry items"
  on pantry_items for insert
  with check (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- Pantry items: household members can update
create policy "Household members can update pantry items"
  on pantry_items for update
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

-- Pantry items: household members can delete
create policy "Household members can delete pantry items"
  on pantry_items for delete
  using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );
