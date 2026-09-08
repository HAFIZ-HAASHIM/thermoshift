/**
 * ThermoShift - Shared Schedule & Optimization Output Types
 */
import { PhysicalIntensity } from './task';
import { HeatRiskCategory } from './heat';

export type AssignmentType = 'WORK' | 'REST_SHADE' | 'HYDRATION_BREAK' | 'STANDBY';

export interface ScheduleAssignment {
  id: string;
  workerId: string;
  workerName: string;
  taskId?: string;
  taskTitle?: string;
  zoneId: string;
  zoneName: string;
  type: AssignmentType;
  startTime: string;                      // HH:MM or ISO timestamp
  endTime: string;                        // HH:MM or ISO timestamp
  startMinute: number;                    // Minutes from shift start (e.g. 0 to 480)
  endMinute: number;
  durationMinutes: number;
  intensity: PhysicalIntensity;
  predictedWbgt: number;
  heatRisk: HeatRiskCategory;
  hydrationAlert: boolean;
}

export interface OptimizationMetrics {
  totalWorkersAssigned: number;
  totalTasksCompleted: number;
  unassignedTasksCount: number;
  totalRestMinutes: number;
  totalShadeUtilizationPeak: number;
  maxContinuousExposureMinutes: number;
  deadlineMet: boolean;
  solverStatus: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'ERROR';
  solverSolveTimeMs: number;
  reasonsInfeasible?: string[];
}

export interface OptimizedSchedule {
  scheduleId: string;
  siteId: string;
  generatedAt: string;
  shiftDate: string;
  timeSlotIntervalMinutes: number;        // e.g. 15 or 30 minutes
  assignments: ScheduleAssignment[];
  metrics: OptimizationMetrics;
  warnings: string[];
}

export interface OptimizationRequest {
  siteId: string;
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
  workers: any[];
  tasks: any[];
  siteResources: any;
  environmentalForecast: any[];
  constraints?: {
    allowOvertime?: boolean;
    prioritizeDeadlineOverRest?: boolean; // Must ALWAYS default to FALSE (Safety First)
    strictAcclimatizationLimits?: boolean;
  };
}
