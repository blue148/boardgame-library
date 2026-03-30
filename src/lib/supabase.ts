import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Game {
  id: string;
  barcode: string;
  name: string;
  bgg_id?: number;
  publisher?: string;
  year?: string;
  edition?: string;
  cover_image?: string;
  game_type?: string[];
  game_category?: string[];
  game_mechanic?: string[];
  game_family?: string[];
  min_players?: number;
  max_players?: number;
  playtime_minutes?: number;
  is_expansion?: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserLibraryEntry {
  id: string;
  user_id: string;
  game_id: string;
  is_favorite: boolean;
  for_sale: boolean;
  personal_ranking?: 'high' | 'medium' | 'low';
  played_dates?: string[];
  notes?: string;
  added_date: string;
  updated_at: string;
  game?: Game;
}

export interface UserWishlistEntry {
  id: string;
  user_id: string;
  game_id: string;
  priority: 'high' | 'medium' | 'low';
  notes?: string;
  added_date: string;
  updated_at: string;
  game?: Game;
}

export interface Profile {
  id: string;
  email: string;
  username: string;
  avatar_url?: string;
  bio?: string;
  preferences: {
    theme: 'light' | 'dark';
    notifications_enabled: boolean;
    default_view: 'grid' | 'list';
    players?: string[];
    game_timer?: {
      started_at: string | null;
      stopped_at: string | null;
      is_running: boolean;
    };
  };
  total_games: number;
  favorite_count: number;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}
