-- Cardápios por tipo de dia: padrão e véspera de corrida (um ativo de cada tipo)
alter table public.meal_plans add column if not exists day_type text not null default 'padrao'
  check (day_type in ('padrao','vespera_corrida'));
drop index if exists public.meal_plans_one_active;
create unique index meal_plans_one_active on public.meal_plans(user_id, day_type) where status = 'active';
