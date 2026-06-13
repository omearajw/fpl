import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../auth';

const supabaseAdmin = getSupabaseAdmin();

export async function POST(request: Request) {
  try {
    // Authenticate the user
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    
    const authHeader = request.headers.get('authorization');
    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data } = await supabase.auth.getUser(token);
      userId = data.user?.id || null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized: Please log in first' },
        { status: 401 }
      );
    }

    // Check if user is an admin
    const { data: user, error: adminError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (adminError || !user || !user.is_admin) {
      return NextResponse.json(
        { error: 'Forbidden: User is not an admin' },
        { status: 403 }
      );
    }

    // 1. Fetch all managers in the league
    const { data: users, error: userError } = await supabaseAdmin.from('users').select('id');
    if (userError || !users) throw new Error("Failed to fetch users");

    let managerIds = users.map(u => u.id);

    // 2. Handle Odd Numbers (The "Ghost" Player)
    if (managerIds.length % 2 !== 0) {
      managerIds.push(null); // 'null' acts as our BYE week / Ghost manager
    }

    const totalManagers = managerIds.length;
    const roundsPerCycle = totalManagers - 1;
    const matchesPerRound = totalManagers / 2;

    const allFixtures = [];

    // 3. Generate the 38-week season
    for (let gw = 1; gw <= 38; gw++) {
      // Determine which round of the Round-Robin cycle we are currently in
      const roundIndex = (gw - 1) % roundsPerCycle;

      for (let match = 0; match < matchesPerRound; match++) {
        const homeIndex = (roundIndex + match) % (totalManagers - 1);
        let awayIndex = (totalManagers - 1 - match + roundIndex) % (totalManagers - 1);

        // The very last team in the array stays fixed in place
        if (match === 0) {
          awayIndex = totalManagers - 1;
        }

        const homeId = managerIds[homeIndex];
        const awayId = managerIds[awayIndex];

        // Ensure we don't insert a match where BOTH are null (impossible, but safe)
        if (homeId || awayId) {
          // If homeId is null, swap them so the real user is always "home" against the BYE
          allFixtures.push({
            gameweek: gw,
            home_user_id: homeId || awayId,
            away_user_id: homeId ? awayId : null,
          });
        }
      }
    }

    // 4. Wipe any existing fixtures (safety clear) and insert the new ones
    await supabaseAdmin.from('fixtures').delete().neq('gameweek', 0); // Deletes everything
    const { error: insertError } = await supabaseAdmin.from('fixtures').insert(allFixtures);

    if (insertError) throw insertError;

    return NextResponse.json({ 
      message: `Successfully generated ${allFixtures.length} fixtures for 38 Gameweeks!` 
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}