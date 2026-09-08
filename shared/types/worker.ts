/**
 * ThermoShift - Shared Worker Types
 */

export type SkillType = 
  | 'CARPENTRY'
  | 'ELECTRICAL'
  | 'MASONRY'
  | 'HEAVY_MACHINERY'
  | 'GENERAL_LABOR'
  | 'WELDING'
  | 'ROOFING'
  | 'PLUMBING'
  | 'SAFETY_INSPECTION';

export type HeatVulnerabilityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface WorkerHeatProfile {
  acclimatized: boolean;                     // Has worker worked in ambient heat for >14 days?
  heatVulnerability: HeatVulnerabilityLevel; // Operational vulnerability category (LOW, MEDIUM, HIGH, CRITICAL)
  pastHeatIncidents: number;                 // Prior heat-related incident count
  hydrationStatus?: 'OPTIMAL' | 'ADEQUATE' | 'DEHYDRATED';
  customMaxContinuousWorkMinutes?: number;   // Operational override cap if set by supervisor
}

export interface Worker {
  id: string;
  name: string;
  employeeCode: string;
  role: string;
  skills: SkillType[];
  heatProfile: WorkerHeatProfile;
  isActive: boolean;
  avatarUrl?: string;
}
