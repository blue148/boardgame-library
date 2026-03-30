-- Drop the original permissive write policies that bypass admin-only restrictions.
-- Migration 20260109193343 added admin-only INSERT/UPDATE/DELETE policies but never
-- removed these originals. Because Supabase ORs permissive policies, the WITH CHECK (true)
-- policy was winning over the admin check, allowing any anonymous user to write game data.
-- The SELECT policy "Shared games are viewable by everyone" is intentionally left in place.

DROP POLICY IF EXISTS "Shared games can be created by anyone" ON shared_games;
DROP POLICY IF EXISTS "Shared games can be updated by anyone" ON shared_games;
