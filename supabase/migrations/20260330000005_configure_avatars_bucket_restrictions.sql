-- Enforce server-side upload restrictions on the avatars storage bucket.
-- The original bucket creation migration set only (id, name, public) — no file size
-- limit or MIME type allowlist. Client-side checks in ProfileDrawer.tsx can be
-- bypassed by posting directly to the Supabase Storage REST API with the anon key.
-- These columns are enforced by the Storage API before any RLS policy runs.
--
-- file_size_limit: 2MB (2 * 1024 * 1024 = 2097152 bytes)
-- allowed_mime_types: explicit allowlist matching the client-side validation

UPDATE storage.buckets
SET
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
WHERE id = 'avatars';
