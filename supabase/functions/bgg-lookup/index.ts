// Supabase Edge Function to securely lookup BGG data
// This keeps the BGG API token server-side only

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const BGG_API_TOKEN = Deno.env.get('BGG_API_TOKEN');
const BGG_API_BASE_URL = 'https://boardgamegeek.com/xmlapi2';

interface BggLookupRequest {
  bggId?: number;
  searchName?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Require a valid user JWT — prevents unauthenticated callers from burning API quota
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const body: BggLookupRequest = await req.json();
    const { bggId, searchName } = body;

    let url: string;
    if (bggId) {
      // Lookup by BGG ID
      url = `${BGG_API_BASE_URL}/thing?id=${bggId}&stats=1`;
    } else if (searchName) {
      // Search by name
      url = `${BGG_API_BASE_URL}/search?query=${encodeURIComponent(searchName)}&type=boardgame`;
    } else {
      return new Response(
        JSON.stringify({ error: 'Either bggId or searchName is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Make request to BGG API with optional token
    const headers: Record<string, string> = {
      'Accept': 'application/xml',
      'User-Agent': 'BoardGameLibrary/1.0',
    };

    // Add Authorization header if token is available
    if (BGG_API_TOKEN) {
      headers['Authorization'] = `Bearer ${BGG_API_TOKEN}`;
    }

    const bggResponse = await fetch(url, { headers });

    if (!bggResponse.ok) {
      const errorText = await bggResponse.text();
      console.error('BGG API error:', bggResponse.status, errorText);
      return new Response(
        JSON.stringify({
          error: 'BGG API request failed',
          status: bggResponse.status
        }),
        { status: bggResponse.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Get XML response
    const xmlText = await bggResponse.text();

    // Parse XML and extract game data
    const gameData = await parseXmlResponse(xmlText, Boolean(bggId));

    return new Response(
      JSON.stringify(gameData),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        }
      }
    );

  } catch (error) {
    console.error('Error in bgg-lookup function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        }
      }
    );
  }
});

async function parseXmlResponse(xmlText: string, isThingRequest: boolean) {
  // Simple XML parsing for BGG responses
  // For production, consider using a proper XML parser library

  if (isThingRequest) {
    // Parse thing (game details) response
    const nameMatch = xmlText.match(/<name[^>]*type="primary"[^>]*value="([^"]+)"/);
    const yearMatch = xmlText.match(/<yearpublished[^>]*value="([^"]+)"/);
    const imageMatch = xmlText.match(/<image>([^<]+)<\/image>/);
    const thumbnailMatch = xmlText.match(/<thumbnail>([^<]+)<\/thumbnail>/);
    const minPlayersMatch = xmlText.match(/<minplayers[^>]*value="([^"]+)"/);
    const maxPlayersMatch = xmlText.match(/<maxplayers[^>]*value="([^"]+)"/);
    const playtimeMatch = xmlText.match(/<playingtime[^>]*value="([^"]+)"/);
    const minAgeMatch = xmlText.match(/<minage[^>]*value="([^"]+)"/);
    const descriptionMatch = xmlText.match(/<description>([^<]+)<\/description>/);

    // Extract publishers
    const publisherMatches = [...xmlText.matchAll(/<link[^>]*type="boardgamepublisher"[^>]*value="([^"]+)"/g)];
    const publishers = publisherMatches.map(m => m[1]);

    // Extract categories
    const categoryMatches = [...xmlText.matchAll(/<link[^>]*type="boardgamecategory"[^>]*value="([^"]+)"/g)];
    const categories = categoryMatches.map(m => m[1]);

    // Extract mechanics
    const mechanicMatches = [...xmlText.matchAll(/<link[^>]*type="boardgamemechanic"[^>]*value="([^"]+)"/g)];
    const mechanics = mechanicMatches.map(m => m[1]);

    // Extract families (for game_type - broader classifications)
    const familyMatches = [...xmlText.matchAll(/<link[^>]*type="boardgamefamily"[^>]*value="([^"]+)"/g)];
    const families = familyMatches.map(m => m[1]);

    return {
      name: nameMatch?.[1] || 'Unknown Game',
      year: yearMatch?.[1] ? parseInt(yearMatch[1]) : null,
      cover_image: imageMatch?.[1] || thumbnailMatch?.[1] || null,
      publisher: publishers[0] || null,
      min_players: minPlayersMatch?.[1] ? parseInt(minPlayersMatch[1]) : null,
      max_players: maxPlayersMatch?.[1] ? parseInt(maxPlayersMatch[1]) : null,
      playtime_minutes: playtimeMatch?.[1] ? parseInt(playtimeMatch[1]) : null,
      min_age: minAgeMatch?.[1] ? parseInt(minAgeMatch[1]) : null,
      game_category: categories.length > 0 ? categories : null,
      game_mechanic: mechanics.length > 0 ? mechanics : null,
      game_type: families.length > 0 ? families : null,
      game_family: families.length > 0 ? families : null,
      description: descriptionMatch?.[1] ? decodeHtmlEntities(descriptionMatch[1]) : null,
    };
  } else {
    // Parse search response
    const itemMatches = [...xmlText.matchAll(/<item[^>]*id="(\d+)"[^>]*>[\s\S]*?<name[^>]*value="([^"]+)"[\s\S]*?<yearpublished[^>]*value="([^"]+)"/g)];

    return {
      results: itemMatches.map(match => ({
        bgg_id: parseInt(match[1]),
        name: match[2],
        year: parseInt(match[3]),
      })),
    };
  }
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&rdquo;': '"',
    '&ldquo;': '"',
  };

  return text.replace(/&[a-z]+;|&#\d+;/gi, match => entities[match] || match);
}
