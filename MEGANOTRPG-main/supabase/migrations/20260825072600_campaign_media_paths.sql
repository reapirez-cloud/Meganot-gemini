begin;

-- Introduce campaign-scoped paths before the frontend deploy. Both legacy
-- user/folder paths and new campaign/user/folder paths remain readable.
create or replace function private.can_read_campaign_media(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_campaign_id uuid;
  v_owner_id uuid;
begin
  if auth.uid() is null or v_parts is null then
    return false;
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 3
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_campaign_id := v_parts[1]::uuid;
    return private.is_campaign_member(v_campaign_id, auth.uid());
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 2
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_parts[1]::uuid;
    return v_owner_id = auth.uid()
      or private.shares_campaign(v_owner_id, auth.uid());
  end if;

  return false;
end;
$$;

create or replace function private.can_write_campaign_media(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_campaign_id uuid;
begin
  if auth.uid() is null or v_parts is null then
    return false;
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 3
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and v_parts[2] = auth.uid()::text then
    v_campaign_id := v_parts[1]::uuid;
    return private.is_campaign_member(v_campaign_id, auth.uid());
  end if;

  return coalesce(array_length(v_parts, 1), 0) >= 2
    and v_parts[1] = auth.uid()::text;
end;
$$;

create or replace function private.can_delete_campaign_media(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_campaign_id uuid;
  v_owner_id uuid;
begin
  if auth.uid() is null or v_parts is null then
    return false;
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 3
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_campaign_id := v_parts[1]::uuid;
    return v_parts[2] = auth.uid()::text
      or private.can_manage_campaign(v_campaign_id, auth.uid());
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 2
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_parts[1]::uuid;
    return v_owner_id = auth.uid()
      or exists (
        select 1
        from public.campaign_members mine
        join public.campaign_members theirs
          on theirs.campaign_id = mine.campaign_id
        where mine.user_id = auth.uid()
          and (mine.is_owner = true or mine.role = 'gm')
          and theirs.user_id = v_owner_id
      );
  end if;

  return false;
end;
$$;

revoke all on function private.can_read_campaign_media(text) from public, anon;
revoke all on function private.can_write_campaign_media(text) from public, anon;
revoke all on function private.can_delete_campaign_media(text) from public, anon;
grant execute on function private.can_read_campaign_media(text) to authenticated, service_role;
grant execute on function private.can_write_campaign_media(text) to authenticated, service_role;
grant execute on function private.can_delete_campaign_media(text) to authenticated, service_role;

drop policy if exists campaign_media_authenticated_read on storage.objects;
drop policy if exists campaign_media_scoped_insert on storage.objects;
drop policy if exists campaign_media_scoped_update on storage.objects;
drop policy if exists campaign_media_scoped_delete on storage.objects;

create policy campaign_media_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'campaign-media'
  and (select private.can_read_campaign_media(name))
);

create policy campaign_media_member_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campaign-media'
  and (select private.can_write_campaign_media(name))
);

create policy campaign_media_member_update
on storage.objects for update to authenticated
using (
  bucket_id = 'campaign-media'
  and (select private.can_write_campaign_media(name))
)
with check (
  bucket_id = 'campaign-media'
  and (select private.can_write_campaign_media(name))
);

create policy campaign_media_member_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'campaign-media'
  and (select private.can_delete_campaign_media(name))
);

commit;
