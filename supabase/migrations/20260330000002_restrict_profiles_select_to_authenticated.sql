-- Restrict profile reads to authenticated users only.
-- The original policy used USING (true), making the entire profiles table world-readable
-- via the anon key — including the email column, exposing all user email addresses.
-- All existing callers of getProfile() run in authenticated sessions, so this is non-breaking.
-- If a public-facing profile feature is needed later, add a scoped policy at that time.

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);
