/**
 * ThermoShift - Frontend Schedule Import Types
 * Phase 5A: AI PDF Import, Structured Review, and Confirmation
 */

export type PhysicalIntensity = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'EXTREME';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ExtractedTaskCandidate {
  id: string;
  title: string;
  description?: string | null;
  estimated_duration_minutes?: number | null;
  min_workers?: number | null;
  max_workers?: number | null;
  physical_intensity: PhysicalIntensity;
  required_skills: string[];
  dependencies: string[]; // List of task IDs or titles
  earliest_start_time?: string | null;
  deadline_time?: string | null;
  zone_name?: string | null;
  is_sun_exposed: boolean;
  priority: TaskPriority;
  source_reference?: string | { page?: number; snippet?: string; confidence?: number } | null;
  confidence: number; // 0.0 to 1.0
  needs_review: boolean;
  review_reasons: string[];
}

export interface ProjectMetadata {
  project_name: string;
  project_id: string;
  site_name: string;
  schedule_version?: string | null;
  planned_start?: string | null;
  planned_finish?: string | null;
  working_window?: string | null;
  prepared_by?: string | null;
}

export interface ExtractedWorkforceGroup {
  group_name: string;
  skill_category: string;
  headcount: number;
}

export interface ExtractedResourceItem {
  name: string;
  resource_type: string;
  capacity: number;
  notes?: string | null;
}

export interface ScheduleImportExtractResponse {
  success: boolean;
  filename: string;
  page_count: number;
  raw_text_length: number;
  project_metadata?: ProjectMetadata | null;
  workforce_requirements?: ExtractedWorkforceGroup[];
  total_crew_available?: number;
  resources?: ExtractedResourceItem[];
  tasks: ExtractedTaskCandidate[];
  warnings: string[];
  unsupported_elements: string[];
  error?: string;
}

export interface ConfirmedTaskItem {
  temp_id: string;
  title: string;
  description?: string | null;
  estimated_duration_minutes: number;
  min_workers: number;
  max_workers: number;
  physical_intensity: PhysicalIntensity;
  required_skills: string[];
  dependencies: string[];
  earliest_start_time: string;
  deadline_time: string;
  zone_name: string;
  is_sun_exposed: boolean;
  priority: TaskPriority;
  source_reference?: string | { page?: number; snippet?: string; confidence?: number } | null;
}

export interface ScheduleImportConfirmRequest {
  site_id: string;
  tasks: ConfirmedTaskItem[];
  project_metadata?: ProjectMetadata | null;
  workforce_requirements?: ExtractedWorkforceGroup[];
  resources?: ExtractedResourceItem[];
}

export interface ScheduleImportConfirmResponse {
  success: boolean;
  site_id: string;
  created_tasks_count: number;
  created_tasks: Array<{ id: string; title: string }>;
  site?: any;
  workers_created?: number;
  resources_created?: number;
  error?: string;
  details?: Record<string, any>;
}

