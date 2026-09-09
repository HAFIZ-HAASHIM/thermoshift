import React, { useEffect, useState } from 'react';
import {
  fetchSites,
  fetchFullSiteData,
  SiteDashboardData,
  SEEDED_SITE_ID,
  SEEDED_DATE
} from './services/siteService';
import { SchedulingApiService } from './services/schedulingService';
import { useScheduleGeneration } from './hooks/useScheduleGeneration';
import {
  SiteRecord,
  TaskRecord,
  ScheduleAssignment,
  ScenarioSimulationRequest,
  ScenarioSimulationResult
} from './types/schedule';

import { Header, AppTab } from './components/Header';
import { TodayConditionsBar } from './components/TodayConditionsBar';
import { HeatTimeline } from './components/HeatTimeline';
import { ReadinessCard } from './components/ReadinessCard';
import { ScheduleGantt } from './components/ScheduleGantt';
import { ScheduleSummary } from './components/ScheduleSummary';
import { DecisionIntelligencePanel } from './components/DecisionIntelligencePanel';
import { InfeasibleAlert } from './components/InfeasibleAlert';
import { ErrorAlert } from './components/ErrorAlert';
import { TaskDetailModal } from './components/TaskDetailModal';
import { WorkerDetailModal } from './components/WorkerDetailModal';
import { ScenarioDrawer } from './components/ScenarioDrawer';
import { ScenarioComparisonView } from './components/ScenarioComparisonView';
import { SiteSwitcherModal } from './components/SiteSwitcherModal';
import { WorkforceManagement } from './components/WorkforceManagement';
import { TaskManagement } from './components/TaskManagement';
import { ResourceManagement } from './components/ResourceManagement';
import { ScheduleImportView } from './components/ScheduleImport/ScheduleImportView';
import { ScheduleExplanationResponse } from './types/decision_intelligence';
import { ErrorBoundary } from './components/ErrorBoundary';
import { safeContainsIgnoreCase } from './utils/formatters';

export const App: React.FC = () => {
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [activeSite, setActiveSite] = useState<SiteRecord | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [dashboardData, setDashboardData] = useState<SiteDashboardData | null>(null);
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<string>(SEEDED_DATE);
  const [showThermalCurve, setShowThermalCurve] = useState<boolean>(false);
  const [isSiteSwitcherOpen, setIsSiteSwitcherOpen] = useState<boolean>(false);
  const [isLoadingSiteData, setIsLoadingSiteData] = useState<boolean>(true);

  // Modals state
  const [selectedTask, setSelectedTask] = useState<{
    task: TaskRecord | null;
    assignment: ScheduleAssignment | null;
  } | null>(null);

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  // Scenario Simulation State (Phase 4E)
  const [isScenarioDrawerOpen, setIsScenarioDrawerOpen] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<ScenarioSimulationResult | null>(null);

  // Decision Intelligence State (Phase 4F)
  const [decisionExplanation, setDecisionExplanation] = useState<ScheduleExplanationResponse | null>(null);
  const [simulationExplanation, setSimulationExplanation] = useState<ScheduleExplanationResponse | null>(null);

  // Hook for schedule generation
  const {
    objectiveMode,
    setObjectiveMode,
    isGenerating,
    schedule,
    summary,
    status,
    errorMessage,
    infeasibleDetails,
    generateSchedule,
    resetSchedule
  } = useScheduleGeneration('BALANCED');

  // 1. Initial load of sites list & health check
  const loadSitesList = async () => {
    try {
      const [allSites, health] = await Promise.all([
        fetchSites(),
        SchedulingApiService.checkHealth()
      ]);
      setSites(allSites);
      setIsBackendHealthy(health.healthy);

      if (allSites.length > 0) {
        const storedSiteId = localStorage.getItem('thermoshift_active_site_id');
        setActiveSite((prev) => {
          if (prev && allSites.find((s) => s.id === prev.id)) return prev;
          if (storedSiteId) {
            const foundStored = allSites.find((s) => s.id === storedSiteId);
            if (foundStored) return foundStored;
          }
          // Check if Riverside Logistics Hub exists
          const riverside = allSites.find((s) => safeContainsIgnoreCase(s?.name, 'riverside') || s.id === 'site-riverside-logistics-01');
          if (riverside) return riverside;
          return null;
        });
      }
    } catch (err) {
      console.error('Failed to initialize sites:', err);
    }
  };

  useEffect(() => {
    loadSitesList();
  }, []);

  // 2. Load active site's complete operational data whenever activeSite or selectedDate changes
  const loadActiveSiteData = async (siteId: string) => {
    setIsLoadingSiteData(true);
    try {
      const data = await fetchFullSiteData(siteId);
      setDashboardData(data);
    } catch (err) {
      console.error('Failed to load site data:', err);
    } finally {
      setIsLoadingSiteData(false);
    }
  };

  useEffect(() => {
    if (activeSite?.id) {
      localStorage.setItem('thermoshift_active_site_id', activeSite.id);
      loadActiveSiteData(activeSite.id);
      resetSchedule();
      setSimulationResult(null);
      setSimulationExplanation(null);
    }
  }, [activeSite?.id, selectedDate]);


  // 3. Fetch explainability whenever schedule updates
  useEffect(() => {
    if (schedule && activeSite?.id) {
      SchedulingApiService.explainSchedule({
        siteId: activeSite.id,
        date: selectedDate,
        objectiveMode,
        schedule
      }).then((expl) => {
        if (expl) {
          setDecisionExplanation(expl);
        }
      });
    } else {
      setDecisionExplanation(null);
    }
  }, [schedule, selectedDate, objectiveMode, activeSite?.id]);

  const handleGenerate = async () => {
    if (!activeSite?.id) return;
    setSimulationResult(null);
    setSimulationExplanation(null);
    await generateSchedule(activeSite.id, selectedDate, false);
  };

  const handleRunSimulation = async (req: ScenarioSimulationRequest) => {
    setIsSimulating(true);
    try {
      const result = await SchedulingApiService.simulateSchedule(req);
      setSimulationResult(result);
      setIsScenarioDrawerOpen(false);

      if (result.success && result.scenarioSchedule) {
        SchedulingApiService.explainSchedule({
          siteId: req.siteId,
          date: req.date,
          objectiveMode: req.objectiveMode || objectiveMode,
          schedule: result.scenarioSchedule,
          baselineSchedule: result.baselineSchedule,
          scenarioDiff: result.comparisonSummary,
          appliedOverrides: result.appliedOverrides
        }).then((expl) => {
          if (expl) {
            setSimulationExplanation(expl);
          }
        });
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetScenario = () => {
    setSimulationResult(null);
    setSimulationExplanation(null);
  };

  const handleSelectTaskFromGantt = (taskId: string, assignment: ScheduleAssignment) => {
    const taskObj = dashboardData?.tasks.find((t) => t.id === taskId) || null;
    setSelectedTask({ task: taskObj, assignment });
  };

  const activeSchedule = simulationResult?.scenarioSchedule || schedule;
  const selectedWorkerObj = dashboardData?.workers.find((w) => w.id === selectedWorkerId) || null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F8F6', color: '#17211D', display: 'flex', flexDirection: 'column' }}>
      {/* 1. Header with Site Selector, Date Picker, and Tab Navigation */}
      <Header
        activeSite={activeSite}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        onOpenSiteSwitcher={() => setIsSiteSwitcherOpen(true)}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'whatif') {
            setIsScenarioDrawerOpen(true);
          } else {
            setActiveTab(tab);
          }
        }}
        isSimulationActive={Boolean(simulationResult)}
        workerCount={dashboardData?.counts.totalWorkers || 0}
        taskCount={dashboardData?.counts.totalTasks || 0}
        resourceCount={dashboardData?.counts.totalResources || 0}
      />

      {/* 2. Main Body Container */}
      <main style={{ maxWidth: '1520px', width: '100%', margin: '0 auto', padding: '1.5rem', flex: 1 }}>
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Today's Conditions Bar */}
            <TodayConditionsBar
              site={activeSite}
              date={selectedDate}
              currentWeather={dashboardData?.weatherRecords?.[0] || null}
              weatherRecords={dashboardData?.weatherRecords || []}
              weatherSource={dashboardData?.weatherSource || 'DATABASE'}
              onToggleThermalCurve={() => setShowThermalCurve(!showThermalCurve)}
              showThermalCurve={showThermalCurve}
            />

            {/* Expandable Thermal Curve */}
            {showThermalCurve && dashboardData?.weatherRecords && dashboardData.weatherRecords.length > 0 && (
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E3E7E2', padding: '1.25rem' }}>
                <HeatTimeline weatherRecords={dashboardData.weatherRecords} />
              </div>
            )}

            {/* Operational Readiness Verification & Dispatch Card */}
            {activeSite && (
              <ReadinessCard
                dashboardData={dashboardData}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onGeneratePlan={handleGenerate}
                isGenerating={isGenerating}
                objectiveMode={objectiveMode}
                setObjectiveMode={setObjectiveMode}
              />
            )}

            {!activeSite && (
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
                    width: '48px',
                    height: '48px',
                    borderRadius: '8px',
                    backgroundColor: '#E8EFEA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2F6B55',
                    fontSize: '1.5rem',
                    marginBottom: '1rem'
                  }}
                >
                  🏗️
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#17211D', margin: '0 0 0.5rem' }}>
                  No worksite configured yet
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#66736D', maxWidth: '460px', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
                  Create your first worksite with location coordinates to load live weather, configure your workforce and tasks, and generate heat-aware work-rest schedules.
                </p>
                <button
                  onClick={() => setIsSiteSwitcherOpen(true)}
                  style={{
                    padding: '0.65rem 1.5rem',
                    backgroundColor: '#2F6B55',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  + Create Your First Worksite
                </button>
              </div>
            )}

            {/* Error or Infeasible Alerts */}
            {status === 'ERROR' && errorMessage && (
              <ErrorAlert status="ERROR" message={errorMessage} onRetry={handleGenerate} />
            )}

            {status === 'INFEASIBLE' && (
              <InfeasibleAlert
                reason={errorMessage || 'No feasible schedule exists under current safety, resource, and deadline constraints.'}
                details={infeasibleDetails}
                onRetry={handleGenerate}
              />
            )}

            {/* Scenario Simulation Active Comparison Banner */}
            {simulationResult && (
              <ScenarioComparisonView
                simulationResult={simulationResult}
                workers={dashboardData?.workers || []}
                tasks={dashboardData?.tasks || []}
                weatherRecords={dashboardData?.weatherRecords || []}
                onExitSimulation={handleResetScenario}
                onOpenScenarioDrawer={() => setIsScenarioDrawerOpen(true)}
                onSelectTask={(taskId) => {
                  const tObj = dashboardData?.tasks.find((t) => t.id === taskId) || null;
                  const asgn = activeSchedule?.assignments.find((a) => a.taskId === taskId) || null;
                  setSelectedTask({ task: tObj, assignment: asgn });
                }}
                onSelectWorker={(workerId) => setSelectedWorkerId(workerId)}
              />
            )}

            {/* Generated Work Plan & Visual Schedule */}
            {activeSchedule ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <ScheduleSummary
                  schedule={activeSchedule}
                  summary={summary}
                  totalWorkers={dashboardData?.counts.totalWorkers || 0}
                  totalTasks={dashboardData?.counts.totalTasks || 0}
                />

                <ScheduleGantt
                  schedule={activeSchedule}
                  workers={dashboardData?.workers || []}
                  tasks={dashboardData?.tasks || []}
                  weatherRecords={dashboardData?.weatherRecords || []}
                  onSelectTask={handleSelectTaskFromGantt}
                  onSelectWorker={(wId) => setSelectedWorkerId(wId)}
                />

                {/* Decision Intelligence Explainability Layer */}
                {(simulationExplanation?.decisionSummary || decisionExplanation?.decisionSummary) && (
                  <DecisionIntelligencePanel
                    summary={(simulationExplanation?.decisionSummary || decisionExplanation?.decisionSummary)!}
                    onSelectTask={(taskId) => {
                      const tObj = dashboardData?.tasks.find((t) => t.id === taskId) || null;
                      const asgn = activeSchedule?.assignments.find((a) => a.taskId === taskId) || null;
                      setSelectedTask({ task: tObj, assignment: asgn });
                    }}
                    onSelectWorker={(workerId) => setSelectedWorkerId(workerId)}
                  />
                )}
              </div>
            ) : (
              /* No Schedule Generated Empty State */
              activeSite && !isGenerating && status !== 'INFEASIBLE' && status !== 'ERROR' && (
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '8px',
                    border: '1px dashed #D0D7D2',
                    padding: '3rem 1.5rem',
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
                      backgroundColor: '#E8EFEA',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2F6B55',
                      fontSize: '1.25rem',
                      marginBottom: '0.75rem'
                    }}
                  >
                    ⚡
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#17211D', margin: '0 0 0.35rem' }}>
                    Your heat-aware work plan hasn't been generated yet
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: '#66736D', maxWidth: '420px', margin: '0 0 1.25rem', lineHeight: 1.4 }}>
                    Click <strong>Generate Work Plan</strong> in the readiness banner above to run the OR-Tools CP-SAT optimizer against today's heat conditions.
                  </p>
                  <button
                    onClick={handleGenerate}
                    style={{
                      padding: '0.65rem 1.5rem',
                      backgroundColor: '#2F6B55',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Generate Work Plan
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* TAB 2: WORKFORCE */}
        {activeTab === 'workforce' && (
          activeSite ? (
            <WorkforceManagement
              siteId={activeSite.id}
              workers={dashboardData?.workers || []}
              onWorkforceUpdated={() => loadActiveSiteData(activeSite.id)}
            />
          ) : (
            <div style={{ backgroundColor: '#FFFFFF', padding: '2rem', borderRadius: '8px', border: '1px solid #E3E7E2', textAlign: 'center' }}>
              <p style={{ color: '#66736D' }}>Please select or create a worksite first.</p>
              <button
                onClick={() => setIsSiteSwitcherOpen(true)}
                style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', backgroundColor: '#2F6B55', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Create Worksite
              </button>
            </div>
          )
        )}

        {/* TAB 3: TASKS */}
        {activeTab === 'tasks' && (
          activeSite ? (
            <TaskManagement
              siteId={activeSite.id}
              tasks={dashboardData?.tasks || []}
              onTasksUpdated={() => loadActiveSiteData(activeSite.id)}
            />
          ) : (
            <div style={{ backgroundColor: '#FFFFFF', padding: '2rem', borderRadius: '8px', border: '1px solid #E3E7E2', textAlign: 'center' }}>
              <p style={{ color: '#66736D' }}>Please select or create a worksite first.</p>
              <button
                onClick={() => setIsSiteSwitcherOpen(true)}
                style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', backgroundColor: '#2F6B55', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Create Worksite
              </button>
            </div>
          )
        )}

        {/* TAB 4: RESOURCES */}
        {activeTab === 'resources' && (
          activeSite ? (
            <ResourceManagement
              siteId={activeSite.id}
              resources={dashboardData?.resources || []}
              onResourcesUpdated={() => loadActiveSiteData(activeSite.id)}
            />
          ) : (
            <div style={{ backgroundColor: '#FFFFFF', padding: '2rem', borderRadius: '8px', border: '1px solid #E3E7E2', textAlign: 'center' }}>
              <p style={{ color: '#66736D' }}>Please select or create a worksite first.</p>
              <button
                onClick={() => setIsSiteSwitcherOpen(true)}
                style={{ marginTop: '0.75rem', padding: '0.5rem 1rem', backgroundColor: '#2F6B55', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Create Worksite
              </button>
            </div>
          )
        )}

        {/* TAB 5: IMPORT SCHEDULE (Phase 5A) */}
        {activeTab === 'import' && (
          <ErrorBoundary fallbackTitle="PDF Schedule Import Error">
            <ScheduleImportView
              activeSite={activeSite}
              availableSkills={[]}
              onSiteChanged={(newSite) => {
                setActiveSite(newSite);
                setSelectedDate('2026-09-15');
                loadSitesList();
                loadActiveSiteData(newSite.id);
              }}
              onScheduleImported={() => {
                loadSitesList();
                if (activeSite) loadActiveSiteData(activeSite.id);
              }}
              onGeneratePlan={() => {
                setActiveTab('dashboard');
                setSelectedDate('2026-09-15');
                if (activeSite) {
                  generateSchedule(activeSite.id, '2026-09-15', true);
                }
              }}
            />
          </ErrorBoundary>
        )}
      </main>


      {/* 3. Site Switcher Modal */}
      <SiteSwitcherModal
        isOpen={isSiteSwitcherOpen}
        onClose={() => setIsSiteSwitcherOpen(false)}
        sites={sites}
        activeSite={activeSite}
        onSelectSite={(site) => {
          setActiveSite(site);
          setIsSiteSwitcherOpen(false);
        }}
        onSitesUpdated={loadSitesList}
      />

      {/* 4. What-If Simulation Drawer */}
      {dashboardData && activeSite && (
        <ScenarioDrawer
          isOpen={isScenarioDrawerOpen}
          onClose={() => setIsScenarioDrawerOpen(false)}
          site={activeSite}
          date={selectedDate}
          workers={dashboardData.workers}
          resources={dashboardData.resources}
          tasks={dashboardData.tasks}
          weatherRecords={dashboardData.weatherRecords}
          baseObjectiveMode={objectiveMode}
          isSimulating={isSimulating}
          onRunSimulation={handleRunSimulation}
          onResetScenario={handleResetScenario}
        />
      )}

      {/* 5. Detail Modals */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask.task}
          assignment={selectedTask.assignment}
          assignedWorkers={
            activeSchedule?.assignments
              .filter((a) => a.taskId === selectedTask.task?.id)
              .map((a) => {
                const w = dashboardData?.workers.find((worker) => worker.id === a.workerId);
                return {
                  id: a.workerId,
                  name: a.workerName || w?.name || a.workerId,
                  role: w?.role || 'Operator',
                  primarySkill: w?.skills?.[0] || 'GENERAL_LABOR'
                };
              }) || []
          }
          taskExplanation={
            selectedTask.task?.id && decisionExplanation?.taskExplanations?.[selectedTask.task.id]
              ? decisionExplanation.taskExplanations[selectedTask.task.id]
              : null
          }
          onClose={() => setSelectedTask(null)}
        />
      )}

      {selectedWorkerObj && (
        <WorkerDetailModal
          worker={selectedWorkerObj}
          assignments={
            activeSchedule?.assignments.filter((a) => a.workerId === selectedWorkerObj.id) || []
          }
          onClose={() => setSelectedWorkerId(null)}
        />
      )}
    </div>
  );
};
