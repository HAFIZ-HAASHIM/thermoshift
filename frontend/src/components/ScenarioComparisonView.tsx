import React, { useState } from 'react';
import {
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import {
  ScenarioSimulationResult,
  WorkerRecord,
  TaskRecord,
  WeatherObservation
} from '../types/schedule';
import { ScheduleGantt } from './ScheduleGantt';
import { InfeasibleAlert } from './InfeasibleAlert';

interface ScenarioComparisonViewProps {
  simulationResult: ScenarioSimulationResult;
  scenarioExplanation?: {
    headline: string;
    narrative: string;
    keyChanges: string[];
    bottleneckFactor?: string;
  } | null;
  workers?: WorkerRecord[];
  tasks?: TaskRecord[];
  weatherRecords?: WeatherObservation[];
  onExitSimulation: () => void;
  onOpenScenarioDrawer: () => void;
  onSelectTask?: (taskId: string) => void;
  onSelectWorker?: (workerId: string) => void;
}

export const ScenarioComparisonView: React.FC<ScenarioComparisonViewProps> = ({
  simulationResult,
  scenarioExplanation,
  workers = [],
  tasks = [],
  weatherRecords = [],
  onExitSimulation,
  onOpenScenarioDrawer,
  onSelectTask,
  onSelectWorker
}) => {
  const [activeView, setActiveView] = useState<'SCENARIO' | 'BASELINE' | 'DIFF_LIST'>('SCENARIO');

  const {
    status,
    baselineSchedule,
    scenarioSchedule,
    comparisonSummary,
    taskDiffs,
    reason,
    details
  } = simulationResult;

  const isFeasible = status === 'OPTIMAL' || status === 'FEASIBLE';

  return (
    <div className="space-y-4">
      {/* What Changed? Header Banner */}
      <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#DCE3DF] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#DCE3DF]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#68736E]">5. What-If Simulation</span>
              <span className="text-[#DCE3DF]">•</span>
              <h3 className="text-sm font-bold text-[#17211D]">Re-optimized Scenario & Operational Diff</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                isFeasible
                  ? 'bg-[#E8F1ED] text-[#4D8A6A] border border-[#C4DCD0]'
                  : 'bg-[#FDF1F0] text-[#C85C52] border border-[#F3C7C3]'
              }`}>
                {status}
              </span>
            </div>
            <p className="text-xs text-[#68736E] mt-0.5">
              Simulated schedule from temporary condition overrides without mutating production database records.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenScenarioDrawer}
              className="px-3 py-1.5 rounded bg-white hover:bg-[#F4F6F5] text-xs font-semibold text-[#17211D] border border-[#DCE3DF] flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Sliders className="w-3.5 h-3.5 text-[#176B52]" />
              <span>Edit Overrides</span>
            </button>
            <button
              onClick={onExitSimulation}
              className="px-3 py-1.5 rounded bg-[#F4F6F5] hover:bg-[#E8F1ED] text-xs font-semibold text-[#68736E] hover:text-[#17211D] border border-[#DCE3DF] flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Exit Scenario</span>
            </button>
          </div>
        </div>

        {/* Meaningful Deltas Strip */}
        {comparisonSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF]">
              <span className="text-[11px] font-medium text-[#68736E] block">Makespan Delta</span>
              <div className="text-base font-bold text-[#17211D] mt-0.5 font-mono">
                {comparisonSummary.completion_time_delta_minutes > 0
                  ? `+${comparisonSummary.completion_time_delta_minutes}m`
                  : `${comparisonSummary.completion_time_delta_minutes}m`}
              </div>
              <span className="text-[10px] text-[#68736E] block mt-0.5">Shift Completion</span>
            </div>

            <div className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF]">
              <span className="text-[11px] font-medium text-[#68736E] block">Tasks Rescheduled</span>
              <div className="text-base font-bold text-[#17211D] mt-0.5 font-mono">
                {comparisonSummary.tasks_changed_count}
              </div>
              <span className="text-[10px] text-[#68736E] block mt-0.5">Timing or Crew Shifted</span>
            </div>

            <div className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF]">
              <span className="text-[11px] font-medium text-[#68736E] block">Workers Affected</span>
              <div className="text-base font-bold text-[#17211D] mt-0.5 font-mono">
                {comparisonSummary.workers_affected_count}
              </div>
              <span className="text-[10px] text-[#68736E] block mt-0.5">Assignments Modified</span>
            </div>

            <div className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF]">
              <span className="text-[11px] font-medium text-[#68736E] block">Recovery Delta</span>
              <div className="text-base font-bold text-[#D88A28] mt-0.5 font-mono">
                {comparisonSummary.rest_minutes_delta > 0
                  ? `+${comparisonSummary.rest_minutes_delta}m`
                  : `${comparisonSummary.rest_minutes_delta}m`}
              </div>
              <span className="text-[10px] text-[#68736E] block mt-0.5">Mandatory Shade Break</span>
            </div>
          </div>
        )}

        {/* Concise Narrative Explanation */}
        {scenarioExplanation && (
          <div className="p-3.5 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF] space-y-1.5 text-xs">
            <span className="font-bold text-[#17211D] block">
              {scenarioExplanation.headline}
            </span>
            <p className="text-[#68736E] leading-relaxed">
              {scenarioExplanation.narrative}
            </p>
            {scenarioExplanation.bottleneckFactor && (
              <span className="text-xs text-[#D88A28] font-medium block pt-0.5">
                Primary constraint: {scenarioExplanation.bottleneckFactor}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Infeasibility Alert if Scenario Failed */}
      {!isFeasible && (
        <InfeasibleAlert
          reason={reason || 'The scenario is mathematically infeasible under occupational heat safety constraints.'}
          details={details}
          onRetry={onOpenScenarioDrawer}
        />
      )}

      {/* View Switcher: Simulated Plan | Baseline Plan | Task Changes */}
      {isFeasible && scenarioSchedule && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="inline-flex rounded-lg bg-[#F4F6F5] p-1 border border-[#DCE3DF] text-xs">
              <button
                onClick={() => setActiveView('SCENARIO')}
                className={`px-3 py-1.5 rounded font-semibold transition-all ${
                  activeView === 'SCENARIO'
                    ? 'bg-white text-[#176B52] border border-[#C4DCD0] shadow-2xs'
                    : 'text-[#68736E] hover:text-[#17211D]'
                }`}
              >
                Simulated Plan
              </button>
              <button
                onClick={() => setActiveView('BASELINE')}
                className={`px-3 py-1.5 rounded font-semibold transition-all ${
                  activeView === 'BASELINE'
                    ? 'bg-white text-[#176B52] border border-[#C4DCD0] shadow-2xs'
                    : 'text-[#68736E] hover:text-[#17211D]'
                }`}
              >
                Baseline Plan
              </button>
              <button
                onClick={() => setActiveView('DIFF_LIST')}
                className={`px-3 py-1.5 rounded font-semibold transition-all ${
                  activeView === 'DIFF_LIST'
                    ? 'bg-white text-[#176B52] border border-[#C4DCD0] shadow-2xs'
                    : 'text-[#68736E] hover:text-[#17211D]'
                }`}
              >
                Task Changes ({taskDiffs.filter((d) => d.change_type !== 'UNCHANGED').length})
              </button>
            </div>
          </div>

          {activeView === 'SCENARIO' && (
            <ScheduleGantt
              schedule={scenarioSchedule}
              workers={workers}
              tasks={tasks}
              weatherRecords={weatherRecords}
              onSelectTask={(taskId) => onSelectTask?.(taskId)}
              onSelectWorker={(workerId) => onSelectWorker?.(workerId)}
            />
          )}

          {activeView === 'BASELINE' && baselineSchedule && (
            <ScheduleGantt
              schedule={baselineSchedule}
              workers={workers}
              tasks={tasks}
              weatherRecords={weatherRecords}
              onSelectTask={(taskId) => onSelectTask?.(taskId)}
              onSelectWorker={(workerId) => onSelectWorker?.(workerId)}
            />
          )}

          {activeView === 'DIFF_LIST' && (
            <div className="rounded-xl bg-white border border-[#DCE3DF] p-4 space-y-2 shadow-xs">
              {taskDiffs.map((diff) => (
                <div
                  key={diff.task_id}
                  className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF] flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-[#17211D] block">{diff.task_title}</span>
                    <span className="text-xs text-[#68736E]">
                      {diff.baseline_start_time || '—'} → {diff.scenario_start_time || '—'}
                    </span>
                  </div>

                  <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                    diff.change_type === 'MOVED_EARLIER' || diff.change_type === 'MOVED_LATER'
                      ? 'bg-[#FAF2E8] text-[#D88A28] border-[#F1D4B0]'
                      : diff.change_type === 'WORKERS_CHANGED'
                      ? 'bg-[#E8F1ED] text-[#176B52] border-[#C4DCD0]'
                      : diff.change_type === 'TIMING_AND_WORKERS_CHANGED'
                      ? 'bg-[#FAF2E8] text-[#D88A28] border-[#F1D4B0]'
                      : diff.change_type === 'NEWLY_UNSCHEDULED'
                      ? 'bg-[#FDF1F0] text-[#C85C52] border-[#F3C7C3]'
                      : 'bg-[#F4F6F5] text-[#68736E] border-[#DCE3DF]'
                  }`}>
                    {diff.change_type.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
