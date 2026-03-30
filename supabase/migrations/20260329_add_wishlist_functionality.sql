-- Add wishlist functionality to the boardgame library
-- This migration adds a new table for wishlist entries separate from the main library

-- Create wishlist table
CREATE TABLE IF NOT EXISTS user_wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  game_id UUID NOT NULL REFERENCES shared_games(id) ON DELETE CASCADE,
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  notes TEXT,
  added_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, game_id)
);

-- Add indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_user_wishlist_user_id ON user_wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wishlist_game_id ON user_wishlist(game_id);
CREATE INDEX IF NOT EXISTS idx_user_wishlist_priority ON user_wishlist(priority);

-- Add updated timestamp trigger
DROP TRIGGER IF EXISTS update_user_wishlist_updated_at ON user_wishlist;
CREATE TRIGGER update_user_wishlist_updated_at
  BEFORE UPDATE ON user_wishlist
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies for wishlist
ALTER TABLE user_wishlist ENABLE ROW LEVEL SECURITY;

-- Users can only see their own wishlist entries
DROP POLICY IF EXISTS "Users can view own wishlist" ON user_wishlist;
CREATE POLICY "Users can view own wishlist"
  ON user_wishlist FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert into their own wishlist
DROP POLICY IF EXISTS "Users can insert own wishlist" ON user_wishlist;
CREATE POLICY "Users can insert own wishlist"
  ON user_wishlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own wishlist entries
DROP POLICY IF EXISTS "Users can update own wishlist" ON user_wishlist;
CREATE POLICY "Users can update own wishlist"
  ON user_wishlist FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own wishlist entries
DROP POLICY IF EXISTS "Users can delete own wishlist" ON user_wishlist;
CREATE POLICY "Users can delete own wishlist"
  ON user_wishlist FOR DELETE
  USING (auth.uid() = user_id);

-- Comments for documentation
COMMENT ON TABLE user_wishlist IS 'User wishlist - games users want to acquire';
COMMENT ON COLUMN user_wishlist.user_id IS 'Reference to auth.users.id';
COMMENT ON COLUMN user_wishlist.game_id IS 'Reference to shared_games.id';
COMMENT ON COLUMN user_wishlist.priority IS 'User priority for acquiring this game: high, medium, low';
COMMENT ON COLUMN user_wishlist.notes IS 'Personal notes about why they want this game';