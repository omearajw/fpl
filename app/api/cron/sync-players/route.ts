import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyCronSecret } from '../../auth';

// Initialize Supabase client using your environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  // Verify CRON_SECRET
  const authError = verifyCronSecret(request);
  if (authError) return authError;
  try {
    // 1. Fetch data from the official FPL API
    const response = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {
      // Bypasses some aggressive caching in Next.js to ensure fresh data
      cache: 'no-store' 
    });
    
    if (!response.ok) throw new Error('Failed to fetch from FPL API');
    
    const data = await response.json();

    // 2. Map position IDs to readable strings
    const positions: Record<number, string> = {
      1: 'GK',
      2: 'DEF',
      3: 'MID',
      4: 'FWD'
    };

    // 3. Map team IDs to short names (e.g., 1 -> 'ARS')
    const teams: Record<number, string> = {};
    data.teams.forEach((team: any) => {
      teams[team.id] = team.short_name;
    });

    // 4. Format the players for our custom database
    const formattedPlayers = data.elements.map((player: any) => ({
      id: player.id,
      name: player.web_name,
      position: positions[player.element_type],
      team: teams[player.team],
      // FPL stores prices as integers (e.g. 55). We divide by 10 to get 5.5.
      current_cost: player.now_cost / 10,
      injury_status: player.news || 'Available',
      weekly_points: player.event_points
    }));

    // 5. Upsert into Supabase
    // (Upsert means "Update if they exist, Insert if they are new")
    const { error } = await supabase
      .from('players_cache')
      .upsert(formattedPlayers, { onConflict: 'id' });

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      message: `Successfully synced ${formattedPlayers.length} players to the database.` 
    });

  } catch (error: any) {
    console.error('FPL Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}