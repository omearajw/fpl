import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export async function POST() {
  try {
    // 1. Wipe all historical scores
    const { error: scoresError } = await supabaseAdmin
      .from('gameweek_scores')
      .delete()
      .gt('gameweek', 0); // Supabase requires a filter to delete all rows

    if (scoresError) throw scoresError;

    // 2. Delete all rosters EXCEPT Gameweek 1
    const { error: rostersError } = await supabaseAdmin
      .from('rosters')
      .delete()
      .gt('gameweek', 1);

    if (rostersError) throw rostersError;

    // 3. (Optional) Reset all user transfers back to 8
    await supabaseAdmin
      .from('users')
      .update({ transfers_remaining: 8 })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Hack to target all users

    return NextResponse.json({ message: "Season successfully reset to Gameweek 1!" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}