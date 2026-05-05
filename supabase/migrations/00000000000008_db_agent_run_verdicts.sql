-- Per-run reviewer verdicts for the DB Agent (ama-agent) run history.
--
-- Mirror of query_run_verdicts but for the DB Agent automation. One row per
-- Kognitos run that a reviewer has marked correct/incorrect; stores a
-- self-contained snapshot of the question + answer at the moment of marking
-- so the row remains useful even if the underlying Kognitos run later ages
-- out of the API's paging window.
--
-- Read/written by GET and PUT /api/ama-agent/runs/verdicts and consumed by
-- the DB Agent Run History list (/ama-agent/runs) and the run detail page
-- (/ama-agent/runs/[runId]).

create table if not exists db_agent_run_verdicts (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  question text,
  answer text,
  verdict text check (verdict in ('correct', 'incorrect')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_db_agent_run_verdicts_verdict
  on db_agent_run_verdicts (verdict);

alter table db_agent_run_verdicts enable row level security;

drop policy if exists "Allow all on db_agent_run_verdicts" on db_agent_run_verdicts;
create policy "Allow all on db_agent_run_verdicts"
  on db_agent_run_verdicts
  for all
  using (true)
  with check (true);
