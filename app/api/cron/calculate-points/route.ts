import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

export async function GET() {
  try {
    // 1. Determine the NEXT Gameweek
    const { data: latestGW } = await supabase
      .from('gameweek_scores')
      .select('gameweek')
      .order('gameweek', { ascending: false })
      .limit(1)
      .single();

    const nextGameweek = (latestGW?.gameweek || 0) + 1;

// 2. Fetch all managers' STARTING rosters
    const { data: starters, error: rosterError } = await supabase
      .from('rosters')
      .select('user_id, player_id')
      .eq('is_starter', true)
      .eq('gameweek', nextGameweek); // <-- ADD THIS FILTER!

    if (rosterError || !starters || starters.length === 0) {
      return NextResponse.json({ message: `No starting players found for Gameweek ${nextGameweek}.` }, { status: 400 });
    }

    // 3. --- LIVE FPL DATA FETCH ---
    let liveStatsMap: Record<number, any> = {};
    
    if (!USE_MOCK_DATA) {
      console.log(`Fetching LIVE data from official FPL API for Gameweek ${nextGameweek}...`);
      
      // We make ONE call to get every player in the league
      const response = await fetch(`https://fantasy.premierleague.com/api/event/${nextGameweek}/live/`);
      
      if (!response.ok) {
         throw new Error(`FPL API returned status: ${response.status}. The gameweek might not exist yet.`);
      }

      const fplData = await response.json();

      // Transform the FPL array into a fast lookup dictionary: { player_id: stats_object }
      if (fplData.elements) {
        fplData.elements.forEach((player: any) => {
          liveStatsMap[player.id] = player.stats; 
        });
      }
    }

    // 4. Calculate Points for each Manager
    const userPoints: Record<string, number> = {};

    starters.forEach(roster => {
      let points = 0;

      if (USE_MOCK_DATA) {
        // Mock off-season data (Randomizer)
        const minutesPlayed = Math.random() > 0.15 ? 90 : 0; 
        const goalsScored = Math.random() > 0.90 ? 1 : 0;    
        const cleanSheet = Math.random() > 0.65;             

        if (minutesPlayed >= 60) points += 2;
        else if (minutesPlayed > 0) points += 1;
        points += goalsScored * 5; 
        if (cleanSheet) points += 4;
        
      } else {
        // --- REAL LIVE DATA ---
        const realStats = liveStatsMap[roster.player_id];
        
        if (realStats) {
          // For now, we are pulling the official rudimentary FPL score directly
          points = realStats.total_points || 0;
        }
      }

      // Add to the manager's weekly bucket
      userPoints[roster.user_id] = (userPoints[roster.user_id] || 0) + points;
    });

    // 5. Fetch PREVIOUS running totals
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

    // 6. Package data for database insertion
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

    // 7. Write to Supabase
    const { error: insertError } = await supabase
      .from('gameweek_scores')
      .insert(insertPayload);

    if (insertError) throw insertError;

    // 8. --- THE AUTO-ROLLOVER ---
    // Fetch every player's roster from the gameweek we just finished scoring
    const { data: currentRosters, error: fetchRostersError } = await supabase
      .from('rosters')
      .select('*')
      .eq('gameweek', nextGameweek);

    if (fetchRostersError) throw fetchRostersError;

    if (currentRosters && currentRosters.length > 0) {
      // Duplicate them, strip out the old UUIDs, and stamp them with the new Gameweek
      const rolloverPayload = currentRosters.map(roster => {
        const { id, ...rest } = roster; // Remove the old primary key so Supabase generates new ones
        return {
          ...rest,
          gameweek: nextGameweek + 1
        };
      });

      // Insert the duplicated squads into the database
      const { error: rolloverError } = await supabase
        .from('rosters')
        .insert(rolloverPayload);

      if (rolloverError) throw rolloverError;
    }

    // Return the final success message
    return NextResponse.json({ 
      message: `Gameweek ${nextGameweek} calculation complete! All rosters rolled over to Gameweek ${nextGameweek + 1}. (Mock Data: ${USE_MOCK_DATA})`,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}