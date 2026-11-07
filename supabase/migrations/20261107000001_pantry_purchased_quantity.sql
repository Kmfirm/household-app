-- Remember how much was bought so the pantry can show how much is left.
-- A trigger fills it on insert so every add path (manual, photo, email) gets it.
alter table pantry_items add column if not exists purchased_quantity numeric;

update pantry_items set purchased_quantity = quantity where purchased_quantity is null;

create or replace function set_pantry_purchased_quantity()
returns trigger
language plpgsql
as $$
begin
  if new.purchased_quantity is null then
    new.purchased_quantity := new.quantity;
  end if;
  return new;
end;
$$;

create trigger pantry_items_set_purchased_quantity
  before insert on pantry_items
  for each row execute function set_pantry_purchased_quantity();
