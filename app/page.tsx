'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Dashboard() {
  const router = useRouter();
  
  // Real Database States
  const [isLoading, setIsLoading] = useState(true);
  const [managerInfo, setManagerInfo] = useState<any>(null);
  const [topStandings, setTopStandings] = useState<any[]>([]);
  const [userRank, setUserRank] = useState<number | string>('-');
  const [userPoints, setUserPoints] = useState<number | string>(0);
  
  // Newsletter State
  const [newsletter, setNewsletter] = useState<any>(null);

  useEffect(() => {
    async function loadDashboard() {
      // 1. Authentication Lock
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const uid = session.user.id;

      // 2. Fetch Manager Profile
      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', uid)
        .single();

      if (profileData) setManagerInfo(profileData);


      // 3. Fetch league-mates using the current user's league_id
      const leagueId = profileData?.league_id;

      if (leagueId) {
        const { data: leagueMates } = await supabase
          .from('users')
          .select('id')
          .eq('league_id', leagueId);

        const leagueMateIds = leagueMates?.map(u => u.id) ?? [];

        const { data: scoresData } = await supabase
          .from('gameweek_scores')
          .select(`
            user_id,
            gameweek,
            running_total,
            users (team_name, manager_name)
          `)
          .in('user_id', leagueMateIds)
          .order('gameweek', { ascending: false });

        if (scoresData && scoresData.length > 0) {
          // Deduplicate: keep only the latest row per user (highest gameweek = current running_total)
          const latestByUser = new Map<string, any>();
          for (const row of scoresData) {
            if (!latestByUser.has(row.user_id)) {
              latestByUser.set(row.user_id, row);
            }
          }

          const standingsData = Array.from(latestByUser.values())
            .sort((a, b) => (b.running_total || 0) - (a.running_total || 0));

          const rankIndex = standingsData.findIndex(s => s.user_id === uid);
          if (rankIndex !== -1) {
            setUserRank(rankIndex + 1);
            setUserPoints(standingsData[rankIndex].running_total || 0);
          }

          const formattedTop5 = standingsData.slice(0, 5).map((s: any, index: number) => ({
            rank: index + 1,
            name: s.users?.team_name || 'Unknown Team',
            manager: s.users?.manager_name || 'Unknown',
            pts: s.running_total || 0,
            highlight: s.user_id === uid
          }));

          setTopStandings(formattedTop5);
        }
      }

      // 4. Fetch Latest Newsletter
      const { data: newsData } = await supabase
        .from('newsletters')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (newsData) setNewsletter(newsData);

      setIsLoading(false);
    }

    loadDashboard();
  }, [router]);

    const handleSimulateGameweek = async () => {
    const isConfirmed = window.confirm("Are you sure you want to simulate a full weekend of fixtures?");
    if (!isConfirmed) return;

    setIsLoading(true);
    try {
    const res = await fetch('/api/cron/calculate-points');
      const data = await res.json();
      
      if (res.ok) {
        alert(data.message);
        window.location.reload(); // Refresh the page to see the new data!
      } else {
        alert(`Error: ${data.error || data.message}`);
      }
    } catch (err) {
      alert("Failed to run simulation.");
    }
    setIsLoading(false);
  };

  const handleSeedBots = async () => {
    const amount = window.prompt("How many fully-rostered Bot teams do you want to create?", "5");
    if (!amount || isNaN(Number(amount))) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/seed-bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: Number(amount) }) 
        // Note: You can pass a specific leagueId here if you want them assigned immediately
      });
      
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert("Failed to seed bots.");
    }
    setIsLoading(false);
  };

  const handleResetSeason = async () => {
    const isConfirmed = window.confirm("⚠️ DANGER: Are you sure you want to completely reset the season? This will delete all points and revert all rosters to Gameweek 1.");
    if (!isConfirmed) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/reset-season', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        alert(data.message);
        window.location.reload();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert("Failed to reset season.");
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 animate-pulse">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="h-16 bg-slate-200 rounded-xl"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 h-64 bg-slate-200 rounded-xl"></div>
            <div className="h-96 bg-slate-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      <main className="max-w-6xl mx-auto py-8 px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Welcome Banner */}
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Welcome back, {managerInfo?.manager_name?.split(' ')[0] || 'Manager'}</h2>
            <p className="text-slate-500 font-medium">{managerInfo?.team_name}</p>
          </div>

          {/* Stat Banner */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Gameweek</p>
              <p className="text-3xl font-extrabold text-slate-800 mt-1">1</p> 
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Points</p>
              <p className="text-3xl font-extrabold text-slate-800 mt-1">{userPoints}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Overall Rank</p>
              <p className="text-3xl font-extrabold text-slate-800 mt-1">{userRank}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-200 flex flex-col justify-center">
              <p className="text-xs text-emerald-800 font-bold uppercase tracking-wider">Transfers Left</p>
              <p className="text-3xl font-extrabold text-emerald-600 mt-1">{managerInfo?.transfers_remaining || 0}</p>
            </div>
          </div>

          {/* Commissioner's Corner (Newsletter) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
              <h2 className="text-lg font-bold">Commissioner's Corner</h2>
              <span className="text-xs font-medium bg-slate-700 px-2 py-1 rounded">Latest</span>
            </div>
            {newsletter ? (
              <div className="p-6 prose max-w-none text-slate-700">
                <p className="text-sm text-slate-400 mb-4 font-medium">
                  Posted by League Admin • {new Date(newsletter.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{newsletter.title}</h3>
                <p className="leading-relaxed whitespace-pre-wrap">{newsletter.content}</p>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-medium">
                No announcements yet. Check back closer to the gameweek deadline.
              </div>
            )}
          </div>
          {/* Developer Tools */}
          <div className="bg-rose-50 border border-rose-200 p-6 rounded-xl shadow-sm text-center flex flex-col gap-4">
            <h3 className="text-rose-800 font-bold">Developer Tools</h3>
            
            <button 
              onClick={handleSimulateGameweek}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 px-6 rounded shadow transition"
            >
              Simulate Next Gameweek
            </button>

            <button 
              onClick={handleSeedBots}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-6 rounded shadow transition"
            >
              Seed 🤖 Bot Teams
            </button>

            <button 
              onClick={handleResetSeason}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded shadow transition mt-4 border border-red-800"
            >
              ⚠️ Reset Entire Season to GW1
            </button>
            
            <p className="text-xs text-rose-500 font-medium">Use these to test the league mechanics during the off-season.</p>
          </div>
          
        </div>

        {/* Sidebar Column */}
        <div className="space-y-8">
          {/* Mini League Table */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-end mb-4">
              <h3 className="font-bold text-slate-900">League Standings</h3>
              <span className="text-xs text-slate-500 font-medium">Top 5</span>
            </div>
            
            <div className="space-y-2">
              {topStandings.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-500 font-medium bg-slate-50 rounded-lg border border-slate-100">
                  No points recorded yet.<br/>Waiting for Gameweek 1.
                </div>
              ) : (
                topStandings.map((team) => (
                  <div key={team.name} className={`flex justify-between items-center p-3 rounded-lg transition-colors ${team.highlight ? 'bg-slate-800 text-white shadow-md' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-sm ${team.highlight ? 'text-slate-300' : 'text-slate-400'}`}>{team.rank}.</span>
                      <div>
                        <p className={`font-bold text-sm truncate w-32 ${team.highlight ? 'text-white' : 'text-slate-800'}`}>{team.name}</p>
                        <p className={`text-xs truncate w-32 ${team.highlight ? 'text-slate-300' : 'text-slate-500'}`}>{team.manager}</p>
                      </div>
                    </div>
                    <span className="font-extrabold">{team.pts}</span>
                  </div>
                ))
              )}
            </div>
            
            <a href="/leagues" className="block text-center w-full mt-6 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-300">
              View Full Standings
            </a>
          </div>
        </div>

      </main>
    </div>
  );
}