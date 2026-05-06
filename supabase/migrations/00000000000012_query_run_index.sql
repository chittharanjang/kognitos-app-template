-- Lightweight per-run index for the SQL Query Generator (the "Query" app).
-- Mirror of db_agent_run_index but tuned for the Query automation's output
-- schema: result_row_count (vs record_count) and no databases_queried column
-- (Query is single-source so the field would always be the same).
--
-- Powers /query/run-groups: one card per question with run history, verdict
-- trend, row-count sparkline, and side-by-side compare. Kept fresh by the
-- live indexer in /api/query/runs/verdicts/bootstrap and the Kognitos-paging
-- /api/query/run-groups/backfill route.
--
-- stage_version is included up-front (unlike the DB Agent index which got it
-- via migration 11) so consumers don't need a fallback selector.

create table if not exists query_run_index (
  run_id text primary key,
  question text not null,
  question_norm text not null,
  question_id text not null,
  created_at timestamptz not null,
  status text not null,
  result_row_count integer,
  applied_where_clause_count integer,
  answer_preview text,
  stage text,
  stage_version text,
  indexed_at timestamptz not null default now()
);

create index if not exists idx_query_run_index_qid_created
  on query_run_index (question_id, created_at desc);
create index if not exists idx_query_run_index_qnorm
  on query_run_index (question_norm);
create index if not exists idx_query_run_index_created
  on query_run_index (created_at desc);
create index if not exists idx_query_run_index_stage_version
  on query_run_index (stage_version);

alter table query_run_index enable row level security;

drop policy if exists "Allow all on query_run_index" on query_run_index;
create policy "Allow all on query_run_index"
  on query_run_index
  for all
  using (true)
  with check (true);
