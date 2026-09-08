import React from 'react';
import {
  X,
  User,
  Shield,
  Award
} from 'lucide-react';
import { WorkerRecord, ScheduleAssignment } from '../types/schedule';

interface WorkerDetailModalProps {
  worker: WorkerRecord | null;
  assignments: ScheduleAssignment[];
  onClose: () => void;
}

export const WorkerDetailModal: React.FC<WorkerDetailModalProps> = ({
  worker,
  assignments,
  onClose
}) => {
  if (!worker) return null;

  const workAssignments = assignments.filter((a) => a.assignmentType === 'WORK');
  const restAssignments = assignments.filter((a) => a.assignmentType === 'REST');

  const totalWorkMin = workAssignments.reduce((acc, a) => acc + (Number(a.endMinute) - Number(a.startMinute) || 0), 0);
  const totalRestMin = restAssignments.reduce((acc, a) => acc + (Number(a.endMinute) - Number(a.startMinute) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-2xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-xl bg-white border border-[#DCE3DF] shadow-xl overflow-hidden text-[#17211D]">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#DCE3DF] flex items-start justify-between bg-[#F4F6F5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E8F1ED] border border-[#C4DCD0] flex items-center justify-center text-[#176B52] font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#17211D]">{worker.name}</h3>
              <div className="flex items-center gap-2 text-xs text-[#68736E] mt-0.5">
                <span>{worker.role || 'Operator'}</span>
                <span className="text-[#DCE3DF]">•</span>
                <span className="font-mono text-[#68736E] font-medium">{worker.employee_code}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded text-[#68736E] hover:text-[#17211D] hover:bg-[#DCE3DF]/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Operational Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF]">
              <span className="text-[10px] text-[#68736E] font-semibold uppercase block">Acclimatization</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-2 h-2 rounded-full ${worker.is_acclimatized ? 'bg-[#4D8A6A]' : 'bg-[#D88A28]'}`} />
                <span className="text-xs font-bold text-[#17211D]">
                  {worker.is_acclimatized ? 'Fully Acclimatized' : 'Unacclimatized (Ramp Up)'}
                </span>
              </div>
              <span className="text-[11px] text-[#68736E] block mt-0.5">
                {worker.is_acclimatized ? 'Standard work/rest regimen' : 'NIOSH 20% exposure limit'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF]">
              <span className="text-[10px] text-[#68736E] font-semibold uppercase block">Vulnerability Tier</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Shield className="w-3.5 h-3.5 text-[#D88A28]" />
                <span className="text-xs font-bold text-[#D88A28]">
                  {worker.vulnerability_rating || 'LOW'} TIER
                </span>
              </div>
              <span className="text-[11px] text-[#68736E] block mt-0.5">
                Operational exposure factor
              </span>
            </div>
          </div>

          {/* Shift Schedule Utilization */}
          <div className="p-3.5 rounded-lg bg-[#F4F6F5] border border-[#DCE3DF] space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#17211D] block">
              Shift Schedule Utilization
            </span>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#68736E] text-[11px]">Scheduled Work:</span>
                <span className="font-bold text-[#17211D] ml-1.5 font-mono">{totalWorkMin} min</span>
              </div>
              <div>
                <span className="text-[#68736E] text-[11px]">Mandatory Rest:</span>
                <span className="font-bold text-[#176B52] ml-1.5 font-mono">{totalRestMin} min</span>
              </div>
            </div>
          </div>

          {/* Assigned Shift Tasks */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#17211D] block">
              Assigned Shift Tasks ({workAssignments.length})
            </span>

            <div className="divide-y divide-[#DCE3DF] rounded-lg border border-[#DCE3DF] bg-[#F4F6F5]">
              {workAssignments.length > 0 ? (
                workAssignments.map((a, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-[#17211D] block">{a.taskTitle || 'Task'}</span>
                      <span className="text-[11px] text-[#68736E]">{a.zoneId || 'Site Zone'}</span>
                    </div>
                    <span className="font-mono text-[#176B52] font-semibold text-xs">
                      {a.startTimeStr} — {a.endTimeStr}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-3 text-xs text-[#68736E] text-center">
                  In reserve / available for dispatch.
                </div>
              )}
            </div>
          </div>

          {/* Verified Trade Skills */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#17211D] block">
              Verified Trade Qualifications
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(worker.skills || []).map((skill, idx) => (
                <span
                  key={idx}
                  className="text-[11px] font-medium px-2.5 py-1 rounded bg-white border border-[#DCE3DF] text-[#17211D] flex items-center gap-1.5 shadow-2xs"
                >
                  <Award className="w-3 h-3 text-[#176B52]" />
                  <span>{skill.replace(/_/g, ' ')}</span>
                </span>
              ))}
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
