import React from 'react';
import { Users, Award, Shield, UserCheck } from 'lucide-react';
import { WorkerRecord } from '../types/schedule';

interface WorkforceCardProps {
  workers: WorkerRecord[];
  onSelectWorker?: (worker: WorkerRecord) => void;
}

export const WorkforceCard: React.FC<WorkforceCardProps> = ({ workers, onSelectWorker }) => {
  const total = workers.length;
  const acclimatizedCount = workers.filter((w) => w.is_acclimatized).length;
  const unacclimatizedCount = total - acclimatizedCount;

  // Aggregate specialized trades
  const tradeCounts: Record<string, number> = {};
  workers.forEach((w) => {
    w.skills.forEach((s) => {
      const cleanSkill = s.replace(/_/g, ' ');
      tradeCounts[cleanSkill] = (tradeCounts[cleanSkill] || 0) + 1;
    });
  });

  const sortedTrades = Object.entries(tradeCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg flex flex-col justify-between space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 uppercase tracking-wider">
            <Users className="w-3.5 h-3.5" />
            <span>Operational Roster</span>
          </div>
          <h3 className="text-lg font-bold text-white mt-0.5">Active Workforce</h3>
        </div>

        <div className="px-2.5 py-1 rounded-lg bg-cyan-950/50 border border-cyan-500/30 text-xs font-bold text-cyan-300">
          {total} Active Operators
        </div>
      </div>

      {/* Roster Readiness Metrics */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Acclimatized</span>
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {acclimatizedCount} <span className="text-xs text-slate-400 font-normal">/ {total}</span>
          </div>
          <span className="text-[10px] text-slate-500">Standard Work Rest</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Unacclimatized</span>
            <Shield className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400 mt-1">
            {unacclimatizedCount} <span className="text-xs text-slate-400 font-normal">operators</span>
          </div>
          <span className="text-[10px] text-slate-500">NIOSH 20% Ramp Rule</span>
        </div>
      </div>

      {/* Trade Skills Badges */}
      <div>
        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-2">
          Verified Trade Certifications
        </span>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
          {sortedTrades.map(([trade, count]) => (
            <span
              key={trade}
              className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-300 flex items-center gap-1.5"
            >
              <Award className="w-3 h-3 text-orange-400" />
              <span className="capitalize">{trade.toLowerCase()}</span>
              <span className="text-slate-500 text-[10px]">({count})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
