insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

create policy "case documents read" on storage.objects
for select to authenticated
using (bucket_id = 'case-documents');

create policy "case documents upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "case documents delete" on storage.objects
for delete to authenticated
using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth.uid()::text);
