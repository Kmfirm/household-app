-- ============================================================
-- Email receipt import
-- Each household gets a secret token. Emails forwarded to
-- <inbound-address>+<token>@inbound.postmarkapp.com are parsed
-- by the inbound-email edge function and added to the pantry.
-- ============================================================
create table email_import_addresses (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null unique,
  user_id uuid references auth.users(id) on delete cascade not null,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamp with time zone default now()
);

alter table email_import_addresses enable row level security;

create policy "Household members can manage email import address"
  on email_import_addresses for all
  using (
    household_id in (
      select household_id from household_members where user_id = (select auth.uid())
    )
  );

-- Log of every email received, so the app can show what happened
-- (including the Gmail forwarding confirmation email)
create table inbound_emails (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  message_id text not null unique,
  from_address text,
  subject text,
  status text not null check (status in ('processing', 'imported', 'skipped', 'gmail_verification', 'error')),
  error text,
  body_preview text,
  receipt_id uuid references receipts(id) on delete set null,
  created_at timestamp with time zone default now()
);

alter table inbound_emails enable row level security;

create policy "Household members can view and delete inbound emails"
  on inbound_emails for all
  using (
    household_id in (
      select household_id from household_members where user_id = (select auth.uid())
    )
  );

alter table receipts add column if not exists source text not null default 'photo';
