import React from 'react';
import { AlertTriangle, ShieldX, HelpCircle, RefreshCw } from 'lucide-react';

interface InfeasibleAlertProps {
  reason: string;
  details?: {
    solverMessages?: string[];
    unassignedTaskIds?: string[];
    solveTimeSeconds?: number;
  } | null;
  onRetry?: () => void;
}

export const InfeasibleAlert: React.FC<InfeasibleAlertProps> = ({
  details,
  onRetry
}) => {
  const solverMessages = details?.solverMessages || [];

  return (
    <div className="p-5 sm:p-6 rounded-xl bg-[#FAF2E8] border border-[#F1D4B0] shadow-xs space-y-4 text-[#17211D]">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded bg-white text-[#D88A28] border border-[#F1D4B0] shrink-0">
            <ShieldX className="w-5 h-5 text-[#D88A28]" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-[#D88A28] uppercase tracking-wider">
                No Feasible Schedule Under Current Constraints
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white text-[#D88A28] border border-[#F1D4B0] font-mono">
                HTTP 422
              </span>
            </div>
            <p className="text-xs text-[#68736E] leading-relaxed">
              ThermoShift strictly enforces heat safety limits, trade qualifications, and shade recovery capacities. The optimizer confirmed that no valid schedule exists without violating mandatory safety rules.
            </p>
          </div>
        </div>

        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3.5 py-1.5 rounded bg-white hover:bg-[#FAF2E8] text-[#17211D] border border-[#F1D4B0] text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Alternate Priority</span>
          </button>
        )}
      </div>

      {/* Solver Diagnostics Breakdown */}
      {solverMessages.length > 0 && (
        <div className="p-3.5 rounded-lg bg-white border border-[#F1D4B0] space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#D88A28] uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-[#D88A28]" />
            <span>Constraint Violations Detected:</span>
          </div>

          <ul className="space-y-1 pl-2 text-xs text-[#17211D]">
            {solverMessages.map((msg, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-[#D88A28] font-bold">•</span>
                <span className="font-mono text-xs leading-relaxed text-[#17211D]">{msg}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Operational Action Suggestion */}
      <div className="p-3.5 rounded-lg bg-white border border-[#DCE3DF] flex items-start gap-2.5 text-xs text-[#68736E]">
        <HelpCircle className="w-4 h-4 text-[#176B52] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-[#17211D]">Recommended Mitigation Actions:</p>
          <p className="text-xs text-[#68736E] leading-relaxed">
            1. Move intensive outdoor tasks to earlier morning windows before peak heat.<br />
            2. Dispatch additional certified workers to split continuous task loads.<br />
            3. Increase on-site shade and cooling station capacity.<br />
            <span className="text-[#D88A28] font-semibold">Mandatory rest break durations remain non-negotiable.</span>
          </p>
        </div>
      </div>
    </div>
  );
};
