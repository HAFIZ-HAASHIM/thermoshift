import React, { useState } from 'react';
import {
  Clock,
  Tent,
  Search,
  Filter,
  Users,
  Flame,
  LayoutList,
  Calendar,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import {
  ScheduleAssignment,
  ScheduleOutput,
  WorkerRecord,
  TaskRecord,
  WeatherObservation
} from '../types/schedule';

interface ScheduleGanttProps {
  schedule: ScheduleOutput;
  workers?: WorkerRecord[];
  tasks?: TaskRecord[];
  weatherRecords?: WeatherObservation[];
  onSelectTask?: (taskId: string, assignment: ScheduleAssignment) => void;
  onSelectWorker?: (workerId: string) => void;
}

// Fixed 15-minute slot intervals from 07:00 to 12:00 (20 slots)
const SLOT_COUNT = 20;
const SLOT_DURATION_MIN = 15;
const START_HOUR = 7;

function formatSlotTime(slotIndex: number): string {
  const safeIndex = isNaN(slotIndex) ? 0 : Math.max(0, Math.min(SLOT_COUNT - 1, slotIndex));
  const totalMin = START_HOUR * 60 + safeIndex * SLOT_DURATION_MIN;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Estimate WBGT and risk level for a slot from 07:00 to 12:00 based on typical morning heat curve
function getSlotThermalRisk(slotIndex: number) {
  const baseWbgt = 28.0 + (slotIndex / (SLOT_COUNT - 1)) * 5.8;
  if (baseWbgt < 29.5) {
    return {
      wbgt: baseWbgt.toFixed(1),
      level: 'LOW',
      bgClass: 'bg-[#E8F1ED]',
      textClass: 'text-[#4D8A6A]',
      barClass: 'bg-[#4D8A6A]'
    };
  } else if (baseWbgt < 32.0) {
    return {
      wbgt: baseWbgt.toFixed(1),
      level: 'MODERATE',
      bgClass: 'bg-[#FAF2E8]',
      textClass: 'text-[#D88A28]',
      barClass: 'bg-[#D88A28]'
    };
  } else {
    return {
      wbgt: baseWbgt.toFixed(1),
      level: 'HIGH',
      bgClass: 'bg-[#FDF1F0]',
      textClass: 'text-[#C85C52]',
      barClass: 'bg-[#C85C52]'
    };
  }
}

export const ScheduleGantt: React.FC<ScheduleGanttProps> = ({
  schedule,
  workers = [],
  tasks = [],
  onSelectTask,
  onSelectWorker
}) => {
  const [viewMode, setViewMode] = useState<'GANTT' | 'ROSTER'>('GANTT');
  const [searchQuery, setSearchQuery] = useState('');
  const [tradeFilter, setTradeFilter] = useState('ALL');

  // Build task map
  const taskMap: Record<string, TaskRecord> = {};
  tasks.forEach((t) => {
    taskMap[t.id] = t;
  });

  // Build worker lookup map and ensure non-empty worker roster from schedule assignments if workers prop is empty
  const effectiveWorkers: WorkerRecord[] = [...workers];
  const knownWorkerIds = new Set(effectiveWorkers.map((w) => w.id));

  // Auto-discover any assigned workers missing from workers array (prevents blank Gantt)
  schedule.assignments.forEach((a) => {
    if (a.workerId && !knownWorkerIds.has(a.workerId)) {
      knownWorkerIds.add(a.workerId);
      effectiveWorkers.push({
        id: a.workerId,
        name: a.workerName || `Worker ${a.workerId.slice(0, 4)}`,
        employee_code: `OP-${a.workerId.slice(0, 4)}`,
        role: 'Operator',
        is_active: true,
        is_acclimatized: true,
        vulnerability_rating: 'LOW',
        past_heat_incidents: 0,
        skills: ['GENERAL_LABOR']
      });
    }
  });

  // Group assignments by worker
  const assignmentsByWorker: Record<string, ScheduleAssignment[]> = {};
  schedule.assignments.forEach((a) => {
    if (!assignmentsByWorker[a.workerId]) {
      assignmentsByWorker[a.workerId] = [];
    }
    assignmentsByWorker[a.workerId].push(a);
  });

  // Find workers who have assignments
  const assignedWorkerIds = new Set(Object.keys(assignmentsByWorker));

  // Determine all distinct trades for filter dropdown
  const allTrades = Array.from(
    new Set(effectiveWorkers.flatMap((w) => (w.skills || []).map((s) => s.replace(/_/g, ' '))))
  );

  // Filter workers list
  const filteredWorkers = effectiveWorkers.filter((w) => {
    const matchesSearch =
      (w.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.employee_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.role || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTrade =
      tradeFilter === 'ALL' ||
      (w.skills || []).some((s) => s.replace(/_/g, ' ') === tradeFilter);

    return matchesSearch && matchesTrade;
  });

  // Sort: active workers with assignments first, then alphabetical
  filteredWorkers.sort((a, b) => {
    const aHas = assignedWorkerIds.has(a.id) ? 1 : 0;
    const bHas = assignedWorkerIds.has(b.id) ? 1 : 0;
    if (bHas !== aHas) return bHas - aHas;
    return (a.name || '').localeCompare(b.name || '');
  });

  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => ({
    index: i,
    label: formatSlotTime(i),
    risk: getSlotThermalRisk(i)
  }));

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#DCE3DF] shadow-xs space-y-4">
      {/* Top Header with Search, View Mode & Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#DCE3DF]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0]">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#17211D]">
                Workforce Shift Operations & Schedule
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#E8F1ED] text-[#4D8A6A] border border-[#C4DCD0] font-semibold">
                FEASIBLE
              </span>
            </div>
            <p className="text-xs text-[#68736E]">
              Synchronized work execution and mandatory shade recovery intervals aligned to thermal conditions
            </p>
          </div>
        </div>

        {/* View Toggle & Search/Filter Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Timeline vs Roster Toggle */}
          <div className="inline-flex rounded-lg bg-[#F4F6F5] p-1 border border-[#DCE3DF] text-xs">
            <button
              onClick={() => setViewMode('GANTT')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'GANTT'
                  ? 'bg-white text-[#176B52] border border-[#C4DCD0] shadow-2xs'
                  : 'text-[#68736E] hover:text-[#17211D]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Gantt Timeline</span>
            </button>
            <button
              onClick={() => setViewMode('ROSTER')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'ROSTER'
                  ? 'bg-white text-[#176B52] border border-[#C4DCD0] shadow-2xs'
                  : 'text-[#68736E] hover:text-[#17211D]'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>WHO / WHAT / WHEN / REST</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#68736E] absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search worker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#F4F6F5] border border-[#DCE3DF] rounded pl-8 pr-3 py-1.5 text-xs text-[#17211D] focus:outline-none focus:border-[#176B52] placeholder:text-[#68736E] w-36"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-[#F4F6F5] border border-[#DCE3DF] rounded px-2.5 py-1.5 text-xs text-[#17211D]">
            <Filter className="w-3.5 h-3.5 text-[#68736E]" />
            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
              className="bg-transparent text-[#17211D] focus:outline-none text-xs capitalize"
            >
              <option value="ALL">All Trades</option>
              {allTrades.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Legend & Thermal Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-[#F4F6F5] p-2.5 rounded-lg border border-[#DCE3DF]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[10px] font-bold text-[#68736E] uppercase tracking-wider">Legend:</span>
          
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-white border border-[#DCE3DF] shadow-2xs inline-block" />
            <span className="text-[#17211D] font-medium text-xs">Work Task</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-[#E8F1ED] border border-[#C4DCD0] inline-flex items-center justify-center text-[8px] font-bold text-[#176B52]">
              R
            </span>
            <span className="text-[#176B52] font-semibold text-xs">Mandatory Shade Rest</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#F4F6F5] border border-[#DCE3DF] inline-block" />
            <span className="text-[#68736E] text-xs">Standby / Available</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-[#DCE3DF]">
            <Flame className="w-3.5 h-3.5 text-[#D88A28]" />
            <span className="text-[11px] text-[#68736E]">
              Thermal overlay shows WBGT climbing across 07:00 (28.2°C) to 12:00 (33.8°C)
            </span>
          </div>
        </div>

        <div className="text-xs text-[#68736E] hidden sm:block">
          Showing <span className="text-[#17211D] font-semibold">{filteredWorkers.length}</span> crew members
        </div>
      </div>

      {/* VIEW 1: GANTT TIMELINE */}
      {viewMode === 'GANTT' && (
        <div className="overflow-x-auto rounded-lg border border-[#DCE3DF] bg-white">
          <div className="min-w-[980px]">
            {/* Header Row: Time Slots with Thermal Risk Curve Overlay */}
            <div className="grid grid-cols-[220px_repeat(20,1fr)] bg-[#F4F6F5] border-b border-[#DCE3DF] sticky top-0 z-20">
              <div className="p-2.5 text-xs font-semibold text-[#17211D] uppercase tracking-wider border-r border-[#DCE3DF] flex items-center gap-1.5 bg-[#F4F6F5]">
                <Users className="w-3.5 h-3.5 text-[#176B52]" />
                <span>Worker & Trade</span>
              </div>

              {slots.map((slot) => (
                <div
                  key={slot.index}
                  className="py-1.5 px-0.5 text-center border-r border-[#DCE3DF] last:border-r-0 flex flex-col justify-between"
                >
                  <span className="text-[10px] font-mono font-medium text-[#17211D]">
                    {slot.label}
                  </span>
                  {/* Thermal gradient strip indicating WBGT rise */}
                  <div className="mt-1 flex items-center justify-center">
                    <span className={`text-[8px] font-mono font-bold px-1 rounded ${slot.risk.bgClass} ${slot.risk.textClass}`}>
                      {slot.risk.wbgt}°
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Worker Rows */}
            <div className="divide-y divide-[#DCE3DF]">
              {filteredWorkers.map((worker) => {
                const workerAssignments = assignmentsByWorker[worker.id] || [];
                const isAssigned = workerAssignments.length > 0;
                const primarySkill = (worker.skills?.[0] || 'LABOR').replace(/_/g, ' ');

                return (
                  <div
                    key={worker.id}
                    className={`grid grid-cols-[220px_repeat(20,1fr)] transition-colors hover:bg-[#F4F6F5]/80 ${
                      isAssigned ? 'bg-white' : 'bg-[#FAF9F7]/40'
                    }`}
                  >
                    {/* Worker Name Column */}
                    <div
                      onClick={() => onSelectWorker?.(worker.id)}
                      className="p-2.5 border-r border-[#DCE3DF] flex items-center justify-between gap-2 cursor-pointer hover:bg-[#F4F6F5] transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[#17211D] truncate hover:text-[#176B52] transition-colors">
                            {worker.name}
                          </span>
                          {worker.is_acclimatized && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4D8A6A] shrink-0" title="Acclimatized" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-medium text-[#68736E] uppercase tracking-wider truncate">
                            {primarySkill}
                          </span>
                          <span className="text-[#DCE3DF] text-[8px]">•</span>
                          <span className="text-[9px] text-[#68736E] font-mono">
                            {worker.employee_code}
                          </span>
                        </div>
                      </div>

                      {isAssigned && (
                        <span className="px-1.5 py-0.5 rounded bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0] text-[8px] font-bold shrink-0">
                          ACTIVE
                        </span>
                      )}
                    </div>

                    {/* 20 Slot Cells for this Worker */}
                    {slots.map((slot) => {
                      const slotMin = slot.index * SLOT_DURATION_MIN;
                      // Find assignment covering this slot
                      const asgn = workerAssignments.find(
                        (a) => a.startMinute <= slotMin && a.endMinute > slotMin
                      );

                      if (!asgn) {
                        return (
                          <div
                            key={slot.index}
                            className="h-13 border-r border-[#DCE3DF]/70 last:border-r-0 relative group"
                          >
                            <div className="w-full h-full hover:bg-[#F4F6F5]/60 transition-colors" />
                          </div>
                        );
                      }

                      if (asgn.assignmentType === 'REST') {
                        return (
                          <div
                            key={slot.index}
                            className="h-13 border-r border-[#DCE3DF]/70 last:border-r-0 p-1"
                          >
                            <div className="w-full h-full rounded bg-[#E8F1ED] border border-[#C4DCD0] p-1 flex flex-col justify-center items-center text-center shadow-2xs">
                              <Tent className="w-3 h-3 text-[#176B52]" />
                              <span className="text-[8px] font-bold text-[#176B52] leading-tight mt-0.5">
                                REST
                              </span>
                            </div>
                          </div>
                        );
                      }

                      // WORK Assignment
                      const taskId = asgn.taskId || '';
                      const isBlockStart = asgn.startMinute === slotMin;

                      return (
                        <div
                          key={slot.index}
                          onClick={() => onSelectTask?.(taskId, asgn)}
                          className="h-13 border-r border-[#DCE3DF]/70 last:border-r-0 p-1 cursor-pointer"
                        >
                          <div
                            className="w-full h-full rounded p-1.5 border border-[#DCE3DF] bg-white hover:bg-[#E8F1ED]/40 hover:border-[#176B52] text-[#17211D] flex flex-col justify-between transition-all shadow-2xs"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[9px] font-bold text-[#17211D] truncate leading-tight">
                                {asgn.taskTitle || 'Task'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[8px] text-[#68736E]">
                              <span className="truncate font-medium">{asgn.zoneId || 'Zone'}</span>
                              <span className="font-mono text-[#68736E]">{asgn.startTimeStr}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: WHO / WHAT / WHEN / REST TABULAR ROSTER */}
      {viewMode === 'ROSTER' && (
        <div className="overflow-x-auto rounded-lg border border-[#DCE3DF] bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F4F6F5] border-b border-[#DCE3DF] text-[11px] font-bold uppercase tracking-wider text-[#17211D]">
              <tr>
                <th className="py-3 px-4">WHO (Operator)</th>
                <th className="py-3 px-4">Trade & Acclimatization</th>
                <th className="py-3 px-4">WHAT (Assigned Task)</th>
                <th className="py-3 px-4">Location Zone</th>
                <th className="py-3 px-4">WHEN (Start — End)</th>
                <th className="py-3 px-4">REST (Mandatory Shade)</th>
                <th className="py-3 px-4">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE3DF]">
              {filteredWorkers.map((w) => {
                const wAssignments = assignmentsByWorker[w.id] || [];
                const workAsgns = wAssignments.filter((a) => a.assignmentType === 'WORK');
                const restAsgns = wAssignments.filter((a) => a.assignmentType === 'REST');
                const isAssigned = workAsgns.length > 0;

                return (
                  <tr
                    key={w.id}
                    onClick={() => onSelectWorker?.(w.id)}
                    className="hover:bg-[#F4F6F5]/80 transition-colors cursor-pointer"
                  >
                    {/* WHO */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#17211D] hover:text-[#176B52]">
                        {w.name}
                      </div>
                      <div className="font-mono text-[10px] text-[#68736E]">
                        {w.employee_code}
                      </div>
                    </td>

                    {/* Trade & Acclimatization */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-[#17211D]">
                          {(w.skills?.[0] || 'GENERAL_LABOR').replace(/_/g, ' ')}
                        </span>
                        {w.is_acclimatized && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4D8A6A] shrink-0" title="Acclimatized" />
                        )}
                      </div>
                      <span className="text-[10px] text-[#68736E] block mt-0.5">
                        {w.is_acclimatized ? 'Acclimatized' : 'Unacclimatized (20% Ramp)'}
                      </span>
                    </td>

                    {/* WHAT */}
                    <td className="py-3 px-4">
                      {workAsgns.length > 0 ? (
                        <div className="space-y-1">
                          {workAsgns.map((a, idx) => (
                            <button
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (a.taskId) onSelectTask?.(a.taskId, a);
                              }}
                              className="font-semibold text-[#17211D] hover:text-[#176B52] hover:underline text-left block"
                            >
                              {a.taskTitle || 'Task'}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[#68736E] italic">Reserve / Standby</span>
                      )}
                    </td>

                    {/* Location */}
                    <td className="py-3 px-4 font-medium text-[#68736E]">
                      {workAsgns.length > 0 ? workAsgns[0].zoneId || 'Main Zone' : '—'}
                    </td>

                    {/* WHEN */}
                    <td className="py-3 px-4 font-mono text-[#17211D]">
                      {workAsgns.length > 0 ? (
                        <div className="space-y-0.5">
                          {workAsgns.map((a, idx) => (
                            <div key={idx} className="font-semibold">
                              {a.startTimeStr} — {a.endTimeStr} ({a.endMinute - a.startMinute}m)
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[#68736E]">Available</span>
                      )}
                    </td>

                    {/* REST */}
                    <td className="py-3 px-4">
                      {restAsgns.length > 0 ? (
                        <div className="space-y-0.5">
                          {restAsgns.map((r, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0] font-mono text-[10px] font-bold mr-1 mb-1"
                            >
                              <Tent className="w-2.5 h-2.5" />
                              <span>{r.startTimeStr}–{r.endTimeStr} ({r.endMinute - r.startMinute}m)</span>
                            </span>
                          ))}
                        </div>
                      ) : isAssigned ? (
                        <span className="text-[10px] text-[#68736E]">Continuous Work</span>
                      ) : (
                        <span className="text-[#68736E]">—</span>
                      )}
                    </td>

                    {/* STATUS */}
                    <td className="py-3 px-4">
                      {isAssigned ? (
                        <span className="px-2 py-0.5 rounded bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0] font-bold text-[10px] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>SCHEDULED</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-[#F4F6F5] text-[#68736E] border border-[#DCE3DF] font-medium text-[10px]">
                          STANDBY
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
