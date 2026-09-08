/**
 * ThermoShift - Frontend Type Definitions
 * Strict types matching Phase 4C API contracts and Supabase relational schema.
 */

export type ObjectiveMode = 'FASTEST' | 'BALANCED' | 'SAFEST';

export type HeatRiskCategory = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'EXTREME';

export type PhysicalIntensity = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'EXTREME';

export type AssignmentType = 'WORK' | 'REST' | 'IDLE';

export interface ScheduleGenerationRequest {
  siteId: string;
  date: string;
  objectiveMode: ObjectiveMode;
  persist?: boolean;
}

export interface ScheduleAssignment {
  assignmentId: string;
  workerId: string;
  workerName: string;
  taskId?: string | null;
  taskTitle?: string | null;
  assignmentType: AssignmentType;
  zoneId?: string | null;
  startMinute: number;
  endMinute: number;
  startTimeStr: string;
  endTimeStr: string;
  intensity?: PhysicalIntensity | string | null;
  resourceId?: string | null;
  resourceType?: string | null;
}

export interface ScheduleOutput {
  scheduleId: string;
  siteId: string;
  date: string;
  objectiveMode: ObjectiveMode;
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'ERROR';
  objectiveValue?: number | null;
  totalTasksScheduled: number;
  totalWorkMinutes: number;
  totalRestMinutes: number;
  peakShadeUtilization: number;
  peakWaterUtilization: number;
  assignments: ScheduleAssignment[];
  solverMessages: string[];
}

export interface ScheduleSummary {
  siteId: string;
  date: string;
  objectiveMode: ObjectiveMode;
  taskCount: number;
  workerCount: number;
  resourceCount: number;
  solveTimeSeconds: number;
}

export interface ScheduleGenerationResponse {
  success: boolean;
  status: string;
  schedule?: ScheduleOutput;
  summary?: ScheduleSummary;
  reason?: string;
  error?: string;
  details?: {
    solverMessages?: string[];
    unassignedTaskIds?: string[];
    solveTimeSeconds?: number;
  };
}

export interface SiteRecord {
  id: string;
  name: string;
  location_name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  shift_start: string;
  shift_end: string;
  is_active: boolean;
}

export interface WorkerRecord {
  id: string;
  employee_code: string;
  name: string;
  role: string;
  is_active: boolean;
  is_acclimatized: boolean;
  vulnerability_rating: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  past_heat_incidents: number;
  skills: string[];
}

export interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  zone_name: string;
  min_workers: number;
  max_workers: number;
  estimated_duration_minutes: number;
  physical_intensity: PhysicalIntensity;
  is_sun_exposed: boolean;
  earliest_start_time: string;
  deadline_time: string;
  priority: string;
  status: string;
  required_skills: { skill_id: string; min_skill_count: number }[];
  dependencies: string[];
}

export interface ResourceRecord {
  id: string;
  name: string;
  resource_type: 'SHADE_STRUCTURE' | 'WATER_STATION' | 'COOLING_TENT' | 'HEAVY_EQUIPMENT';
  zone_name: string;
  capacity: number;
  is_available: boolean;
  notes?: string;
}

export interface WeatherObservation {
  id?: string;
  observation_time: string;
  temperature_c: number;
  relative_humidity_pct: number;
  wind_speed_kmh?: number;
  solar_radiation_wm2?: number;
  direct_sun_exposure: boolean;
  estimated_wbgt_c?: number;
  risk_category?: HeatRiskCategory;
}

export interface WeatherSlot {
  slot_index: number;
  start_minute: number;
  end_minute: number;
  time_str: string;
  temperature_c: number;
  relative_humidity: number;
  solar_radiation_wm2: number;
  wind_speed_kmh: number;
  estimated_wbgt_c: number;
  risk_category: HeatRiskCategory;
}

export type TaskChangeType =
  | 'UNCHANGED'
  | 'MOVED_EARLIER'
  | 'MOVED_LATER'
  | 'WORKERS_CHANGED'
  | 'TIMING_AND_WORKERS_CHANGED'
  | 'NEWLY_UNSCHEDULED'
  | 'NEWLY_SCHEDULED';

export interface WeatherOverrideInput {
  temperature_c_delta?: number;
  temperature_c?: number;
  relative_humidity_delta?: number;
  relative_humidity?: number;
  solar_radiation_wm2_delta?: number;
  solar_radiation_wm2?: number;
  wind_speed_kmh?: number;
  direct_wbgt_c_delta?: number;
}

export interface WorkerAvailabilityOverrideInput {
  unavailable_worker_ids?: string[];
}

export interface ResourceCapacityOverrideInput {
  resource_capacities?: Record<string, number>;
}

export interface TaskDeadlineOverrideInput {
  task_deadlines_minutes?: Record<string, number>;
  task_deadlines_time?: Record<string, string>;
}

export interface ScenarioSimulationRequest {
  siteId: string;
  date: string;
  objectiveMode: ObjectiveMode;
  baseScheduleId?: string;
  weatherOverrides?: WeatherOverrideInput;
  workerOverrides?: WorkerAvailabilityOverrideInput;
  resourceOverrides?: ResourceCapacityOverrideInput;
  taskOverrides?: TaskDeadlineOverrideInput;
}

export interface TaskScheduleDiff {
  task_id: string;
  task_title: string;
  baseline_start_minute?: number;
  baseline_end_minute?: number;
  baseline_start_time?: string;
  baseline_end_time?: string;
  baseline_workers: string[];
  scenario_start_minute?: number;
  scenario_end_minute?: number;
  scenario_start_time?: string;
  scenario_end_time?: string;
  scenario_workers: string[];
  start_delta_minutes: number;
  end_delta_minutes: number;
  workers_added: string[];
  workers_removed: string[];
  change_type: TaskChangeType;
  summary_text: string;
}

export interface ComparisonSummary {
  tasks_changed_count: number;
  workers_affected_count: number;
  work_minutes_delta: number;
  rest_minutes_delta: number;
  peak_shade_delta: number;
  completion_time_delta_minutes: number;
  feasibility_changed: boolean;
  baseline_status: string;
  scenario_status: string;
}

export interface ScenarioSimulationResult {
  success: boolean;
  status: string;
  baselineSchedule?: ScheduleOutput;
  scenarioSchedule?: ScheduleOutput;
  comparisonSummary?: ComparisonSummary;
  taskDiffs: TaskScheduleDiff[];
  appliedOverrides: Record<string, any>;
  reason?: string;
  error?: string;
  details?: {
    solverMessages?: string[];
    unassignedTaskIds?: string[];
    solveTimeSeconds?: number;
  };
}
