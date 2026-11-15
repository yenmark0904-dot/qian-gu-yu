-- 玩家心聲 ♡ survey replies (anonymous). The Google Sheet is the durable copy; this table also backs
-- the per-device 10-minute submit limit while the server instance lives.
create table if not exists feedback (
  id bigserial primary key,
  device_id text not null,
  answers text not null,
  other text not null default '',
  user_agent text not null default '',
  version text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists feedback_device_time on feedback (device_id, created_at desc);
