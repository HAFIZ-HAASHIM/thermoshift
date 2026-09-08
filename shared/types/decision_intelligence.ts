/**
 * ThermoShift - Decision Intelligence & Schedule Explainability Types
 * 
 * Provides structured schema for deterministic explanation layers,
 * decision factor breakdowns, and task/worker movement rationales.
 */

export type DecisionFactorCategory =
  | 'HEAT'
  | 'WORKFORCE'
  | 'RESOURCE'
  | 'DEPENDENCY'
  | 'DEADLINE'
  | 'RECOVERY'
  | 'OPTIMIZATION';

export type DecisionFactorSeverity = 'INFO' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface DecisionFactor {
  id: string;
  category: DecisionFactorCategory;
  severity: DecisionFactorSeverity;
  title: string;
  explanation: string;
  fact: string;
  reason: string;
  impact: string;
  relatedTaskIds?: string[];
  relatedWorkerIds?: string[];
  relatedResourceIds?: string[];
  evidence?: Record<string, any>;
  source?: string;
}

export interface TaskExplanation {
  taskId: string;
  taskTitle: string;
  startMinute: number;
  endMinute: number;
  startTime: string;
  endTime: string;
  assignedWorkers: string[];
  primaryReason: string;
  factors: DecisionFactor[];
  scenarioDeltaText?: string;
}

export interface WorkerExplanation {
  workerId: string;
  workerName: string;
  assignedTasks: string[];
  totalWorkMinutes: number;
  totalRestMinutes: number;
  mandatoryRestBlocksCount: number;
  reassignmentReason?: string;
  factors: DecisionFactor[];
}

export interface DecisionSummary {
  headline: string;
  subheadline: string;
  objectiveMode: string;
  objectiveModeExplanation: string;
  keyFactors: DecisionFactor[];
  heatImpactSummary: string;
  workforceImpactSummary: string;
  resourceImpactSummary: string;
  deadlineImpactSummary: string;
  recoveryImpactSummary: string;
  completionTimeMinutes: number;
  totalWorkMinutes: number;
  totalRestMinutes: number;
  peakWbgtCelsius: number;
  peakWbgtTime: string;
  peakResourceUtilizationPct: number;
}

export interface ScheduleExplanationRequest {
  siteId?: string;
  date?: string;
  objectiveMode?: string;
  schedule: any; // SolverScheduleOutput
  siteContext?: any;
  baselineSchedule?: any;
  scenarioDiff?: any;
  appliedOverrides?: any;
}

export interface ScheduleExplanationResponse {
  success: boolean;
  decisionSummary: DecisionSummary;
  taskExplanations: Record<string, TaskExplanation>;
  workerExplanations: Record<string, WorkerExplanation>;
  scenarioExplanation?: {
    headline: string;
    narrative: string;
    keyChanges: string[];
    bottleneckFactor?: string;
  };
}
