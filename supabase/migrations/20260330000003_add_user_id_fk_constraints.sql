-- Add FK constraints linking user_library and user_wishlist to auth.users.
-- Both tables declared user_id as UUID NOT NULL but without an actual foreign key,
-- meaning deleted users leave orphaned rows permanently. The profiles table already
-- has this constraint correctly; this migration brings the other two tables in line.
--
-- Pre-flight: remove orphaned rows that would block the ALTER TABLE.
-- In production, audit these first — if any exist they represent stale data from
-- previously deleted users.

DELETE FROM user_library
  WHERE user_id NOT IN (SELECT id FROM auth.users);

DELETE FROM user_wishlist
  WHERE user_id NOT IN (SELECT id FROM auth.users);

-- Add FK constraint to user_library
ALTER TABLE user_library
  ADD CONSTRAINT user_library_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

-- Add FK constraint to user_wishlist
ALTER TABLE user_wishlist
  ADD CONSTRAINT user_wishlist_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;
