import React from 'react';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Navigation Bar */}
      <nav className="bg-slate-900 text-white p-4 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight">Retro FPL</h1>
          <div className="space-x-6 text-sm font-medium">
            <a href="#" className="text-emerald-400">Dashboard</a>
            <a href="#" className="hover:text-emerald-400 transition">My Team & Transfers</a>
            <a href="#" className="hover:text-emerald-400 transition">Leagues</a>
            <a href="#" className="hover:text-emerald-400 transition">History</a>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-8 px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-8">
          {/* Stat Banner */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Gameweek</p>
              <p className="text-3xl font-extrabold text-slate-800 mt-1">12</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Points</p>
              <p className="text-3xl font-extrabold text-slate-800 mt-1">642</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Overall Rank</p>
              <p className="text-3xl font-extrabold text-slate-800 mt-1">4</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-200 flex flex-col justify-center">
              <p className="text-xs text-emerald-800 font-bold uppercase tracking-wider">Transfers Left</p>
              <p className="text-3xl font-extrabold text-emerald-600 mt-1">8</p>
            </div>
          </div>

          {/* Commissioner's Corner (Newsletter) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
              <h2 className="text-lg font-bold">Commissioner's Corner</h2>
              <span className="text-xs font-medium bg-slate-700 px-2 py-1 rounded">Latest</span>
            </div>
            <div className="p-6 prose max-w-none text-slate-700">
              <p className="text-sm text-slate-400 mb-4 font-medium">Posted by League Admin • Nov 14, 2026</p>
              <h3 className="text-xl font-bold text-slate-900 mb-3">The Midfield Dilemma</h3>
              <p className="leading-relaxed">
                Welcome to Gameweek 12. As we saw last weekend, the heavy reliance on premium forwards is starting to punish those who completely neglected their midfield...
              </p>
              <button className="text-emerald-600 font-semibold mt-6 hover:text-emerald-700 transition flex items-center gap-1">
                Read Full Breakdown <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-8">
          {/* Mini League Table */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-end mb-4">
              <h3 className="font-bold text-slate-900">Tier 1: Elite</h3>
              <span className="text-xs text-slate-500 font-medium">Top 5</span>
            </div>
            <div className="space-y-2">
              {[
                { rank: 1, name: 'The Tactician', manager: 'John D.', pts: 680 },
                { rank: 2, name: 'Retro Rovers', manager: 'Dad', pts: 655 },
                { rank: 3, name: 'Saka Potatoes', manager: 'Sarah W.', pts: 645 },
                { rank: 4, name: 'False Nine FC', manager: 'You', pts: 642, highlight: true },
                { rank: 5, name: 'Chaos United', manager: 'Mike T.', pts: 610 },
              ].map((team) => (
                <div key={team.name} className={`flex justify-between items-center p-3 rounded-lg ${team.highlight ? 'bg-slate-800 text-white shadow-md' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono text-sm ${team.highlight ? 'text-slate-300' : 'text-slate-400'}`}>{team.rank}.</span>
                    <div>
                      <p className={`font-bold text-sm ${team.highlight ? 'text-white' : 'text-slate-800'}`}>{team.name}</p>
                      <p className={`text-xs ${team.highlight ? 'text-slate-300' : 'text-slate-500'}`}>{team.manager}</p>
                    </div>
                  </div>
                  <span className="font-extrabold">{team.pts}</span>
                </div>
              ))}
            </div>
            <button className="w-full mt-6 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-300">
              View Full Standings
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}