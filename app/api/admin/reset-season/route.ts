import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
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
    const { error: transfersError } = await supabaseAdmin
      .from('users')
      .update({ transfers_remaining: 8 })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Hack to target all users
      
    if (transfersError) throw transfersError;

    // 4. Reset the Master Clock back to Gameweek 1
    const { error: clockError } = await supabaseAdmin
      .from('system_settings')
      .update({ active_gameweek: 1, next_gameweek: 1 })
      .eq('id', 1);

    if (clockError) throw clockError;

    return NextResponse.json({ message: "Season successfully reset to Gameweek 1!" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}