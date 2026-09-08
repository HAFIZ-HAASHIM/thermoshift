import React, { useState } from 'react';
import { ResourceRecord } from '../types/schedule';
import {
  createResource,
  updateResource,
  deleteResource
} from '../services/siteService';

interface ResourceManagementProps {
  siteId: string;
  resources: ResourceRecord[];
  onResourcesUpdated: () => void;
}

export const ResourceManagement: React.FC<ResourceManagementProps> = ({
  siteId,
  resources,
  onResourcesUpdated
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form fields
  const [name, setName] = useState<string>('');
  const [resourceType, setResourceType] = useState<ResourceRecord['resource_type']>('SHADE_STRUCTURE');
  const [zoneName, setZoneName] = useState<string>('Ground Sector');
  const [capacity, setCapacity] = useState<number>(6);
  const [notes, setNotes] = useState<string>('');

  const resetForm = () => {
    setName('');
    setResourceType('SHADE_STRUCTURE');
    setZoneName('Ground Sector');
    setCapacity(6);
    setNotes('');
    setEditingResourceId(null);
    setIsModalOpen(false);
    setErrorMsg(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleStartEdit = (r: ResourceRecord) => {
    setName(r.name);
    setResourceType(r.resource_type);
    setZoneName(r.zone_name);
    setCapacity(r.capacity);
    setNotes(r.notes || '');
    setEditingResourceId(r.id);
    setIsModalOpen(true);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Resource name is required.');
      return;
    }
    if (capacity <= 0) {
      setErrorMsg('Capacity must be at least 1 worker.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingResourceId) {
        const res = await updateResource(editingResourceId, {
          name: name.trim(),
          resource_type: resourceType,
          zone_name: zoneName.trim(),
          capacity,
          notes: notes.trim() || undefined
        });
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to update resource');
          return;
        }
      } else {
        const res = await createResource(siteId, {
          name: name.trim(),
          resource_type: resourceType,
          zone_name: zoneName.trim(),
          capacity,
          notes: notes.trim() || undefined
        });
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to create resource');
          return;
        }
      }

      onResourcesUpdated();
      resetForm();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (resourceId: string) => {
    if (!window.confirm('Are you sure you want to delete this recovery resource?')) {
      return;
    }
    const res = await deleteResource(resourceId);
    if (res.success) {
      onResourcesUpdated();
    } else {
      alert(res.error || 'Failed to delete resource');
    }
  };

  const handleToggleAvailable = async (r: ResourceRecord) => {
    const res = await updateResource(r.id, { is_available: !r.is_available });
    if (res.success) {
      onResourcesUpdated();
    } else {
      alert(res.error || 'Failed to update resource status');
    }
  };

  const getResourceTypeLabel = (type: string) => {
    switch (type) {
      case 'SHADE_STRUCTURE':
        return { label: 'Shade Canopy', icon: '⛺' };
      case 'WATER_STATION':
        return { label: 'Hydration Station', icon: '💧' };
      case 'COOLING_TENT':
        return { label: 'AC Cooling Trailer', icon: '❄️' };
      default:
        return { label: 'Site Resource', icon: '🛠️' };
    }
  };

  const availableCapacity = resources
    .filter((r) => r.is_available)
    .reduce((acc, r) => acc + r.capacity, 0);

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
            Site Recovery Resources
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#66736D', margin: '2px 0 0' }}>
            {resources.length === 0
              ? 'No recovery facilities configured. Add shade and cooling capacity to schedule safely.'
              : `${resources.length} active recovery stations · ${availableCapacity} total concurrent worker capacity`}
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
          <span>+</span> Add Resource
        </button>
      </div>

      {/* Resource List or Empty State */}
      {resources.length === 0 ? (
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
            ⛺
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#17211D', margin: '0 0 0.35rem' }}>
            No recovery resources configured
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#66736D', maxWidth: '420px', margin: '0 0 1.25rem', lineHeight: 1.4 }}>
            Configure shade structures, hydration points, and cooling trailers so the optimizer can schedule compulsory recovery blocks during high WBGT hours.
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
            + Add First Recovery Resource
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
                  Resource / Location
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Type
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Capacity
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase' }}>
                  Availability
                </th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r, idx) => {
                const typeInfo = getResourceTypeLabel(r.resource_type);
                const isAvail = r.is_available;

                return (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: idx < resources.length - 1 ? '1px solid #F0F4F2' : 'none',
                      backgroundColor: isAvail ? '#FFFFFF' : '#FAFAFA',
                      opacity: isAvail ? 1 : 0.65
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#17211D' }}>
                        {typeInfo.icon} {r.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#66736D', marginTop: '2px' }}>
                        📍 {r.zone_name} {r.notes ? `· ${r.notes}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: '#17211D' }}>
                      <span
                        style={{
                          backgroundColor: '#F0F4F2',
                          color: '#2F6B55',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '4px'
                        }}
                      >
                        {typeInfo.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem', color: '#17211D', fontWeight: 600 }}>
                      {r.capacity} workers
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <button
                        onClick={() => handleToggleAvailable(r)}
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
                        onClick={() => handleStartEdit(r)}
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
                        onClick={() => handleDelete(r.id)}
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

      {/* Add / Edit Resource Modal */}
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
              maxWidth: '500px',
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
                  {editingResourceId ? 'Edit Recovery Resource' : 'Add Recovery Resource'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#66736D', margin: '2px 0 0' }}>
                  Define recovery shelter type, location, and concurrent worker capacity
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
                  Resource Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. East Misting Shade Canopy"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Resource Type
                  </label>
                  <select
                    value={resourceType}
                    onChange={(e) => setResourceType(e.target.value as ResourceRecord['resource_type'])}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', backgroundColor: '#FFFFFF', boxSizing: 'border-box' }}
                  >
                    <option value="SHADE_STRUCTURE">Shade Structure / Canopy</option>
                    <option value="WATER_STATION">Hydration Station</option>
                    <option value="COOLING_TENT">AC Cooling Trailer</option>
                    <option value="HEAVY_EQUIPMENT">Heavy Equipment / Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Capacity (Workers) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={capacity}
                    onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
                    required
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                  Zone / Location *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ground Sector East, Level 2 Base"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                  Notes & Equipment Specs
                </label>
                <input
                  type="text"
                  placeholder="e.g. 10x20 pop-up with high-pressure mist nozzles"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E3E7E2', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
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
                  {isSubmitting ? 'Saving...' : editingResourceId ? 'Save Changes' : 'Add Resource'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
