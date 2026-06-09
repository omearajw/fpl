'use client';

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // 1. Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // 2. Check the database for the 'must_change_password' flag
      const { data: userData, error: dbError } = await supabase
        .from('users')
        .select('must_change_password')
        .eq('id', authData.user.id)
        .single();

      if (dbError) throw dbError;

      // 3. Redirect based on their account status
      if (userData?.must_change_password) {
        router.push('/reset-password');
      } else {
        router.push('/my-team');
      }

    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        
        <div className="bg-slate-900 p-8 text-center">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Retro FPL</h1>
          <p className="text-emerald-400 font-medium mt-2 text-sm uppercase tracking-widest">Manager Portal</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-6 rounded-r">
              <p className="text-sm text-rose-700 font-bold">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="manager@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 rounded-lg font-bold text-white transition-all shadow-md ${
                isLoading 
                  ? 'bg-slate-400 cursor-not-allowed' 
                  : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg'
              }`}
            >
              {isLoading ? 'Authenticating...' : 'Secure Sign In'}
            </button>
          </form>
          
          <p className="text-center text-xs text-slate-500 mt-6">
            League access is by invitation only. Contact the commissioner if you cannot access your account.
          </p>
        </div>
      </div>
    </div>
  );
}