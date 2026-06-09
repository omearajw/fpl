'use client';

import React, { useState } from 'react';

// --- Mock Data & Configuration ---
// In the real app, this comes from the Supabase database.
const leagueConfig = {
  1: { id: 1, name: "Tier 1: Elite", promoSlots: 0, relSlots: 3 },
  2: { id: 2, name: "Tier 2: Championship", promoSlots: 3, relSlots: 3 },
  3: { id: 3, name: "Tier 3: Conference", promoSlots: 3, relSlots: 0 },
};

const mockTeams = {
  1: [
    { rank: 1, teamName: "The Tactician", manager: "John D.", gwPoints: 62, totalPoints: 145, transfers: 7 },
    { rank: 2, teamName: "Retro Rovers", manager: "Dad", gwPoints: 55, totalPoints: 128, transfers: 8 },
    { rank: 3, teamName: "Saka Potatoes", manager: "Sarah W.", gwPoints: 48, totalPoints: 125, transfers: 5 },
    { rank: 4, teamName: "Expected Toulouse", manager: "Mike T.", gwPoints: 40, totalPoints: 120, transfers: 8 },
    { rank: 5, teamName: "Klopp's Kids", manager: "Emma B.", gwPoints: 35, totalPoints: 110, transfers: 4 },
    { rank: 6, teamName: "Relegation Threat", manager: "Dave C.", gwPoints: 29, totalPoints: 95, transfers: 1 },
    { rank: 7, teamName: "Basement Boys", manager: "Chris P.", gwPoints: 22, totalPoints: 88, transfers: 0 },
    { rank: 8, teamName: "Pointless FC", manager: "Tom H.", gwPoints: 15, totalPoints: 75, transfers: 8 },
  ],
  2: [
    { rank: 1, teamName: "Championship Kings", manager: "Alex R.", gwPoints: 70, totalPoints: 140, transfers: 8 },
    { rank: 2, teamName: "Promotion Pushers", manager: "Sam G.", gwPoints: 65, totalPoints: 135, transfers: 6 },
    { rank: 3, teamName: "Midfield Maestros", manager: "Liam K.", gwPoints: 60, totalPoints: 130, transfers: 7 },
    { rank: 4, teamName: "Stuck in the Middle", manager: "Nina V.", gwPoints: 50, totalPoints: 115, transfers: 8 },
    { rank: 5, teamName: "Average Joes", manager: "Paul M.", gwPoints: 45, totalPoints: 110, transfers: 5 },
    { rank: 6, teamName: "Slipping Down", manager: "Greg F.", gwPoints: 30, totalPoints: 90, transfers: 2 },
    { rank: 7, teamName: "Panic Stations", manager: "Ian W.", gwPoints: 25, totalPoints: 85, transfers: 0 },
    { rank: 8, teamName: "Rock Bottom", manager: "Kate L.", gwPoints: 10, totalPoints: 60, transfers: 8 },
  ]
};

export default function LeagueTables() {
  // State to track which tier is currently selected
  const [activeTier, setActiveTier] = useState<1 | 2 | 3>(1);

  // Grab the configuration and data for the currently selected tier
  const currentConfig = leagueConfig[activeTier];
  // Fallback to empty array if Tier 3 mock data isn't filled out
  const currentTeams = mockTeams[activeTier as keyof typeof mockTeams] || [];
  const totalTeams = currentTeams.length;

  // Helper function to determine row styling and indicators
  const getRowStatus = (index: number) => {
    if (index < currentConfig.promoSlots) {
      return { 
        style: 'bg-emerald-50 border-l-4 border-emerald-500 hover:bg-emerald-100', 
        indicator: '▲', 
        indicatorColor: 'text-emerald-600' 
      };
    }
    if (index >= totalTeams - currentConfig.relSlots) {
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

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Navigation Bar (Matches Dashboard) */}
      <nav className="bg-slate-900 text-white p-4 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight">Retro FPL</h1>
          <div className="space-x-6 text-sm font-medium">
            <a href="/" className="hover:text-emerald-400 transition">Dashboard</a>
            <a href="#" className="hover:text-emerald-400 transition">My Team & Transfers</a>
            <a href="/leagues" className="text-emerald-400">Leagues</a>
            <a href="#" className="hover:text-emerald-400 transition">History</a>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto py-10 px-4">
        
        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-extrabold text-slate-900">League Standings</h2>
          <p className="text-slate-500 mt-2">End of season promotion and relegation thresholds are marked below.</p>
        </div>

        {/* Tier Navigation Tabs */}
        <div className="flex space-x-2 mb-6 border-b border-slate-200">
          {[1, 2, 3].map((tier) => (
            <button
              key={tier}
              onClick={() => setActiveTier(tier as 1 | 2 | 3)}
              className={`px-6 py-3 text-sm font-bold rounded-t-lg transition-colors duration-200 ${
                activeTier === tier
                  ? 'bg-white text-emerald-600 border-t border-l border-r border-slate-200 shadow-[0_4px_0_0_white]'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {leagueConfig[tier as keyof typeof leagueConfig].name}
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
                    No teams populated for this tier yet.
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
                          {/* We make this look like a link to simulate the "Roster Time Machine" click */}
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