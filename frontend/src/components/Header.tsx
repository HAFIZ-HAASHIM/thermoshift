import React from 'react';
import { SlidersHorizontal, MapPin, Calendar, Users, ClipboardList, Tent, LayoutDashboard, FileUp } from 'lucide-react';
import { SiteRecord } from '../types/schedule';

export type AppTab = 'dashboard' | 'workforce' | 'tasks' | 'resources' | 'whatif' | 'import';

interface HeaderProps {
  activeSite: SiteRecord | null;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onOpenSiteSwitcher: () => void;
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  isSimulationActive?: boolean;
  workerCount: number;
  taskCount: number;
  resourceCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeSite,
  selectedDate,
  onDateChange,
  onOpenSiteSwitcher,
  activeTab,
  onSelectTab,
  isSimulationActive,
  workerCount,
  taskCount,
  resourceCount
}) => {
  return (
    <header style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E3E7E2', position: 'sticky', top: 0, zIndex: 40 }}>
      {/* Top Bar: Brand, Site Switcher, Date */}
      <div
        style={{
          maxWidth: '1520px',
          margin: '0 auto',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid #F0F4F2'
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: '#E8EFEA',
              border: '1px solid #C4DCD0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2F6B55',
              fontWeight: 800,
              fontSize: '0.8rem',
              letterSpacing: '0.05em'
            }}
          >
            TS
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#17211D', letterSpacing: '-0.02em' }}>
                THERMOSHIFT
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  backgroundColor: '#F4F5F4',
                  color: '#66736D',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  border: '1px solid #E3E7E2'
                }}
              >
                OPERATIONS MVP
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#66736D', margin: 0 }}>
              Heat-Aware Workforce Scheduling & Safety Guidance
            </p>
          </div>
        </div>

        {/* Center / Right: Site Switcher & Date Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Site Selector Button */}
          <button
            onClick={onOpenSiteSwitcher}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#F7F8F6',
              border: '1px solid #E3E7E2',
              borderRadius: '6px',
              padding: '0.45rem 0.8rem',
              cursor: 'pointer',
              color: '#17211D',
              fontSize: '0.8rem',
              fontWeight: 600,
              transition: 'all 0.15s ease'
            }}
          >
            <MapPin size={14} style={{ color: '#2F6B55' }} />
            <span>{activeSite ? activeSite.name : 'Select Worksite'}</span>
            <span style={{ fontSize: '0.7rem', color: '#66736D', fontWeight: 400 }}>
              ({activeSite?.location_name || 'No site'})
            </span>
            <span style={{ fontSize: '0.7rem', color: '#2F6B55', marginLeft: '4px', textDecoration: 'underline' }}>
              Change
            </span>
          </button>

          {/* Date Picker */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E3E7E2',
              borderRadius: '6px',
              padding: '0.35rem 0.65rem'
            }}
          >
            <Calendar size={13} style={{ color: '#66736D' }} />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              style={{
                border: 'none',
                backgroundColor: 'transparent',
                color: '#17211D',
                fontSize: '0.8rem',
                fontFamily: 'inherit',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div
        style={{
          maxWidth: '1520px',
          margin: '0 auto',
          padding: '0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          overflowX: 'auto'
        }}
      >
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {/* Dashboard Tab */}
          <button
            onClick={() => onSelectTab('dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 1rem',
              fontSize: '0.825rem',
              fontWeight: activeTab === 'dashboard' ? 700 : 500,
              color: activeTab === 'dashboard' ? '#2F6B55' : '#66736D',
              borderBottom: activeTab === 'dashboard' ? '2px solid #2F6B55' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer'
            }}
          >
            <LayoutDashboard size={14} />
            <span>Dashboard</span>
          </button>

          {/* Workforce Tab */}
          <button
            onClick={() => onSelectTab('workforce')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 1rem',
              fontSize: '0.825rem',
              fontWeight: activeTab === 'workforce' ? 700 : 500,
              color: activeTab === 'workforce' ? '#2F6B55' : '#66736D',
              borderBottom: activeTab === 'workforce' ? '2px solid #2F6B55' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer'
            }}
          >
            <Users size={14} />
            <span>Workforce</span>
            <span
              style={{
                fontSize: '0.7rem',
                backgroundColor: activeTab === 'workforce' ? '#E8EFEA' : '#F4F5F4',
                color: activeTab === 'workforce' ? '#2F6B55' : '#66736D',
                padding: '1px 5px',
                borderRadius: '10px',
                fontWeight: 600
              }}
            >
              {workerCount}
            </span>
          </button>

          {/* Tasks Tab */}
          <button
            onClick={() => onSelectTab('tasks')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 1rem',
              fontSize: '0.825rem',
              fontWeight: activeTab === 'tasks' ? 700 : 500,
              color: activeTab === 'tasks' ? '#2F6B55' : '#66736D',
              borderBottom: activeTab === 'tasks' ? '2px solid #2F6B55' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer'
            }}
          >
            <ClipboardList size={14} />
            <span>Today's Work</span>
            <span
              style={{
                fontSize: '0.7rem',
                backgroundColor: activeTab === 'tasks' ? '#E8EFEA' : '#F4F5F4',
                color: activeTab === 'tasks' ? '#2F6B55' : '#66736D',
                padding: '1px 5px',
                borderRadius: '10px',
                fontWeight: 600
              }}
            >
              {taskCount}
            </span>
          </button>

          {/* Resources Tab */}
          <button
            onClick={() => onSelectTab('resources')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 1rem',
              fontSize: '0.825rem',
              fontWeight: activeTab === 'resources' ? 700 : 500,
              color: activeTab === 'resources' ? '#2F6B55' : '#66736D',
              borderBottom: activeTab === 'resources' ? '2px solid #2F6B55' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer'
            }}
          >
            <Tent size={14} />
            <span>Resources</span>
            <span
              style={{
                fontSize: '0.7rem',
                backgroundColor: activeTab === 'resources' ? '#E8EFEA' : '#F4F5F4',
                color: activeTab === 'resources' ? '#2F6B55' : '#66736D',
                padding: '1px 5px',
                borderRadius: '10px',
                fontWeight: 600
              }}
            >
              {resourceCount}
            </span>
          </button>

          {/* Import Schedule Tab (Phase 5A) */}
          <button
            onClick={() => onSelectTab('import')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 1rem',
              fontSize: '0.825rem',
              fontWeight: activeTab === 'import' ? 700 : 500,
              color: activeTab === 'import' ? '#2F6B55' : '#66736D',
              borderBottom: activeTab === 'import' ? '2px solid #2F6B55' : '2px solid transparent',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer'
            }}
          >
            <FileUp size={14} />
            <span>Import Schedule</span>
            <span
              style={{
                fontSize: '0.65rem',
                backgroundColor: '#E8EFEA',
                color: '#2F6B55',
                padding: '1px 4px',
                borderRadius: '4px',
                fontWeight: 700
              }}
            >
              AI
            </span>
          </button>
        </div>

        {/* What-If CTA in nav bar */}
        <div style={{ padding: '0.35rem 0' }}>
          <button
            onClick={() => onSelectTab('whatif')}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: isSimulationActive ? '1px solid #F1D4B0' : '1px solid #E3E7E2',
              backgroundColor: isSimulationActive ? '#FAF2E8' : '#FFFFFF',
              color: isSimulationActive ? '#D58A1F' : '#17211D',
              fontSize: '0.775rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer'
            }}
          >
            <SlidersHorizontal size={13} style={{ color: isSimulationActive ? '#D58A1F' : '#2F6B55' }} />
            <span>{isSimulationActive ? 'Scenario Active' : 'What-If Simulation'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
