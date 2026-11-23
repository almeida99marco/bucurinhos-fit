-- =====================================================================
-- APP PRIVADO: só e-mails autorizados pelo administrador podem criar conta.
-- =====================================================================

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.allowed_emails (
  email text primary key check (email = lower(trim(email)) and email like '%_@_%'),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
alter table public.allowed_emails enable row level security;
-- Sem políticas: ninguém acessa as tabelas diretamente; tudo passa pelas funções abaixo.

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- Bloqueia o cadastro de quem não está na lista (vale também para cadastros feitos fora do app)
create or replace function public.enforce_allowed_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_emails where email = lower(trim(new.email))) then
    raise exception 'APP_PRIVADO: cadastro não autorizado para este e-mail' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger enforce_allowed_signup before insert on auth.users
  for each row execute function public.enforce_allowed_signup();

create or replace function public.admin_list_emails()
returns table (email text, created_at timestamptz, has_account boolean, is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Apenas o administrador pode ver esta lista.'; end if;
  return query
    select a.email, a.created_at,
           exists (select 1 from auth.users u where lower(u.email) = a.email),
           exists (select 1 from auth.users u join public.app_admins ad on ad.user_id = u.id where lower(u.email) = a.email)
      from public.allowed_emails a order by a.created_at;
end $$;

create or replace function public.admin_add_email(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := lower(trim(p_email));
begin
  if not public.is_admin() then raise exception 'Apenas o administrador pode liberar e-mails.'; end if;
  if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  insert into public.allowed_emails (email, added_by) values (v, auth.uid()) on conflict (email) do nothing;
end $$;

-- Remove o e-mail da lista. A conta já criada continua existindo (só impede novos cadastros).
create or replace function public.admin_remove_email(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v text := lower(trim(p_email));
begin
  if not public.is_admin() then raise exception 'Apenas o administrador pode remover e-mails.'; end if;
  if exists (select 1 from auth.users u join public.app_admins ad on ad.user_id = u.id where lower(u.email) = v) then
    raise exception 'Você não pode remover o e-mail do administrador.';
  end if;
  delete from public.allowed_emails where email = v;
end $$;

revoke execute on function public.enforce_allowed_signup() from public, anon, authenticated;
revoke execute on function public.is_admin(), public.admin_list_emails(), public.admin_add_email(text), public.admin_remove_email(text) from public, anon;
grant execute on function public.is_admin(), public.admin_list_emails(), public.admin_add_email(text), public.admin_remove_email(text) to authenticated;

-- Administrador: a conta já existente (primeira conta criada no app)
insert into public.app_admins (user_id)
  select id from auth.users order by created_at limit 1
  on conflict do nothing;
insert into public.allowed_emails (email, added_by)
  select lower(email), id from auth.users
  on conflict do nothing;
