import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

export async function GET(request: Request) {
  try {
    // Check if we are running the final Tuesday Rollover
    const { searchParams } = new URL(request.url);
    const isTuesdayRollover = searchParams.get('rollover') === 'true';

    // 1. Read from the Master Clock
    const { data: settings } = await supabase
      .from('system_settings')
      .select('active_gameweek, next_gameweek')
      .single();

    if (!settings) throw new Error("System settings not found.");

    // The gameweek we are calculating scores for is being played in real-time, so we use the active_gameweek for scoring
    const processingGW = settings.active_gameweek; 

    // 2. Fetch all managers' STARTING rosters for the active weekend
    const { data: starters, error: rosterError } = await supabase
      .from('rosters')
      .select('user_id, player_id')
      .eq('is_starter', true)
      .eq('gameweek', processingGW);

    if (rosterError || !starters || starters.length === 0) {
      return NextResponse.json({ message: `No starting players found for Gameweek ${processingGW}.` }, { status: 400 });
    }

    // 3. --- LIVE FPL DATA FETCH ---
    let liveStatsMap: Record<number, any> = {};
    
    if (!USE_MOCK_DATA) {
      console.log(`Fetching LIVE data from official FPL API for Gameweek ${processingGW}...`);
      const response = await fetch(`https://fantasy.premierleague.com/api/event/${processingGW}/live/`);
      
      if (!response.ok) {
         throw new Error(`FPL API returned status: ${response.status}.`);
      }

      const fplData = await response.json();
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
        const minutesPlayed = Math.random() > 0.15 ? 90 : 0; 
        const goalsScored = Math.random() > 0.90 ? 1 : 0;    
        const cleanSheet = Math.random() > 0.65;             

        if (minutesPlayed >= 60) points += 2;
        else if (minutesPlayed > 0) points += 1;
        points += goalsScored * 5; 
        if (cleanSheet) points += 4;
      } else {
        const realStats = liveStatsMap[roster.player_id];
        if (realStats) points = realStats.total_points || 0;
      }

      userPoints[roster.user_id] = (userPoints[roster.user_id] || 0) + points;
    });

    // 5. Fetch PREVIOUS running totals (processingGW - 1)
    const { data: previousScores } = await supabase
      .from('gameweek_scores')
      .select('user_id, running_total')
      .eq('gameweek', processingGW - 1);

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
        gameweek: processingGW,
        points_earned: pointsEarned,
        running_total: prevTotal + pointsEarned
      };
    });

    // 7. Write to Supabase (CHANGED TO UPSERT FOR SAFETY)
    // You MUST ensure your gameweek_scores table has a unique constraint on (user_id, gameweek)
    const { error: upsertError } = await supabase
      .from('gameweek_scores')
      .upsert(insertPayload, { onConflict: 'user_id, gameweek' });

    if (upsertError) throw upsertError;

    // ==========================================
    // 8. --- THE TUESDAY AUTO-ROLLOVER ---
    // ==========================================
    if (isTuesdayRollover) {
      // Calculate the exact date/time for the upcoming Saturday at 11:00 AM UTC
      const nextDeadline = new Date();
      // Math to find the next Saturday (Day 6)
      nextDeadline.setUTCDate(nextDeadline.getUTCDate() + ((6 - nextDeadline.getUTCDay() + 7) % 7));
      // Set to exactly 11:00:00.000 AM UTC
      nextDeadline.setUTCHours(11, 0, 0, 0);

      // Advance Active GW and set the new perfectly synced deadline
      await supabase
        .from('system_settings')
        .update({
          active_gameweek: processingGW + 1,
          deadline_time: nextDeadline.toISOString()
        })
        .eq('id', 1);

      return NextResponse.json({ 
        message: `SUCCESS: Gameweek ${processingGW} finalized! Active GW advanced to ${processingGW + 1}. Next deadline set to ${nextDeadline.toISOString()}`,
      });
    }

    // If it's just a weekend live-update run...
    return NextResponse.json({ 
      message: `LIVE UPDATE: Scores for Gameweek ${processingGW} updated. No rollover performed.`,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}