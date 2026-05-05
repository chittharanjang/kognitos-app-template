-- Add an editable per-run notes field to the existing reviewer-verdict tables
-- for both the SQL Query Generator (Query app) and the DB Agent (ama-agent).
--
-- After this migration:
--   * Every visible run has an explicit row in its verdict table (default
--     verdict='correct'), inserted via the per-app bootstrap API routes
--     (POST /api/query/runs/verdicts/bootstrap and the DB Agent twin).
--   * The new `notes` column captures free-form context per run (e.g. why a
--     run errored). Empty/NULL means "no note"; the UI shows a muted "none"
--     placeholder.
--
-- Read/written by:
--   * GET/PUT /api/query/runs/verdicts and /api/ama-agent/runs/verdicts
--   * POST /api/query/runs/verdicts/bootstrap and the DB Agent twin
--   * The Run History list pages (/query/runs, /ama-agent/runs) and the
--     run detail pages.

alter table query_run_verdicts
  add column if not exists notes text;

alter table db_agent_run_verdicts
  add column if not exists notes text;

create index if not exists idx_query_run_verdicts_has_notes
  on query_run_verdicts (run_id)
  where notes is not null and notes <> '';

create index if not exists idx_db_agent_run_verdicts_has_notes
  on db_agent_run_verdicts (run_id)
  where notes is not null and notes <> '';
