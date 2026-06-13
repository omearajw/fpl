'use client';

import React, { useEffect, useState } from 'react';
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
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from('users')
          .select('is_admin')
          .eq('id', session.user.id)
          .single();
        
        if (data?.is_admin) {
          setIsAdmin(true);
        }
      }
    };
    checkAdminStatus();
  }, [pathname]);

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
          
          {/* Conditional Admin Link */}
          {isAdmin && (
            <Link href="/admin" className={`transition flex items-center gap-1 ${isActive('/admin') ? 'text-rose-400' : 'text-slate-400 hover:text-rose-400'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              Admin
            </Link>
          )}

          <button onClick={handleLogout} className="text-slate-400 hover:text-rose-400 transition ml-4 border-l border-slate-700 pl-4">
            Log Out
          </button>
        </div>
      </div>
    </nav>
  );
}