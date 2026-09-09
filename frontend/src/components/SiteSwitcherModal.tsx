import React, { useState } from 'react';
import { SiteRecord } from '../types/schedule';
import { createSite, updateSite, deleteSite } from '../services/siteService';

interface SiteSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: SiteRecord[];
  activeSite: SiteRecord | null;
  onSelectSite: (site: SiteRecord) => void;
  onSitesUpdated: () => void;
}

export const SiteSwitcherModal: React.FC<SiteSwitcherModalProps> = ({
  isOpen,
  onClose,
  sites,
  activeSite,
  onSelectSite,
  onSitesUpdated
}) => {
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form fields
  const [name, setName] = useState<string>('');
  const [locationName, setLocationName] = useState<string>('');
  const [latitude, setLatitude] = useState<string>('33.4484');
  const [longitude, setLongitude] = useState<string>('-112.0740');
  const [timezone, setTimezone] = useState<string>('America/Phoenix');
  const [shiftStart, setShiftStart] = useState<string>('07:00:00');
  const [shiftEnd, setShiftEnd] = useState<string>('17:00:00');

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setLocationName('');
    setLatitude('33.4484');
    setLongitude('-112.0740');
    setTimezone('America/Phoenix');
    setShiftStart('07:00:00');
    setShiftEnd('17:00:00');
    setIsCreating(false);
    setEditingSiteId(null);
    setErrorMsg(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleStartEdit = (site: SiteRecord) => {
    setName(site.name);
    setLocationName(site.location_name);
    setLatitude(site.latitude.toString());
    setLongitude(site.longitude.toString());
    setTimezone(site.timezone || 'America/Phoenix');
    setShiftStart(site.shift_start || '07:00:00');
    setShiftEnd(site.shift_end || '17:00:00');
    setEditingSiteId(site.id);
    setIsCreating(false);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const latNum = parseFloat(latitude);
    const lonNum = parseFloat(longitude);

    if (!name.trim()) {
      setErrorMsg('Site name is required.');
      return;
    }
    if (!locationName.trim()) {
      setErrorMsg('Location name is required.');
      return;
    }
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setErrorMsg('Latitude must be a valid number between -90 and 90.');
      return;
    }
    if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
      setErrorMsg('Longitude must be a valid number between -180 and 180.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingSiteId) {
        const res = await updateSite(editingSiteId, {
          name: name.trim(),
          location_name: locationName.trim(),
          latitude: latNum,
          longitude: lonNum,
          timezone,
          shift_start: shiftStart,
          shift_end: shiftEnd
        });
        if (!res.success) {
          setErrorMsg(res.error || 'Failed to update site');
          return;
        }
        if (activeSite?.id === editingSiteId && res.site) {
          onSelectSite(res.site);
        }
      } else {
        const res = await createSite({
          name: name.trim(),
          location_name: locationName.trim(),
          latitude: latNum,
          longitude: lonNum,
          timezone,
          shift_start: shiftStart,
          shift_end: shiftEnd
        });
        if (!res.success || !res.site) {
          setErrorMsg(res.error || 'Failed to create site');
          return;
        }
        onSelectSite(res.site);
      }

      onSitesUpdated();
      resetForm();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (siteId: string) => {
    if (sites.length <= 1) {
      alert('Cannot delete the only remaining site.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this worksite? All associated tasks, workforce, and schedules will be permanently removed.')) {
      return;
    }

    const res = await deleteSite(siteId);
    if (res.success) {
      onSitesUpdated();
      if (activeSite?.id === siteId) {
        const remaining = sites.filter((s) => s.id !== siteId);
        if (remaining.length > 0) onSelectSite(remaining[0]);
      }
    } else {
      alert(res.error || 'Failed to delete site');
    }
  };

  return (
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
        {/* Header */}
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
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#17211D', margin: 0 }}>
              {isCreating ? 'Create New Worksite' : editingSiteId ? 'Edit Worksite' : 'Worksite Selector'}
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#66736D', margin: '2px 0 0' }}>
              {isCreating || editingSiteId
                ? 'Configure geographic location and operational shift hours'
                : 'Select an active worksite to manage operations'}
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#66736D',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '0.25rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                backgroundColor: '#FDF3F2',
                border: '1px solid #F1C3BE',
                borderRadius: '6px',
                padding: '0.75rem 1rem',
                fontSize: '0.85rem',
                color: '#C95A4B',
                marginBottom: '1rem'
              }}
            >
              {errorMsg}
            </div>
          )}

          {isCreating || editingSiteId ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                  Worksite Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Riverside Logistics Hub · Phase 1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    border: '1px solid #E3E7E2',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    color: '#17211D',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                  Location / Region *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Phoenix, AZ or Dubai, UAE"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    border: '1px solid #E3E7E2',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    color: '#17211D',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Latitude (°N) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="33.4484"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.8rem',
                      border: '1px solid #E3E7E2',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      color: '#17211D',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Longitude (°W) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="-112.0740"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.8rem',
                      border: '1px solid #E3E7E2',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      color: '#17211D',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.8rem',
                      border: '1px solid #E3E7E2',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      color: '#17211D',
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="America/Phoenix">America/Phoenix (MST)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                    <option value="America/Chicago">America/Chicago (CST)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#17211D', marginBottom: '0.35rem' }}>
                    Shift Window
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={shiftStart.slice(0, 5)}
                      onChange={(e) => setShiftStart(`${e.target.value}:00`)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.5rem',
                        border: '1px solid #E3E7E2',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        textAlign: 'center'
                      }}
                    />
                    <span style={{ color: '#66736D', fontSize: '0.8rem' }}>to</span>
                    <input
                      type="text"
                      value={shiftEnd.slice(0, 5)}
                      onChange={(e) => setShiftEnd(`${e.target.value}:00`)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.5rem',
                        border: '1px solid #E3E7E2',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        textAlign: 'center'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    padding: '0.6rem 1rem',
                    border: '1px solid #E3E7E2',
                    borderRadius: '6px',
                    backgroundColor: '#FFFFFF',
                    color: '#66736D',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '6px',
                    backgroundColor: '#2F6B55',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: isSubmitting ? 0.7 : 1
                  }}
                >
                  {isSubmitting ? 'Saving...' : editingSiteId ? 'Update Site' : 'Create Site'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#66736D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Registered Sites ({sites.length})
                </span>
                <button
                  onClick={handleStartCreate}
                  style={{
                    padding: '0.4rem 0.75rem',
                    backgroundColor: '#2F6B55',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  + Add Worksite
                </button>
              </div>

              {sites.map((s) => {
                const isActive = activeSite?.id === s.id;
                return (
                  <div
                    key={s.id}
                    style={{
                      border: isActive ? '2px solid #2F6B55' : '1px solid #E3E7E2',
                      borderRadius: '6px',
                      padding: '0.9rem 1rem',
                      backgroundColor: isActive ? '#F7FBF9' : '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div
                      onClick={() => {
                        onSelectSite(s);
                        onClose();
                      }}
                      style={{ cursor: 'pointer', flex: 1 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#17211D' }}>{s.name}</span>
                        {isActive && (
                          <span
                            style={{
                              backgroundColor: '#E8EFEA',
                              color: '#2F6B55',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}
                          >
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#66736D', marginTop: '2px' }}>
                        {s.location_name} · ({Number(s.latitude).toFixed(4)}°, {Number(s.longitude).toFixed(4)}°) · Shift {s.shift_start?.slice(0, 5)}–{s.shift_end?.slice(0, 5)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleStartEdit(s)}
                        style={{
                          background: 'none',
                          border: '1px solid #E3E7E2',
                          borderRadius: '4px',
                          color: '#66736D',
                          fontSize: '0.75rem',
                          padding: '0.3rem 0.6rem',
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        style={{
                          background: 'none',
                          border: '1px solid #F1C3BE',
                          borderRadius: '4px',
                          color: '#C95A4B',
                          fontSize: '0.75rem',
                          padding: '0.3rem 0.6rem',
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
