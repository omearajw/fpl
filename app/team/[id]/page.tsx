'use client';

import React, { useState, useEffect, use } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import PageSkeleton from '../../../components/PageSkeleton';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function OpponentTeamViewer({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap the dynamic route parameter safely using React.use()
  const { id: targetUserId } = use(params);
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [managerInfo, setManagerInfo] = useState<any>(null);
  const [selectedGw, setSelectedGw] = useState<number>(1);
  const [availableGws, setAvailableGws] = useState<number[]>([]);
  const [starters, setStarters] = useState<any[]>([]);
  const [bench, setBench] = useState<any[]>([]);

    useEffect(() => {
    async function loadTeamData() {
      // 1. Fetch Opponent Manager Profile Details
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', targetUserId)
        .single();

      if (!profile) {
        alert("Manager not found.");
        router.push('/leagues');
        return;
      }
      setManagerInfo(profile);

        // --- LIVE FOG OF WAR LOGIC ---
      
      // 1. Get the latest finished gameweek from the scoreboard
      const { data: latestGwData } = await supabase
        .from('gameweek_scores')
        .select('gameweek')
        .order('gameweek', { ascending: false })
        .limit(1)
        .single();

      const latestFinishedGw = latestGwData?.gameweek || 0;
      const currentActiveGameweek = latestFinishedGw + 1;

      // 2. Determine if the deadline has passed by checking if rosters for the NEXT gameweek exist
      const { data: nextGwRoster } = await supabase
        .from('rosters')
        .select('id')
        .eq('gameweek', currentActiveGameweek)
        .limit(1);

      // If records for the new gameweek exist, the rollover happened and the deadline has passed!
      const hasDeadlinePassed = !!(nextGwRoster && nextGwRoster.length > 0);

      // 2. Discover which Gameweeks this user actually has a roster for
      const { data: rosterHistory } = await supabase
        .from('rosters')
        .select('gameweek')
        .eq('user_id', targetUserId)
        .order('gameweek', { ascending: false });

      let visibleGws: number[] = [];

      if (rosterHistory && rosterHistory.length > 0) {
        // Extract a clean list of unique gameweek numbers (e.g., [1, 2, 3])
        const allDraftedGws = Array.from(new Set(rosterHistory.map(r => r.gameweek)));
        
        // 3. Filter out anything that should be hidden
        visibleGws = allDraftedGws.filter(gw => {
          // Rule A: Past gameweeks are always visible
          if (gw < currentActiveGameweek) return true;
          
          // Rule B: The current gameweek is ONLY visible if the deadline has passed
          if (gw === currentActiveGameweek) return hasDeadlinePassed;
          
          // Rule C: Future gameweeks (if they somehow exist) are never visible
          return false;
        });
      }

      // 4. Update the UI state safely
      if (visibleGws.length > 0) {
        setAvailableGws(visibleGws);
        // Automatically select the highest visible gameweek
        setSelectedGw(Math.max(...visibleGws)); 
      } else {
        // Fallback if the season hasn't started and no gameweeks are visible yet
        setAvailableGws([]);
        setSelectedGw(0); 
      }
    }
    
    loadTeamData();
  }, [targetUserId, router]);

  // Triggered whenever the user toggles the historical Gameweek dropdown
  useEffect(() => {
    async function fetchRosterForGw() {
      setIsLoading(true);
      
      const { data: rosterRows, error } = await supabase
        .from('rosters')
        .select(`
          is_starter,
          purchase_price,
          players_cache (
            id,
            name,
            position,
            team
          )
        `)
        .eq('user_id', targetUserId)
        .eq('gameweek', selectedGw);

      if (rosterRows) {
        const formattedPlayers = rosterRows.map((r: any) => ({
          id: r.players_cache?.id,
          name: r.players_cache?.name || 'Unknown Player',
          position: r.players_cache?.position || 'MID',
          team: r.players_cache?.team || 'UNK',
          price: r.purchase_price,
          isStarter: r.is_starter
        }));

        setStarters(formattedPlayers.filter(p => p.isStarter));
        setBench(formattedPlayers.filter(p => !p.isStarter));
      }
      setIsLoading(false);
    }

    fetchRosterForGw();
  }, [selectedGw, targetUserId]);

  if (isLoading && !managerInfo) {
    return (
      <PageSkeleton>
        <div className="min-h-screen bg-slate-50 font-sans py-10 px-4">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div>
                <span className="inline-block h-4 w-32 rounded-full bg-slate-200" />
                <div className="mt-4 space-y-3">
                  <span className="block h-8 w-64 rounded-full bg-slate-200" />
                  <span className="block h-4 w-40 rounded-full bg-slate-200" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-block h-4 w-16 rounded-full bg-slate-200" />
                <span className="inline-block h-10 w-40 rounded-xl bg-slate-200" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-4">
                <div className="h-10 bg-slate-200 rounded-xl" />
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="p-4 flex justify-between items-center">
                      <div className="space-y-2">
                        <span className="block h-4 w-48 rounded-full bg-slate-200" />
                        <span className="block h-3 w-32 rounded-full bg-slate-200" />
                      </div>
                      <span className="inline-block h-4 w-16 rounded-full bg-slate-200" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="h-10 bg-slate-200 rounded-xl" />
                <div className="bg-slate-100 rounded-xl border border-slate-200 shadow-inner p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-14 bg-white rounded-lg border border-slate-200 shadow-sm" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageSkeleton>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Roster Time Machine</span>
            <h2 className="text-3xl font-extrabold text-slate-900 mt-1">{managerInfo?.team_name}</h2>
            <p className="text-slate-500 font-medium">Managed by {managerInfo?.manager_name}</p>
          </div>
          
          {/* History Selection Dropdown */}
          <div className="flex items-center gap-3">
            <label htmlFor="gw-select" className="text-sm font-bold text-slate-600">Viewing:</label>
            <select
              id="gw-select"
              value={selectedGw}
              onChange={(e) => setSelectedGw(Number(e.target.value))}
              className="bg-slate-100 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 py-2 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {availableGws.map(gw => (
                <option key={gw} value={gw}>Gameweek {gw}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Squad Status Container */}
        {isLoading ? (
          <div className="text-center py-20 text-slate-400 font-medium bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse">
            Loading squad selection...
          </div>
        ) : starters.length === 0 && bench.length === 0 ? (
          <div className="text-center py-20 text-slate-400 font-medium bg-white rounded-xl border border-slate-200 shadow-sm">
            No roster records found for Gameweek {selectedGw}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Starters Block (Takes up 2 Columns) */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="font-extrabold text-lg text-slate-800 flex items-center gap-2">
                Starting XI <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">{starters.length} Players</span>
              </h3>
              
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                {starters.map((player) => (
                  <div key={player.id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="font-bold text-slate-900">{player.name}</p>
                      <p className="text-xs text-slate-500 font-medium">{player.team} • <span className="uppercase text-slate-600 font-bold">{player.position}</span></p>
                    </div>
                    <span className="font-mono text-sm text-slate-600 font-semibold">£{player.price}m</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bench Block (Takes up 1 Column) */}
            <div className="space-y-4">
              <h3 className="font-extrabold text-lg text-slate-800 flex items-center gap-2">
                Substitutes <span className="text-xs font-semibold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full">{bench.length} Players</span>
              </h3>
              
              <div className="bg-slate-100 rounded-xl border border-slate-200 shadow-inner p-4 space-y-3">
                {bench.map((player) => (
                  <div key={player.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex justify-between items-center">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{player.name}</p>
                      <p className="text-[11px] text-slate-500 font-medium">{player.team} • {player.position}</p>
                    </div>
                    <span className="font-mono text-xs text-slate-500 font-medium">£{player.price}m</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}