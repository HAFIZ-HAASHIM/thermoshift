import React from 'react';
import { ClipboardList, Clock, Flame, GitBranch, MapPin } from 'lucide-react';
import { TaskRecord, PhysicalIntensity } from '../types/schedule';

interface TaskOverviewCardProps {
  tasks: TaskRecord[];
  onSelectTask?: (task: TaskRecord) => void;
}

const INTENSITY_BADGES: Record<PhysicalIntensity, { label: string; text: string; bg: string; border: string }> = {
  LIGHT: { label: 'LIGHT INTENSITY', text: 'text-blue-400', bg: 'bg-blue-950/50', border: 'border-blue-500/30' },
  MEDIUM: { label: 'MEDIUM INTENSITY', text: 'text-emerald-400', bg: 'bg-emerald-950/50', border: 'border-emerald-500/30' },
  HEAVY: { label: 'HEAVY INTENSITY', text: 'text-orange-400', bg: 'bg-orange-950/50', border: 'border-orange-500/30' },
  EXTREME: { label: 'EXTREME INTENSITY', text: 'text-red-400', bg: 'bg-red-950/50', border: 'border-red-500/30' }
};

export const TaskOverviewCard: React.FC<TaskOverviewCardProps> = ({ tasks, onSelectTask }) => {
  return (
    <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg flex flex-col justify-between space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider">
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Scope of Work</span>
          </div>
          <h3 className="text-lg font-bold text-white mt-0.5">Critical Tasks ({tasks.length})</h3>
        </div>

        <div className="px-2.5 py-1 rounded-lg bg-purple-950/50 border border-purple-500/30 text-xs font-bold text-purple-300">
          5 Work Packages
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {tasks.map((task) => {
          const intensity = INTENSITY_BADGES[task.physical_intensity] || INTENSITY_BADGES.MEDIUM;

          return (
            <div
              key={task.id}
              onClick={() => onSelectTask && onSelectTask(task)}
              className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-xs text-white truncate">
                  {task.title}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${intensity.bg} ${intensity.text} ${intensity.border}`}>
                  {task.physical_intensity}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-500" />
                    <span>{task.zone_name}</span>
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{task.estimated_duration_minutes}m target</span>
                  </span>
                </div>

                {task.dependencies.length > 0 && (
                  <span className="flex items-center gap-1 text-orange-400 text-[10px] font-medium">
                    <GitBranch className="w-3 h-3" />
                    <span>{task.dependencies.length} Dep</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
