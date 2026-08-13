-- Existing installations may already have the original broad read policy.
-- Keep documents private to the authenticated uploader's Storage prefix.
drop policy if exists "case documents read" on storage.objects;

create policy "case documents read" on storage.objects
for select to authenticated
using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth.uid()::text);
