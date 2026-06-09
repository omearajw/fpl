import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Supabase using the SECRET Admin Key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// We use the admin client to bypass normal security rules
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// --- THE MASTER LIST ---
// Easily scalable. Just add as many objects to this array as needed.
const managersList = [
  { email: 'dad@example.com', teamName: 'Retro Rovers', managerName: 'Dad', leagueId: 1 },
  { email: 'john@example.com', teamName: 'The Tactician', managerName: 'John D.', leagueId: 1 },
  { email: 'sarah@example.com', teamName: 'Saka Potatoes', managerName: 'Sarah W.', leagueId: 2 },
];

const TEMPORARY_PASSWORD = 'RetroFPL2026!';

export async function GET() {
  const results = [];

  for (const manager of managersList) {
    try {
      // 1. Create the user in Supabase Authentication securely
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: manager.email,
        password: TEMPORARY_PASSWORD,
        email_confirm: true, // Skips the email verification step so they can log in instantly
      });

      if (authError) throw authError;
      
      const newUserId = authData.user.id;

      // 2. Create their public profile in our custom 'users' database table
      const { error: dbError } = await supabaseAdmin
        .from('users')
        .insert({
          id: newUserId, // Link the database row to the secure auth login
          team_name: manager.teamName,
          manager_name: manager.managerName,
          league_id: manager.leagueId,
          remaining_budget: 100.0,
          transfers_remaining: 8,
          must_change_password: true, // Forces them to change the temp password on login
        });

      if (dbError) throw dbError;

      results.push({ email: manager.email, status: 'Success' });

    } catch (error: any) {
      console.error(`Failed to create account for ${manager.email}:`, error.message);
      results.push({ email: manager.email, status: 'Failed', reason: error.message });
    }
  }

  return NextResponse.json({
    message: "Provisioning complete.",
    details: results
  });
}