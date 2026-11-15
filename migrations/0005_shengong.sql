-- 深宮 leaderboard (fallback store when no Upstash Redis is configured). One row per device.
create table if not exists shengong_board (
  device_id text primary key,
  nickname text,
  floor integer not null default 0,
  total bigint not null default 0,
  last_score integer not null default 0,
  ranks_paid text not null default '[]',
  updated_at bigint not null default 0
);
create index if not exists shengong_board_rank on shengong_board (floor desc, total desc);
