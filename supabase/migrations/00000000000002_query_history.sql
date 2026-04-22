create table if not exists query_history (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  run_id text,
  status text not null default 'loading' check (status in ('loading', 'completed', 'failed')),
  result jsonb,
  error text,
  elapsed integer not null default 0,
  created_at timestamptz default now()
);

alter table query_history enable row level security;

create policy "Allow all on query_history" on query_history for all using (true) with check (true);
