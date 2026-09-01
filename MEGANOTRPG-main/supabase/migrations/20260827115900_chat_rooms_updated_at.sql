begin;
alter table public.chat_rooms
  add column if not exists updated_at timestamptz not null default now();
commit;
