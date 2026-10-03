-- Auth is Supabase Auth (email magic link + Google OAuth).
-- Enable both providers in the Supabase dashboard:
--   Authentication → Providers → Email (magic link / OTP)
--   Authentication → Providers → Google (client id + secret)
-- Set Authentication → URL configuration:
--   Site URL: the Vercel origin (or http://localhost:3000 for local dev)
--   Redirect URLs: http://localhost:3000/auth/callback and https://<your-app>/auth/callback
--
-- The API verifies access tokens against the project JWKS:
--   ${SUPABASE_URL}/auth/v1/.well-known/jwks.json
-- Optional HS256 fallback: SUPABASE_JWT_SECRET (legacy projects).
-- Anonymous sign-ins stay disabled. The API rejects requests without a verified user id.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_preferences (user_id, default_target_lang)
  values (new.id, 'en')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
