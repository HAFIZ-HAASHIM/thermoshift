/**
 * ThermoShift - Phase 5A Schedule Import Types & Schemas
 */

import { z } from 'zod';

export const PhysicalIntensitySchema = z.enum(['LIGHT', 'MEDIUM', 'HEAVY', 'EXTREME']);
export type PhysicalIntensity = z.infer<typeof PhysicalIntensitySchema>;

export const TaskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const ExtractedTaskCandidateSchema = z.object({
  id: z.string().default(() => `ext-${Math.random().toString(36).substring(2, 9)}`),
  title: z.string().min(1, 'Task title cannot be empty'),
  description: z.string().nullable().optional(),
  estimated_duration_minutes: z.number().int().positive('Duration must be greater than 0 minutes').nullable().optional(),
  min_workers: z.number().int().min(1, 'Minimum workers must be at least 1').nullable().optional(),
  max_workers: z.number().int().min(1).nullable().optional(),
  physical_intensity: PhysicalIntensitySchema.default('MEDIUM'),
  required_skills: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]), // Task IDs or titles of prerequisite tasks
  earliest_start_time: z.string().nullable().optional(),
  deadline_time: z.string().nullable().optional(),
  zone_name: z.string().nullable().optional(),
  is_sun_exposed: z.boolean().default(true),
  priority: TaskPrioritySchema.default('MEDIUM'),
  source_reference: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.85),
  needs_review: z.boolean().default(false),
  review_reasons: z.array(z.string()).default([])
});

export type ExtractedTaskCandidate = z.infer<typeof ExtractedTaskCandidateSchema>;

export const ScheduleImportExtractResponseSchema = z.object({
  success: z.boolean(),
  filename: z.string(),
  page_count: z.number().int().nonnegative(),
  raw_text_length: z.number().int().nonnegative(),
  tasks: z.array(ExtractedTaskCandidateSchema),
  warnings: z.array(z.string()).default([]),
  unsupported_elements: z.array(z.string()).default([]),
  error: z.string().optional()
});

export type ScheduleImportExtractResponse = z.infer<typeof ScheduleImportExtractResponseSchema>;

export const ConfirmedTaskItemSchema = z.object({
  temp_id: z.string(),
  title: z.string().min(1, 'Task title is required'),
  description: z.string().nullable().optional(),
  estimated_duration_minutes: z.number().int().positive(),
  min_workers: z.number().int().min(1),
  max_workers: z.number().int().min(1),
  physical_intensity: PhysicalIntensitySchema,
  required_skills: z.array(z.string()),
  dependencies: z.array(z.string()), // refers to other temp_ids
  earliest_start_time: z.string(),
  deadline_time: z.string(),
  zone_name: z.string(),
  is_sun_exposed: z.boolean(),
  priority: TaskPrioritySchema,
  source_reference: z.string().nullable().optional()
});

export type ConfirmedTaskItem = z.infer<typeof ConfirmedTaskItemSchema>;

export const ScheduleImportConfirmRequestSchema = z.object({
  site_id: z.string().uuid('Invalid site UUID'),
  tasks: z.array(ConfirmedTaskItemSchema).min(1, 'At least one task must be confirmed')
});

export type ScheduleImportConfirmRequest = z.infer<typeof ScheduleImportConfirmRequestSchema>;

export interface ScheduleImportConfirmResponse {
  success: boolean;
  site_id: string;
  created_tasks_count: number;
  created_tasks: Array<{ id: string; title: string }>;
  error?: string;
  details?: Record<string, any>;
}
