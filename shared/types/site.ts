/**
 * ThermoShift - Shared Site & Resource Types
 */

export interface WorkZone {
  id: string;
  name: string;
  hasShadeCover: boolean;
  solarExposureFactor: number;            // 0.0 (full shade/indoor) to 1.0 (full direct sun)
  waterStationNearby: boolean;
  maxWorkerCapacity: number;
}

export interface SiteResources {
  maxShadeAreaWorkers: number;            // Maximum workers who can simultaneously rest in shade
  waterStationsCount: number;             // Number of active water points
  mistingFansActive: number;              // Active cooling points
  coolingStationCapacity: number;         // Air-conditioned / cooled rest capacity
}

export interface WorkSite {
  id: string;
  name: string;
  location: {
    lat: number;
    lng: number;
    address: string;
    timezone: string;
  };
  shiftStart: string;                     // E.g. "07:00"
  shiftEnd: string;                       // E.g. "17:00"
  resources: SiteResources;
  zones: WorkZone[];
}
