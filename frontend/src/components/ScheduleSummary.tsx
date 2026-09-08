import React from 'react';
import { CheckCircle2, Clock, Users, Layers, Tent } from 'lucide-react';
import { ScheduleOutput, ScheduleSummary as ScheduleSummaryType } from '../types/schedule';

interface ScheduleSummaryProps {
  schedule: ScheduleOutput;
  summary: ScheduleSummaryType | null;
  totalWorkers?: number;
  totalTasks?: number;
}

export const ScheduleSummary: React.FC<ScheduleSummaryProps> = ({
  schedule,
  totalWorkers = 0,
  totalTasks = 0
}) => {
  const activeWorkerIds = new Set(
    schedule.assignments
      .filter((a) => a.assignmentType === 'WORK')
      .map((a) => a.workerId)
  );
  const activeWorkersCount = activeWorkerIds.size;

  // Compute shift finish time safely without any NaN
  const endMinutes = schedule.assignments
    .map((a) => Number(a.endMinute))
    .filter((m) => !isNaN(m) && isFinite(m));
  const lastEndMinute = endMinutes.length > 0 ? Math.max(...endMinutes) : 0;
  const finishHour = 7 + Math.floor(lastEndMinute / 60);
  const finishMin = lastEndMinute % 60;
  const finishTimeStr = `${String(finishHour).padStart(2, '0')}:${String(finishMin).padStart(2, '0')}`;

  const workMinutes = Number(schedule.totalWorkMinutes) || 0;
  const restMinutes = Number(schedule.totalRestMinutes) || 0;
  const tasksScheduled = Number(schedule.totalTasksScheduled) || 0;
  const coveragePct = totalTasks > 0 ? Math.round((tasksScheduled / totalTasks) * 100) : 100;

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #E3E7E2',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #E3E7E2'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#17211D', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Generated Work Plan & Resource Allocation
            </h3>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                backgroundColor: '#E8EFEA',
                color: '#2F6B55',
                padding: '2px 7px',
                borderRadius: '4px',
                border: '1px solid #C4DCD0'
              }}
            >
              {schedule.objectiveMode || 'BALANCED'} Optimization
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#66736D', margin: '3px 0 0' }}>
            Shift completion at <strong style={{ color: '#17211D' }}>{finishTimeStr}</strong> · {tasksScheduled} tasks safely dispatched with compulsory heat recovery blocks.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#E8EFEA',
              color: '#2F6B55',
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid #C4DCD0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <CheckCircle2 size={13} />
            <span>Safety Constraints Verified</span>
          </span>
        </div>
      </div>

      {/* 5-Column Metrics Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem'
        }}
      >
        {/* Shift Completion */}
        <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: '#F7F8F6', border: '1px solid #E3E7E2' }}>
          <span style={{ fontSize: '0.7rem', color: '#66736D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Shift Makespan
          </span>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#17211D', marginTop: '2px', fontFamily: 'monospace' }}>
            {finishTimeStr}
          </div>
          <span style={{ fontSize: '0.7rem', color: '#66736D' }}>Estimated Finish</span>
        </div>

        {/* Tasks Scheduled */}
        <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: '#F7F8F6', border: '1px solid #E3E7E2' }}>
          <span style={{ fontSize: '0.7rem', color: '#66736D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Tasks Scheduled
          </span>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#17211D', marginTop: '2px', fontFamily: 'monospace' }}>
            {tasksScheduled}
            {totalTasks > 0 && <span style={{ fontSize: '0.8rem', color: '#66736D', fontWeight: 400 }}> / {totalTasks}</span>}
          </div>
          <span style={{ fontSize: '0.7rem', color: '#2F6B55', fontWeight: 600 }}>{coveragePct}% Coverage</span>
        </div>

        {/* Operators Dispatched */}
        <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: '#F7F8F6', border: '1px solid #E3E7E2' }}>
          <span style={{ fontSize: '0.7rem', color: '#66736D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Active Crew
          </span>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#17211D', marginTop: '2px', fontFamily: 'monospace' }}>
            {activeWorkersCount}
            {totalWorkers > 0 && <span style={{ fontSize: '0.8rem', color: '#66736D', fontWeight: 400 }}> / {totalWorkers}</span>}
          </div>
          <span style={{ fontSize: '0.7rem', color: '#66736D' }}>Dispatched Operators</span>
        </div>

        {/* Total Productive Work */}
        <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: '#F7F8F6', border: '1px solid #E3E7E2' }}>
          <span style={{ fontSize: '0.7rem', color: '#66736D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Productive Work
          </span>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#D58A1F', marginTop: '2px', fontFamily: 'monospace' }}>
            {workMinutes}m
          </div>
          <span style={{ fontSize: '0.7rem', color: '#66736D' }}>Cumulative Work Time</span>
        </div>

        {/* Protected Recovery */}
        <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', backgroundColor: '#F7F8F6', border: '1px solid #E3E7E2' }}>
          <span style={{ fontSize: '0.7rem', color: '#66736D', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Recovery Rest
          </span>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#2F6B55', marginTop: '2px', fontFamily: 'monospace' }}>
            {restMinutes}m
          </div>
          <span style={{ fontSize: '0.7rem', color: '#2F6B55' }}>Compulsory Shade Time</span>
        </div>
      </div>
    </div>
  );
};
