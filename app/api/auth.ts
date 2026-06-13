import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Create a Supabase admin client for API routes.
 * Uses the service role key to bypass row-level security.
 */
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Verify CRON_SECRET from the Authorization header.
 * Use this for CRON routes that need simple secret verification.
 *
 * @param request - The incoming request object
 * @returns An error response if verification fails, null if successful
 *
 * @example
 * // In a CRON route:
 * export async function GET(request: Request) {
 *   const authError = verifyCronSecret(request);
 *   if (authError) return authError;
 *   // ... rest of your route logic
 * }
 */
export function verifyCronSecret(request: Request): NextResponse | null {
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing CRON_SECRET' },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Verify both CRON_SECRET and admin status for a user.
 * Use this for ADMIN routes that require both secret and user verification.
 *
 * @param request - The incoming request object
 * @param userId - (Optional) The user ID to verify as admin. If not provided, returns null (passed CRON check)
 * @returns An error response if verification fails, null if successful
 *
 * @example
 * // In an ADMIN route with no user context:
 * export async function POST(request: Request) {
 *   const authError = await verifyAdminAccess(request);
 *   if (authError) return authError;
 *   // ... rest of your route logic
 * }
 *
 * @example
 * // In an ADMIN route with a user ID from request body:
 * export async function POST(request: Request) {
 *   const body = await request.json();
 *   const authError = await verifyAdminAccess(request, body.userId);
 *   if (authError) return authError;
 *   // ... rest of your route logic
 * }
 */
export async function verifyAdminAccess(
  request: Request,
  userId?: string
): Promise<NextResponse | null> {
  // First, always verify CRON_SECRET
  const cronError = verifyCronSecret(request);
  if (cronError) return cronError;

  // If no userId is provided, just return the CRON verification result (passed)
  if (!userId) {
    return null;
  }

  // If userId is provided, check if they are an admin
  const supabase = getSupabaseAdmin();

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.is_admin) {
      return NextResponse.json(
        { error: 'Forbidden: User is not an admin' },
        { status: 403 }
      );
    }

    return null;
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error during authorization' },
      { status: 500 }
    );
  }
}
