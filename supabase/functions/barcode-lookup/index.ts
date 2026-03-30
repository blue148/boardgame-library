// @ts-ignore - This is a Deno file for Supabase Edge Functions
// Supabase Edge Function to securely lookup barcode data
// This keeps API tokens server-side only and provides fallback logic

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// @ts-ignore - Deno global
const GAMEUPC_API_KEY = Deno.env.get('GAMEUPC_API_KEY');
// @ts-ignore - Deno global
const BARCODELOOKUP_API_KEY = Deno.env.get('BARCODELOOKUP_API_KEY');
// UPCITEMDB is optional - uses free trial endpoint if not set
// @ts-ignore - Deno global
const UPCITEMDB_USER_KEY = Deno.env.get('UPCITEMDB_USER_KEY');
// @ts-ignore - Deno global
const UPCITEMDB_KEY_TYPE = Deno.env.get('UPCITEMDB_KEY_TYPE') || '3scale';

interface BarcodeLookupRequest {
  barcode: string;
}

interface GameUpcResponse {
  bgg_info?: Array<{
    id?: number;
    name: string;
  }>;
}

interface BarcodeLookupResponse {
  products?: Array<{
    title?: string;
    description?: string;
    brand?: string;
  }>;
}

interface UpcItemDbResponse {
  items?: Array<{
    title?: string;
    description?: string;
    brand?: string;
  }>;
}

const isNonEmptyString = (value?: string) => typeof value === 'string' && value.trim().length > 0;

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  // Require a valid user JWT — prevents unauthenticated callers from burning API quota
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // @ts-ignore - Deno global
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

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // @ts-ignore - request.json() returns unknown
    const body: BarcodeLookupRequest = await req.json();
    const { barcode } = body;

    if (!barcode) {
      return new Response(
        JSON.stringify({ error: 'Barcode is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Looking up barcode: ${barcode}`);

    const jsonHeaders = {
      'Content-Type': 'application/json',
      ...corsHeaders,
    };

    const respondOk = (payload: Record<string, unknown>) =>
      new Response(JSON.stringify(payload), { status: 200, headers: jsonHeaders });

    const respondNotFound = () =>
      new Response(
        JSON.stringify({
          error: 'No game found for this barcode',
          source: 'none',
        }),
        { status: 404, headers: jsonHeaders }
      );

    const tryGameUpc = async () => {
      try {
        console.log('Trying GameUPC...');
        const gameUpcResponse = await fetch(`https://api.gameupc.com/v1/upc/${barcode}`, {
          headers: {
            'x-api-key': GAMEUPC_API_KEY,
          },
        });

        if (gameUpcResponse.ok) {
          const result: GameUpcResponse = await gameUpcResponse.json();
          const gameMatch = result.bgg_info?.[0];
          const name = gameMatch?.name?.trim();

          if (isNonEmptyString(name)) {
            console.log(`GameUPC success: ${name}`);
            return respondOk({
              source: 'gameupc',
              bgg_id: gameMatch?.id || undefined,
              name,
            });
          }
        } else {
          console.error('GameUPC API error:', gameUpcResponse.status);
        }

        console.log('GameUPC returned empty title or no results, trying fallback...');
      } catch (gameUpcError) {
        console.error('GameUPC error:', gameUpcError);
      }

      return null;
    };

    const tryBarcodeLookup = async () => {
      if (!BARCODELOOKUP_API_KEY) {
        console.warn('BARCODELOOKUP_API_KEY not configured, skipping BarcodeLookup');
        return null;
      }

      try {
        console.log('Trying BarcodeLookup...');
        const barcodeLookupResponse = await fetch(
          `https://api.barcodelookup.com/v3/products?barcode=${barcode}&formatted=y&key=${BARCODELOOKUP_API_KEY}`
        );

        if (!barcodeLookupResponse.ok) {
          console.error('BarcodeLookup API error:', barcodeLookupResponse.status);
          return null;
        }

        const result: BarcodeLookupResponse = await barcodeLookupResponse.json();
        const product = result.products?.[0];
        const name = product?.title?.trim();

        if (isNonEmptyString(name)) {
          console.log(`BarcodeLookup success: ${name}`);
          return respondOk({
            source: 'barcodelookup',
            name,
            brand: product?.brand,
          });
        }

        console.log('BarcodeLookup returned empty title or no results, trying fallback...');
      } catch (barcodeLookupError) {
        console.error('BarcodeLookup error:', barcodeLookupError);
      }

      return null;
    };

    const tryUpcItemDb = async () => {
      try {
        console.log('Trying UPCItemDB...');
        const endpoint = UPCITEMDB_USER_KEY
          ? 'https://api.upcitemdb.com/prod/v1/lookup'
          : 'https://api.upcitemdb.com/prod/trial/lookup';

        const headers: Record<string, string> = {
          Accept: 'application/json',
        };

        if (UPCITEMDB_USER_KEY) {
          headers.user_key = UPCITEMDB_USER_KEY;
          headers.key_type = UPCITEMDB_KEY_TYPE;
        }

        const upcItemDbResponse = await fetch(`${endpoint}?upc=${barcode}`, { headers });

        if (!upcItemDbResponse.ok) {
          console.error('UPCItemDB API error:', upcItemDbResponse.status);
          return null;
        }

        const result: UpcItemDbResponse = await upcItemDbResponse.json();
        const item = result.items?.[0];
        const name = item?.title?.trim();

        if (isNonEmptyString(name)) {
          console.log(`UPCItemDB success: ${name}`);
          return respondOk({
            source: 'upcitemdb',
            name,
            brand: item?.brand,
          });
        }

        console.log('UPCItemDB returned empty title or no results.');
      } catch (upcItemDbError) {
        console.error('UPCItemDB error:', upcItemDbError);
      }

      return null;
    };

    const result =
      (await tryGameUpc()) ||
      (await tryBarcodeLookup()) ||
      (await tryUpcItemDb());

    return result ?? respondNotFound();

  } catch (error) {
    console.error('Error in barcode-lookup function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
});
