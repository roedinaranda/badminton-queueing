-- Run this AFTER your existing schema.
-- It adds queue sessions and ties waiting players/matches to the current session.

create table if not exists queue_sessions (
  id uuid primary key default gen_random_uuid(),
  name text,
  available_courts integer not null default 2 check (available_courts between 1 and 12),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

alter table queue add column if not exists session_id uuid references queue_sessions(id) on delete set null;
alter table matches add column if not exists session_id uuid references queue_sessions(id) on delete set null;

create index if not exists queue_session_status_idx on queue(session_id,status,joined_at);
create index if not exists matches_session_status_idx on matches(session_id,status,court);

-- Create an initial open session if none exists.
do $$
declare sid uuid;
begin
  select id into sid from queue_sessions where status='open' order by created_at desc limit 1;
  if sid is null then
    insert into queue_sessions(name,available_courts,status) values ('Sunday\'s Bets Session',2,'open') returning id into sid;
  end if;
  update queue set session_id=sid where session_id is null and status in ('waiting','playing');
  update matches set session_id=sid where session_id is null and status='live';
end $$;

alter table queue_sessions enable row level security;
create policy "public read sessions" on queue_sessions for select using (true);
create policy "mvp session insert" on queue_sessions for insert with check (true);
create policy "mvp session update" on queue_sessions for update using (true) with check (true);

alter table queue replica identity full;
alter table matches replica identity full;
alter table queue_sessions replica identity full;

do $$
begin
  alter publication supabase_realtime add table queue_sessions;
exception when duplicate_object then null;
end $$;

-- Verify with:
-- select * from queue_sessions;
-- select id,name,skill_level,session_id,status,joined_at from queue order by joined_at;
-- select id,court,status,session_id from matches order by started_at desc;
