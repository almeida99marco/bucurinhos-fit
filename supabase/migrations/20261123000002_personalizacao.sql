-- Bucurinho's Fit: cor de destaque e personalização avançada da dieta
alter table public.profiles
  add column if not exists accent_color text not null default 'verde' check (accent_color in ('verde','vermelho'));

alter table public.nutrition_profiles
  add column if not exists secondary_goals text[] not null default '{}',
  add column if not exists custom_goal text,
  add column if not exists strength_days_per_week integer check (strength_days_per_week between 0 and 7),
  add column if not exists running_km_per_week numeric(5,1) check (running_km_per_week between 0 and 250),
  add column if not exists training_time text,
  add column if not exists supplements text;
