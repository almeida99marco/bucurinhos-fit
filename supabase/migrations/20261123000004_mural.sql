-- =====================================================================
-- MURAL: posts com foto (pratos, treinos), curtidas e comentários.
-- Quem vê: o autor e quem recebeu dele o compartilhamento "mural".
-- =====================================================================

create or replace function public.can_see_wall(p_author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_author = auth.uid() or public.can_view(p_author, 'mural');
$$;

create table public.wall_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'outro' check (kind in ('prato','treino','outro')),
  caption text check (char_length(caption) <= 1000),
  photo_path text not null,
  created_at timestamptz not null default now()
);
create index wall_posts_created_idx on public.wall_posts (created_at desc);
create index wall_posts_user_idx on public.wall_posts (user_id);

create table public.wall_likes (
  post_id uuid not null references public.wall_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index wall_likes_user_idx on public.wall_likes (user_id);

create table public.wall_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.wall_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index wall_comments_post_idx on public.wall_comments (post_id, created_at);
create index wall_comments_user_idx on public.wall_comments (user_id);

alter table public.wall_posts enable row level security;
alter table public.wall_likes enable row level security;
alter table public.wall_comments enable row level security;

create policy wall_posts_select on public.wall_posts for select to authenticated using (public.can_see_wall(user_id));
create policy wall_posts_insert on public.wall_posts for insert to authenticated
  with check (user_id = auth.uid() and split_part(photo_path, '/', 1) = auth.uid()::text);
create policy wall_posts_update on public.wall_posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wall_posts_delete on public.wall_posts for delete to authenticated using (user_id = auth.uid());

create policy wall_likes_select on public.wall_likes for select to authenticated
  using (exists (select 1 from public.wall_posts p where p.id = post_id and public.can_see_wall(p.user_id)));
create policy wall_likes_insert on public.wall_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.wall_posts p where p.id = post_id and public.can_see_wall(p.user_id)));
create policy wall_likes_delete on public.wall_likes for delete to authenticated using (user_id = auth.uid());

create policy wall_comments_select on public.wall_comments for select to authenticated
  using (exists (select 1 from public.wall_posts p where p.id = post_id and public.can_see_wall(p.user_id)));
create policy wall_comments_insert on public.wall_comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.wall_posts p where p.id = post_id and public.can_see_wall(p.user_id)));
-- apaga o próprio comentário, ou qualquer comentário no próprio post
create policy wall_comments_delete on public.wall_comments for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.wall_posts p where p.id = post_id and p.user_id = auth.uid()));

-- Feed com nome do autor, curtidas e comentários (respeita a mesma regra de visibilidade)
create or replace function public.wall_feed(p_limit int default 20, p_before timestamptz default null)
returns table (id uuid, user_id uuid, kind text, caption text, photo_path text, created_at timestamptz,
               author_name text, author_avatar text, like_count bigint, liked boolean, comment_count bigint, likers text[])
language sql stable security definer set search_path = public as $$
  select p.id, p.user_id, p.kind, p.caption, p.photo_path, p.created_at,
         pr.full_name, pr.avatar_url,
         (select count(*) from wall_likes l where l.post_id = p.id),
         exists (select 1 from wall_likes l where l.post_id = p.id and l.user_id = auth.uid()),
         (select count(*) from wall_comments c where c.post_id = p.id),
         array(select case when l.user_id = auth.uid() then 'Você' else coalesce(nullif(split_part(lp.full_name, ' ', 1), ''), 'Alguém') end from wall_likes l join profiles lp on lp.id = l.user_id
                where l.post_id = p.id order by l.created_at)
    from wall_posts p join profiles pr on pr.id = p.user_id
   where public.can_see_wall(p.user_id) and (p_before is null or p.created_at < p_before)
   order by p.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.wall_comments_for(p_post uuid)
returns table (id uuid, user_id uuid, body text, created_at timestamptz, author_name text, author_avatar text)
language sql stable security definer set search_path = public as $$
  select c.id, c.user_id, c.body, c.created_at, pr.full_name, pr.avatar_url
    from wall_comments c join wall_posts p on p.id = c.post_id join profiles pr on pr.id = c.user_id
   where c.post_id = p_post and public.can_see_wall(p.user_id)
   order by c.created_at;
$$;

-- Libera o meu mural para alguém (pelo e-mail), mantendo os outros compartilhamentos
create or replace function public.mural_invite(p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_viewer uuid; v_id uuid;
begin
  select id into v_viewer from public.profiles where lower(email) = lower(trim(p_email));
  if v_viewer is null then raise exception 'Nenhum usuário encontrado com este e-mail. A pessoa precisa criar a conta no app primeiro.'; end if;
  if v_viewer = auth.uid() then raise exception 'Use o e-mail da outra pessoa.'; end if;
  insert into public.data_shares (user_id, viewer_id, scopes) values (auth.uid(), v_viewer, array['mural'])
  on conflict (user_id, viewer_id) do update
    set scopes = (select array(select distinct unnest(data_shares.scopes || array['mural'])))
  returning id into v_id;
  return v_id;
end $$;

-- Remove o acesso de alguém ao meu mural
create or replace function public.mural_revoke(p_viewer uuid)
returns void language sql security definer set search_path = public as $$
  update public.data_shares set scopes = array_remove(scopes, 'mural') where user_id = auth.uid() and viewer_id = p_viewer;
$$;

revoke execute on function public.can_see_wall(uuid), public.wall_feed(int, timestamptz), public.wall_comments_for(uuid),
  public.mural_invite(text), public.mural_revoke(uuid) from public, anon;
grant execute on function public.can_see_wall(uuid), public.wall_feed(int, timestamptz), public.wall_comments_for(uuid),
  public.mural_invite(text), public.mural_revoke(uuid) to authenticated;

-- Storage: fotos do mural (privadas, pasta = id do autor)
insert into storage.buckets (id, name, public) values ('wall-photos', 'wall-photos', false) on conflict (id) do nothing;
create policy "wall_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'wall-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.data_shares s
                where s.user_id::text = (storage.foldername(name))[1] and s.viewer_id = auth.uid() and 'mural' = any(s.scopes))));
create policy "wall_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'wall-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "wall_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'wall-photos' and (storage.foldername(name))[1] = auth.uid()::text);
