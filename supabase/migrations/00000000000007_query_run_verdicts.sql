-- Per-run reviewer verdicts for the SQL Query Generator (Query app) run history.
--
-- One row per Kognitos run that a reviewer has explicitly marked. Stores a
-- self-contained snapshot of the question + answer at the moment of marking
-- so the row remains useful even if the underlying Kognitos run later ages
-- out of the API's paging window.
--
-- Read/written by GET and PUT /api/query/runs/verdicts and consumed by the
-- Run History list (/query/runs) and the Run Detail page (/query/runs/[runId]).

create table if not exists query_run_verdicts (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  question text,
  answer text,
  verdict text check (verdict in ('correct', 'incorrect')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_query_run_verdicts_verdict
  on query_run_verdicts (verdict);

alter table query_run_verdicts enable row level security;

drop policy if exists "Allow all on query_run_verdicts" on query_run_verdicts;
create policy "Allow all on query_run_verdicts"
  on query_run_verdicts
  for all
  using (true)
  with check (true);
