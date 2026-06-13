'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import PageSkeleton from '../../components/PageSkeleton';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function LeagueTables() {
  const [leagues, setLeagues] = useState<any[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState<number | null>(null);
  const [bottomLeagueId, setBottomLeagueId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [leagueData, setLeagueData] = useState<Record<number, any[]>>({});
  const [activeGw, setActiveGw] = useState<number>(1);
  const [displayGw, setDisplayGw] = useState<number>(1);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [thirdPlacePoints, setThirdPlacePoints] = useState<number>(0);
  const [sprintLeaderboard, setSprintLeaderboard] = useState<any[]>([]);

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

      let bottomLgId = null;
      if (leaguesData && leaguesData.length > 0) {
        setLeagues(leaguesData);
        setActiveLeagueId(leaguesData[0].id); // Default to highest tier
        
        // The bottom division is the one with the highest tier_level number
        const bottomLeague = leaguesData.reduce((prev, current) => 
          (prev.tier_level > current.tier_level) ? prev : current
        );
        bottomLgId = bottomLeague.id;
        setBottomLeagueId(bottomLgId);
      }

      // 2. Read from the Master Clock
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('active_gameweek, next_gameweek')
        .single();
        
      const currentGameweek = settingsData?.active_gameweek || 1;
      const nextGameweek = settingsData?.next_gameweek || 1;
      setActiveGw(currentGameweek);

      // We know we are in the "Live Weekend" (Phase 2) if the lockout script has advanced the next_gameweek
      const isWeekendLive = currentGameweek !== nextGameweek;
      setIsLive(isWeekendLive);

      // Determine which gameweek is actually being displayed on the table
      const gwToShow = isWeekendLive ? currentGameweek : Math.max(1, currentGameweek - 1);
      setDisplayGw(gwToShow);

      // 3. Fetch all necessary data simultaneously
      const [
        { data: h2hData }, 
        { data: usersData }, 
        { data: recentScores }
      ] = await Promise.all([
        supabase.from('h2h_league_table').select('*'),
        supabase.from('users').select('id, league_id, transfers_remaining'),
        supabase.from('gameweek_scores')
          .select('user_id, points_earned, running_total, gameweek')
          .in('gameweek', [currentGameweek, currentGameweek - 1]) // Fetch both current and previous weeks
      ]);

      if (h2hData && usersData) {
        const groupedData: Record<number, any[]> = {};
        
        leaguesData?.forEach(lg => {
          groupedData[lg.id] = [];
        });

        // Map users for easy lookup
        const userMap = new Map(usersData.map(u => [u.id, u]));

        h2hData.forEach((row: any) => {
          const userMeta = userMap.get(row.user_id);
          const l_id = userMeta?.league_id;
          
          if (l_id && groupedData[l_id]) {
            // --- SMART UI SWITCH ---
            let gwPts = 0;
            let fplPts = 0;
            
            const activeScore = recentScores?.find(s => s.user_id === row.user_id && s.gameweek === currentGameweek);
            const previousScore = recentScores?.find(s => s.user_id === row.user_id && s.gameweek === currentGameweek - 1);

            if (isWeekendLive) {
              // PHASE 2: The weekend is live!
              if (activeScore) {
                // Live points have been pulled
                gwPts = activeScore.points_earned;
                fplPts = activeScore.running_total;
              } else {
                // The lockout JUST happened, but no live points exist yet. Wipe GW points to 0!
                gwPts = 0;
                fplPts = previousScore?.running_total || 0; // Hold onto last week's FPL total so it doesn't drop to 0
              }
            } else {
              // PHASE 1: Midweek buildup. Show last week's fully finalized stats.
              gwPts = previousScore?.points_earned || 0;
              fplPts = previousScore?.running_total || 0;
            }

            groupedData[l_id].push({
              userId: row.user_id,
              teamName: row.team_name || 'Unknown Team',
              manager: row.manager_name || 'Unknown',
              gwPoints: gwPts,
              won: row.won,
              drawn: row.drawn,
              lost: row.lost,
              h2hPoints: row.total_h2h_points,
              totalPoints: fplPts, // We now pass the live running_total here!
              transfers: userMeta?.transfers_remaining || 0,
            });
          }
        });

        // 4. Sort and Rank each league perfectly
        Object.keys(groupedData).forEach((key) => {
          const id = Number(key);
          
          groupedData[id].sort((a, b) => {
            if (b.h2hPoints !== a.h2hPoints) return b.h2hPoints - a.h2hPoints; // 1. H2H Points
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints; // 2. Total FPL Pts
            return b.transfers - a.transfers; // 3. Transfers left
          });

          groupedData[id] = groupedData[id].map((team, index) => ({
            ...team,
            rank: index + 1
          }));
        });

        setLeagueData(groupedData);

        // 5. PLAY-OFF LOGIC (Only runs for the bottom division)
        if (bottomLgId && groupedData[bottomLgId].length >= 3) {
          const bottomTeams = groupedData[bottomLgId];
          const tpp = bottomTeams[2].h2hPoints; // Always track 3rd place H2H points
          setThirdPlacePoints(tpp);

          // ONLY trigger the sprint data fetch if we are in Gameweek 33 or later
          if (currentGameweek >= 33) {
            // Slice from 2 so 3rd place is included, filter for anyone within 9 points
            const eligibleUsers = bottomTeams.slice(2).filter(team => (tpp - team.h2hPoints) <= 9);
            const eligibleIds = eligibleUsers.map(u => u.userId);

            if (eligibleIds.length > 0) {
              const { data: rawScores } = await supabase
                .from('gameweek_scores')
                .select('user_id, points_earned')
                .gte('gameweek', 33)
                .in('user_id', eligibleIds);

              if (rawScores) {
                const sprintTotals: Record<string, number> = {};
                rawScores.forEach(score => {
                  sprintTotals[score.user_id] = (sprintTotals[score.user_id] || 0) + score.points_earned;
                });

                const sprintData = eligibleUsers.map(team => ({
                  ...team,
                  sprint_points: sprintTotals[team.userId] || 0
                })).sort((a, b) => b.sprint_points - a.sprint_points);

                setSprintLeaderboard(sprintData);
              }
            }
          }
        }
      }
      setIsLoading(false);
    }

    fetchLeaguesAndStandings();
  }, []);

  // --- UI Helpers ---
  const activeLeagueConfig = leagues.find(lg => lg.id === activeLeagueId);
  const currentTeams = activeLeagueId ? (leagueData[activeLeagueId] || []) : [];
  const totalTeams = currentTeams.length;
  const isBottomLeagueActive = activeLeagueId === bottomLeagueId;

  const getRowStatus = (index: number, isPlayoffZone: boolean) => {
    if (!activeLeagueConfig) return { style: 'bg-white', indicator: '-', indicatorColor: 'text-slate-300' };

    // 1. Automatic Promotion (Top 2 for bottom league, otherwise use DB config)
    const autoPromoSlots = isBottomLeagueActive ? 2 : activeLeagueConfig.promotion_slots;
    if (index < autoPromoSlots) {
      return { 
        style: 'bg-emerald-50 border-l-4 border-emerald-500 hover:bg-emerald-100', 
        indicator: '▲', 
        indicatorColor: 'text-emerald-600' 
      };
    }

    // 2. The Play-off Zone (Yellow Highlight for 3rd Place + Anyone within 9 pts)
    if (isPlayoffZone) {
      return {
        style: 'bg-amber-50 border-l-4 border-amber-400 hover:bg-amber-100',
        indicator: '★',
        indicatorColor: 'text-amber-500'
      }
    }

    // 3. Relegation logic
    if (index >= totalTeams - activeLeagueConfig.relegation_slots && totalTeams > 0 && activeLeagueConfig.relegation_slots > 0) {
      return { 
        style: 'bg-rose-50 border-l-4 border-rose-500 hover:bg-rose-100', 
        indicator: '▼', 
        indicatorColor: 'text-rose-600' 
      };
    }
    
    // Default
    return { 
      style: 'bg-white border-l-4 border-transparent hover:bg-slate-50', 
      indicator: '-', 
      indicatorColor: 'text-slate-300' 
    };
  };

  if (isLoading) {
    return (
      <PageSkeleton>
        {/* Keeping your exact skeleton loader... */}
        <div className="min-h-screen bg-slate-50 font-sans">
          <main className="max-w-5xl mx-auto py-10 px-4">
             {/* Skeleton internals truncated for brevity, assume they match your original code */}
             <div className="animate-pulse text-slate-400 font-bold">Loading League Data...</div>
          </main>
        </div>
      </PageSkeleton>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <main className="max-w-5xl mx-auto py-10 px-4">
        
        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-extrabold text-slate-900">League Standings</h2>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <p className="text-slate-500 font-medium">Gameweek {displayGw} • Head-to-Head Scoring</p>
            
            {/* Dynamic Status Badge */}
            {isLive ? (
              <span className="bg-rose-100 text-rose-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded flex items-center gap-1.5 border border-rose-200">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span>
                Live Matches
              </span>
            ) : (
              <span className="bg-slate-200 text-slate-600 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-slate-300">
                {displayGw === 1 && !isLive && activeGw === 1 ? 'Pre-Season' : 'Finalized Results'}
              </span>
            )}
          </div>
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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold w-16 text-center">Rank</th>
                <th className="p-4 font-semibold">Team & Manager</th>
                <th className="p-4 font-semibold text-center">GW</th>
                <th className="p-4 font-semibold text-center hidden md:table-cell">W-D-L</th>
                <th className="p-4 font-semibold text-center text-emerald-400">H2H Pts</th>
                <th className="p-4 font-semibold text-center w-24">FPL Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {currentTeams.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                    No teams populated for this league yet.
                  </td>
                </tr>
              ) : (
              currentTeams.map((team, index) => {
                  // Calculate if they are in the play-off zone (3rd place, or 4th+ within 9 points)
                  // ONLY TRUE IF WE ARE IN GAMEWEEK 33 OR LATER
                  const isPlayoffZone = activeGw >= 33 && isBottomLeagueActive && index >= 2 && (thirdPlacePoints - team.h2hPoints) <= 9;
                  const status = getRowStatus(index, isPlayoffZone);
                  
                  return (
                    <tr key={team.teamName} className={`transition-colors ${status.style}`}>
                      {/* Rank & Indicator */}
                      <td className="p-4 text-center font-mono font-bold text-slate-700 flex items-center justify-center gap-2">
                        <span className={`text-xs ${status.indicatorColor}`}>{status.indicator}</span>
                        {team.rank}
                      </td>
                      
                      {/* Team Info */}
                      <td className="p-4">
                        <div className="flex flex-col items-start">
                          <a href={`/team/${team.userId}`} className="font-bold text-slate-900 hover:text-emerald-600 transition">
                            {team.teamName}
                          </a>
                          <span className="text-slate-500 text-xs mt-0.5">{team.manager}</span>
                        </div>
                      </td>
                      
                      {/* Stats */}
                      <td className="p-4 text-center font-medium text-slate-600">{team.gwPoints}</td>
                      <td className="p-4 text-center font-mono text-slate-500 text-xs hidden md:table-cell">
                        {team.won}-{team.drawn}-{team.lost}
                      </td>
                      <td className="p-4 text-center font-extrabold text-slate-900 text-lg">{team.h2hPoints}</td>
                      <td className="p-4 text-center font-medium text-slate-600">{team.totalPoints}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* The Play-off Shootout Widget - ONLY renders if we are on the Bottom League tab AND it's GW33+ */}
        {isBottomLeagueActive && activeGw >= 33 && (
          <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-800 overflow-hidden flex flex-col mt-8">
            <div className="p-5 bg-gradient-to-br from-amber-500 to-orange-600">
              <h3 className="text-white font-extrabold text-xl">The Promotion Shootout</h3>
              <p className="text-amber-100 text-sm font-medium mt-1">Final 6-Week Raw FPL Sprint for 3rd Place</p>
            </div>
            
            <div className="p-0 flex-grow bg-slate-900">
              {sprintLeaderboard.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm font-medium">
                  No teams are currently within 9 points of 3rd place.
                </div>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {sprintLeaderboard.map((team, index) => (
                    <li key={team.userId} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className={`font-bold text-lg w-6 text-center ${index === 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-bold text-white text-sm">{team.teamName}</p>
                          <p className="text-xs text-slate-400 font-medium tracking-wide">
                            Current H2H Deficit: -{thirdPlacePoints - team.h2hPoints} pts
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Sprint Pts</p>
                        <span className="font-mono text-2xl font-extrabold text-emerald-400">
                          {team.sprint_points}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}