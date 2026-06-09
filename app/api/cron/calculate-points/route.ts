import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  // 1. Fetch live player stats for the current Gameweek
  // In a real app, this would call your football data provider API
  const { data: matchStats } = await supabaseAdmin.from('match_stats').select('*').eq('gameweek', 1);

  // 2. Fetch all managers' rosters
  const { data: allRosters } = await supabaseAdmin.from('rosters').select('*');

  // 3. Calculate points for each manager
  const pointsMap: Record<string, number> = {};

  for (const roster of allRosters || []) {
    const stats = matchStats?.find(s => s.player_id === roster.player_id);
    if (!stats) continue;

    let points = 0;
    if (roster.is_starter) {
      points = calculatePlayerPoints(stats);
      pointsMap[roster.user_id] = (pointsMap[roster.user_id] || 0) + points;
    }
  }

  // 4. Update the League table
  for (const [userId, totalPoints] of Object.entries(pointsMap)) {
    await supabaseAdmin
      .from('league_standings')
      .upsert({ user_id: userId, gameweek_points: totalPoints });
  }

  return NextResponse.json({ message: "Points updated successfully!" });
}

function calculatePlayerPoints(stats: any) {
  let pts = 0;
  if (stats.minutes >= 60) pts += 2;
  else if (stats.minutes > 0) pts += 1;
  
  pts += stats.goals * 5; // Example: Midfielder goal
  pts += stats.assists * 3;
  if (stats.clean_sheet) pts += 4;
  // Add more logic here based on your dad's specific scoring rules
  return pts;
}