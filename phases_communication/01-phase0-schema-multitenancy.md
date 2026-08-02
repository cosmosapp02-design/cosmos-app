# Phase 0 — Schema Foundation & Multi-Tenancy

## Objective
Make every existing table properly org-scoped with RLS enforced, and add the columns the new gateway architecture needs. No relay or agent code yet — this is pure schema/security work.

## Work for the LLM (Supabase access)

1. **Audit** `channels`, `threads`, `messages`, `agents`, `agent_workers`, `agent_gateways`, `dispatch_jobs`, `agent_turn_log`, `spend_ledger`, `tasks` for an `org_id` column referencing `organizations(id)`. Add it wherever missing, backfill existing rows to a single default org (whatever the current test org is).

2. **Confirm or create** an `org_members` join table: `(user_id uuid, org_id uuid, role text)`. If `organizations` already embeds membership some other way, use that instead — but there must be a queryable way to answer "which orgs can this user_id see."

3. **Enable RLS** on every table above. Policy pattern for each (adjust table name):
```sql
alter table messages enable row level security;

create policy "org_isolation_select" on messages
  for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );

create policy "org_isolation_insert" on messages
  for insert with check (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );
```
Apply the same select/insert (and update/delete where relevant) pattern to all ten tables. `spend_ledger` and `agent_turn_log` should likely be select-only for normal users (agents/backend write them via service role).

4. **New columns:**
   - `agents`: add `gateway_token_hash` (text — store a SHA-256 hash, never the raw token), `last_sequence` (bigint, default 0)
   - `agent_workers`: confirm/add `session_id` (text), `last_heartbeat_at` (timestamptz)
   - `messages`: add `content_blocks` (jsonb, nullable — keep the existing text column during migration, don't drop it yet)

5. **Token generation:** write a small server-side function (edge function or SQL function callable only via service role) that generates a random token, stores only its hash in `agents.gateway_token_hash`, and returns the raw token once. The raw token is never stored or logged anywhere after that point — this is what the user copies into their local Hermes config in Phase 3.

## Work for the user
- Confirm which `organizations` row is your test org.
- After the LLM applies migrations, spot-check in the Supabase table editor that `org_id` is populated on all rows and RLS is showing as "enabled" (green) on each table.

## Test (must pass before Phase 1)
- Create a second dummy org + dummy user in `org_members`.
- Using the anon key with that second user's session, query `messages`, `agents`, and `channels` — confirm **zero rows** return from the first org.
- Using the anon key with the real user's session, confirm normal data still returns correctly for their own org.
- Confirm `agents.gateway_token_hash` is populated but the raw token is not stored in any table.
