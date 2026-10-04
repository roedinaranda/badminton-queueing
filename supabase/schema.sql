-- Badminton Queue MVP schema
create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  skill_level text not null default 'Intermediate' check (skill_level in ('Beginner','Intermediate','Advanced')),
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  court integer not null default 1,
  status text not null default 'live' check (status in ('live','finished','cancelled')),
  winner integer check (winner in (1,2)),
  score_team1 integer not null default 0,
  score_team2 integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists match_players (
  match_id uuid references matches(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  team integer not null check (team in (1,2)),
  primary key (match_id, player_id)
);

create table if not exists queue (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  status text not null default 'waiting' check (status in ('waiting','playing','left','completed')),
  match_id uuid references matches(id) on delete set null
);

create table if not exists rating_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  match_id uuid references matches(id) on delete cascade,
  old_rating integer not null,
  new_rating integer not null,
  change integer not null,
  created_at timestamptz not null default now()
);

create index if not exists queue_waiting_idx on queue(status, joined_at);
create index if not exists matches_status_idx on matches(status, started_at desc);

-- Prevent a player from being queued twice at the same time.
create unique index if not exists one_active_queue_per_player
on queue(player_id) where status = 'waiting';

-- Realtime
alter table players replica identity full;
alter table queue replica identity full;
alter table matches replica identity full;
alter table match_players replica identity full;

do $$
begin
  alter publication supabase_realtime add table players;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table queue;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table matches;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table match_players;
exception when duplicate_object then null;
end $$;

-- MVP RLS: public player joining/reading. For a real club deployment,
-- replace these with Supabase Auth policies and an admin role.
alter table players enable row level security;
alter table queue enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table rating_history enable row level security;

create policy "public read players" on players for select using (true);
create policy "public create players" on players for insert with check (true);
create policy "public read queue" on queue for select using (true);
create policy "public join queue" on queue for insert with check (true);
create policy "public leave queue" on queue for update using (true) with check (true);
create policy "public read matches" on matches for select using (true);
create policy "public read match players" on match_players for select using (true);
create policy "public read ratings" on rating_history for select using (true);

-- Admin mutations should be moved behind authenticated RPCs before public production use.
create policy "mvp match insert" on matches for insert with check (true);
create policy "mvp match update" on matches for update using (true) with check (true);
create policy "mvp match players insert" on match_players for insert with check (true);

-- Existing MVP database migration, if needed:
-- alter table players drop column if exists rating;
-- alter table players add column if not exists skill_level text not null default 'Intermediate';
