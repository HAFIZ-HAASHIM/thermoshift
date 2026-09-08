import React, { useState } from 'react';
import { TaskRecord } from '../types/schedule';
import {
  createTask,
  updateTask,
  deleteTask,
  STANDARD_SKILLS
} from '../services/siteService';

interface TaskManagementProps {
  siteId: string;
  tasks: TaskRecord[];
  onTasksUpdated: () => void;
}

export const TaskManagement: React.FC<TaskManagementProps> = ({
  siteId,
  tasks,
  onTasksUpdated
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form fields
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [zoneName, setZoneName] = useState<string>('Ground Sector');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [physicalIntensity, setPhysicalIntensity] = useState<'LIGHT' | 'MEDIUM' | 'HEAVY' | 'EXTREME'>('MEDIUM');
  const [isSunExposed, setIsSunExposed] = useState<boolean>(true);
  const [minWorkers, setMinWorkers] = useState<number>(2);
  const [maxWorkers, setMaxWorkers] = useState<number>(4);
  const [primarySkill, setPrimarySkill] = useState<string>('GENERAL_LABOR');
  const [skillCount, setSkillCount] = useState<number>(1);
  const [earliestStart, setEarliestStart] = useState<string>('07:00:00');
  const [deadlineTime, setDeadlineTime] = useState<string>('15:00:00');
  const [dependencies, setDependencies] = useState<string[]>([]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setZoneName('Ground Sector');
    setDurationMinutes(60);
    setPhysicalIntensity('MEDIUM');
    setIsSunExposed(true);
    setMinWorkers(2);
    setMaxWorkers(4);
    setPrimarySkill('GENERAL_LABOR');
    setSkillCount(1);
    setEarliestStart('07:00:00');
    setDeadlineTime('15:00:00');
    setDependencies([]);
    setEditingTaskId(null);
    setIsModalOpen(false);
    setErrorMsg(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleStartEdit = (t: TaskRecord) => {
    setTitle(t.title);
    setDescription(t.description || '');
    setZoneName(t.zone_name);
    setDurationMinutes(t.estimated_duration_minutes);
    setPhysicalIntensity(t.physical_intensity);
    setIsSunExposed(t.is_sun_exposed);
    setMinWorkers(t.min_workers);
    setMaxWorkers(t.max_workers);
    const primary = t.required_skills && t.required_skills.length > 0 ? t.required_skills[0] : null;
    setPrimarySkill(primary?.skill_id || 'GENERAL_LABOR');
    setSkillCount(primary?.min_skill_count || 1);
    setEarliestStart(t.earliest_start_time || '07:00:00');
    setDeadlineTime(t.deadline_time || '15:00:00');
    setDependencies(t.dependencies || []);
    setEditingTaskId(t.id);
    setIsModalOpen(true);
    setErrorMsg(null);
  };

  const handleToggleDependency = (taskId: string) => {
    setDependencies((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg('Task title is required.');
      return;
    }
    if (durationMinutes <= 0) {
      setErrorMsg('Duration must be greater than 0 minutes.');
      return;
    }
    if (minWorkers <= 0) {
      setErrorMsg('Minimum required workers must be at least 1.');
      return;
    }
    if (maxWorkers < minWorkers) {
      setErrorMsg('Maximum workers must be greater than or equal to minimum workers.');
      return;
    }

    setIsSubmitting(true);

    const required_skills = [
      {
        skill_id: primarySkill,
        min_skill_count: skillCount
      }
    ];

    try {
      if (editingTaskId) {
        const res = await updateTask(editingTaskId, {
          title: title.trim(),
          description: description.trim() || undefined,
          zone_name: zoneName.trim(),
          estimated_duration_minutes: durationMinutes,
          physical_intensity: physicalIntensity,
          is_sun_exposed: isSunExposed,
          min_workers: minWorkers,
          max_workers: maxWorkers,
          earliest_start_time: earliestStart,
          deadline_time: deadlineTime,
          required_skills,
          dependencies
        });
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to update task');
          return;
        }
      } else {
        const res = await createTask(siteId, {
          title: title.trim(),
          description: description.trim() || undefined,
          zone_name: zoneName.trim(),
          estimated_duration_minutes: durationMinutes,
          physical_intensity: physicalIntensity,
          is_sun_exposed: isSunExposed,
          min_workers: minWorkers,
          max_workers: maxWorkers,
          earliest_start_time: earliestStart,
          deadline_time: deadlineTime,
          required_skills,
          dependencies
        });
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to create task');
          return;
        }
      }

      onTasksUpdated();
      resetForm();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }
    const res = await deleteTask(taskId);
    if (res.success) {
      onTasksUpdated();
    } else {
      alert(res.error || 'Failed to delete task');
    }
  };

  const getIntensityBadgeColor = (intensity: string) => {
    switch (intensity) {
      case 'EXTREME':
        return { bg: '#FDF3F2', color: '#C95A4B', border: '#F1C3BE' };
      case 'HEAVY':
        return { bg: '#FEF8EE', color: '#D58A1F', border: '#FCE0B8' };
      case 'MEDIUM':
        return { bg: '#F0F7F4', color: '#2F6B55', border: '#D0E1D9' };
      default:
        return { bg: '#F4F5F4', color: '#66736D', border: '#E3E7E2' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#FFFFFF',
          padding: '1rem 1.25rem',
          borderRadius: '8px',
          border: '1px solid #E3E7E2'
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#17211D', margin: 0 }}>
            Today's Work & Tasks
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#66736D', margin: '2px 0 0' }}>
            {tasks.length === 0
              ? 'No tasks configured for today. Add today’s operations to generate a schedule.'
              : `${tasks.length} planned work tasks across active zones.`}
          </p>
        </div>
        <button
          onClick={handleStartCreate}
          style={{
            padding: '0.55rem 1rem',
            backgroundColor: '#2F6B55',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          <span>+</span> Add Task
        </button>
      </div>

      {/* Task List or Empty State */}
      {tasks.length === 0 ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px dashed #D0D7D2',
            padding: '3.5rem 1.5rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: '#F0F4F2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2F6B55',
              fontSize: '1.25rem',
              marginBottom: '0.75rem'
            }}
          >
            📋
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#17211D', margin: '0 0 0.35rem' }}>
            No work planned for today
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#66736D', maxWidth: '420px', margin: '0 0 1.25rem', lineHeight: 1.4 }}>
            Enter tasks with physical intensity, required trade skills, team sizes, and deadlines to schedule safely.
          </p>
          <button
            onClick={handleStartCreate}
            style={{
              padding: '0.6rem 1.25rem',
              backgroundColor: '#2F6B55',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + Add First Task
          </button>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E3E7E2',
            overflow: 'hidden'
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#F9FAF9', borderBottom: '1px solid #E3E7E2' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Task / Zone
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Workload / Heat
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Team & Skills
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Duration
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Deadline
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, idx) => {
                const intensityStyle = getIntensityBadgeColor(t.physical_intensity);
                const depNames = (t.dependencies || [])
                  .map((depId) => tasks.find((item) => item.id === depId)?.title)
                  .filter(Boolean);

                return (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: idx < tasks.length - 1 ? '1px solid #F0F4F2' : 'none'
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#17211D' }}>{t.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#66736D', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '2px' }}>
                        <span>📍 {t.zone_name}</span>
                        {depNames.length > 0 && (
                          <span style={{ color: '#D58A1F' }}>· Depends on: {depNames.join(', ')}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: intensityStyle.bg,
                            color: intensityStyle.color,
                            border: `1px solid ${intensityStyle.border}`
                          }}
                        >
                          {t.physical_intensity}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#66736D' }}>
                          {t.is_sun_exposed ? '☀️ Sun Exposed' : '🏢 Shaded/Indoor'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontSize: '0.8rem', color: '#17211D', fontWeight: 500 }}>
                        {t.min_workers} {t.min_workers === 1 ? 'worker' : 'workers'} (max {t.max_workers})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '2px' }}>
                        {t.required_skills?.map((s) => (
                          <span
                            key={s.skill_id}
                            style={{
                              backgroundColor: '#E8EFEA',
                              color: '#2F6B55',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '1px 5px',
                              borderRadius: '3px'
                            }}
                          >
                            {s.skill_id} (min {s.min_skill_count})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: '#17211D', fontWeight: 500 }}>
                      {t.estimated_duration_minutes} min
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: '#17211D' }}>
                      <div style={{ fontWeight: 600 }}>{t.deadline_time?.slice(0, 5) || '17:00'}</div>
                      <div style={{ fontSize: '0.7rem', color: '#66736D' }}>from {t.earliest_start_time?.slice(0, 5) || '07:00'}</div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleStartEdit(t)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2F6B55',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          marginRight: '0.75rem'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#C95A4B',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Task Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(23, 33, 29, 0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E3E7E2',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)'
            }}
          >
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid #E3E7E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#17211D', margin: 0 }}>
                  {editingTaskId ? 'Edit Work Task' : 'Add New Work Task'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#66736D', margin: '2px 0 0' }}>
                  Define physical workload intensity, team size, required skills, and hard deadline
                </p>
              </div>
              <button
                onClick={resetForm}
                style={{ background: 'none', border: 'none', color: '#66736D', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {errorMsg && (
                <div style={{ backgroundColor: '#FDF3F2', border: '1px solid #F1C3BE', borderRadius: '6px', padding: '0.6rem 0.8rem', color: '#C95A4B', fontSize: '0.85rem' }}>
                  {errorMsg}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                  Task Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Structural Steel Column Welding"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Zone / Location *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tower Grid B, Foundation Pit"
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Duration (Minutes) *
                  </label>
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
                    required
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Physical Workload Intensity
                  </label>
                  <select
                    value={physicalIntensity}
                    onChange={(e) => setPhysicalIntensity(e.target.value as any)}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', backgroundColor: '#FFFFFF', boxSizing: 'border-box' }}
                  >
                    <option value="LIGHT">Light (Inspection, Wiring)</option>
                    <option value="MEDIUM">Medium (Framing, Assembly)</option>
                    <option value="HEAVY">Heavy (Concrete, Rebar, Roofing)</option>
                    <option value="EXTREME">Extreme (Welding, Intensive Digging)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Solar Exposure
                  </label>
                  <select
                    value={isSunExposed ? 'true' : 'false'}
                    onChange={(e) => setIsSunExposed(e.target.value === 'true')}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', backgroundColor: '#FFFFFF', boxSizing: 'border-box' }}
                  >
                    <option value="true">Direct Sunlight / Outdoor</option>
                    <option value="false">Shaded / Indoor Utility Area</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Required Trade Skill
                  </label>
                  <select
                    value={primarySkill}
                    onChange={(e) => setPrimarySkill(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', backgroundColor: '#FFFFFF', boxSizing: 'border-box' }}
                  >
                    {STANDARD_SKILLS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Min Workers *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={minWorkers}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setMinWorkers(val);
                      if (maxWorkers < val) setMaxWorkers(val);
                      if (skillCount < val) setSkillCount(val);
                    }}
                    required
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Max Workers
                  </label>
                  <input
                    type="number"
                    min={minWorkers}
                    value={maxWorkers}
                    onChange={(e) => setMaxWorkers(parseInt(e.target.value) || minWorkers)}
                    required
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Earliest Start
                  </label>
                  <input
                    type="text"
                    value={earliestStart.slice(0, 5)}
                    onChange={(e) => setEarliestStart(`${e.target.value}:00`)}
                    placeholder="07:00"
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Hard Deadline *
                  </label>
                  <input
                    type="text"
                    value={deadlineTime.slice(0, 5)}
                    onChange={(e) => setDeadlineTime(`${e.target.value}:00`)}
                    placeholder="15:00"
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Precedence Dependencies */}
              {tasks.filter((t) => t.id !== editingTaskId).length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Prerequisite Tasks (Must Complete First)
                  </label>
                  <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid #E3E7E2', borderRadius: '6px', padding: '0.4rem' }}>
                    {tasks
                      .filter((t) => t.id !== editingTaskId)
                      .map((t) => {
                        const isDep = dependencies.includes(t.id);
                        return (
                          <label
                            key={t.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              fontSize: '0.8rem',
                              color: '#17211D',
                              padding: '0.2rem 0.4rem',
                              borderRadius: '4px',
                              backgroundColor: isDep ? '#E8EFEA' : 'transparent',
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isDep}
                              onChange={() => handleToggleDependency(t.id)}
                              style={{ accentColor: '#2F6B55' }}
                            />
                            <span>{t.title}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={resetForm}
                  style={{ padding: '0.55rem 1rem', border: '1px solid #E3E7E2', borderRadius: '6px', backgroundColor: '#FFFFFF', color: '#66736D', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ padding: '0.55rem 1.25rem', borderRadius: '6px', backgroundColor: '#2F6B55', color: '#FFFFFF', border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', opacity: isSubmitting ? 0.7 : 1 }}
                >
                  {isSubmitting ? 'Saving...' : editingTaskId ? 'Save Changes' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
