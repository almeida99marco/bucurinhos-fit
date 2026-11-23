-- =====================================================================
-- Bucurinho's Fit — esquema completo (tabelas, índices, RLS, storage, triggers)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  avatar_url text,
  birth_date date,
  sex text check (sex in ('masculino','feminino','outro')),
  height_cm numeric(5,1) check (height_cm between 50 and 260),
  weight_kg numeric(5,1) check (weight_kg between 20 and 400),
  goal_weight_kg numeric(5,1) check (goal_weight_kg between 20 and 400),
  activity_level text check (activity_level in ('sedentario','leve','moderado','intenso','muito_intenso')),
  fitness_goals text,
  running_enabled boolean not null default false,
  water_goal_ml integer not null default 2500 check (water_goal_ml between 500 and 8000),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria perfil automaticamente no cadastro.
-- Corrida habilitada por padrão para o perfil masculino (pode ser alterado no Perfil).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sex text := nullif(new.raw_user_meta_data->>'sex','');
begin
  insert into public.profiles (id, email, full_name, sex, running_enabled)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    v_sex,
    coalesce(v_sex = 'masculino', false)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- COMPARTILHAMENTO (somente com autorização expressa do dono dos dados)
-- scopes possíveis: 'evolucao','fotos','treinos','corrida','nutricao'
-- ---------------------------------------------------------------------
create table public.data_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,   -- dono dos dados
  viewer_id uuid not null references auth.users(id) on delete cascade, -- quem pode ver
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, viewer_id),
  check (user_id <> viewer_id)
);
create index data_shares_viewer_idx on public.data_shares(viewer_id);

create or replace function public.can_view(p_owner uuid, p_scope text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.data_shares s
    where s.user_id = p_owner and s.viewer_id = auth.uid() and p_scope = any(s.scopes)
  );
$$;

-- Concede acesso a outro usuário pelo e-mail (executado pelo dono).
create or replace function public.share_with_email(p_email text, p_scopes text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_viewer uuid; v_id uuid;
begin
  select id into v_viewer from public.profiles where lower(email) = lower(trim(p_email));
  if v_viewer is null then
    raise exception 'Nenhum usuário encontrado com este e-mail';
  end if;
  if v_viewer = auth.uid() then
    raise exception 'Você não pode compartilhar com você mesmo';
  end if;
  insert into public.data_shares (user_id, viewer_id, scopes)
  values (auth.uid(), v_viewer, p_scopes)
  on conflict (user_id, viewer_id) do update set scopes = excluded.scopes
  returning id into v_id;
  return v_id;
end $$;

-- Perfis públicos mínimos de quem compartilhou comigo / com quem compartilho.
create or replace function public.shared_profiles()
returns table (id uuid, full_name text, email text, direction text, scopes text[], share_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email, 'incoming', s.scopes, s.id
    from public.data_shares s join public.profiles p on p.id = s.user_id
   where s.viewer_id = auth.uid()
  union all
  select p.id, p.full_name, p.email, 'outgoing', s.scopes, s.id
    from public.data_shares s join public.profiles p on p.id = s.viewer_id
   where s.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- METAS
-- ---------------------------------------------------------------------
create table public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('peso','calorias','agua','treinos_semana','km_semana','personalizada')),
  title text not null,
  target_value numeric,
  unit text,
  target_date date,
  active boolean not null default true,
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);
create index user_goals_user_idx on public.user_goals(user_id);

-- ---------------------------------------------------------------------
-- NUTRIÇÃO
-- ---------------------------------------------------------------------
create table public.nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  goal text check (goal in ('emagrecimento','manutencao','ganho_massa')),
  activity_level text check (activity_level in ('sedentario','leve','moderado','intenso','muito_intenso')),
  target_weight_kg numeric(5,1),
  restrictions text,
  allergies text,
  health_conditions text,
  preferences text,
  dislikes text,
  meals_per_day integer check (meals_per_day between 2 and 8),
  budget text check (budget in ('economico','moderado','livre')),
  routine text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create trigger nutrition_profiles_updated_at before update on public.nutrition_profiles
  for each row execute function public.set_updated_at();

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active','archived')),
  target_calories integer,
  total_calories numeric(7,1) default 0,
  protein_g numeric(6,1) default 0,
  carbs_g numeric(6,1) default 0,
  fat_g numeric(6,1) default 0,
  fiber_g numeric(6,1) default 0,
  notes text,
  source text not null default 'ai' check (source in ('ai','manual')),
  created_at timestamptz not null default now()
);
create index meal_plans_user_idx on public.meal_plans(user_id, created_at desc);
-- No máximo um plano ativo por usuário
create unique index meal_plans_one_active on public.meal_plans(user_id) where status = 'active';

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null references public.meal_plans(id) on delete cascade,
  meal_type text not null check (meal_type in ('cafe_manha','lanche_manha','almoco','lanche_tarde','jantar','ceia')),
  name text not null,
  time text,
  position integer not null default 0,
  calories numeric(7,1) default 0,
  protein_g numeric(6,1) default 0,
  carbs_g numeric(6,1) default 0,
  fat_g numeric(6,1) default 0,
  fiber_g numeric(6,1) default 0,
  created_at timestamptz not null default now()
);
create index meals_plan_idx on public.meals(plan_id, position);
create index meals_user_idx on public.meals(user_id);

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  name text not null,
  quantity_g numeric(7,1) not null default 0,
  household_measure text,
  calories numeric(7,1) default 0,
  protein_g numeric(6,1) default 0,
  carbs_g numeric(6,1) default 0,
  fat_g numeric(6,1) default 0,
  fiber_g numeric(6,1) default 0,
  alternatives jsonb not null default '[]',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index food_items_meal_idx on public.food_items(meal_id, position);
create index food_items_user_idx on public.food_items(user_id);

-- Registro diário de refeições realizadas (e alimentos avulsos)
create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  meal_id uuid references public.meals(id) on delete set null,
  name text not null,
  calories numeric(7,1) default 0,
  protein_g numeric(6,1) default 0,
  carbs_g numeric(6,1) default 0,
  fat_g numeric(6,1) default 0,
  fiber_g numeric(6,1) default 0,
  created_at timestamptz not null default now()
);
create index meal_logs_user_date_idx on public.meal_logs(user_id, date);
create unique index meal_logs_meal_day on public.meal_logs(user_id, meal_id, date) where meal_id is not null;

-- ---------------------------------------------------------------------
-- MUSCULAÇÃO
-- ---------------------------------------------------------------------
-- Biblioteca: registros com user_id nulo são do sistema (somente leitura);
-- usuários podem criar exercícios próprios.
create table public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  muscle_group text not null,
  description text,
  instructions text,
  media_url text,
  created_at timestamptz not null default now()
);
create index exercise_library_user_idx on public.exercise_library(user_id);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  goal text,
  notes text,
  active boolean not null default true,
  source text not null default 'manual' check (source in ('manual','ai')),
  created_at timestamptz not null default now()
);
create index workout_plans_user_idx on public.workout_plans(user_id);

create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  label text not null,               -- "Treino A", "Treino B", ...
  name text,                         -- "Peito e tríceps"
  weekdays smallint[] not null default '{}', -- 0=domingo ... 6=sábado
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index workout_days_plan_idx on public.workout_days(plan_id, position);
create index workout_days_user_idx on public.workout_days(user_id);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  library_id uuid references public.exercise_library(id) on delete set null,
  name text not null,
  muscle_group text,
  sets integer not null default 3 check (sets between 1 and 20),
  reps text not null default '10',
  load_kg numeric(6,1),
  rest_seconds integer not null default 60 check (rest_seconds between 0 and 900),
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index exercises_day_idx on public.exercises(workout_day_id, position);
create index exercises_user_idx on public.exercises(user_id);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_day_id uuid references public.workout_days(id) on delete set null,
  title text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_seconds integer,
  notes text
);
create index workout_sessions_user_idx on public.workout_sessions(user_id, started_at desc);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text not null,
  set_number integer not null,
  reps integer,
  load_kg numeric(6,1),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index workout_sets_session_idx on public.workout_sets(session_id);
create index workout_sets_user_name_idx on public.workout_sets(user_id, exercise_name, created_at);

-- ---------------------------------------------------------------------
-- CORRIDA (preparado para Strava / Garmin / Apple Health via source + external_id)
-- ---------------------------------------------------------------------
create table public.running_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  status text not null default 'done' check (status in ('done','planned')),
  type text not null check (type in ('leve','rodagem','intervalado','tiros','longao','ritmo','recuperacao')),
  distance_km numeric(6,2) not null check (distance_km >= 0 and distance_km <= 400),
  duration_seconds integer check (duration_seconds >= 0),
  pace_seconds_per_km integer,
  avg_heart_rate integer check (avg_heart_rate between 30 and 250),
  calories integer,
  notes text,
  source text not null default 'manual' check (source in ('manual','ai','strava','garmin','apple_health')),
  external_id text,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index running_sessions_user_date_idx on public.running_sessions(user_id, date desc);

create table public.running_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  target_km numeric(6,2) not null,
  target_time_seconds integer,
  target_date date,
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);
create index running_goals_user_idx on public.running_goals(user_id);

-- ---------------------------------------------------------------------
-- EVOLUÇÃO FÍSICA
-- ---------------------------------------------------------------------
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  weight_kg numeric(5,1),
  body_fat_pct numeric(4,1) check (body_fat_pct between 2 and 70),
  waist_cm numeric(5,1),
  abdomen_cm numeric(5,1),
  chest_cm numeric(5,1),
  arm_cm numeric(5,1),
  thigh_cm numeric(5,1),
  hip_cm numeric(5,1),
  notes text,
  created_at timestamptz not null default now()
);
create index body_measurements_user_date_idx on public.body_measurements(user_id, date);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  storage_path text not null,
  pose text check (pose in ('frente','lado','costas','outro')),
  notes text,
  created_at timestamptz not null default now()
);
create index progress_photos_user_idx on public.progress_photos(user_id, date desc);

-- ---------------------------------------------------------------------
-- HIDRATAÇÃO, ATIVIDADE, NOTIFICAÇÕES, IA
-- ---------------------------------------------------------------------
create table public.water_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  amount_ml integer not null check (amount_ml between 1 and 3000),
  created_at timestamptz not null default now()
);
create index water_tracking_user_date_idx on public.water_tracking(user_id, date);

create table public.daily_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  kind text not null check (kind in ('musculacao','corrida','refeicao','agua','medidas','descanso','dieta','outro')),
  title text not null,
  ref_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index daily_activity_user_date_idx on public.daily_activity(user_id, date desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('refeicao','agua','treino','corrida','medidas','personalizado')),
  title text not null,
  time_of_day time not null,
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
  enabled boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id);

create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('dieta','substituir_refeicao','substituir_alimento','musculacao','corrida','chat')),
  request jsonb not null default '{}',
  response jsonb not null default '{}',
  status text not null default 'done' check (status in ('pending','approved','rejected','done','error')),
  created_at timestamptz not null default now()
);
create index ai_interactions_user_idx on public.ai_interactions(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.data_shares enable row level security;
alter table public.user_goals enable row level security;
alter table public.nutrition_profiles enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meals enable row level security;
alter table public.food_items enable row level security;
alter table public.meal_logs enable row level security;
alter table public.exercise_library enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_days enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.running_sessions enable row level security;
alter table public.running_goals enable row level security;
alter table public.body_measurements enable row level security;
alter table public.progress_photos enable row level security;
alter table public.water_tracking enable row level security;
alter table public.daily_activity enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_interactions enable row level security;

-- profiles: dono lê e edita; leitura por quem recebeu qualquer compartilhamento
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or exists (select 1 from public.data_shares s where s.user_id = profiles.id and s.viewer_id = auth.uid()));
create policy "profiles_update" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- data_shares: dono gerencia; visualizador apenas lê
create policy "shares_select" on public.data_shares for select
  using (user_id = auth.uid() or viewer_id = auth.uid());
create policy "shares_insert" on public.data_shares for insert with check (user_id = auth.uid());
create policy "shares_update" on public.data_shares for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shares_delete" on public.data_shares for delete using (user_id = auth.uid() or viewer_id = auth.uid());

-- exercise_library: sistema (user_id nulo) visível a todos autenticados; próprios só do dono
create policy "library_select" on public.exercise_library for select
  to authenticated using (user_id is null or user_id = auth.uid());
create policy "library_insert" on public.exercise_library for insert with check (user_id = auth.uid());
create policy "library_update" on public.exercise_library for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "library_delete" on public.exercise_library for delete using (user_id = auth.uid());

-- Demais tabelas: isolamento por user_id + leitura opcional via compartilhamento autorizado
do $$
declare
  r record;
begin
  for r in select * from (values
    ('user_goals', null),
    ('nutrition_profiles', 'nutricao'),
    ('meal_plans', 'nutricao'),
    ('meals', 'nutricao'),
    ('food_items', 'nutricao'),
    ('meal_logs', 'nutricao'),
    ('workout_plans', 'treinos'),
    ('workout_days', 'treinos'),
    ('exercises', 'treinos'),
    ('workout_sessions', 'treinos'),
    ('workout_sets', 'treinos'),
    ('running_sessions', 'corrida'),
    ('running_goals', 'corrida'),
    ('body_measurements', 'evolucao'),
    ('progress_photos', 'fotos'),
    ('water_tracking', null),
    ('daily_activity', null),
    ('notifications', null),
    ('ai_interactions', null)
  ) as t(tbl, scope)
  loop
    if r.scope is null then
      execute format('create policy "%1$s_select" on public.%1$I for select using (user_id = auth.uid())', r.tbl);
    else
      execute format('create policy "%1$s_select" on public.%1$I for select using (user_id = auth.uid() or public.can_view(user_id, %2$L))', r.tbl, r.scope);
    end if;
    execute format('create policy "%1$s_insert" on public.%1$I for insert with check (user_id = auth.uid())', r.tbl);
    execute format('create policy "%1$s_update" on public.%1$I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', r.tbl);
    execute format('create policy "%1$s_delete" on public.%1$I for delete using (user_id = auth.uid())', r.tbl);
  end loop;
end $$;

-- Garante que registros filhos pertençam ao mesmo dono do registro pai
create or replace function public.assert_same_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if tg_table_name = 'meals' then
    select user_id into v_owner from public.meal_plans where id = new.plan_id;
  elsif tg_table_name = 'food_items' then
    select user_id into v_owner from public.meals where id = new.meal_id;
  elsif tg_table_name = 'workout_days' then
    select user_id into v_owner from public.workout_plans where id = new.plan_id;
  elsif tg_table_name = 'exercises' then
    select user_id into v_owner from public.workout_days where id = new.workout_day_id;
  elsif tg_table_name = 'workout_sets' then
    select user_id into v_owner from public.workout_sessions where id = new.session_id;
  end if;
  if v_owner is distinct from new.user_id then
    raise exception 'Registro pai pertence a outro usuário';
  end if;
  return new;
end $$;

create trigger meals_owner before insert or update on public.meals for each row execute function public.assert_same_owner();
create trigger food_items_owner before insert or update on public.food_items for each row execute function public.assert_same_owner();
create trigger workout_days_owner before insert or update on public.workout_days for each row execute function public.assert_same_owner();
create trigger exercises_owner before insert or update on public.exercises for each row execute function public.assert_same_owner();
create trigger workout_sets_owner before insert or update on public.workout_sets for each row execute function public.assert_same_owner();

-- ---------------------------------------------------------------------
-- STORAGE: avatars e fotos de evolução (privados, pasta = id do usuário)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('progress-photos', 'progress-photos', false)
  on conflict (id) do nothing;

create policy "own_files_select" on storage.objects for select to authenticated
  using (
    bucket_id in ('avatars','progress-photos') and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (bucket_id = 'avatars' and exists (select 1 from public.data_shares s where s.user_id::text = (storage.foldername(name))[1] and s.viewer_id = auth.uid()))
      or (bucket_id = 'progress-photos' and public.can_view(((storage.foldername(name))[1])::uuid, 'fotos'))
    )
  );
create policy "own_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','progress-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own_files_update" on storage.objects for update to authenticated
  using (bucket_id in ('avatars','progress-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own_files_delete" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','progress-photos') and (storage.foldername(name))[1] = auth.uid()::text);
