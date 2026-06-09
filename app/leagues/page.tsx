'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function LeagueTables() {
  const [leagues, setLeagues] = useState<any[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // This will store our grouped data: { [league_id]: [array of teams] }
  const [leagueData, setLeagueData] = useState<Record<number, any[]>>({});

  useEffect(() => {
    async function fetchLeaguesAndStandings() {
      // 1. Fetch the dynamic league configuration
      const { data: leaguesData, error: leaguesError } = await supabase
        .from('leagues')
        .select('*')
        .order('tier_level', { ascending: true });

      if (leaguesError) {
        console.error("Error fetching leagues:", leaguesError);
        setIsLoading(false);
        return;
      }

      if (leaguesData && leaguesData.length > 0) {
        setLeagues(leaguesData);
        setActiveLeagueId(leaguesData[0].id); // Default to the highest tier league
      }

      // --- NEW LOGIC: FIND THE LATEST GAMEWEEK ---
      // We ask Supabase for the highest gameweek number currently in the table
      const { data: latestGwData } = await supabase
        .from('gameweek_scores')
        .select('gameweek')
        .order('gameweek', { ascending: false })
        .limit(1)
        .single();

      // If the season has started, use that gameweek. If the table is totally empty, default to 1.
      const currentGameweek = latestGwData?.gameweek || 1;

      // Fetch standings and join with user data, filtered by the current gameweek
      const { data: standingsData, error: standingsError } = await supabase
        .from('gameweek_scores')
        .select(`
          user_id,
          points_earned,
          running_total,
          users (
            team_name,
            manager_name,
            transfers_remaining,
            league_id
          )
        `)
        .eq('gameweek', currentGameweek)
        .order('running_total', { ascending: false });

      if (standingsError) {
        console.error("Error fetching standings:", standingsError);
      } else if (standingsData) {
        
        // Group teams dynamically by their actual league_id
        const groupedData: Record<number, any[]> = {};
        
        // Initialize empty arrays for every league that exists
        leaguesData?.forEach(lg => {
          groupedData[lg.id] = [];
        });

        standingsData.forEach((row: any) => {
          const l_id = row.users?.league_id;
          
          if (l_id && groupedData[l_id]) {
            groupedData[l_id].push({
              teamName: row.users?.team_name || 'Unknown Team',
              manager: row.users?.manager_name || 'Unknown',
              gwPoints: row.points_earned || 0,
              totalPoints: row.running_total || row.points_earned || 0,
              transfers: row.users?.transfers_remaining || 0,
            });
          }
        });

        // Assign numerical ranks with a built-in tie-breaker!
        Object.keys(groupedData).forEach((key) => {
          const id = Number(key);
          
          // 1. Sort the array mathematically
          groupedData[id].sort((a, b) => {
            // If points are different, highest points wins
            if (b.totalPoints !== a.totalPoints) {
              return b.totalPoints - a.totalPoints;
            }
            // TIE-BREAKER: If points are tied, highest transfers remaining wins!
            return b.transfers - a.transfers; 
          });

          // 2. Assign the rank based on that perfect order
          groupedData[id] = groupedData[id].map((team, index) => ({
            ...team,
            rank: index + 1
          }));
        });

        setLeagueData(groupedData);
      }
      setIsLoading(false);
    }

    fetchLeaguesAndStandings();
  }, []);

  // --- UI Helpers ---
  const activeLeagueConfig = leagues.find(lg => lg.id === activeLeagueId);
  const currentTeams = activeLeagueId ? (leagueData[activeLeagueId] || []) : [];
  const totalTeams = currentTeams.length;

  const getRowStatus = (index: number) => {
    if (!activeLeagueConfig) return { style: 'bg-white', indicator: '-', indicatorColor: 'text-slate-300' };

    if (index < activeLeagueConfig.promotion_slots) {
      return { 
        style: 'bg-emerald-50 border-l-4 border-emerald-500 hover:bg-emerald-100', 
        indicator: '▲', 
        indicatorColor: 'text-emerald-600' 
      };
    }
    // Only apply relegation styles if there are actually teams in the league to relegate
    if (index >= totalTeams - activeLeagueConfig.relegation_slots && totalTeams > 0 && activeLeagueConfig.relegation_slots > 0) {
      return { 
        style: 'bg-rose-50 border-l-4 border-rose-500 hover:bg-rose-100', 
        indicator: '▼', 
        indicatorColor: 'text-rose-600' 
      };
    }
    return { 
      style: 'bg-white border-l-4 border-transparent hover:bg-slate-50', 
      indicator: '-', 
      indicatorColor: 'text-slate-300' 
    };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 animate-pulse">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="h-12 w-64 bg-slate-200 rounded"></div>
          <div className="flex space-x-2 border-b border-slate-200 mb-6">
            <div className="h-10 w-32 bg-slate-200 rounded-t-lg"></div>
            <div className="h-10 w-32 bg-slate-200 rounded-t-lg"></div>
          </div>
          <div className="h-96 bg-slate-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <main className="max-w-5xl mx-auto py-10 px-4">
        
        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-extrabold text-slate-900">League Standings</h2>
          <p className="text-slate-500 mt-2">End of season promotion and relegation thresholds are marked below.</p>
        </div>

        {/* Dynamic Tier Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-200">
          {leagues.map((league) => (
            <button
              key={league.id}
              onClick={() => setActiveLeagueId(league.id)}
              className={`px-6 py-3 text-sm font-bold rounded-t-lg transition-colors duration-200 ${
                activeLeagueId === league.id
                  ? 'bg-white text-emerald-600 border-t border-l border-r border-slate-200 shadow-[0_4px_0_0_white] relative translate-y-[1px]'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {league.name}
            </button>
          ))}
        </div>

        {/* The Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold w-16 text-center">Rank</th>
                <th className="p-4 font-semibold">Team & Manager</th>
                <th className="p-4 font-semibold text-center w-24">GW Pts</th>
                <th className="p-4 font-semibold text-center w-24">Total Pts</th>
                <th className="p-4 font-semibold text-center w-32">Transfers Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {currentTeams.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 font-medium">
                    No teams populated for this league yet.
                  </td>
                </tr>
              ) : (
                currentTeams.map((team, index) => {
                  const status = getRowStatus(index);
                  
                  return (
                    <tr key={team.teamName} className={`transition-colors ${status.style}`}>
                      {/* Rank & Indicator */}
                      <td className="p-4 text-center font-mono font-bold text-slate-700 flex items-center justify-center gap-2">
                        <span className={`text-xs ${status.indicatorColor}`}>{status.indicator}</span>
                        {team.rank}
                      </td>
                      
                      {/* Team Info */}
                      <td className="p-4">
                        <div className="flex flex-col">
                          <a href="#" className="font-bold text-slate-900 hover:text-emerald-600 transition">
                            {team.teamName}
                          </a>
                          <span className="text-slate-500 text-xs mt-0.5">{team.manager}</span>
                        </div>
                      </td>
                      
                      {/* Stats */}
                      <td className="p-4 text-center font-medium text-slate-600">{team.gwPoints}</td>
                      <td className="p-4 text-center font-extrabold text-slate-900 text-base">{team.totalPoints}</td>
                      
                      {/* Transfers */}
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          team.transfers === 0 
                            ? 'bg-rose-100 text-rose-700' 
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {team.transfers}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </main>
    </div>
  );
}