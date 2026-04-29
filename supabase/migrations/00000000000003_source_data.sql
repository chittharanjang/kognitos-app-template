-- Mirrors of the source-of-truth tables that the SQL Query Generator
-- normally queries live (FIDO + WealthX in Snowflake, Profile Status in Azure SQL).
-- Loaded into Supabase by the source-loader (lib/source-loader.ts) so the
-- Query Assistant can run against a local cache when desired.

-- FIDO.CLIENTS_FIDO
create table if not exists fido_clients (
  fiduciary_id text primary key,
  first_name text,
  last_name text,
  ssn_last4digits text,
  date_of_birth_or_inception text,
  primary_email text,
  mobile_phone text,
  online_portal_access text,
  loaded_at timestamptz default now()
);

-- FIDO.CLIENT_ADDRESS  (one client may have many addresses)
create table if not exists fido_client_address (
  id uuid primary key default gen_random_uuid(),
  fiduciary_id text not null,
  postal_code text,
  loaded_at timestamptz default now()
);
create index if not exists idx_fido_client_address_fid on fido_client_address (fiduciary_id);

-- WealthX.ACCOUNT_DETAILS  (one client may have many accounts)
create table if not exists wealthx_account_details (
  id uuid primary key default gen_random_uuid(),
  fiduciary_id text not null,
  account_number text,
  account_status text,
  account_type text,
  loaded_at timestamptz default now()
);
create index if not exists idx_wealthx_account_fid on wealthx_account_details (fiduciary_id);
create index if not exists idx_wealthx_account_number on wealthx_account_details (account_number);

-- AzureSQL.PROFILE_STATUS
create table if not exists azure_profile_status (
  fiduciary_id text primary key,
  profile_status text,
  loaded_at timestamptz default now()
);

-- Audit log for each load attempt (one row per source table per attempt)
create table if not exists source_load_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,                       -- e.g. 'FIDO', 'WealthX', 'Profile Status'
  table_name text not null,                   -- supabase target table
  source_table text not null,                 -- original SOURCE.TABLE
  run_id text,                                -- kognitos run id
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  row_count integer,
  generated_sql text,
  error text,
  started_at timestamptz default now(),
  completed_at timestamptz
);
create index if not exists idx_source_load_runs_table on source_load_runs (table_name, started_at desc);
create index if not exists idx_source_load_runs_status on source_load_runs (status);

alter table fido_clients enable row level security;
alter table fido_client_address enable row level security;
alter table wealthx_account_details enable row level security;
alter table azure_profile_status enable row level security;
alter table source_load_runs enable row level security;

-- Permissive RLS to match the rest of the project (query_history pattern).
-- Mutations only happen via service_role key from the server.
create policy "Allow all on fido_clients" on fido_clients for all using (true) with check (true);
create policy "Allow all on fido_client_address" on fido_client_address for all using (true) with check (true);
create policy "Allow all on wealthx_account_details" on wealthx_account_details for all using (true) with check (true);
create policy "Allow all on azure_profile_status" on azure_profile_status for all using (true) with check (true);
create policy "Allow all on source_load_runs" on source_load_runs for all using (true) with check (true);
