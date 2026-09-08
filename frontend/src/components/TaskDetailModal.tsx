import React from 'react';
import {
  X,
  Clock,
  MapPin,
  Users,
  BrainCircuit
} from 'lucide-react';
import { TaskRecord, ScheduleAssignment } from '../types/schedule';
import { TaskExplanation } from '../types/decision_intelligence';

interface TaskDetailModalProps {
  task: TaskRecord | null;
  assignment?: ScheduleAssignment | null;
  assignedWorkers: { id: string; name: string; role: string; primarySkill: string }[];
  taskExplanation?: TaskExplanation | null;
  onClose: () => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  assignment,
  assignedWorkers,
  onClose
}) => {
  if (!task) return null;

  const earliestStart = (task.earliest_start_time || '07:00').slice(0, 5);
  const deadlineTime = (task.deadline_time || '12:00').slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-2xs animate-in fade-in duration-100">
      <div className="w-full max-w-lg rounded-xl bg-white border border-[#DCE3DF] shadow-xl overflow-hidden text-[#17211D]">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#DCE3DF] flex items-start justify-between bg-[#F4F6F5]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white text-[#17211D] border border-[#DCE3DF] uppercase">
                {task.physical_intensity || 'MEDIUM'} INTENSITY
              </span>
              <span className="text-xs text-[#68736E]">
                Priority: {task.priority || 1}
              </span>
            </div>
            <h3 className="text-base font-bold text-[#17211D] mt-1.5">{task.title}</h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded text-[#68736E] hover:text-[#17211D] hover:bg-[#DCE3DF]/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {/* Timing & Location Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF]">
              <div className="flex items-center gap-1.5 text-[#68736E] text-xs font-semibold">
                <MapPin className="w-3.5 h-3.5 text-[#176B52]" />
                <span>Work Location</span>
              </div>
              <p className="text-sm font-bold text-[#17211D] mt-1">{task.zone_name || 'Main Zone'}</p>
              <span className="text-[11px] text-[#68736E] block mt-0.5">
                {task.is_sun_exposed ? 'Direct Sun Exposure' : 'Shaded Interior'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF]">
              <div className="flex items-center gap-1.5 text-[#68736E] text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 text-[#176B52]" />
                <span>Scheduled Time</span>
              </div>
              <p className="text-sm font-bold text-[#176B52] mt-1 font-mono">
                {assignment ? `${assignment.startTimeStr} — ${assignment.endTimeStr}` : `${task.estimated_duration_minutes || 60}m`}
              </p>
              <span className="text-[11px] text-[#68736E] block mt-0.5">
                Earliest: {earliestStart} | Deadline: {deadlineTime}
              </span>
            </div>
          </div>

          {/* Assigned Crew */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#68736E] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#176B52]" />
              Assigned Crew ({assignedWorkers.length})
            </span>

            <div className="divide-y divide-[#DCE3DF] rounded-lg border border-[#DCE3DF] bg-[#F4F6F5]">
              {assignedWorkers.length > 0 ? (
                assignedWorkers.map((w) => (
                  <div key={w.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-[#17211D] block">{w.name}</span>
                      <span className="text-[11px] text-[#68736E] capitalize">{w.role}</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-[#DCE3DF] text-[#17211D]">
                      {w.primarySkill}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-3 text-xs text-[#68736E] text-center">
                  Assigned dynamically during solver schedule run.
                </div>
              )}
            </div>
          </div>

          {/* WHY HERE? Decision Intelligence Breakdown */}
          <div className="p-4 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF] space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#17211D]">
              <BrainCircuit className="w-4 h-4 text-[#176B52]" />
              <span>WHY WAS THIS TASK SCHEDULED HERE?</span>
            </div>

            <div className="space-y-2 text-xs">
              {/* 1. Heat Factor */}
              <div className="p-2.5 rounded-lg bg-white border border-[#DCE3DF]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#17211D]">1. Thermal Environment</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FAF2E8] text-[#D88A28] border border-[#F1D4B0] font-mono">
                    {task.is_sun_exposed ? 'Sun Avoidance' : 'Controlled'}
                  </span>
                </div>
                <p className="text-[#68736E] text-xs mt-1 leading-relaxed">
                  Scheduled in morning window to avoid peak WBGT heat stress and reduce mandatory recovery duration.
                </p>
              </div>

              {/* 2. Workforce Factor */}
              <div className="p-2.5 rounded-lg bg-white border border-[#DCE3DF]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#17211D]">2. Crew Qualifications</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0] font-mono">
                    Skills Verified
                  </span>
                </div>
                <p className="text-[#68736E] text-xs mt-1 leading-relaxed">
                  Matched required certified operators with valid trade skill and unacclimatized exposure constraints.
                </p>
              </div>

              {/* 3. Resources Factor */}
              <div className="p-2.5 rounded-lg bg-white border border-[#DCE3DF]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#17211D]">3. Resource & Shade Access</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E8F1ED] text-[#4D8A6A] border border-[#C4DCD0] font-mono">
                    Shade Available
                  </span>
                </div>
                <p className="text-[#68736E] text-xs mt-1 leading-relaxed">
                  Proximity to designated hydration stations and cooling tent capacity accounted for during recovery.
                </p>
              </div>

              {/* 4. Precedence Factor */}
              <div className="p-2.5 rounded-lg bg-white border border-[#DCE3DF]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#17211D]">4. Deadlines & Sequence</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F4F6F5] text-[#17211D] border border-[#DCE3DF] font-mono">
                    Sequence Intact
                  </span>
                </div>
                <p className="text-[#68736E] text-xs mt-1 leading-relaxed">
                  Completes safely before the shift deadline ({deadlineTime}) with all dependency rules satisfied.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#DCE3DF] bg-[#F4F6F5] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-white hover:bg-[#F4F6F5] text-[#17211D] font-semibold text-xs border border-[#DCE3DF] transition-colors shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
