-- Add stage_version to the DB Agent run index so the Run History UI can show
-- which automation version produced each run (e.g. "Draft v5.8").
--
-- Kognitos returns this on every run object as the top-level `stage_version`
-- field, alongside `stage`. Indexed runs predating this migration will simply
-- have NULL until they are next bootstrapped or until POST
-- /api/ama-agent/run-groups/backfill is re-run.

alter table db_agent_run_index
  add column if not exists stage_version text;

create index if not exists idx_db_agent_run_index_stage_version
  on db_agent_run_index (stage_version);
