-- Restringe a execução direta de funções SECURITY DEFINER (recomendação do Supabase Advisor)
alter function public.set_updated_at() set search_path = public;
revoke execute on function public.assert_same_owner() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.can_view(uuid, text) from public, anon;
revoke execute on function public.share_with_email(text, text[]) from public, anon;
revoke execute on function public.shared_profiles() from public, anon;
grant execute on function public.can_view(uuid, text) to authenticated;
grant execute on function public.share_with_email(text, text[]) to authenticated;
grant execute on function public.shared_profiles() to authenticated;
