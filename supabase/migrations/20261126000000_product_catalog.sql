-- ============================================================
-- Product catalog: package size and nutrition looked up by barcode
-- (Open Food Facts, then USDA FoodData Central). Shared across
-- households because it only holds public product data. Written
-- only by edge functions (service role); readable by any signed-in user.
-- ============================================================
create table if not exists product_catalog (
  product_key text primary key,          -- 'upc:<12-13 digit gtin>' or 'name:<normalized receipt text>'
  upc text,
  name text,
  brand text,
  package_size numeric,                  -- size of one package (or one piece of a multi-pack)
  package_unit text,                     -- oz | fl oz | lb | g | kg | ml | l | gal
  pack_count numeric,
  serving_size text,                     -- as labelled, e.g. '1 bar (23 g)'
  serving_grams numeric,
  servings_per_package numeric,
  calories numeric,                      -- all nutrition values are per serving
  protein numeric,
  carbohydrates numeric,
  fat numeric,
  saturated_fat numeric,
  fiber numeric,
  sugar numeric,
  sodium numeric,                        -- mg
  image_url text,
  source text,                           -- openfoodfacts | usda | openfoodfacts+usda
  source_id text,
  lookup_status text not null default 'found' check (lookup_status in ('found', 'not_found')),
  fetched_at timestamp with time zone not null default now()
);

alter table product_catalog enable row level security;

drop policy if exists "Signed-in users can read the product catalog" on product_catalog;
create policy "Signed-in users can read the product catalog"
  on product_catalog for select
  to authenticated
  using (true);

alter table pantry_items add column if not exists product_key text references product_catalog(product_key) on delete set null;
alter table pantry_items add column if not exists upc text;
alter table pantry_items add column if not exists package_size numeric;
alter table pantry_items add column if not exists package_unit text;
alter table pantry_items add column if not exists pack_count numeric;
alter table pantry_items add column if not exists unit_price numeric;
alter table pantry_items add column if not exists unit_price_unit text;   -- lb | fl oz | each

create index if not exists pantry_items_product_key_idx on pantry_items(product_key);
