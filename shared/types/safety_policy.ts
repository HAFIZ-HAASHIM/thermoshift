/**
 * ThermoShift - Configurable Safety Policy & Threshold Specifications
 * 
 * Safety-critical formulas, WBGT bands, and work-rest cycles are NOT hardcoded.
 * They are defined via configurable safety policies (e.g. OSHA, NIOSH, ACGIH, or Custom).
 */

import { PhysicalIntensity } from './task';
import { HeatRiskCategory } from './heat';
import { HeatVulnerabilityLevel } from './worker';

export type SafetyStandardType = 'OSHA' | 'NIOSH' | 'ACGIH' | 'CUSTOM';

export interface AcclimatizationPolicy {
  referenceSource: string;                 // e.g. "NIOSH (2016) Criteria for a Recommended Standard"
  acclimatizationDaysThreshold: number;   // e.g. 14 days
  unacclimatizedMaxContinuousWorkMinutes: number; // e.g. 30 min
  unacclimatizedRestMultiplier: number;   // e.g. 1.5
  initialDayMaxExposurePct: number;       // e.g. 20%
}

export interface WbgtBandThreshold {
  category: HeatRiskCategory;
  wbgtMinCelsius: number;
  wbgtMaxCelsius: number;
  description: string;
}

export interface WorkRestRule {
  riskCategory: HeatRiskCategory;
  intensity: PhysicalIntensity;
  acclimatized: boolean;
  workMinutes: number;                    // Maximum continuous work duration in minutes
  restMinutes: number;                    // Mandatory shade/cool rest duration in minutes
  mandatoryHydrationMlPerHour: number;    // Recommended water intake (mL/hr)
}

export interface VulnerabilityAdjustment {
  vulnerabilityLevel: HeatVulnerabilityLevel;
  operationalRestMultiplier: number;      // Operational administrative precaution factor
  maxContinuousWorkCapMinutes?: number;   // Optional hard cap on continuous work duration
  description?: string;
}

export interface SafetyPolicy {
  policyId: string;
  name: string;
  standard: SafetyStandardType;
  version: string;
  wbgtBands: WbgtBandThreshold[];
  workRestRules: WorkRestRule[];
  vulnerabilityAdjustments: VulnerabilityAdjustment[];
  acclimatizationPolicy: AcclimatizationPolicy;
  solarRadiationAdjustmentC: number;      // Temperature addition for direct unshaded sun (e.g., +2.0 to +3.5 °C)
  allowOvertimeInExtremeHeat: boolean;    // Safety guardrail: strict block on overtime during extreme heat
}
