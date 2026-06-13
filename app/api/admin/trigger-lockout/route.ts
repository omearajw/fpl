import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../auth';

/**
 * Admin-facing wrapper to trigger the lockout cron job.
 * Checks user session for admin status, then internally calls the cron endpoint.
 */
export async function POST(request: Request) {
  try {
    // Get the session from the request
    const supabaseAdmin = getSupabaseAdmin();
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
        },
      }
    );
    
    // Try to get the user from the Authorization header (Bearer token)
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
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (error || !user || !user.is_admin) {
      return NextResponse.json(
        { error: 'Forbidden: User is not an admin' },
        { status: 403 }
      );
    }
    // Call the internal cron job with the CRON_SECRET
    const cronResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/cron/lockout`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
      }
    );

    const data = await cronResponse.json();
    
    if (!cronResponse.ok) {
      return NextResponse.json(data, { status: cronResponse.status });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to trigger lockout: ' + error.message },
      { status: 500 }
    );
  }
}
