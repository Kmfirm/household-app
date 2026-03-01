create table unit_conversions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  ingredient_name text not null,
  oz_per_count numeric not null,
  count_label text not null default 'piece',
  sample_count integer not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(household_id, ingredient_name)
);

alter table unit_conversions enable row level security;

create policy "Household members can manage unit conversions"
on unit_conversions for all
using (
  household_id in (
    select household_id from household_members where user_id = auth.uid()
  )
);
