-- Sync profiles.email when a user changes their email via Supabase Auth.
-- The existing handle_new_user() trigger copies email on signup (INSERT) but nothing
-- handles auth.users UPDATE events. This means profiles.email silently drifts after
-- an email change, and the UI (ProfileDrawer) shows stale data.
--
-- The WHEN clause restricts firing to rows where the email actually changed,
-- avoiding unnecessary writes on password changes, metadata updates, etc.
-- SECURITY DEFINER matches the pattern of handle_new_user() already in the codebase.
--
-- Note: Supabase does not update auth.users.email until the user confirms the new
-- address, so this trigger fires at the correct moment — post-confirmation.

CREATE OR REPLACE FUNCTION public.handle_user_email_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email,
      updated_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_user_email_update();
