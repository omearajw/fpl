'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function FixturesPage() {
  const [selectedGw, setSelectedGw] = useState<number>(1);
  const [latestFinishedGw, setLatestFinishedGw] = useState<number>(1);
  const [matchups, setMatchups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchFixtures() {
      setIsLoading(true);

      // 1. Find the current active gameweek to set the default view on initial load
      if (selectedGw === 1 && matchups.length === 0) {
        const { data: latestGwData } = await supabase
          .from('gameweek_scores')
          .select('gameweek')
          .order('gameweek', { ascending: false })
          .limit(1)
          .single();
        
        const activeGw = latestGwData?.gameweek || 1;
        setSelectedGw(activeGw);
        setLatestFinishedGw(activeGw);
      }

      // 2. Fetch the schedule for the selected gameweek, joining the users table to get team names
      const { data: fixturesData } = await supabase
        .from('fixtures')
        .select(`
          id,
          gameweek,
          home_user_id,
          away_user_id,
          home:users!fixtures_home_user_id_fkey(id, team_name, manager_name),
          away:users!fixtures_away_user_id_fkey(id, team_name, manager_name)
        `)
        .eq('gameweek', selectedGw);

      // 3. Fetch the live points for this specific gameweek
      const { data: scoresData } = await supabase
        .from('gameweek_scores')
        .select('user_id, points_earned')
        .eq('gameweek', selectedGw);

      if (fixturesData) {
        // Map the points to the fixtures for a clean UI render
        const scoreMap = new Map(scoresData?.map(s => [s.user_id, s.points_earned]) || []);

        const formattedMatchups = fixturesData.map(f => ({
          id: f.id,
          homeTeam: f.home,
          awayTeam: f.away,
          homeScore: scoreMap.get(f.home_user_id) || 0,
          awayScore: f.away_user_id ? (scoreMap.get(f.away_user_id) || 0) : null, // Null handles BYE weeks
        }));

        setMatchups(formattedMatchups);
      }
      
      setIsLoading(false);
    }

    fetchFixtures();
  }, [selectedGw]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header & Gameweek Selector */}
        <div className="text-center space-y-6">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900">Fixtures</h1>
            <p className="text-slate-500 font-medium mt-1">Head-to-Head Schedule</p>
          </div>

          <div className="flex items-center justify-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-slate-200 inline-flex">
            <button 
              onClick={() => setSelectedGw(Math.max(1, selectedGw - 1))}
              disabled={selectedGw === 1}
              className="p-2 rounded-xl hover:bg-slate-100 disabled:opacity-30 transition"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
            </button>
            
            <span className="font-bold text-lg w-32 text-center text-slate-800">
              Gameweek {selectedGw}
            </span>

            <button 
              onClick={() => setSelectedGw(Math.min(38, selectedGw + 1))}
              disabled={selectedGw === 38}
              className="p-2 rounded-xl hover:bg-slate-100 disabled:opacity-30 transition"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
          </div>
        </div>

        {/* Fixtures List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 bg-slate-200 animate-pulse rounded-xl"></div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {matchups.map((match) => (
              <div key={match.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex items-stretch">
                
                {/* Home Team (Left) */}
                <div className="flex-1 p-4 flex flex-col justify-center items-end text-right">
                  {/* Notice the Link tag wrapping the team name for the snooping feature! */}
                  <Link href={`/team/${match.homeTeam.id}`} className="font-bold text-slate-900 hover:text-emerald-600 transition">
                    {match.homeTeam.team_name}
                  </Link>
                  <span className="text-xs text-slate-500">{match.homeTeam.manager_name}</span>
                </div>

                {/* Score / Center Badge */}
                <div className="w-24 bg-slate-50 border-x border-slate-100 flex flex-col justify-center items-center py-2">
                  {selectedGw > latestFinishedGw ? (
                    <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">v</span>
                  ) : (
                    <div className="flex items-center gap-2 font-mono font-extrabold text-xl text-slate-800">
                      <span>{match.homeScore}</span>
                      <span className="text-slate-300 text-sm">-</span>
                      <span>{match.awayScore !== null ? match.awayScore : 'AVG'}</span>
                    </div>
                  )}
                </div>

                {/* Away Team (Right) */}
                <div className="flex-1 p-4 flex flex-col justify-center items-start text-left">
                  {match.awayTeam ? (
                    <>
                      <Link href={`/team/${match.awayTeam.id}`} className="font-bold text-slate-900 hover:text-emerald-600 transition">
                        {match.awayTeam.team_name}
                      </Link>
                      <span className="text-xs text-slate-500">{match.awayTeam.manager_name}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-slate-400">BYE WEEK</span>
                      <span className="text-xs text-slate-400">League Average Score</span>
                    </>
                  )}
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}