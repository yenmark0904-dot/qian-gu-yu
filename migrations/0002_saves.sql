create table if not exists saves (
  user_id text primary key,
  ink integer not null,
  pity integer not null,
  total_pulls integer not null,
  last_daily text,
  owned text not null,
  history text not null,
  updated_at timestamptz not null default now()
);
