import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../auth';

const supabaseAdmin = getSupabaseAdmin();

// Helper function to get random elements from an array
const getRandomPlayers = (array: any[], count: number) => {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

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

    const { count, leagueId } = await request.json(); // How many bots to create

    // 1. Fetch the entire player market
    const { data: allPlayers } = await supabaseAdmin.from('players_cache').select('*');
    if (!allPlayers || allPlayers.length === 0) throw new Error("Player market is empty.");

    const gks = allPlayers.filter(p => p.position === 'GK');
    const defs = allPlayers.filter(p => p.position === 'DEF');
    const mids = allPlayers.filter(p => p.position === 'MID');
    const fwds = allPlayers.filter(p => p.position === 'FWD');

    const createdBots = [];

    // 2. Loop to create 'N' amount of bots
    for (let i = 0; i < count; i++) {
      const botNumber = Math.floor(Math.random() * 10000);
      const email = `bot${botNumber}@retro-fpl.com`;

      // A. Create the Auth User (so foreign keys don't break)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: 'Password123!',
        email_confirm: true
      });

      if (authError) continue; // Skip if email collision happens
      const botId = authData.user.id;

      // B. Algorithm to find a valid < £100m squad
      let validSquad: any[] = [];
      let squadCost = 0;
      let attempts = 0;

      while (attempts < 100) { // Safety break
        const draftGks = getRandomPlayers(gks, 2);
        const draftDefs = getRandomPlayers(defs, 5);
        const draftMids = getRandomPlayers(mids, 5);
        const draftFwds = getRandomPlayers(fwds, 3);
        
        validSquad = [...draftGks, ...draftDefs, ...draftMids, ...draftFwds];
        squadCost = validSquad.reduce((acc, p) => acc + p.current_cost, 0);

        if (squadCost <= 100.0) break; // Found a legal squad!
        attempts++;
      }

      // C. Sort into a legal 4-4-2 starting lineup
      const squadGks = validSquad.filter(p => p.position === 'GK').sort((a, b) => b.current_cost - a.current_cost);
      const squadDefs = validSquad.filter(p => p.position === 'DEF').sort((a, b) => b.current_cost - a.current_cost);
      const squadMids = validSquad.filter(p => p.position === 'MID').sort((a, b) => b.current_cost - a.current_cost);
      const squadFwds = validSquad.filter(p => p.position === 'FWD').sort((a, b) => b.current_cost - a.current_cost);

      const starting11Ids = [
        ...squadGks.slice(0, 1),
        ...squadDefs.slice(0, 4),
        ...squadMids.slice(0, 4),
        ...squadFwds.slice(0, 2)
      ].map(p => p.id);

      // D. Insert into the public `users` table
      await supabaseAdmin.from('users').insert({
        id: botId,
        league_id: leagueId || null,
        team_name: `Bot FC ${botNumber}`,
        manager_name: `AutoBot ${botNumber}`,
        remaining_budget: +(100.0 - squadCost).toFixed(1),
        transfers_remaining: 8,
        must_change_password: false
      });

      // E. Insert the 15 players into the `rosters` table
      const rosterPayload = validSquad.map(player => ({
        user_id: botId,
        player_id: player.id,
        gameweek: 1,
        purchase_price: player.current_cost,
        is_starter: starting11Ids.includes(player.id)
      }));

      await supabaseAdmin.from('rosters').insert(rosterPayload);
      
      createdBots.push(`Bot FC ${botNumber}`);
    }

    return NextResponse.json({ message: `Successfully seeded ${createdBots.length} teams.`, teams: createdBots });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}