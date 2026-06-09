'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Security check: Ensure they are actually logged in before viewing this page
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      }
    };
    checkSession();
  }, [router]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Basic Validation
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      setIsLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      setIsLoading(false);
      return;
    }

    try {
      // 1. Get the currently logged-in user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Could not verify your session. Please log in again.");

      // 2. Update their secure password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (updateError) throw updateError;

      // 3. Update the database flag so they aren't asked to do this again
      const { error: dbError } = await supabase
        .from('users')
        .update({ must_change_password: false })
        .eq('id', user.id);
      
      if (dbError) throw dbError;

      // 4. Success! Send them to the pitch.
      router.push('/my-team');

    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        
        <div className="bg-amber-500 p-8 text-center">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Account Security</h1>
          <p className="text-amber-900 font-medium mt-2 text-sm">Please secure your account to continue.</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-6 rounded-r">
              <p className="text-sm text-rose-700 font-bold">{error}</p>
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-lg mb-6 border border-slate-200 text-sm text-slate-600">
            You are currently using a temporary password assigned by the commissioner. You must create a new, private password before accessing the transfer market.
          </div>

          <form onSubmit={handlePasswordReset} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition-all"
                placeholder="Minimum 6 characters"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition-all"
                placeholder="Repeat password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 rounded-lg font-bold text-slate-900 transition-all shadow-md mt-4 ${
                isLoading 
                  ? 'bg-slate-300 cursor-not-allowed' 
                  : 'bg-amber-400 hover:bg-amber-500 hover:shadow-lg'
              }`}
            >
              {isLoading ? 'Updating...' : 'Save Password & Enter'}
            </button>
          </form>
          
        </div>
      </div>
    </div>
  );
}