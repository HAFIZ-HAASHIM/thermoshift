/**
 * ThermoShift - Shared Task Types
 */
import { SkillType } from './worker';

export type PhysicalIntensity = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'EXTREME';

export type TaskStatus = 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Task {
  id: string;
  title: string;
  description?: string;
  zoneId: string;
  requiredSkills: SkillType[];
  minWorkers: number;
  maxWorkers: number;
  durationMinutes: number;                // Total active work minutes required
  intensity: PhysicalIntensity;           // Affects metabolic rate & heat accumulation
  dependencies: string[];                 // Array of task IDs that must finish before this begins
  earliestStartTime: string;              // ISO timestamp or HH:MM offset
  deadlineTime: string;                   // Project deadline timestamp or HH:MM offset
  isSunExposed: boolean;                  // True if direct sunlight outdoors (high solar radiation)
  status: TaskStatus;
}
