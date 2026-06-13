import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    // 1. Fetch current settings including deadline_time
    const { data: settings, error: fetchError } = await supabase
      .from('system_settings')
      .select('active_gameweek, next_gameweek, deadline_time')
      .eq('id', 1)
      .single();

    if (fetchError || !settings) {
      throw new Error("Failed to fetch system settings. Does the row exist?");
    }

    const currentActiveGw = settings.active_gameweek;
    const currentNextGw = settings.next_gameweek;

    // 2. FAILSAFE 1: Are we ALREADY locked out? 
    // If active and next are different, the timeline is already split.
    if (currentActiveGw !== currentNextGw) {
      return NextResponse.json({ message: "Already locked out for this week. Waiting for Tuesday rollover." });
    }

    // 3. FAILSAFE 2: Has the database deadline actually passed?
    const now = new Date();
    const deadline = new Date(settings.deadline_time);

    if (now < deadline) {
      // It's not time yet. The cron job just bounces off harmlessly.
      return NextResponse.json({ 
        message: `Window is still open. Next deadline is ${deadline.toISOString()}.` 
      });
    }

    // ==========================================
    // 4. DEADLINE PASSED! EXECUTE LOCKOUT
    // ==========================================
    const newNextGw = currentNextGw + 1;

    // DUPLICATE ROSTERS BEFORE ADVANCING THE CLOCK
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

    // Advance ONLY the next_gameweek to create the "Split Timeline"
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