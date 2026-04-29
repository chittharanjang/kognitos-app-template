-- Read-only SQL execution function used by the Chat assistant.
--
-- The chat route lets Claude generate SQL against the source mirrors
-- (fido_clients, fido_client_address, wealthx_account_details, azure_profile_status).
-- This function is the single execution surface: it accepts only SELECT/WITH
-- statements, blocks any DDL or write keywords, runs inside a read-only
-- transaction, and returns the result as a JSON array.

create or replace function chat_sql(query text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  trimmed text;
  upper_query text;
  result jsonb;
begin
  trimmed := trim(query);

  if trimmed is null or trimmed = '' then
    raise exception 'Empty query';
  end if;

  -- Strip a single trailing semicolon to make Claude-generated SQL friendlier.
  if right(trimmed, 1) = ';' then
    trimmed := trim(rtrim(trimmed, ';'));
  end if;

  upper_query := upper(trimmed);

  -- Only SELECT (or CTE-led WITH ... SELECT) statements are allowed.
  if upper_query not like 'SELECT%' and upper_query not like 'WITH%' then
    raise exception 'Only SELECT (or WITH ... SELECT) statements are allowed.';
  end if;

  -- Defense-in-depth keyword block: refuse anything that smells like a write or DDL.
  if trimmed ~* '\m(insert|update|delete|truncate|drop|alter|create|grant|revoke|rename|copy|vacuum|reindex|comment|cluster|listen|notify|set\s+role|reset)\M' then
    raise exception 'Write or DDL keywords are not allowed.';
  end if;

  -- Reject statement separators so callers can't smuggle in a second statement.
  if trimmed like '%;%' then
    raise exception 'Multiple statements are not allowed.';
  end if;

  -- Run the query inside a read-only transaction subblock.
  set local transaction read only;

  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) as t', trimmed)
  into result;

  return result;
end;
$$;

-- Service role is what the chat API uses; anon/authenticated kept for completeness.
grant execute on function chat_sql(text) to anon, authenticated, service_role;
