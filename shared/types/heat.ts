/**
 * ThermoShift - Shared Heat & Environmental Types
 * 
 * DISCLAIMER:
 * Environmental indicators (WBGT, Heat Index) are calculated for operational worksite
 * decision-support only. They do not constitute medical diagnoses or clinical guarantees.
 */

export type HeatRiskCategory = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'EXTREME';

export interface EnvironmentalCondition {
  timestamp: string;                      // ISO timestamp or HH:MM
  temperatureC: number;                   // Dry bulb temperature in Celsius
  relativeHumidity: number;               // Percentage 0 - 100
  windSpeedKmh: number;                   // Wind speed in km/h
  solarRadiationWm2: number;              // Solar irradiance in W/m^2
  directSun: boolean;
  wbgtCelsius: number;                    // Calculated Wet-Bulb Globe Temperature (Liljegren / Stull formulation)
  heatIndexCelsius: number;               // Standard NOAA Heat Index (Rothfusz polynomial)
  riskCategory: HeatRiskCategory;
}

export interface HeatMetricsSummary {
  temperatureC: number;
  relativeHumidityPct: number;
  wetBulbC: number;
  heatIndexC: number;
  estimatedWbgtC: number;
  riskCategory: HeatRiskCategory;
  isDirectSun: boolean;
  source: 'CALCULATED_ESTIMATE' | 'SENSOR_OBSERVATION' | 'WEATHER_FORECAST';
}
