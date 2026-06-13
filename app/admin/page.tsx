'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AdminDashboard() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [deadlineString, setDeadlineString] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'loading' } | null>(null);

  useEffect(() => {
    const initAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/login');

      const { data: user } = await supabase.from('users').select('is_admin').eq('id', session.user.id).single();
      if (!user?.is_admin) return router.push('/');

      setIsAuthorized(true);

      const { data: settings } = await supabase.from('system_settings').select('deadline_time').eq('id', 1).single();
      if (settings?.deadline_time) {
        const dateObj = new Date(settings.deadline_time);
        const localFormat = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setDeadlineString(localFormat);
      }
    };
    initAdmin();
  }, [router]);

  const handleUpdateDeadline = async () => {
    setStatusMsg({ text: 'Updating database clock...', type: 'loading' });
    try {
      const isoString = new Date(deadlineString).toISOString();
      const { error } = await supabase.from('system_settings').update({ deadline_time: isoString }).eq('id', 1);
      if (error) throw error;
      setStatusMsg({ text: 'Deadline successfully updated.', type: 'success' });
    } catch (err: any) {
      setStatusMsg({ text: err.message, type: 'error' });
    }
  };

  const triggerApiRoute = async (url: string, actionName: string) => {
    if (!window.confirm(`Are you sure you want to run: ${actionName}?`)) return;
    setStatusMsg({ text: `Executing ${actionName}...`, type: 'loading' });
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error("Not authenticated. Please log in.");

      const res = await fetch(url, { 
        method: 'POST', // *See note below about this!
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }); 
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error(`Server returned HTML. Route ${url} might not exist (404 Error).`);
      }

      // THE FIX: Read the raw text first, instead of forcing .json()
      const textResponse = await res.text();
      let data: any = {};
      
      if (textResponse) {
        try {
          data = JSON.parse(textResponse);
        } catch (e) {
          // If it's not JSON, just wrap the raw text in an object
          data = { message: textResponse }; 
        }
      }

      if (!res.ok) {
        throw new Error(data.error || `API Request Failed (Status: ${res.status})`);
      }
      
      setStatusMsg({ text: data.message || `${actionName} Complete!`, type: 'success' });
    } catch (err: any) {
      setStatusMsg({ text: err.message, type: 'error' });
    }
  };

  if (!isAuthorized) return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Verifying access...</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900">League Control Room</h1>
          <p className="text-slate-500 mt-1">Manage weekly operations, deadlines, and league data.</p>
        </header>

        {statusMsg && (
          <div className={`p-4 rounded-lg font-bold mb-6 ${
            statusMsg.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 
            statusMsg.type === 'error' ? 'bg-rose-100 text-rose-800' : 
            'bg-blue-100 text-blue-800 animate-pulse'
          }`}>
            {statusMsg.text}
          </div>
        )}

        {/* SECTION 1: WEEKEND OPERATIONS (SAFE) */}
        <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">1. Weekend Operations</h2>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div>
              <p className="font-bold text-slate-700">Update Live Points</p>
              <p className="text-sm text-slate-500">Pulls the latest real-world scores. Safe to click anytime during matches.</p>
            </div>
            <button 
              onClick={() => triggerApiRoute('/api/admin/trigger-calculate-points', 'Live Points Update')}
              className="w-full md:w-auto bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-6 rounded shadow transition whitespace-nowrap"
            >
              Fetch Live Scores
            </button>
          </div>
        </section>

        {/* SECTION 2: THE TIMELINE (CAUTION) */}
        <section className="bg-white p-6 rounded-xl border border-amber-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">2. Timeline & Deadlines</h2>
          
          <div className="space-y-6">
            {/* Override Clock */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end justify-between bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="w-full">
                <label className="block text-sm font-bold text-slate-700 mb-1">Master Deadline</label>
                <p className="text-xs text-slate-500 mb-2">Change the exact time players are locked out of making transfers.</p>
                <input 
                  type="datetime-local" 
                  value={deadlineString}
                  onChange={(e) => setDeadlineString(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                />
              </div>
              <button 
                onClick={handleUpdateDeadline}
                className="w-full md:w-auto bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-6 rounded transition whitespace-nowrap"
              >
                Save Time
              </button>
            </div>

            {/* Lockout */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div>
                <p className="font-bold text-amber-700">Force Saturday Lockout</p>
                <p className="text-sm text-slate-500">Manually lock the game and duplicate teams for the weekend.</p>
              </div>
              <button 
                onClick={() => triggerApiRoute('/api/admin/trigger-lockout', 'Saturday Lockout')}
                className="w-full md:w-auto bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-6 rounded shadow transition whitespace-nowrap"
              >
                Trigger Lockout
              </button>
            </div>

            {/* Rollover */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border-t pt-4">
              <div>
                <p className="font-bold text-rose-600">Tuesday Weekly Rollover</p>
                <p className="text-sm text-slate-500">Finalizes all points and officially opens the next Gameweek. Only click when the real-world week is completely finished.</p>
              </div>
              <button 
                onClick={() => triggerApiRoute('/api/admin/trigger-calculate-points?rollover=true', 'Tuesday Rollover')}
                className="w-full md:w-auto bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-6 rounded shadow transition whitespace-nowrap"
              >
                Run Rollover
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: DANGER ZONE */}
        <section className="bg-rose-50 p-6 rounded-xl border border-rose-200 shadow-sm">
          <h2 className="text-lg font-bold text-rose-800 mb-4 border-b border-rose-200 pb-2">3. Pre-Season Setup (Danger Zone)</h2>
          <p className="text-sm text-rose-600 mb-4">Do not click these while a season is active. These will overwrite existing database records.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button 
              onClick={() => triggerApiRoute('/api/admin/seed-bots', 'Seed Bots')}
              className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold py-3 px-4 rounded shadow transition"
            >
              🤖 Seed Bots
            </button>

            <button 
              onClick={() => triggerApiRoute('/api/admin/generate-fixtures', 'Generate Fixtures')}
              className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold py-3 px-4 rounded shadow transition"
            >
              📅 Gen Fixtures
            </button>

            <button 
              onClick={() => triggerApiRoute('/api/admin/reset-season', 'Reset Season')}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-3 px-4 rounded shadow transition border border-red-800 flex items-center justify-center gap-2"
            >
              ⚠️ Reset Season
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}