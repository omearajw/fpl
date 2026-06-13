import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    // 1. Fetch current settings to see where we are
    const { data: settings, error: fetchError } = await supabase
      .from('system_settings')
      .select('active_gameweek, next_gameweek')
      .eq('id', 1)
      .single();

    if (fetchError || !settings) {
      throw new Error("Failed to fetch system settings. Does the row exist?");
    }

    const currentNextGw = settings.next_gameweek;
    const newNextGw = currentNextGw + 1;

    // 2. DUPLICATE ROSTERS BEFORE ADVANCING THE CLOCK
    // We grab the rosters from the week that just locked, and copy them to the new week
    const { data: currentRosters } = await supabase
      .from('rosters')
      .select('*')
      .eq('gameweek', currentNextGw);

    if (currentRosters && currentRosters.length > 0) {
      const rolloverPayload = currentRosters.map(roster => {
        const { id, ...rest } = roster; 
        return {
          ...rest,
          gameweek: newNextGw
        };
      });

      // UPSERT the new rosters to prevent accidental duplicates
      const { error: rolloverError } = await supabase
        .from('rosters')
        .upsert(rolloverPayload, { onConflict: 'user_id, player_id, gameweek' });

      if (rolloverError) throw rolloverError;
    }

    // 3. Advance ONLY the next_gameweek to create the "Split Timeline"
    const { error: updateError } = await supabase
      .from('system_settings')
      .update({ next_gameweek: newNextGw })
      .eq('id', 1);

    if (updateError) throw updateError;

    return NextResponse.json({ 
      message: `SUCCESS: Deadline Lockout triggered! Rosters duplicated to GW${newNextGw} and Transfers advanced.`,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}