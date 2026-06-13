'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageSkeleton from '../components/PageSkeleton';

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
  const [userH2hPts, setUserH2hPts] = useState<number | string>('-');
  
  // Fixtures State
  const [activeGw, setActiveGw] = useState<number>(1);
  const [currentMatchup, setCurrentMatchup] = useState<any>(null);

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

      // 3. Read from the Master Clock
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('active_gameweek, next_gameweek')
        .single();
        
      const currentGw = settingsData?.active_gameweek || 1;
      setActiveGw(currentGw);

      // 4. Fetch the User's Matchup for the Current Gameweek
      const { data: matchupData } = await supabase
        .from('fixtures')
        .select(`
          id,
          gameweek,
          home_user_id,
          away_user_id,
          home:users!fixtures_home_user_id_fkey(id, team_name, manager_name),
          away:users!fixtures_away_user_id_fkey(id, team_name, manager_name)
        `)
        .eq('gameweek', currentGw)
        .or(`home_user_id.eq.${uid},away_user_id.eq.${uid}`)
        .single();

      if (matchupData) {
        // Fetch the live scores for this specific matchup
        const { data: scoresData } = await supabase
          .from('gameweek_scores')
          .select('user_id, points_earned')
          .eq('gameweek', currentGw)
          .in('user_id', [matchupData.home_user_id, matchupData.away_user_id].filter(Boolean));

        const scoreMap = new Map(scoresData?.map(s => [s.user_id, s.points_earned]) || []);

        setCurrentMatchup({
          ...matchupData,
          homeScore: scoreMap.get(matchupData.home_user_id) || 0,
          awayScore: matchupData.away_user_id ? (scoreMap.get(matchupData.away_user_id) || 0) : null,
        });
      }

      // 5. Fetch Live Total FPL Points
      // (This continues to live-update during the weekend)
      const { data: userLiveScore } = await supabase
        .from('gameweek_scores')
        .select('running_total')
        .eq('user_id', uid)
        .eq('gameweek', currentGw)
        .single();
        
      if (userLiveScore) {
        setUserPoints(userLiveScore.running_total);
      } else {
        // Fallback to previous week if weekend just started
        const { data: prevScore } = await supabase
          .from('gameweek_scores')
          .select('running_total')
          .eq('user_id', uid)
          .eq('gameweek', Math.max(1, currentGw - 1))
          .single();
        if (prevScore) setUserPoints(prevScore.running_total);
      }

      // 6. Fetch Official H2H Standings & Rank
      const leagueId = profileData?.league_id;

      if (leagueId) {
        const [
          { data: h2hData },
          { data: usersData }
        ] = await Promise.all([
          supabase.from('h2h_league_table').select('*'),
          supabase.from('users').select('id, league_id, transfers_remaining').eq('league_id', leagueId)
        ]);

        if (h2hData && usersData) {
          const leagueUserIds = new Set(usersData.map(u => u.id));
          const leagueH2H = h2hData.filter(row => leagueUserIds.has(row.user_id));
          const userMap = new Map(usersData.map(u => [u.id, u]));

          const enrichedStandings = leagueH2H.map(row => ({
            ...row,
            transfers: userMap.get(row.user_id)?.transfers_remaining || 0
          }));

          // Sort exactly like the Leagues page: 1. H2H Pts, 2. FPL Pts, 3. Transfers Left
          enrichedStandings.sort((a, b) => {
            if (b.total_h2h_points !== a.total_h2h_points) return b.total_h2h_points - a.total_h2h_points;
            if (b.points_for !== a.points_for) return b.points_for - a.points_for;
            return b.transfers - a.transfers;
          });

          // Find current user's official rank and H2H points
          const rankIndex = enrichedStandings.findIndex(s => s.user_id === uid);
          if (rankIndex !== -1) {
            setUserRank(rankIndex + 1);
            setUserH2hPts(enrichedStandings[rankIndex].total_h2h_points || 0);
          }

          // Format the Top 5 for the sidebar widget
          const formattedTop5 = enrichedStandings.slice(0, 5).map((s: any, index: number) => ({
            rank: index + 1,
            name: s.team_name || 'Unknown Team',
            manager: s.manager_name || 'Unknown',
            pts: s.total_h2h_points || 0,
            highlight: s.user_id === uid
          }));

          setTopStandings(formattedTop5);
        }
      }

      // 7. Fetch Latest Newsletter
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

  // --- DEVELOPER TOOL ACTIONS ---
  const handleTriggerLockout = async () => {
    const isConfirmed = window.confirm("Phase 1: Trigger Deadline Lockout? Transfers will be locked and Next GW advanced.");
    if (!isConfirmed) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/cron/lockout', {headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }});
      const data = await res.json();
      if (res.ok) { alert(data.message); window.location.reload(); }
      else { alert(`Error: ${data.error || data.message}`); }
    } catch (err) { alert("Failed to trigger lockout."); }
    setIsLoading(false);
  };

  const handleUpdateLivePoints = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/cron/calculate-points', {headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }});
      const data = await res.json();
      if (res.ok) { alert(data.message); window.location.reload(); }
      else { alert(`Error: ${data.error || data.message}`); }
    } catch (err) { alert("Failed to update live points."); }
    setIsLoading(false);
  };

  const handleTriggerRollover = async () => {
    const isConfirmed = window.confirm("Phase 3: Run Tuesday Rollover? This finalizes points and advances the Active GW.");
    if (!isConfirmed) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/cron/calculate-points?rollover=true', {headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }});
      const data = await res.json();
      if (res.ok) { alert(data.message); window.location.reload(); }
      else { alert(`Error: ${data.error || data.message}`); }
    } catch (err) { alert("Failed to trigger rollover."); }
    setIsLoading(false);
  };

  const handleSeedBots = async () => {
    const amount = window.prompt("How many fully-rostered Bot teams do you want to create?", "5");
    if (!amount || isNaN(Number(amount))) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/seed-bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({ count: Number(amount) }) 
      });
      const data = await res.json();
      if (res.ok) { alert(data.message); } else { alert(`Error: ${data.error}`); }
    } catch (err) { alert("Failed to seed bots."); }
    setIsLoading(false);
  };

  const handleResetSeason = async () => {
    const isConfirmed = window.confirm("⚠️ DANGER: Are you sure you want to completely reset the season? This will delete all points and revert all rosters to Gameweek 1.");
    if (!isConfirmed) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/reset-season', { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
      });
      const data = await res.json();
      if (res.ok) { alert(data.message); window.location.reload(); } else { alert(`Error: ${data.error}`); }
    } catch (err) { alert("Failed to reset season."); }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <PageSkeleton>
        <div className="min-h-screen bg-slate-50 font-sans">
          <main className="max-w-6xl mx-auto py-8 px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">Welcome back, Manager</h2>
                <p className="text-slate-500 font-medium">Your team name here</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-2 md:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="h-24 bg-slate-200 rounded-3xl" />
                ))}
              </div>
            </div>
          </main>
        </div>
      </PageSkeleton>
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
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Gameweek</p>
              <p className="text-3xl font-extrabold text-slate-800 mt-1">{activeGw}</p> 
            </div>
            <div>
              <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider">H2H Pts</p>
              <p className="text-3xl font-extrabold text-indigo-600 mt-1">{userH2hPts}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">FPL Pts</p>
              <p className="text-3xl font-extrabold text-slate-800 mt-1">{userPoints}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">League Rank</p>
              <p className="text-3xl font-extrabold text-slate-800 mt-1">{userRank}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-200 flex flex-col justify-center col-span-2 md:col-span-1">
              <p className="text-xs text-emerald-800 font-bold uppercase tracking-wider">Transfers</p>
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
            <h3 className="text-rose-800 font-bold">Time Machine Controls</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button 
                onClick={handleTriggerLockout}
                className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2 px-4 rounded shadow transition"
              >
                1. Trigger Lockout
              </button>

              <button 
                onClick={handleUpdateLivePoints}
                className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold py-2 px-4 rounded shadow transition"
              >
                2. Live Pts Update
              </button>

              <button 
                onClick={handleTriggerRollover}
                className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold py-2 px-4 rounded shadow transition"
              >
                3. Finalize & Rollover
              </button>
            </div>

            <hr className="border-rose-200 my-2" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button 
                onClick={handleSeedBots}
                className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold py-2 px-4 rounded shadow transition"
              >
                Seed 🤖 Bot Teams
              </button>

              <button 
                onClick={handleResetSeason}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2 px-4 rounded shadow transition border border-red-800"
              >
                ⚠️ Reset Season
              </button>
            </div>
            
            <p className="text-[10px] text-rose-500 font-medium uppercase tracking-wide">Admin Test Tools</p>
          </div>
          
        </div>

        {/* Sidebar Column */}
        <div className="space-y-8">

          {/* MATCHUP WIDGET */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-end mb-4">
              <h3 className="font-bold text-slate-900">Your Matchup</h3>
              <span className="text-xs text-slate-500 font-medium">GW {activeGw}</span>
            </div>

            {!currentMatchup ? (
              <div className="text-center py-6 text-sm text-slate-500 font-medium bg-slate-50 rounded-lg border border-slate-100">
                No matchup found for this gameweek.
              </div>
            ) : (
              <div className="flex items-stretch justify-between bg-slate-50 rounded-lg border border-slate-100 overflow-hidden">
                {/* Home Team */}
                <div className="flex-1 p-3 text-center flex flex-col justify-center">
                  <Link href={`/team/${currentMatchup.home.id}`} className="font-bold text-slate-900 hover:text-emerald-600 transition text-sm line-clamp-1">
                    {currentMatchup.home.team_name}
                  </Link>
                  <span className="text-[10px] text-slate-500 line-clamp-1">{currentMatchup.home.manager_name}</span>
                </div>

                {/* Score/VS */}
                <div className="bg-slate-200 px-3 flex items-center justify-center font-mono font-bold text-base text-slate-800 border-x border-slate-300">
                  {currentMatchup.homeScore} - {currentMatchup.awayScore !== null ? currentMatchup.awayScore : 'AVG'}
                </div>

                {/* Away Team */}
                <div className="flex-1 p-3 text-center flex flex-col justify-center">
                  {currentMatchup.away ? (
                    <>
                      <Link href={`/team/${currentMatchup.away.id}`} className="font-bold text-slate-900 hover:text-emerald-600 transition text-sm line-clamp-1">
                        {currentMatchup.away.team_name}
                      </Link>
                      <span className="text-[10px] text-slate-500 line-clamp-1">{currentMatchup.away.manager_name}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-slate-400 text-xs">BYE WEEK</span>
                      <span className="text-[10px] text-slate-400">League Avg</span>
                    </>
                  )}
                </div>
              </div>
            )}
            
            <Link href="/fixtures" className="block text-center w-full mt-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-300">
              View Full Schedule
            </Link>
          </div>

          {/* Mini League Table */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-end mb-4">
              <h3 className="font-bold text-slate-900">League Standings</h3>
              <span className="text-xs text-slate-500 font-medium">Top 5 • H2H Pts</span>
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
                    <span className={`font-extrabold ${team.highlight ? 'text-indigo-400' : 'text-indigo-600'}`}>{team.pts}</span>
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