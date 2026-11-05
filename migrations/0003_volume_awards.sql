-- 成就 · 卷滿: JSON array of claimed 卷 ids (1 = 卷一); each pays 2000 墨玉 once. writeSave only ever adds ids.
alter table saves add column if not exists volume_awards text not null default '[]';
