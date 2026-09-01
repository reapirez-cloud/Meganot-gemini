update storage.buckets
set allowed_mime_types = array['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic','image/heif']::text[]
where id = 'campaign-media';
