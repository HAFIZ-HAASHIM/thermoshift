import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  Flame,
  Users,
  ShieldCheck,
  Layers
} from 'lucide-react';
import {
  DecisionSummary
} from '../types/decision_intelligence';

interface DecisionIntelligencePanelProps {
  summary: DecisionSummary;
  onSelectTask?: (taskId: string) => void;
  onSelectWorker?: (workerId: string) => void;
}

export const DecisionIntelligencePanel: React.FC<DecisionIntelligencePanelProps> = ({
  summary,
  onSelectTask
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expandedFactorIds, setExpandedFactorIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedFactorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const categories = [
    { id: 'ALL', label: 'All Drivers' },
    { id: 'HEAT', label: 'Heat' },
    { id: 'WORKFORCE', label: 'Workforce' },
    { id: 'RESOURCE', label: 'Resources' },
    { id: 'DEPENDENCY', label: 'Sequence' }
  ];

  // Prioritize 3-5 top factors
  const topFactors = summary.keyFactors.slice(0, 5);

  const displayedFactors = selectedCategory === 'ALL'
    ? topFactors
    : summary.keyFactors.filter((f) => f.category === selectedCategory);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'HEAT':
        return <Flame className="w-3.5 h-3.5 text-[#D88A28]" />;
      case 'WORKFORCE':
        return <Users className="w-3.5 h-3.5 text-[#176B52]" />;
      case 'RESOURCE':
        return <ShieldCheck className="w-3.5 h-3.5 text-[#4D8A6A]" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-[#17211D]" />;
    }
  };

  return (
    <div className="rounded-xl bg-white border border-[#DCE3DF] p-4 sm:p-5 space-y-4 shadow-xs">
      {/* 4. WHY THIS PLAN HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DCE3DF]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0]">
            <BrainCircuit className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#17211D]">
                4. Why This Plan
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0] font-semibold">
                DECISION INTELLIGENCE
              </span>
            </div>
            <p className="text-xs text-[#68736E] mt-0.5">
              {summary.headline}
            </p>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                selectedCategory === cat.id
                  ? 'bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0] font-semibold'
                  : 'text-[#68736E] hover:text-[#17211D] bg-[#F4F6F5] border border-[#DCE3DF]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Decision Drivers (Fact -> Reason -> Impact) */}
      <div className="space-y-2.5">
        {displayedFactors.length === 0 ? (
          <div className="p-6 text-center text-[#68736E] text-xs">
            No specific drivers in this category for the current shift.
          </div>
        ) : (
          displayedFactors.map((factor) => {
            const isExpanded = expandedFactorIds.has(factor.id);

            return (
              <div
                key={factor.id}
                className="rounded-lg bg-[#F4F6F5]/80 border border-[#DCE3DF] hover:border-[#BFCBC6] transition-all overflow-hidden"
              >
                {/* Driver Summary Row */}
                <div
                  onClick={() => toggleExpand(factor.id)}
                  className="p-3.5 cursor-pointer flex items-center justify-between gap-3 hover:bg-[#F4F6F5] select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1 rounded bg-white border border-[#DCE3DF] shrink-0">
                      {getCategoryIcon(factor.category)}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[#17211D]">
                        {factor.title}
                      </h4>
                      <p className="text-xs text-[#68736E] mt-0.5">
                        {factor.explanation}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-[#68736E] font-medium hidden sm:inline">
                      {isExpanded ? 'Hide decision evidence' : 'View decision evidence'}
                    </span>
                    <button className="text-[#68736E] p-0.5">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Structured Fact -> Reason -> Impact (Progressive Disclosure) */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-[#DCE3DF] bg-white space-y-3 text-xs animate-in fade-in duration-100">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF]">
                        <span className="text-[10px] text-[#68736E] uppercase tracking-wider block font-bold mb-1">
                          1. Operational Fact
                        </span>
                        <p className="text-[#17211D] text-xs leading-relaxed">
                          {factor.fact}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF]">
                        <span className="text-[10px] text-[#68736E] uppercase tracking-wider block font-bold mb-1">
                          2. Decision Rationale
                        </span>
                        <p className="text-[#17211D] text-xs leading-relaxed">
                          {factor.reason}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-[#E8F1ED]/70 border border-[#C4DCD0]">
                        <span className="text-[10px] text-[#176B52] uppercase tracking-wider block font-bold mb-1">
                          3. Shift Impact
                        </span>
                        <p className="text-[#17211D] text-xs leading-relaxed">
                          {factor.impact}
                        </p>
                      </div>
                    </div>

                    {/* Technical evidence (quietly tucked away) */}
                    {factor.evidence && Object.keys(factor.evidence).length > 0 && (
                      <div className="pt-2 border-t border-[#DCE3DF] flex flex-wrap items-center justify-between gap-2 text-xs text-[#68736E]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold text-[#68736E] uppercase">Solver Evidence:</span>
                          {Object.entries(factor.evidence).map(([k, v]) => (
                            <span key={k} className="text-[#68736E] font-mono text-[10px] bg-[#F4F6F5] px-1.5 py-0.5 rounded border border-[#DCE3DF]">
                              {k}: {String(v)}
                            </span>
                          ))}
                        </div>

                        {factor.relatedTaskIds && factor.relatedTaskIds.length > 0 && onSelectTask && (
                          <div className="flex items-center gap-1">
                            <span>Task Reference:</span>
                            {factor.relatedTaskIds.map((tid) => (
                              <button
                                key={tid}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectTask(tid);
                                }}
                                className="text-[#176B52] hover:underline font-mono text-xs font-semibold"
                              >
                                View Task
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Methodology & Solver Objective Note */}
      <div className="pt-3 border-t border-[#DCE3DF] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#68736E]">
        <span>Objective: <strong className="text-[#17211D] font-medium">{summary.objectiveModeExplanation}</strong></span>
        <span className="text-[11px] text-[#68736E]">OSHA / NIOSH Heat Stress Guidance & India MoLE Framework</span>
      </div>
    </div>
  );
};
