'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import PageSkeleton from '../../components/PageSkeleton';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- FPL FORMATION RULES ---
const MIN_STARTERS: Record<string, number> = { GK: 1, DEF: 3, MID: 2, FWD: 1 };

export default function MyTeam() {
  const router = useRouter();
  
  const [userId, setUserId] = useState<string | null>(null);
  const [dbSquad, setDbSquad] = useState<any[]>([]); 
  const [currentSquad, setCurrentSquad] = useState<any[]>([]); 
  const [managerInfo, setManagerInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Timeline States
  const [activeGw, setActiveGw] = useState<number>(1);
  const [nextGw, setNextGw] = useState<number>(1);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [countdownText, setCountdownText] = useState<string>('--h --m --s'); // Default skeleton state
  const [isLimbo, setIsLimbo] = useState<boolean>(false); // NEW STATE

  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [isSavingLineup, setIsSavingLineup] = useState(false);
  const [swapError, setSwapError] = useState('');

  useEffect(() => {
    async function loadManagerData() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push('/login');
        return;
      }

      const uid = session.user.id;
      setUserId(uid);

      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', uid)
        .single();

      if (profileData) setManagerInfo(profileData);

      // Read from the Master Clock (Now including deadline_time)
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('active_gameweek, next_gameweek, deadline_time')
        .single();
        
      const currentActiveGw = settingsData?.active_gameweek || 1;
      const currentNextGw = settingsData?.next_gameweek || 1;
      
      setActiveGw(currentActiveGw);
      setNextGw(currentNextGw);
      setIsLockedOut(currentActiveGw !== currentNextGw);
      
      if (settingsData?.deadline_time) {
        setDeadline(new Date(settingsData.deadline_time));
      }

      // My Team always looks at the NEXT gameweek so managers can prepare
      const { data: rosterData } = await supabase
        .from('rosters')
        .select(`is_starter, purchase_price, players_cache(id, name, position, team, current_cost)`)
        .eq('user_id', uid)
        .eq('gameweek', currentNextGw); 

      if (rosterData) {
        const formattedSquad = rosterData.map((row: any) => ({
          id: row.players_cache.id,
          name: row.players_cache.name,
          pos: row.players_cache.position,
          team: row.players_cache.team,
          price: row.players_cache.current_cost,
          purchasePrice: row.purchase_price,
          isStarter: row.is_starter
        }));
        
        setDbSquad(formattedSquad);
        setCurrentSquad(formattedSquad);
      }

      setIsLoading(false);
    }
    loadManagerData();
  }, [router]);

  // --- ZERO-DELAY COUNTDOWN TIMER ENGINE ---
  useEffect(() => {
    if (!deadline || isLockedOut) return;

    const updateTimer = () => {
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdownText('DEADLINE PASSED');
        setIsLimbo(true); // Trigger the full-page block!
        return false; 
      } else {
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);
        
        const pad = (num: number) => num.toString().padStart(2, '0');
        setCountdownText(`${d > 0 ? `${d}d ` : ''}${pad(h)}h ${pad(m)}m ${pad(s)}s`);
        return true; // Tell interval to keep going
      }
    };

    // Run immediately so the UI doesn't flash
    const keepRunning = updateTimer();
    if (!keepRunning) return;

    // Hand off to the interval
    const interval = setInterval(() => {
      const shouldContinue = updateTimer();
      if (!shouldContinue) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [deadline, isLockedOut]);

  // --- THE LIMBO RECOVERY POLL ---
  useEffect(() => {
    if (!isLimbo) return;

    const checkBackendSync = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('next_gameweek, deadline_time')
        .eq('id', 1) // Explicitly target the master row to bypass cache
        .single();
        
      if (data) {
        // 1. Did the backend successfully trigger the lockout?
        const isTimelineSplit = data.next_gameweek > nextGw;
        
        // 2. Did the Admin manually push the deadline into the future to fix a stale database?
        const isDeadlineFixed = new Date(data.deadline_time) > new Date();

        if (isTimelineSplit || isDeadlineFixed) {
           window.location.reload(); 
        }
      }
    };

    const pollInterval = setInterval(checkBackendSync, 3000); 
    return () => clearInterval(pollInterval);
  }, [isLimbo, nextGw]);

  // --- SMART DIMMING LOGIC ---
  const startersCount = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  currentSquad.filter(p => p.isStarter).forEach(p => {
    startersCount[p.pos as keyof typeof startersCount]++;
  });

  const isSwapValid = (p1: any, p2: any) => {
    if (p1.isStarter === p2.isStarter) return true; 
    
    const starter = p1.isStarter ? p1 : p2;
    const bench = p1.isStarter ? p2 : p1;

    if (starter.pos === 'GK' || bench.pos === 'GK') {
      return starter.pos === 'GK' && bench.pos === 'GK';
    }

    if (starter.pos === bench.pos) return true;

    if (startersCount[starter.pos as keyof typeof startersCount] <= MIN_STARTERS[starter.pos]) {
      return false;
    }

    return true;
  };

  // --- ACTIONS ---
  const handlePlayerClick = (player: any) => {
    setSwapError(''); 

    if (!selectedPlayerId) {
      setSelectedPlayerId(player.id);
      return;
    }

    if (selectedPlayerId === player.id) {
      setSelectedPlayerId(null);
      return;
    }

    const player1 = currentSquad.find(p => p.id === selectedPlayerId);
    const player2 = player;

    if (player1.isStarter === player2.isStarter) {
      setSelectedPlayerId(player.id);
      return;
    }

    if (!isSwapValid(player1, player2)) {
      setSwapError("That substitution would result in an illegal formation.");
      setSelectedPlayerId(null);
      return;
    }

    const proposedSquad = currentSquad.map(p => {
      if (p.id === player1.id) return { ...p, isStarter: player2.isStarter };
      if (p.id === player2.id) return { ...p, isStarter: player1.isStarter };
      return p;
    });

    setCurrentSquad(proposedSquad);
    setSelectedPlayerId(null);
  };

  const handleSaveLineup = async () => {
    setIsSavingLineup(true);

    try {
      const changedPlayers = currentSquad.filter(p => {
        const original = dbSquad.find(db => db.id === p.id);
        return original && original.isStarter !== p.isStarter;
      });

      for (const p of changedPlayers) {
        await supabase
          .from('rosters')
          .update({ is_starter: p.isStarter })
          .eq('user_id', userId)
          .eq('player_id', p.id)
          .eq('gameweek', nextGw); // Ensure we save to the NEXT gameweek!
      }

      setDbSquad([...currentSquad]);
    } catch (error) {
      console.error("Error saving lineup:", error);
      alert("Failed to save lineup changes.");
    } finally {
      setIsSavingLineup(false);
    }
  };

  const cancelLineupChanges = () => {
    setCurrentSquad([...dbSquad]);
    setSelectedPlayerId(null);
    setSwapError('');
  };

  if (isLoading) {
    return (
      <PageSkeleton>
        <div className="min-h-screen bg-slate-50 font-sans pb-12 relative">
          <main className="max-w-6xl mx-auto py-8 px-4 space-y-8">
            <div className="h-16 bg-slate-200 rounded-xl mb-6" />
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="space-y-3">
                <div className="h-8 w-64 bg-slate-200 rounded-full" />
                <div className="h-4 w-40 bg-slate-200 rounded-full" />
              </div>
              <div className="flex gap-6 text-center">
                <div className="h-16 w-32 bg-slate-200 rounded-3xl" />
                <div className="h-16 w-32 bg-slate-200 rounded-3xl" />
                <div className="h-16 w-32 bg-slate-200 rounded-3xl" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 space-y-6">
                <div className="h-16 bg-slate-200 rounded-3xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={idx} className="h-28 bg-slate-200 rounded-3xl" />
                  ))}
                </div>
              </div>

              <div className="lg:col-span-4 space-y-6">
                <div className="h-12 bg-slate-200 rounded-3xl" />
                <div className="h-12 bg-slate-200 rounded-3xl" />
                <div className="h-12 bg-slate-200 rounded-3xl" />
              </div>
            </div>
          </main>
        </div>
      </PageSkeleton>
    );
  }

  const hasLineupChanged = JSON.stringify(currentSquad) !== JSON.stringify(dbSquad);
  const bank = managerInfo?.remaining_budget || 0;
  const squadValue = currentSquad.reduce((acc, player) => acc + player.price, 0);
  const transfersLeft = managerInfo?.transfers_remaining || 0;

  const starters = currentSquad.filter(p => p.isStarter);
  const bench = currentSquad.filter(p => !p.isStarter);
  
  const gks = starters.filter(p => p.pos === 'GK');
  const defs = starters.filter(p => p.pos === 'DEF');
  const mids = starters.filter(p => p.pos === 'MID');
  const fwds = starters.filter(p => p.pos === 'FWD');

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12 relative">

      {/* --- SLEEK LIMBO OVERLAY --- */}
      {isLimbo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-all">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center border border-slate-200">
            <div className="flex justify-center mb-4">
              <svg className="animate-spin h-10 w-10 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Finalizing Deadline</h2>
            <p className="text-sm text-slate-500 font-medium">
              The transfer window is currently closing. Please wait while we sync the live gameweek.
            </p>
          </div>
        </div>
      )}

      {hasLineupChanged && (
        <div className="bg-amber-100 border-b border-amber-200 p-4 sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-amber-800 font-bold flex items-center">
              <span>⚠️ You have unsaved lineup changes!</span>
            </p>
            <div className="flex gap-3">
              <button 
                onClick={cancelLineupChanges}
                className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveLineup}
                disabled={isSavingLineup || isLimbo}
                className={`px-6 py-2 text-sm font-bold text-white rounded shadow transition ${
                  isLimbo ? 'bg-slate-400 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {isSavingLineup ? 'Saving...' : (isLimbo ? 'Syncing Deadline...' : 'Save Lineup')}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto py-8 px-4">

        {/* --- DYNAMIC TIMELINE STATUS BANNER WITH TIMER --- */}
        {isLockedOut ? (
            <div className="bg-slate-900 text-rose-100 p-4 rounded-xl shadow-sm mb-6 flex items-center justify-between border border-slate-800">
              <div className="flex items-center gap-4">
                <span className="flex h-4 w-4 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
                </span>
                <div>
                  <h3 className="font-bold text-white text-lg">Gameweek {activeGw} is Live!</h3>
                  <p className="text-sm text-slate-300">The deadline has passed. Any transfers you make now will apply to <strong>Gameweek {nextGw}</strong>.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-900 text-emerald-100 p-4 rounded-xl shadow-sm mb-6 flex items-center justify-between border border-emerald-800">
              <div className="flex items-center gap-4">
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                <div>
                  <h3 className="font-bold text-white text-lg">Transfer Window Open</h3>
                  <p className="text-sm text-emerald-200">You are building your squad for <strong>Gameweek {nextGw}</strong>. Make your moves before the deadline.</p>
                </div>
              </div>
              <div className="bg-emerald-950/50 px-4 py-2 rounded border border-emerald-700 text-right">
                <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 mb-0.5">Time Remaining</p>
                <p className="font-mono text-xl font-bold text-white min-w-[120px]">{countdownText}</p>
              </div>
            </div>
          )}
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">{managerInfo?.team_name || 'My Team'}</h2>
            <p className="text-slate-500 font-medium">Manager: {managerInfo?.manager_name} • Gameweek {nextGw}</p>
          </div>
          
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Bank</p>
              <p className="text-2xl font-bold text-slate-800">£{bank.toFixed(1)}m</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Squad Value</p>
              <p className="text-2xl font-bold text-slate-800">£{squadValue.toFixed(1)}m</p>
            </div>
            <div className="bg-emerald-50 px-4 py-1 rounded-lg border border-emerald-200">
              <p className="text-xs text-emerald-800 font-bold uppercase tracking-wider">Transfers Left</p>
              <p className="text-2xl font-extrabold text-emerald-600">{transfersLeft}</p>
            </div>
          </div>

          <a 
            href="/transfers"
            className="px-6 py-3 rounded-lg font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md transition-colors text-center"
          >
            Go to Transfer Market
          </a>
        </div>

        {swapError && (
          <div className="mb-6 bg-rose-100 border-l-4 border-rose-500 text-rose-700 p-4 rounded-r shadow-sm flex justify-between items-center">
            <p className="font-bold">{swapError}</p>
            <button onClick={() => setSwapError('')} className="text-rose-500 font-bold hover:text-rose-800">✕</button>
          </div>
        )}

        <div className="bg-emerald-600 rounded-2xl shadow-inner border-4 border-emerald-800 overflow-hidden relative">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 50px, #ffffff 50px, #ffffff 100px)' }}></div>
          
          <div className="relative z-10 py-8 px-4 flex flex-col gap-8 min-h-[600px] justify-between">
            {currentSquad.length === 0 ? (
               <div className="flex-1 flex flex-col items-center justify-center text-center">
                 <div className="bg-white p-8 rounded-xl shadow-lg max-w-md">
                   <h3 className="text-2xl font-bold text-slate-900 mb-2">Welcome to your new club!</h3>
                   <p className="text-slate-600 mb-6">Your pitch is completely empty. Head to the transfer market to sign your first 15 players.</p>
                   <a href="/transfers" className="inline-block px-8 py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800">Enter Market</a>
                 </div>
               </div>
            ) : (
              <>
                {[gks, defs, mids, fwds].map((row, index) => (
                  <div key={index} className="flex justify-center gap-4 sm:gap-8">
                    {row.map(player => {
                      const isSelected = selectedPlayerId === player.id;
                      const isValid = selectedPlayerId 
                        ? isSwapValid(currentSquad.find(p => p.id === selectedPlayerId), player) 
                        : true;
                      const isDimmed = selectedPlayerId && !isSelected && !isValid;
                      
                      return (
                        <div 
                          key={player.id} 
                          onClick={() => handlePlayerClick(player)}
                          className={`flex flex-col items-center cursor-pointer transition-all duration-300 ${
                            isSelected ? 'transform scale-110 -translate-y-2 opacity-100 z-10' : 
                            isDimmed ? 'opacity-30 grayscale cursor-not-allowed' : 
                            'opacity-100 hover:-translate-y-1'
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-t-lg rounded-b-sm border-2 shadow-sm mb-1 flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-amber-100 border-amber-500 ring-4 ring-amber-400/30' : 'bg-white border-slate-300'
                          }`}>
                            <span className={`text-xs font-bold ${isSelected ? 'text-amber-700' : 'text-slate-400'}`}>{player.pos}</span>
                          </div>
                          <div className={`text-white text-center rounded overflow-hidden shadow-lg w-24 border transition-colors ${
                            isSelected ? 'bg-slate-800 border-amber-500 ring-2 ring-amber-400/50' : 'bg-slate-900 border-transparent'
                          }`}>
                            <p className="text-xs font-bold py-1 px-1 truncate">{player.name}</p>
                            <p className={`text-[10px] py-0.5 border-t ${
                              isSelected ? 'bg-slate-700 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-emerald-400'
                            }`}>{player.price}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
          </div>

          {currentSquad.length > 0 && (
            <div className="bg-emerald-900 border-t-4 border-emerald-800 p-4">
              <h3 className="text-emerald-100 text-xs font-bold uppercase tracking-widest text-center mb-4">Substitutes</h3>
              <div className="flex justify-center gap-4 sm:gap-8">
                {bench.map(player => {
                  const isSelected = selectedPlayerId === player.id;
                  const isValid = selectedPlayerId 
                    ? isSwapValid(currentSquad.find(p => p.id === selectedPlayerId), player) 
                    : true;
                  const isDimmed = selectedPlayerId && !isSelected && !isValid;
                  
                  return (
                    <div 
                      key={player.id} 
                      onClick={() => handlePlayerClick(player)}
                      className={`flex flex-col items-center cursor-pointer transition-all duration-300 ${
                        isSelected ? 'transform scale-110 -translate-y-2 opacity-100 z-10' : 
                        isDimmed ? 'opacity-30 grayscale cursor-not-allowed' : 
                        'opacity-80 hover:opacity-100 hover:-translate-y-1'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-t-lg rounded-b-sm border-2 shadow-sm mb-1 flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-amber-100 border-amber-500 ring-4 ring-amber-400/30' : 'bg-slate-200 border-slate-400'
                      }`}>
                        <span className={`text-[10px] font-bold ${isSelected ? 'text-amber-700' : 'text-slate-500'}`}>{player.pos}</span>
                      </div>
                      <div className={`text-white text-center rounded overflow-hidden shadow w-20 border transition-colors ${
                        isSelected ? 'bg-slate-800 border-amber-500 ring-2 ring-amber-400/50' : 'bg-slate-800 border-transparent'
                      }`}>
                        <p className="text-[10px] font-bold py-1 px-1 truncate">{player.name}</p>
                        <p className={`text-[9px] py-0.5 border-t ${
                          isSelected ? 'bg-slate-700 border-amber-500/50 text-amber-400' : 'bg-slate-700 border-slate-600 text-slate-300'
                        }`}>{player.price}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}