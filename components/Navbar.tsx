'use client';

import React from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // We do NOT want the Navbar showing up on the login or password reset screens
  if (pathname === '/login' || pathname === '/reset-password') {
    return null;
  }

  // Helper function to check if a link is active
  const isActive = (path: string) => pathname === path;

  return (
    <nav className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-tight">Retro FPL</h1>
        <div className="space-x-6 text-sm font-medium flex items-center">
          <Link href="/" className={`transition ${isActive('/') ? 'text-emerald-400' : 'hover:text-emerald-400'}`}>
            Dashboard
          </Link>
          <Link href="/my-team" className={`transition ${isActive('/my-team') ? 'text-emerald-400' : 'hover:text-emerald-400'}`}>
            My Team
          </Link>
          <Link href="/transfers" className={`transition ${isActive('/transfers') ? 'text-emerald-400' : 'hover:text-emerald-400'}`}>
            Transfers
          </Link>
          <Link href="/leagues" className={`transition ${isActive('/leagues') ? 'text-emerald-400' : 'hover:text-emerald-400'}`}>
            Leagues
          </Link>
          <Link href="/fixtures" className={`transition ${isActive('/fixtures') ? 'text-emerald-400' : 'hover:text-emerald-400'}`}>
            Fixtures
          </Link>
          <button onClick={handleLogout} className="text-slate-400 hover:text-rose-400 transition ml-4 border-l border-slate-700 pl-4">
            Log Out
          </button>
        </div>
      </div>
    </nav>
  );
}