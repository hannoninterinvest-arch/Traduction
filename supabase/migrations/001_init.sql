-- DocTranslate schema for Supabase Postgres.
-- The API uses the service role key and bypasses RLS.
-- Policies still restrict direct client access to each user's own rows and files.

create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed', 'cancelled')),
  source_lang text not null default 'auto',
  detected_lang text,
  target_lang text not null,
  original_filename text not null,
  original_path text not null,
  original_hash text,
  output_hash text,
  page_count integer not null default 0 check (page_count >= 0),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_pages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  page_index integer not null check (page_index >= 0),
  status text not null default 'queued' check (status in ('queued', 'ocr', 'translating', 'rendering', 'done', 'failed')),
  width integer not null default 0,
  height integer not null default 0,
  image_path text,
  blocks jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, page_index)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  job_id uuid references public.jobs (id) on delete set null,
  user_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  default_target_lang text not null default 'en',
  updated_at timestamptz not null default now()
);

create index if not exists jobs_user_created_idx on public.jobs (user_id, created_at desc);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists job_pages_job_idx on public.job_pages (job_id, page_index);
create index if not exists audit_log_user_idx on public.audit_log (user_id, created_at);
create index if not exists audit_log_job_idx on public.audit_log (job_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists job_pages_set_updated_at on public.job_pages;
create trigger job_pages_set_updated_at
before update on public.job_pages
for each row execute function public.set_updated_at();

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update
before update or delete on public.audit_log
for each row execute function public.prevent_audit_mutation();

create or replace function public.pages_used_this_month(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(page_count), 0)::integer
  from public.jobs
  where user_id = uid
    and status <> 'cancelled'
    and created_at >= date_trunc('month', timezone('utc', now()));
$$;

alter table public.jobs enable row level security;
alter table public.job_pages enable row level security;
alter table public.audit_log enable row level security;
alter table public.user_preferences enable row level security;

drop policy if exists jobs_own on public.jobs;
create policy jobs_own on public.jobs
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists job_pages_own on public.job_pages;
create policy job_pages_own on public.job_pages
for all to authenticated
using (
  exists (
    select 1 from public.jobs
    where jobs.id = job_pages.job_id and jobs.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.jobs
    where jobs.id = job_pages.job_id and jobs.user_id = auth.uid()
  )
);

drop policy if exists audit_log_read_own on public.audit_log;
create policy audit_log_read_own on public.audit_log
for select to authenticated
using (user_id = auth.uid());

drop policy if exists preferences_own on public.user_preferences;
create policy preferences_own on public.user_preferences
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 15728640)
on conflict (id) do update set public = false;

drop policy if exists documents_select_own on storage.objects;
create policy documents_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists documents_insert_own on storage.objects;
create policy documents_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists documents_delete_own on storage.objects;
create policy documents_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
