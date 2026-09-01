begin;

-- Final cutover after the signed-URL frontend is live.
update storage.buckets
set public = false
where id = 'campaign-media';

commit;
