import React from 'react';
import { Users, Award } from 'lucide-react';
import { WorkerRecord } from '../types/schedule';
import { safeLowerCase } from '../utils/formatters';

interface WorkforceCardProps {
  workers: WorkerRecord[];
  onSelectWorker?: (worker: WorkerRecord) => void;
}

export const WorkforceCard: React.FC<WorkforceCardProps> = ({ workers }) => {
  const total = workers.length;
  const activeWorkers = workers.filter((w) => w.is_active);
  const activeCount = activeWorkers.length;

  // Aggregate specialized trades
  const tradeCounts: Record<string, number> = {};
  workers.forEach((w) => {
    (w.skills || []).forEach((s) => {
      const cleanSkill = s.replace(/_/g, ' ');
      tradeCounts[cleanSkill] = (tradeCounts[cleanSkill] || 0) + 1;
    });
  });

  const sortedTrades = Object.entries(tradeCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-400" />
            <h3 className="font-semibold text-slate-100 text-sm tracking-wide">
              Workforce Deployment
            </h3>
          </div>
          <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
            {activeCount}/{total} Active
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
            <span className="text-xs text-slate-400 block mb-1">Total Available</span>
            <span className="text-2xl font-bold font-mono text-slate-100">{total}</span>
          </div>
          <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3">
            <span className="text-xs text-slate-400 block mb-1">Active on Shift</span>
            <span className="text-2xl font-bold font-mono text-emerald-400">{activeCount}</span>
          </div>
        </div>
      </div>

      <div>
        <span className="text-xs font-semibold text-slate-400 block mb-2 uppercase tracking-wider">
          Verified Trade Certifications
        </span>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
          {sortedTrades.map(([trade, count]) => (
            <span
              key={trade}
              className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-300 flex items-center gap-1.5"
            >
              <Award className="w-3 h-3 text-orange-400" />
              <span className="capitalize">{safeLowerCase(trade)}</span>
              <span className="text-slate-500 text-[10px]">({count})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
