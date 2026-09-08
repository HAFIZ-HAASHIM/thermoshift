import React, { useState, useEffect } from 'react';
import {
  ObjectiveMode,
  SiteRecord,
  WorkerRecord,
  TaskRecord,
  ResourceRecord,
  WeatherObservation,
  ScenarioSimulationRequest
} from '../types/schedule';

interface ScenarioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  site: SiteRecord;
  date: string;
  workers: WorkerRecord[];
  tasks: TaskRecord[];
  resources: ResourceRecord[];
  weatherRecords: WeatherObservation[];
  baseObjectiveMode: ObjectiveMode;
  isSimulating: boolean;
  onRunSimulation: (request: ScenarioSimulationRequest) => void;
  onResetScenario: () => void;
}

export const ScenarioDrawer: React.FC<ScenarioDrawerProps> = ({
  isOpen,
  onClose,
  site,
  date,
  workers,
  tasks,
  resources,
  weatherRecords,
  baseObjectiveMode,
  isSimulating,
  onRunSimulation,
  onResetScenario
}) => {
  // Environmental Overrides
  const [tempDelta, setTempDelta] = useState<number>(0);
  const [humidityDelta, setHumidityDelta] = useState<number>(0);
  const [solarDelta, setSolarDelta] = useState<number>(0);

  // Workforce Overrides
  const [unavailableWorkers, setUnavailableWorkers] = useState<Set<string>>(new Set());

  // Resource Overrides
  const [resourceCapacities, setResourceCapacities] = useState<Record<string, number>>({});

  // Task Deadline Overrides
  const [taskDeadlines, setTaskDeadlines] = useState<Record<string, number>>({});

  // Objective Mode
  const [objectiveMode, setObjectiveMode] = useState<ObjectiveMode>(baseObjectiveMode);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'ENVIRONMENT' | 'WORKFORCE' | 'RESOURCES' | 'DEADLINES'>('ENVIRONMENT');

  useEffect(() => {
    handleReset();
  }, [site.id, date, baseObjectiveMode]);

  const handleReset = () => {
    setTempDelta(0);
    setHumidityDelta(0);
    setSolarDelta(0);
    setUnavailableWorkers(new Set());
    setResourceCapacities({});
    setTaskDeadlines({});
    setObjectiveMode(baseObjectiveMode);
    onResetScenario();
  };

  const toggleWorkerAvailability = (workerId: string) => {
    setUnavailableWorkers((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) {
        next.delete(workerId);
      } else {
        next.add(workerId);
      }
      return next;
    });
  };

  const handleResourceCapacityChange = (resourceId: string, val: number) => {
    setResourceCapacities((prev) => ({
      ...prev,
      [resourceId]: Math.max(0, val)
    }));
  };

  const handleTaskDeadlineChange = (taskId: string, val: number) => {
    setTaskDeadlines((prev) => ({
      ...prev,
      [taskId]: Math.max(15, Math.min(300, val))
    }));
  };

  const handleRun = () => {
    const req: ScenarioSimulationRequest = {
      siteId: site.id,
      date,
      objectiveMode
    };

    if (tempDelta !== 0 || humidityDelta !== 0 || solarDelta !== 0) {
      req.weatherOverrides = {
        temperature_c_delta: tempDelta !== 0 ? tempDelta : undefined,
        relative_humidity_delta: humidityDelta !== 0 ? humidityDelta : undefined,
        solar_radiation_wm2_delta: solarDelta !== 0 ? solarDelta : undefined
      };
    }

    if (unavailableWorkers.size > 0) {
      req.workerOverrides = {
        unavailable_worker_ids: Array.from(unavailableWorkers)
      };
    }

    if (Object.keys(resourceCapacities).length > 0) {
      req.resourceOverrides = {
        resource_capacities: resourceCapacities
      };
    }

    if (Object.keys(taskDeadlines).length > 0) {
      req.taskOverrides = {
        task_deadlines_minutes: taskDeadlines
      };
    }

    onRunSimulation(req);
  };

  const hasOverrides =
    tempDelta !== 0 ||
    humidityDelta !== 0 ||
    solarDelta !== 0 ||
    unavailableWorkers.size > 0 ||
    Object.keys(resourceCapacities).length > 0 ||
    Object.keys(taskDeadlines).length > 0 ||
    objectiveMode !== baseObjectiveMode;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/30 backdrop-blur-2xs flex justify-end">
      <div className="w-full max-w-2xl bg-white border-l border-[#DCE3DF] shadow-xl flex flex-col h-full text-[#17211D] animate-slide-left">
        {/* Drawer Header */}
        <div className="p-5 sm:p-6 border-b border-[#DCE3DF] bg-[#F4F6F5] sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-[#E8F1ED] border border-[#C4DCD0] rounded-lg text-[#176B52]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-[#17211D] flex items-center gap-2">
                  5. What-If Scenario Simulation
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0]">
                    In-Memory
                  </span>
                </h2>
                <p className="text-xs text-[#68736E] mt-0.5">
                  Simulate heat spikes, worker absences, or shade limits without changing production data.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-[#68736E] hover:text-[#17211D] hover:bg-[#DCE3DF]/50 rounded transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex space-x-1 mt-4 bg-[#E8F1ED]/40 p-1 rounded-lg border border-[#DCE3DF]">
            {(
              [
                { id: 'ENVIRONMENT', label: 'Heat & Weather', icon: '🌡️' },
                { id: 'WORKFORCE', label: 'Workforce', icon: '👷' },
                { id: 'RESOURCES', label: 'Shade & Rest', icon: '⛱️' },
                { id: 'DEADLINES', label: 'Deadlines', icon: '⏱️' }
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-[#176B52] border border-[#C4DCD0] shadow-2xs'
                    : 'text-[#68736E] hover:text-[#17211D]'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* TAB 1: ENVIRONMENT */}
          {activeTab === 'ENVIRONMENT' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#F4F6F5] rounded-xl border border-[#DCE3DF] space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold text-[#17211D]">Ambient Temperature Shift (°C)</h3>
                    <p className="text-xs text-[#68736E]">
                      Baseline max: {(weatherRecords.length > 0 ? Math.max(...weatherRecords.map(w => Number(w.temperature_c) || 0), 36.0) : 36.0).toFixed(1)}°C
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border font-mono ${
                    tempDelta > 0
                      ? 'bg-[#FDF1F0] text-[#C85C52] border-[#F3C7C3]'
                      : tempDelta < 0
                      ? 'bg-[#E8F1ED] text-[#4D8A6A] border-[#C4DCD0]'
                      : 'bg-white text-[#17211D] border-[#DCE3DF]'
                  }`}>
                    {tempDelta > 0 ? `+${tempDelta}°C` : `${tempDelta}°C`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-5"
                  max="5"
                  step="0.5"
                  value={tempDelta}
                  onChange={(e) => setTempDelta(parseFloat(e.target.value))}
                  className="w-full h-2 bg-[#DCE3DF] rounded-lg appearance-none cursor-pointer accent-[#176B52]"
                />
                <div className="flex justify-between text-[11px] font-mono text-[#68736E]">
                  <span>-5.0°C (Milder)</span>
                  <span>0.0°C (Baseline)</span>
                  <span>+5.0°C (Heat Spike)</span>
                </div>
              </div>

              <div className="p-4 bg-[#F4F6F5] rounded-xl border border-[#DCE3DF] space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold text-[#17211D]">Relative Humidity Delta (%)</h3>
                    <p className="text-xs text-[#68736E]">Adjust moisture heat stress factor</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border font-mono ${
                    humidityDelta !== 0
                      ? 'bg-[#FAF2E8] text-[#D88A28] border-[#F1D4B0]'
                      : 'bg-white text-[#17211D] border-[#DCE3DF]'
                  }`}>
                    {humidityDelta > 0 ? `+${humidityDelta}%` : `${humidityDelta}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="5"
                  value={humidityDelta}
                  onChange={(e) => setHumidityDelta(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-[#DCE3DF] rounded-lg appearance-none cursor-pointer accent-[#176B52]"
                />
                <div className="flex justify-between text-[11px] font-mono text-[#68736E]">
                  <span>-20% (Drier)</span>
                  <span>0% (Baseline)</span>
                  <span>+20% (Humid)</span>
                </div>
              </div>

              <div className="p-4 bg-[#F4F6F5] rounded-xl border border-[#DCE3DF] space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-bold text-[#17211D]">Solar Radiation Delta (W/m²)</h3>
                    <p className="text-xs text-[#68736E]">Direct sunlight vs cloud cover</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border font-mono ${
                    solarDelta !== 0
                      ? 'bg-[#FAF2E8] text-[#D88A28] border-[#F1D4B0]'
                      : 'bg-white text-[#17211D] border-[#DCE3DF]'
                  }`}>
                    {solarDelta > 0 ? `+${solarDelta} W/m²` : `${solarDelta} W/m²`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-300"
                  max="300"
                  step="50"
                  value={solarDelta}
                  onChange={(e) => setSolarDelta(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-[#DCE3DF] rounded-lg appearance-none cursor-pointer accent-[#176B52]"
                />
                <div className="flex justify-between text-[11px] font-mono text-[#68736E]">
                  <span>-300 W/m² (Overcast)</span>
                  <span>0 (Baseline)</span>
                  <span>+300 W/m² (Clear Sky)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WORKFORCE */}
          {activeTab === 'WORKFORCE' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#DCE3DF]">
                <p className="text-xs text-[#68736E]">
                  Uncheck workers to simulate unannounced absences or redeployments.
                </p>
                <span className="text-xs font-mono font-medium text-[#D88A28] bg-[#FAF2E8] px-2 py-0.5 rounded border border-[#F1D4B0]">
                  {unavailableWorkers.size} unavailable
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {workers.map((w) => {
                  const isExcluded = unavailableWorkers.has(w.id);
                  return (
                    <div
                      key={w.id}
                      onClick={() => toggleWorkerAvailability(w.id)}
                      className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-all select-none ${
                        isExcluded
                          ? 'bg-[#FDF1F0] border-[#F3C7C3] text-[#C85C52]'
                          : 'bg-white border-[#DCE3DF] hover:border-[#BFCBC6] text-[#17211D]'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                          !isExcluded
                            ? 'bg-[#176B52] border-[#176B52] text-white'
                            : 'bg-white border-[#DCE3DF] text-transparent'
                        }`}>
                          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-[#17211D]">{w.name}</span>
                            <span className="text-[10px] font-mono text-[#68736E]">({w.employee_code})</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {w.skills.map((s) => (
                              <span key={s} className="text-[10px] px-1.5 py-0.2 rounded bg-[#F4F6F5] text-[#68736E] font-mono border border-[#DCE3DF]">
                                {s.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                          isExcluded
                            ? 'bg-[#FDF1F0] text-[#C85C52] border-[#F3C7C3]'
                            : 'bg-[#E8F1ED] text-[#4D8A6A] border-[#C4DCD0]'
                        }`}>
                          {isExcluded ? 'Unavailable' : 'Available'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: RESOURCES */}
          {activeTab === 'RESOURCES' && (
            <div className="space-y-3">
              <p className="text-xs text-[#68736E] pb-2 border-b border-[#DCE3DF]">
                Adjust shade stations, misting cooling zones, or hydration capacities.
              </p>

              <div className="space-y-2.5">
                {resources.map((r) => {
                  const currentCap = resourceCapacities[r.id] !== undefined ? resourceCapacities[r.id] : r.capacity;
                  const isModified = resourceCapacities[r.id] !== undefined && resourceCapacities[r.id] !== r.capacity;

                  return (
                    <div
                      key={r.id}
                      className={`p-3.5 rounded-lg border space-y-2.5 transition-all ${
                        isModified
                          ? 'bg-[#FAF2E8]/60 border-[#F1D4B0]'
                          : 'bg-white border-[#DCE3DF]'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="text-xs font-bold text-[#17211D]">{r.name}</h4>
                          <span className="text-[10px] font-mono text-[#68736E]">{r.resource_type} • {r.zone_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#68736E] font-mono">Baseline: {r.capacity}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                            isModified
                              ? 'bg-[#FAF2E8] text-[#D88A28] border-[#F1D4B0]'
                              : 'bg-[#F4F6F5] text-[#17211D] border-[#DCE3DF]'
                          }`}>
                            Scenario: {currentCap}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max={Math.max(10, r.capacity * 2)}
                          step="1"
                          value={currentCap}
                          onChange={(e) => handleResourceCapacityChange(r.id, parseInt(e.target.value, 10))}
                          className="flex-1 h-2 bg-[#DCE3DF] rounded-lg appearance-none cursor-pointer accent-[#176B52]"
                        />
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={currentCap}
                          onChange={(e) => handleResourceCapacityChange(r.id, parseInt(e.target.value, 10) || 0)}
                          className="w-14 px-2 py-1 bg-white border border-[#DCE3DF] rounded text-xs font-mono text-center text-[#17211D] focus:border-[#176B52] focus:outline-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: DEADLINES */}
          {activeTab === 'DEADLINES' && (
            <div className="space-y-3">
              <p className="text-xs text-[#68736E] pb-2 border-b border-[#DCE3DF]">
                Advance or delay task completion deadlines (minutes from 07:00 shift start).
              </p>

              <div className="space-y-2.5">
                {tasks.map((t) => {
                  const currentDeadline = taskDeadlines[t.id] !== undefined ? taskDeadlines[t.id] : 300;
                  const isModified = taskDeadlines[t.id] !== undefined;

                  return (
                    <div
                      key={t.id}
                      className={`p-3.5 rounded-lg border space-y-2.5 transition-all ${
                        isModified
                          ? 'bg-[#FAF2E8]/60 border-[#F1D4B0]'
                          : 'bg-white border-[#DCE3DF]'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="text-xs font-bold text-[#17211D]">{t.title}</h4>
                          <span className="text-[10px] font-mono text-[#68736E]">
                            {t.physical_intensity} • Duration: {t.estimated_duration_minutes}m • Min workers: {t.min_workers}
                          </span>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                          isModified
                            ? 'bg-[#FAF2E8] text-[#D88A28] border-[#F1D4B0]'
                            : 'bg-[#F4F6F5] text-[#17211D] border-[#DCE3DF]'
                        }`}>
                          Deadline: +{currentDeadline}m
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="15"
                          max="300"
                          step="15"
                          value={currentDeadline}
                          onChange={(e) => handleTaskDeadlineChange(t.id, parseInt(e.target.value, 10))}
                          className="flex-1 h-2 bg-[#DCE3DF] rounded-lg appearance-none cursor-pointer accent-[#176B52]"
                        />
                        <span className="text-xs font-mono text-[#68736E] min-w-14 text-right">
                          {Math.floor(currentDeadline / 60)}h {currentDeadline % 60}m
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Objective Mode Selector */}
          <div className="p-4 bg-[#F4F6F5] rounded-xl border border-[#DCE3DF] space-y-2.5">
            <label className="text-xs font-semibold text-[#68736E] block">
              Scenario Optimization Priority
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['FASTEST', 'BALANCED', 'SAFEST'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setObjectiveMode(mode)}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                    objectiveMode === mode
                      ? 'bg-[#176B52] text-white border-[#176B52] shadow-2xs'
                      : 'bg-white border-[#DCE3DF] text-[#68736E] hover:text-[#17211D]'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Drawer Footer / Actions */}
        <div className="p-4 sm:p-5 border-t border-[#DCE3DF] bg-[#F4F6F5] sticky bottom-0 z-10 flex items-center justify-between gap-4">
          <button
            onClick={handleReset}
            disabled={!hasOverrides || isSimulating}
            className="px-4 py-2 rounded-lg border border-[#DCE3DF] text-xs font-medium text-[#68736E] hover:text-[#17211D] hover:bg-[#DCE3DF]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset Overrides
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#DCE3DF] text-xs font-medium text-[#68736E] hover:text-[#17211D] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRun}
              disabled={isSimulating}
              className="px-5 py-2 rounded-lg bg-[#176B52] hover:bg-[#0E4D3B] text-white text-xs font-semibold shadow-xs flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSimulating ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Simulating scenario...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Run Simulation</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
