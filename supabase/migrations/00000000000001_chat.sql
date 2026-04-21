-- Generic chat tables. Rename the prefix (chat_) to a project-specific slug
-- (e.g. invoice_processing_) before deploying. Update TABLES in lib/supabase.ts
-- to match.

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text default 'default',
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null default '',
  tool_call jsonb,
  created_at timestamptz default now()
);

alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;

create policy "Allow all on chat_sessions" on chat_sessions for all using (true) with check (true);
create policy "Allow all on chat_messages" on chat_messages for all using (true) with check (true);
