import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- THE MAGIC TOGGLE ---
const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

export async function GET() {
  try {
    const { data: latestGW } = await supabase
      .from('gameweek_scores')
      .select('gameweek')
      .order('gameweek', { ascending: false })
      .limit(1)
      .single();

    const nextGameweek = (latestGW?.gameweek || 0) + 1;

    const { data: starters, error: rosterError } = await supabase
      .from('rosters')
      .select('user_id, player_id')
      .eq('is_starter', true);

    if (rosterError || !starters || starters.length === 0) {
      return NextResponse.json({ message: "No starting players found." }, { status: 400 });
    }

    // --- LIVE DATA PRE-FETCH ---
    // If we are in live mode, we fetch all the real match stats ONCE here, before the loop.
    let liveStatsMap: Record<number, any> = {};
    if (!USE_MOCK_DATA) {
      /* TODO: This is where you will call your Dad's chosen Sports API
         Example:
         const res = await fetch(`https://api.sportsprovider.com/pl/stats?gw=${nextGameweek}`);
         const rawData = await res.json();
         // Then map it so we can look up players by their ID:
         // liveStatsMap[player.id] = { minutes: 90, goals: 1, assists: 0, clean_sheet: true }
      */
      console.log("Looking for live Premier League data...");
    }

    const userPoints: Record<string, number> = {};

    starters.forEach(roster => {
      let minutesPlayed = 0;
      let goalsScored = 0;
      let assists = 0;
      let cleanSheet = false;

      // --- ASSIGN STATS BASED ON THE TOGGLE ---
      if (USE_MOCK_DATA) {
        minutesPlayed = Math.random() > 0.15 ? 90 : 0; 
        goalsScored = Math.random() > 0.90 ? 1 : 0;    
        assists = Math.random() > 0.90 ? 1 : 0;        
        cleanSheet = Math.random() > 0.65;             
      } else {
        // Look up this specific player's real-world stats from the API we fetched above
        const realStats = liveStatsMap[roster.player_id];
        if (realStats) {
          minutesPlayed = realStats.minutes || 0;
          goalsScored = realStats.goals || 0;
          assists = realStats.assists || 0;
          cleanSheet = realStats.clean_sheet || false;
        }
      }

      // --- BASIC SCORING MATH ---
      let points = 0;
      if (minutesPlayed >= 60) points += 2;
      else if (minutesPlayed > 0) points += 1;
      
      points += goalsScored * 5; 
      points += assists * 3;
      if (cleanSheet) points += 4;

      userPoints[roster.user_id] = (userPoints[roster.user_id] || 0) + points;
    });

    const { data: previousScores } = await supabase
      .from('gameweek_scores')
      .select('user_id, running_total')
      .eq('gameweek', nextGameweek - 1);

    const previousTotals: Record<string, number> = {};
    if (previousScores) {
      previousScores.forEach(score => {
        previousTotals[score.user_id] = score.running_total;
      });
    }

    const insertPayload = Object.keys(userPoints).map(userId => {
      const pointsEarned = userPoints[userId];
      const prevTotal = previousTotals[userId] || 0;
      
      return {
        user_id: userId,
        gameweek: nextGameweek,
        points_earned: pointsEarned,
        running_total: prevTotal + pointsEarned
      };
    });

    const { error: insertError } = await supabase
      .from('gameweek_scores')
      .insert(insertPayload);

    if (insertError) throw insertError;

    return NextResponse.json({ 
      message: `Gameweek ${nextGameweek} calculation complete! (Mock Data: ${USE_MOCK_DATA})`,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}