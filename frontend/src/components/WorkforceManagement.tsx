import React, { useState } from 'react';
import { WorkerRecord } from '../types/schedule';
import {
  createWorker,
  updateWorker,
  deleteWorker,
  toggleWorkerAvailability,
  STANDARD_SKILLS
} from '../services/siteService';

interface WorkforceManagementProps {
  siteId: string;
  workers: WorkerRecord[];
  onWorkforceUpdated: () => void;
}

export const WorkforceManagement: React.FC<WorkforceManagementProps> = ({
  siteId,
  workers,
  onWorkforceUpdated
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form fields
  const [name, setName] = useState<string>('');
  const [role, setRole] = useState<string>('');
  const [employeeCode, setEmployeeCode] = useState<string>('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isAcclimatized, setIsAcclimatized] = useState<boolean>(true);
  const [vulnerabilityRating, setVulnerabilityRating] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('LOW');

  const resetForm = () => {
    setName('');
    setRole('');
    setEmployeeCode('');
    setSelectedSkills([]);
    setIsAcclimatized(true);
    setVulnerabilityRating('LOW');
    setEditingWorkerId(null);
    setIsModalOpen(false);
    setErrorMsg(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleStartEdit = (w: WorkerRecord) => {
    setName(w.name);
    setRole(w.role);
    setEmployeeCode(w.employee_code);
    setSelectedSkills(w.skills || []);
    setIsAcclimatized(w.is_acclimatized);
    setVulnerabilityRating(w.vulnerability_rating);
    setEditingWorkerId(w.id);
    setIsModalOpen(true);
    setErrorMsg(null);
  };

  const handleToggleSkill = (skillId: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((s) => s !== skillId) : [...prev, skillId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Worker name is required.');
      return;
    }
    if (!role.trim()) {
      setErrorMsg('Worker role / trade is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingWorkerId) {
        const res = await updateWorker(editingWorkerId, {
          name: name.trim(),
          role: role.trim(),
          employee_code: employeeCode.trim() || undefined,
          skills: selectedSkills,
          is_acclimatized: isAcclimatized,
          vulnerability_rating: vulnerabilityRating
        });
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to update worker');
          return;
        }
      } else {
        const res = await createWorker(siteId, {
          name: name.trim(),
          role: role.trim(),
          employee_code: employeeCode.trim() || undefined,
          skills: selectedSkills,
          is_acclimatized: isAcclimatized,
          vulnerability_rating: vulnerabilityRating
        });
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to add worker');
          return;
        }
      }

      onWorkforceUpdated();
      resetForm();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (workerId: string) => {
    if (!window.confirm('Are you sure you want to remove this worker from the site workforce?')) {
      return;
    }
    const res = await deleteWorker(workerId);
    if (res.success) {
      onWorkforceUpdated();
    } else {
      alert(res.error || 'Failed to delete worker');
    }
  };

  const handleToggleActive = async (workerId: string, currentStatus: boolean) => {
    const res = await toggleWorkerAvailability(workerId, !currentStatus);
    if (res.success) {
      onWorkforceUpdated();
    } else {
      alert(res.error || 'Failed to change worker availability');
    }
  };

  const activeCount = workers.filter((w) => w.is_active).length;

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
            Site Workforce Roster
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#66736D', margin: '2px 0 0' }}>
            {workers.length === 0
              ? 'No workers registered yet. Add your workforce to enable schedule generation.'
              : `${activeCount} of ${workers.length} workers available for today's work.`}
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
          <span>+</span> Add Worker
        </button>
      </div>

      {/* Workforce Table or Empty State */}
      {workers.length === 0 ? (
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
            👥
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#17211D', margin: '0 0 0.35rem' }}>
            No workforce configured
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#66736D', maxWidth: '400px', margin: '0 0 1.25rem', lineHeight: 1.4 }}>
            Add operators, tradespeople, and technicians with their qualifications to generate a heat-aware work plan.
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
            + Add First Worker
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
                  Worker
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Role / Trade
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Assigned Skills
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Heat Sensitivity
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Today's Status
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w, idx) => {
                const isAvail = w.is_active;
                return (
                  <tr
                    key={w.id}
                    style={{
                      borderBottom: idx < workers.length - 1 ? '1px solid #F0F4F2' : 'none',
                      backgroundColor: isAvail ? '#FFFFFF' : '#FAFAFA',
                      opacity: isAvail ? 1 : 0.65
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#17211D' }}>{w.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#66736D' }}>{w.employee_code || `EMP-${w.id.slice(0, 4)}`}</div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: '#17211D' }}>
                      {w.role}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {w.skills && w.skills.length > 0 ? (
                          w.skills.map((s) => (
                            <span
                              key={s}
                              style={{
                                backgroundColor: '#E8EFEA',
                                color: '#2F6B55',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}
                            >
                              {s}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>No specialized skills</span>
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
                            backgroundColor:
                              w.vulnerability_rating === 'HIGH' || w.vulnerability_rating === 'CRITICAL'
                                ? '#FDF3F2'
                                : w.vulnerability_rating === 'MEDIUM'
                                ? '#FEF8EE'
                                : '#F0F7F4',
                            color:
                              w.vulnerability_rating === 'HIGH' || w.vulnerability_rating === 'CRITICAL'
                                ? '#C95A4B'
                                : w.vulnerability_rating === 'MEDIUM'
                                ? '#D58A1F'
                                : '#2F6B55'
                          }}
                        >
                          {w.vulnerability_rating}
                        </span>
                        {!w.is_acclimatized && (
                          <span
                            title="Worker is not acclimatized to heat (requires gradual exposure limits)"
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              backgroundColor: '#FEF8EE',
                              color: '#D58A1F',
                              padding: '2px 5px',
                              borderRadius: '4px'
                            }}
                          >
                            Unacclimatized
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <button
                        onClick={() => handleToggleActive(w.id, isAvail)}
                        style={{
                          background: 'none',
                          border: isAvail ? '1px solid #D0E1D9' : '1px solid #E3E7E2',
                          borderRadius: '12px',
                          padding: '3px 8px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          backgroundColor: isAvail ? '#E8EFEA' : '#F4F5F4',
                          color: isAvail ? '#2F6B55' : '#66736D',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: isAvail ? '#2F6B55' : '#9CA3AF'
                          }}
                        />
                        {isAvail ? 'Available' : 'Unavailable'}
                      </button>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleStartEdit(w)}
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
                        onClick={() => handleDelete(w.id)}
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

      {/* Add / Edit Worker Modal */}
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
              maxWidth: '520px',
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
                  {editingWorkerId ? 'Edit Worker Profile' : 'Add New Worker'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#66736D', margin: '2px 0 0' }}>
                  Configure role, trade skills, and heat acclimatization baseline
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

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Marcus Vance"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Employee Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. EMP-104"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                  Role / Primary Trade *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Structural Welder, Lead Mason, Electrician"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                  Assigned Skills & Certifications
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', maxHeight: '140px', overflowY: 'auto', border: '1px solid #E3E7E2', borderRadius: '6px', padding: '0.5rem' }}>
                  {STANDARD_SKILLS.map((s) => {
                    const isChecked = selectedSkills.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.8rem',
                          color: '#17211D',
                          cursor: 'pointer',
                          padding: '0.25rem 0.4rem',
                          borderRadius: '4px',
                          backgroundColor: isChecked ? '#E8EFEA' : 'transparent'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSkill(s.id)}
                          style={{ accentColor: '#2F6B55' }}
                        />
                        <span>{s.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Heat Acclimatization
                  </label>
                  <select
                    value={isAcclimatized ? 'true' : 'false'}
                    onChange={(e) => setIsAcclimatized(e.target.value === 'true')}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', backgroundColor: '#FFFFFF', boxSizing: 'border-box' }}
                  >
                    <option value="true">Acclimatized (Full exposure)</option>
                    <option value="false">Unacclimatized (Strict limits)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Vulnerability Rating
                  </label>
                  <select
                    value={vulnerabilityRating}
                    onChange={(e) => setVulnerabilityRating(e.target.value as any)}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', backgroundColor: '#FFFFFF', boxSizing: 'border-box' }}
                  >
                    <option value="LOW">Low Risk</option>
                    <option value="MEDIUM">Medium Risk</option>
                    <option value="HIGH">High Sensitivity</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

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
                  {isSubmitting ? 'Saving...' : editingWorkerId ? 'Save Changes' : 'Add Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
