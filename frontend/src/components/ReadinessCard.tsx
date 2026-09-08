import React from 'react';
import { SiteDashboardData } from '../services/siteService';

interface ReadinessCardProps {
  dashboardData: SiteDashboardData | null;
  onNavigateTab: (tab: 'workforce' | 'tasks' | 'resources') => void;
  onGeneratePlan: () => void;
  isGenerating: boolean;
  objectiveMode: 'FASTEST' | 'BALANCED' | 'SAFEST';
  setObjectiveMode: (mode: 'FASTEST' | 'BALANCED' | 'SAFEST') => void;
}

export const ReadinessCard: React.FC<ReadinessCardProps> = ({
  dashboardData,
  onNavigateTab,
  onGeneratePlan,
  isGenerating,
  objectiveMode,
  setObjectiveMode
}) => {
  if (!dashboardData?.site) {
    return null;
  }

  const { workers, tasks, resources, weatherRecords } = dashboardData;
  const activeWorkers = workers.filter((w) => w.is_active);
  const activeResources = resources.filter((r) => r.is_available);

  // Skill coverage validation
  const missingSkills: string[] = [];
  const workerSkillSet = new Set<string>();
  activeWorkers.forEach((w) => {
    (w.skills || []).forEach((s) => workerSkillSet.add(s.toUpperCase()));
    workerSkillSet.add('GENERAL_LABOR');
  });

  tasks.forEach((t) => {
    (t.required_skills || []).forEach((req) => {
      const skillName = req.skill_id.toUpperCase();
      if (skillName !== 'GENERAL_LABOR' && !workerSkillSet.has(skillName)) {
        if (!missingSkills.includes(req.skill_id)) {
          missingSkills.push(req.skill_id);
        }
      }
    });
  });

  const hasWorkers = activeWorkers.length > 0;
  const hasTasks = tasks.length > 0;
  const hasResources = activeResources.length > 0;
  const hasSkills = missingSkills.length === 0;
  const hasWeather = weatherRecords.length > 0;

  const isReady = hasWorkers && hasTasks && hasResources && hasSkills && hasWeather;

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isReady ? '#2F6B55' : '#D58A1F'
              }}
            />
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#17211D', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Operational Readiness & Dispatch
            </h2>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#66736D', margin: '3px 0 0' }}>
            {isReady
              ? 'All operational constraints, workforce qualifications, and recovery resources verified.'
              : 'Action required before generating heat-aware work plan.'}
          </p>
        </div>

        {/* Priority selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#66736D', fontWeight: 500 }}>Optimization Goal:</span>
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: '#F4F5F4',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid #E3E7E2'
            }}
          >
            {(['FASTEST', 'BALANCED', 'SAFEST'] as const).map((mode) => {
              const isSelected = objectiveMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setObjectiveMode(mode)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#FFFFFF' : 'transparent',
                    color: isSelected ? '#2F6B55' : '#66736D',
                    boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Checklist Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.75rem',
          padding: '0.75rem',
          backgroundColor: '#F9FAF9',
          borderRadius: '6px',
          border: '1px solid #EAEFEA'
        }}
      >
        {/* Workers */}
        <div
          onClick={() => onNavigateTab('workforce')}
          style={{
            cursor: 'pointer',
            padding: '0.5rem 0.75rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: hasWorkers ? '1px solid #D0E1D9' : '1px solid #FCE0B8'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', color: '#66736D', fontWeight: 600 }}>WORKFORCE</span>
            <span style={{ fontSize: '0.8rem' }}>{hasWorkers ? '✓' : '⚠️'}</span>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#17211D', marginTop: '2px' }}>
            {activeWorkers.length} Available
          </div>
          <div style={{ fontSize: '0.7rem', color: hasWorkers ? '#2F6B55' : '#D58A1F' }}>
            {hasWorkers ? 'Roster configured' : 'Add workforce'}
          </div>
        </div>

        {/* Tasks */}
        <div
          onClick={() => onNavigateTab('tasks')}
          style={{
            cursor: 'pointer',
            padding: '0.5rem 0.75rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: hasTasks ? '1px solid #D0E1D9' : '1px solid #FCE0B8'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', color: '#66736D', fontWeight: 600 }}>TODAY'S WORK</span>
            <span style={{ fontSize: '0.8rem' }}>{hasTasks ? '✓' : '⚠️'}</span>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#17211D', marginTop: '2px' }}>
            {tasks.length} Planned Tasks
          </div>
          <div style={{ fontSize: '0.7rem', color: hasTasks ? '#2F6B55' : '#D58A1F' }}>
            {hasTasks ? 'Operations loaded' : 'Add tasks'}
          </div>
        </div>

        {/* Resources */}
        <div
          onClick={() => onNavigateTab('resources')}
          style={{
            cursor: 'pointer',
            padding: '0.5rem 0.75rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: hasResources ? '1px solid #D0E1D9' : '1px solid #FCE0B8'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', color: '#66736D', fontWeight: 600 }}>RECOVERY</span>
            <span style={{ fontSize: '0.8rem' }}>{hasResources ? '✓' : '⚠️'}</span>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#17211D', marginTop: '2px' }}>
            {activeResources.reduce((a, r) => a + r.capacity, 0)} Capacity
          </div>
          <div style={{ fontSize: '0.7rem', color: hasResources ? '#2F6B55' : '#D58A1F' }}>
            {hasResources ? `${activeResources.length} stations active` : 'Configure shade'}
          </div>
        </div>

        {/* Weather */}
        <div
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: hasWeather ? '1px solid #D0E1D9' : '1px solid #FCE0B8'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', color: '#66736D', fontWeight: 600 }}>WEATHER</span>
            <span style={{ fontSize: '0.8rem' }}>{hasWeather ? '✓' : '⚠️'}</span>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#17211D', marginTop: '2px' }}>
            {hasWeather ? `${weatherRecords.length} Intervals` : 'Unavailable'}
          </div>
          <div style={{ fontSize: '0.7rem', color: hasWeather ? '#2F6B55' : '#D58A1F' }}>
            {hasWeather ? 'Forecast synced' : 'Verify site coordinates'}
          </div>
        </div>
      </div>

      {/* Blockers Alert if any */}
      {!isReady && (
        <div
          style={{
            backgroundColor: '#FEF8EE',
            border: '1px solid #FCE0B8',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            fontSize: '0.8rem',
            color: '#D58A1F',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem'
          }}
        >
          <div style={{ fontWeight: 600 }}>Cannot generate schedule yet:</div>
          {!hasWorkers && <div>• No active workers available. Add workers to the roster.</div>}
          {!hasTasks && <div>• No tasks planned for today. Add tasks to be completed.</div>}
          {!hasResources && <div>• No recovery resources configured. Add shade or cooling trailers.</div>}
          {!hasSkills && (
            <div>
              • Missing trade qualifications: No active worker possesses skill(s):{' '}
              <strong>{missingSkills.join(', ')}</strong>.
            </div>
          )}
          {!hasWeather && <div>• Live weather unavailable. Verify site latitude and longitude.</div>}
        </div>
      )}

      {/* Primary Dispatch Action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onGeneratePlan}
          disabled={!isReady || isGenerating}
          style={{
            padding: '0.75rem 1.75rem',
            borderRadius: '6px',
            backgroundColor: isReady ? '#2F6B55' : '#A0AFA7',
            color: '#FFFFFF',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: isReady && !isGenerating ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: isReady ? '0 2px 8px rgba(47,107,85,0.25)' : 'none'
          }}
        >
          {isGenerating ? (
            <>
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  border: '2px solid #FFFFFF',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  display: 'inline-block'
                }}
              />
              SOLVING OR-TOOLS CP-SAT...
            </>
          ) : (
            'GENERATE WORK PLAN'
          )}
        </button>
      </div>
    </div>
  );
};
