begin;

create index if not exists character_source_suppressions_disabled_by_idx
  on public.character_source_suppressions(disabled_by);

commit;
