'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import PageSkeleton from '../../components/PageSkeleton';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const POS_LIMITS: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const POS_ORDER: Record<string, number> = { GK: 1, DEF: 2, MID: 3, FWD: 4 };

export default function TransfersHub() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [dbSquad, setDbSquad] = useState<any[]>([]);
  const [transfersRemainingLimit, setTransfersRemainingLimit] = useState(8);
  
  // Timeline States
  const [activeGw, setActiveGw] = useState<number>(1);
  const [nextGw, setNextGw] = useState<number>(1);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [countdownText, setCountdownText] = useState<string>('--h --m --s'); // Default skeleton state
  const [isLimbo, setIsLimbo] = useState<boolean>(false); // NEW STATE

  const [marketPlayers, setMarketPlayers] = useState<any[]>([]);
  const [currentSquad, setCurrentSquad] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [squadSortBy, setSquadSortBy] = useState('POS'); 
  const [showRemovedOnly, setShowRemovedOnly] = useState(false);

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      const uid = session.user.id;
      setUserId(uid);

      // Fetch User Profile
      const { data: profileData } = await supabase
        .from('users')
        .select('transfers_remaining')
        .eq('id', uid)
        .single();
      
      if (profileData) setTransfersRemainingLimit(profileData.transfers_remaining);

      // --- NEW: Read from the Master Clock with Deadline ---
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

      // Filter the roster strictly by next_gameweek
      const { data: rosterData } = await supabase
        .from('rosters')
        .select(`is_starter, players_cache(id, name, position, team, current_cost)`)
        .eq('user_id', uid)
        .eq('gameweek', currentNextGw); 

      if (rosterData) {
        const formattedSquad = rosterData.map((row: any) => ({
          id: row.players_cache.id,
          name: row.players_cache.name,
          pos: row.players_cache.position,
          team: row.players_cache.team,
          price: row.players_cache.current_cost,
          isStarter: row.is_starter
        }));
        setDbSquad(formattedSquad);
        setCurrentSquad([...formattedSquad]); 
      }

      // Fetch Market Data
      const { data: marketData } = await supabase
        .from('players_cache')
        .select('*')
        .order('current_cost', { ascending: false });
      
      if (marketData) {
        setMarketPlayers(marketData.map(p => ({
          id: p.id, name: p.name, pos: p.position, team: p.team, price: p.current_cost
        })));
      }

      setIsLoading(false);
    }
    loadData();
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

  const isInitialDraft = dbSquad.length === 0;
  const squadValue = currentSquad.reduce((acc, player) => acc + player.price, 0);
  const bank = +(100.0 - squadValue).toFixed(1);
  
  const posCounts = currentSquad.reduce((acc, player) => {
    acc[player.pos] = (acc[player.pos] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const transfersPending = currentSquad.filter(
    currentPlayer => !dbSquad.some(originalPlayer => originalPlayer.id === currentPlayer.id)
  ).length;

  const removedPlayerIds = dbSquad
    .filter(originalPlayer => !currentSquad.some(currentPlayer => currentPlayer.id === originalPlayer.id))
    .map(p => p.id);

  const handleRemovePlayer = (playerId: number) => {
    setCurrentSquad(prev => prev.filter(p => p.id !== playerId));
  };

  const handleAddPlayer = (player: any) => {
    if (currentSquad.length >= 15) return;
    if ((posCounts[player.pos] || 0) >= POS_LIMITS[player.pos]) return;
    if (currentSquad.some(p => p.id === player.id)) return; 
    
    let willBeStarter = true;
    if (!isInitialDraft) {
      const startersCount = currentSquad.filter(p => p.isStarter).length;
      const startersInPos = currentSquad.filter(p => p.isStarter && p.pos === player.pos).length;
      const maxStarters: Record<string, number> = { GK: 1, DEF: 5, MID: 5, FWD: 3 };
      
      if (startersCount >= 11 || startersInPos >= maxStarters[player.pos]) {
        willBeStarter = false;
      }
    }

    setCurrentSquad(prev => [...prev, { ...player, isStarter: willBeStarter }]);
  };

  const handleConfirmTransfers = async () => {
    if (!userId || currentSquad.length !== 15) return;
    setIsSaving(true);

    try {
      let finalSquad = [...currentSquad];

      if (isInitialDraft) {
        const gks = finalSquad.filter(p => p.pos === 'GK').sort((a, b) => b.price - a.price);
        const defs = finalSquad.filter(p => p.pos === 'DEF').sort((a, b) => b.price - a.price);
        const mids = finalSquad.filter(p => p.pos === 'MID').sort((a, b) => b.price - a.price);
        const fwds = finalSquad.filter(p => p.pos === 'FWD').sort((a, b) => b.price - a.price);

        const starting11Ids = [
          ...gks.slice(0, 1),
          ...defs.slice(0, 4),
          ...mids.slice(0, 4),
          ...fwds.slice(0, 2)
        ].map(p => p.id);

        finalSquad = finalSquad.map(p => ({
          ...p,
          isStarter: starting11Ids.includes(p.id)
        }));
      }

      const addedPlayers = finalSquad.filter(p => !dbSquad.some(db => db.id === p.id));

      if (!isInitialDraft && transfersPending > 0) {
        const newTotal = transfersRemainingLimit - transfersPending;
        await supabase
          .from('users')
          .update({ transfers_remaining: newTotal })
          .eq('id', userId);
      }

      if (removedPlayerIds.length > 0) {
        await supabase
          .from('rosters')
          .delete()
          .in('player_id', removedPlayerIds)
          .eq('user_id', userId)
          .eq('gameweek', nextGw);
      }

      if (addedPlayers.length > 0) {
        const insertPayload = addedPlayers.map(p => ({
          user_id: userId,
          player_id: p.id,
          gameweek: nextGw,
          purchase_price: p.price,
          is_starter: p.isStarter 
        }));

        await supabase
          .from('rosters')
          .insert(insertPayload);
      }

      await supabase
        .from('users')
        .update({ remaining_budget: bank })
        .eq('id', userId);

      router.push('/my-team');

    } catch (error) {
      console.error("Failed to save transfers:", error);
      alert("There was an error saving your transfers. Please try again.");
      setIsSaving(false);
    }
  };

  const sortedSquad = [...currentSquad].sort((a, b) => {
    if (squadSortBy === 'POS') {
      if (POS_ORDER[a.pos] !== POS_ORDER[b.pos]) return POS_ORDER[a.pos] - POS_ORDER[b.pos];
      return b.price - a.price; 
    }
    if (squadSortBy === 'PRICE_DESC') return b.price - a.price;
    if (squadSortBy === 'PRICE_ASC') return a.price - b.price;
    if (squadSortBy === 'ALPHA') return a.name.localeCompare(b.name);
    return 0;
  });

  const filteredMarket = marketPlayers.filter(player => {
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPos = posFilter === 'ALL' || player.pos === posFilter;
    const notInSquad = !currentSquad.some(p => p.id === player.id); 
    const matchesRemovedFilter = showRemovedOnly ? removedPlayerIds.includes(player.id) : true;
    
    return matchesSearch && matchesPos && notInSquad && matchesRemovedFilter;
  });

  const isSquadFull = currentSquad.length === 15;
  const isOverBudget = bank < 0;
  const hasTooManyTransfers = isInitialDraft ? false : transfersPending > transfersRemainingLimit;
  const canConfirm = isSquadFull && !isOverBudget && !hasTooManyTransfers && (isInitialDraft || transfersPending > 0);

  if (isLoading) {
    return (
      <PageSkeleton>
        <div className="min-h-screen bg-slate-50 font-sans pb-12">
          <main className="max-w-6xl mx-auto py-8 px-4 space-y-8">
            <div className="h-16 bg-slate-200 rounded-xl mb-6" />
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="space-y-3">
                <div className="h-8 w-72 bg-slate-200 rounded-full" />
                <div className="h-4 w-80 bg-slate-200 rounded-full" />
              </div>
              <div className="space-y-3">
                <div className="h-12 w-48 bg-slate-200 rounded-full" />
                <div className="h-12 w-48 bg-slate-200 rounded-full" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="h-12 bg-slate-200 rounded-3xl" />
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="h-28 bg-slate-200 rounded-3xl" />
                ))}
              </div>

              <div className="space-y-6">
                <div className="h-12 bg-slate-200 rounded-3xl" />
                {Array.from({ length: 4 }).map((_, idx) => (
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
    <div className="min-h-screen bg-slate-50 font-sans pb-12">

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

      <main className="max-w-6xl mx-auto py-8 px-4">
        
        {/* --- DYNAMIC TIMELINE STATUS BANNER WITH TIMER --- */}
        {!isInitialDraft && (
          isLockedOut ? (
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
          )
        )}
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">
              {isInitialDraft ? 'Initial Draft Selection' : `Transfers • GW ${nextGw}`}
            </h2>
            <p className="text-slate-500 font-medium">
              {isInitialDraft ? 'Build your starting 15 for free.' : 'Build your squad carefully.'}
            </p>
          </div>
          
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Bank</p>
              <p className={`text-2xl font-bold ${isOverBudget ? 'text-rose-600' : 'text-slate-800'}`}>£{bank}m</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Squad Value</p>
              <p className="text-2xl font-bold text-slate-800">£{squadValue.toFixed(1)}m</p>
            </div>
            
            {!isInitialDraft && (
              <div className="bg-emerald-50 px-4 py-1 rounded-lg border border-emerald-200">
                <p className="text-xs text-emerald-800 font-bold uppercase tracking-wider">Transfers Left</p>
                <p className="text-2xl font-extrabold text-emerald-600">{transfersRemainingLimit - transfersPending}</p>
              </div>
            )}
          </div>

          <a 
            href="/my-team"
            className="px-6 py-3 rounded-lg font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 transition-colors"
          >
            Cancel & Return
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
              <h3 className="font-bold">Working Draft ({currentSquad.length}/15)</h3>
              
              <select 
                value={squadSortBy}
                onChange={(e) => setSquadSortBy(e.target.value)}
                className="bg-slate-700 text-white text-xs px-2 py-1.5 rounded outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-600"
              >
                <option value="POS">Sort: Position</option>
                <option value="PRICE_DESC">Sort: Price (High-Low)</option>
                <option value="PRICE_ASC">Sort: Price (Low-High)</option>
                <option value="ALPHA">Sort: A-Z</option>
              </select>
            </div>
            
            <div className="h-[600px] overflow-y-auto bg-slate-50">
              {sortedSquad.map((player, index) => {
                const isNewTransfer = !dbSquad.some(p => p.id === player.id);
                const showPosHeader = squadSortBy === 'POS' && (index === 0 || sortedSquad[index - 1].pos !== player.pos);

                return (
                  <React.Fragment key={player.id}>
                    {showPosHeader && (
                      <div className="bg-slate-200 text-slate-600 text-[10px] font-extrabold uppercase tracking-widest px-4 py-1.5 border-y border-slate-300 flex justify-between">
                        <span>{player.pos}</span>
                        <span>{posCounts[player.pos] || 0} / {POS_LIMITS[player.pos]}</span>
                      </div>
                    )}
                    
                    <div className={`flex justify-between items-center p-4 bg-white border-b border-slate-100 transition-colors ${
                        isNewTransfer ? 'border-l-4 border-emerald-500 bg-emerald-50/50' : 'border-l-4 border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 flex items-center gap-2">
                          {player.name}
                          {isNewTransfer && !isInitialDraft && (
                            <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">New</span>
                          )}
                        </span>
                        <span className="text-xs text-slate-500">{player.team} • {player.pos}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-slate-700">£{player.price}</span>
                        <button 
                          onClick={() => handleRemovePlayer(player.id)}
                          className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 font-bold hover:bg-rose-600 hover:text-white transition"
                        >✕</button>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-800 text-white p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold">Player Market</h3>
                
                {removedPlayerIds.length > 0 && !isInitialDraft && (
                  <button
                    onClick={() => setShowRemovedOnly(!showRemovedOnly)}
                    className={`text-xs px-2 py-1 rounded font-bold transition-colors ${
                      showRemovedOnly ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {showRemovedOnly ? 'Show All Players' : `Show Sold (${removedPlayerIds.length})`}
                  </button>
                )}
              </div>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Search players..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded bg-slate-700 border-none text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                  disabled={showRemovedOnly}
                />
                <select 
                  value={posFilter}
                  onChange={(e) => setPosFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded bg-slate-700 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={showRemovedOnly}
                >
                  <option value="ALL">ALL</option>
                  <option value="GK">GK</option>
                  <option value="DEF">DEF</option>
                  <option value="MID">MID</option>
                  <option value="FWD">FWD</option>
                </select>
              </div>
            </div>
            
            <div className="divide-y divide-slate-100 h-[550px] overflow-y-auto">
              {filteredMarket.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-medium">
                  {showRemovedOnly ? "You haven't removed any players yet." : "No players found."}
                </div>
              ) : (
                filteredMarket.map((player) => {
                  const isPosFull = (posCounts[player.pos] || 0) >= POS_LIMITS[player.pos];
                  const isRecentlySold = removedPlayerIds.includes(player.id);
                  
                  return (
                    <div key={player.id} className="flex justify-between items-center p-4 hover:bg-slate-50">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 flex items-center gap-2">
                          {player.name}
                          {isRecentlySold && !isInitialDraft && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">Sold</span>
                          )}
                        </span>
                        <span className="text-xs text-slate-500">{player.team} • {player.pos}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-slate-700">£{player.price}</span>
                        <button 
                          onClick={() => handleAddPlayer(player)}
                          disabled={isSquadFull || isPosFull}
                          className={`w-8 h-8 rounded-full font-bold transition ${
                            isSquadFull || isPosFull 
                              ? 'bg-slate-100 text-slate-300 cursor-not-allowed' 
                              : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                          }`}
                        >＋</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          <div className="lg:col-span-2 bg-white p-4 border border-slate-200 rounded-xl shadow-sm flex justify-between items-center mt-4">
              <div>
                {!isInitialDraft && (
                  <p className="text-sm font-bold text-slate-600">
                    Transfers pending: <span className={hasTooManyTransfers ? 'text-rose-600' : 'text-amber-600'}>{transfersPending}</span>
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {isOverBudget && <span className="text-rose-600 font-bold">Over Budget! </span>}
                  {!isSquadFull && <span className="text-amber-600 font-bold">Pick 15 Players to Confirm. </span>}
                </p>
              </div>
              <button 
              onClick={handleConfirmTransfers}
              disabled={!canConfirm || isSaving || isLimbo}
              className={`px-8 py-2.5 font-bold rounded-lg transition ${
                canConfirm && !isLimbo
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md' 
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isSaving ? 'Saving Team...' : (isLimbo ? 'Syncing Deadline...' : (isInitialDraft ? 'Save Initial Draft' : 'Confirm Transfers'))}
            </button>
          </div>

        </div>

      </main>
    </div>
  );
}