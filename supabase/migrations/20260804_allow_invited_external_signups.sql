-- The signup guard on auth.users (trigger enforce_methodco_domain) originally
-- hard-restricted accounts to @methodco.com. That predates the external
-- read-only member role, whose users sign in from other domains (e.g.
-- hotelave.com, sagamoreventures.com). With the old guard their magic-link
-- request 500'd ("Accounts are restricted to methodco.com") before an auth
-- account could be created, so they could never sign in despite being on the
-- app_users allowlist.
--
-- Allow signup for Method Co. staff OR any email already invited to the
-- app_users allowlist; every other address is still blocked from creating an
-- auth account. SECURITY DEFINER (owner postgres, which bypasses RLS) so the
-- allowlist lookup succeeds when the trigger runs as supabase_auth_admin.
create or replace function public.enforce_methodco_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    raise exception 'Accounts are restricted to methodco.com or invited members';
  end if;
  if new.email ~* '@methodco\.com$'
     or exists (select 1 from public.app_users u where lower(u.email) = lower(new.email)) then
    return new;
  end if;
  raise exception 'Accounts are restricted to methodco.com or invited members';
end;
$$;

-- Trigger already exists from the original guard; kept for a clean re-apply.
drop trigger if exists enforce_methodco_domain on auth.users;
create trigger enforce_methodco_domain
  before insert on auth.users
  for each row execute function public.enforce_methodco_domain();
