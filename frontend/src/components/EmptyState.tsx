import React from 'react';
import { CalendarCheck, Play, ShieldCheck } from 'lucide-react';

interface EmptyStateProps {
  onGenerate: () => void;
  isGenerating: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onGenerate, isGenerating }) => {
  return (
    <div className="p-10 rounded-xl bg-white border border-[#E2E8F0] text-center space-y-4 shadow-sm">
      <div className="w-12 h-12 mx-auto rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
        <CalendarCheck className="w-6 h-6" />
      </div>

      <div className="max-w-md mx-auto space-y-1.5">
        <h3 className="text-base font-bold text-[#172033]">
          No Workforce Schedule Generated Yet
        </h3>
        <p className="text-xs text-[#64748B] leading-relaxed">
          Select an optimization objective above (<span className="text-blue-600 font-semibold">Fastest</span>, <span className="text-[#172033] font-semibold">Balanced</span>, or <span className="text-emerald-700 font-semibold">Safest</span>) and click <strong className="text-[#172033]">Generate Shift Plan</strong> to compute an optimized heat-safe shift matrix.
        </p>
      </div>

      <div className="pt-2">
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="px-6 py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all active:scale-[0.98] shadow-sm"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Generate Shift Schedule Now</span>
        </button>
      </div>

      <div className="pt-4 flex items-center justify-center flex-wrap gap-5 text-xs text-[#64748B] border-t border-[#E2E8F0] max-w-lg mx-auto">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          OSHA Heat Guidance & MoLE
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
          Trade Skills & Rules
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
          Finite Shade Bound
        </span>
      </div>
    </div>
  );
};
