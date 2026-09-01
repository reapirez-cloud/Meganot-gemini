insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-media',
  'campaign-media',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists campaign_media_authenticated_read on storage.objects;
create policy campaign_media_authenticated_read
on storage.objects for select
to authenticated
using (bucket_id = 'campaign-media');

drop policy if exists campaign_media_own_folder_insert on storage.objects;
create policy campaign_media_own_folder_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'campaign-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists campaign_media_own_folder_update on storage.objects;
create policy campaign_media_own_folder_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'campaign-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'campaign-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists campaign_media_own_folder_delete on storage.objects;
create policy campaign_media_own_folder_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'campaign-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create table if not exists public.campaign_art_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  title text not null default '',
  image_url text not null,
  created_at timestamptz not null default now(),
  constraint campaign_art_items_title_len check (char_length(title) <= 120)
);

create index if not exists campaign_art_items_campaign_created_idx
  on public.campaign_art_items (campaign_id, created_at desc);

alter table public.campaign_art_items enable row level security;

drop policy if exists campaign_art_items_member_read on public.campaign_art_items;
create policy campaign_art_items_member_read
on public.campaign_art_items for select
to authenticated
using (private.is_campaign_member(campaign_id));

drop policy if exists campaign_art_items_member_insert on public.campaign_art_items;
create policy campaign_art_items_member_insert
on public.campaign_art_items for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and private.is_campaign_member(campaign_id)
);

drop policy if exists campaign_art_items_owner_or_manager_update on public.campaign_art_items;
create policy campaign_art_items_owner_or_manager_update
on public.campaign_art_items for update
to authenticated
using (
  uploaded_by = auth.uid()
  or private.can_manage_campaign(campaign_id)
)
with check (
  uploaded_by = auth.uid()
  or private.can_manage_campaign(campaign_id)
);

drop policy if exists campaign_art_items_owner_or_manager_delete on public.campaign_art_items;
create policy campaign_art_items_owner_or_manager_delete
on public.campaign_art_items for delete
to authenticated
using (
  uploaded_by = auth.uid()
  or private.can_manage_campaign(campaign_id)
);

grant select, insert, update, delete on public.campaign_art_items to authenticated;
