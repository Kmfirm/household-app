alter table meal_plans add column if not exists scale numeric not null default 1;
alter table meal_plans add column if not exists cooked boolean not null default false;
