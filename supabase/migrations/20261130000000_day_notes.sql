-- ============================================================
-- Day notes: a free-text reminder per household per day on the
-- meal planner (e.g. "Shelby working late").
-- Safe to re-run.
-- ============================================================

create table if not exists day_notes (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  date date not null,
  body text not null,
  updated_by uuid references auth.users(id),
  updated_at timestamp with time zone default now(),
  unique (household_id, date)
);

alter table day_notes enable row level security;

drop policy if exists "Household members can manage day notes" on day_notes;
create policy "Household members can manage day notes"
  on day_notes for all
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
