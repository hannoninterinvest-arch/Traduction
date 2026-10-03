/** Plain Postgres schema for Neon. No Supabase auth or storage extensions. */
export const NEON_SCHEMA_SQL = `
create table if not exists jobs (
  id uuid primary key,
  user_id uuid not null,
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

create table if not exists job_pages (
  id uuid primary key,
  job_id uuid not null references jobs (id) on delete cascade,
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

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  job_id uuid references jobs (id) on delete set null,
  user_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists user_preferences (
  user_id uuid primary key,
  default_target_lang text not null default 'en',
  updated_at timestamptz not null default now()
);

create table if not exists documents (
  path text primary key,
  content_type text not null,
  body bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists jobs_user_created_idx on jobs (user_id, created_at desc);
create index if not exists jobs_status_idx on jobs (status);
create index if not exists job_pages_job_idx on job_pages (job_id, page_index);
create index if not exists audit_log_user_idx on audit_log (user_id, created_at);
create index if not exists audit_log_job_idx on audit_log (job_id);

create or replace function prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update
before update or delete on audit_log
for each row execute function prevent_audit_mutation();
`;
