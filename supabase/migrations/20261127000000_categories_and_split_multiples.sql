-- ============================================================
-- Custom categories: households can add their own categories
-- on top of the built-in list (produce, dairy, meat, ...).
-- ============================================================
create table if not exists household_categories (
  id uuid default gen_random_uuid() primary key,
  household_id uuid references households(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default now(),
  unique (household_id, name)
);

alter table household_categories enable row level security;

drop policy if exists "Household members can manage categories" on household_categories;
create policy "Household members can manage categories"
  on household_categories for all
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

-- ============================================================
-- One-time fix: split receipt items bought in multiples
-- (e.g. "2 x Almondmilk, half gallon" stored as one 128 oz row)
-- into one pantry row per package. Only touches untouched rows
-- (nothing used yet) whose size info shows a whole number of packages.
-- Safe to re-run: split rows no longer match.
-- ============================================================
drop table if exists split_src;
create temp table split_src as
select id,
       case when coalesce(pack_count, 0) > 1 then purchased_quantity / pack_count
            else purchased_quantity / package_size end as k
from pantry_items
where receipt_reference_id is not null
  and purchased_quantity > 0
  and quantity = purchased_quantity
  and (coalesce(pack_count, 0) > 1 or package_size > 0);

delete from split_src where k is null or k <> floor(k) or k < 2 or k > 24;

drop table if exists split_rows;
create temp table split_rows as
select p.*
from pantry_items p
join split_src s on s.id = p.id
cross join lateral generate_series(2, s.k::int);

update split_rows r
set quantity = r.quantity / s.k,
    purchased_quantity = r.purchased_quantity / s.k,
    purchase_price = round(r.purchase_price / s.k, 2)
from split_src s
where r.id = s.id;

update split_rows set id = gen_random_uuid();

insert into pantry_items select * from split_rows;

update pantry_items p
set quantity = p.quantity / s.k,
    purchased_quantity = p.purchased_quantity / s.k,
    purchase_price = round(p.purchase_price / s.k, 2)
from split_src s
where p.id = s.id;

drop table split_rows;
drop table split_src;
