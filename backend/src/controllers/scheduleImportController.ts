/**
 * ThermoShift Backend - Schedule Import Controller
 * Phase 5A: PDF Upload, AI Extraction, Dependency Validation, and Supabase Persistence
 */

import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { PdfExtractionService } from '../services/pdfExtractionService';
import { ScheduleImportService } from '../services/scheduleImportService';
import {
  ScheduleImportConfirmRequestSchema,
  ExtractedTaskCandidate
} from '../types/import';

const importService = new ScheduleImportService();

/**
 * Upload & Extract Schedule from PDF
 * Route: POST /api/schedules/import/extract
 */
export async function extractScheduleHandler(req: Request, res: Response) {
  const reqStart = Date.now();
  console.log(`[ScheduleImportController] [DIAGNOSTIC] POST /api/schedules/import/extract received from ${req.ip || 'client'}`);

  try {
    let fileBuffer: Buffer | null = null;
    let filename = 'Uploaded_Schedule.pdf';

    // Check if multipart file uploaded via multer
    if (req.file) {
      fileBuffer = req.file.buffer;
      filename = req.file.originalname || filename;
      console.log(`[ScheduleImportController] [DIAGNOSTIC] Multipart file received: '${filename}' (${(fileBuffer.length / 1024).toFixed(1)} KB, MIME: ${req.file.mimetype})`);
    } else if (req.body && req.body.file_base64) {
      fileBuffer = Buffer.from(req.body.file_base64, 'base64');
      filename = req.body.filename || filename;
      console.log(`[ScheduleImportController] [DIAGNOSTIC] Base64 payload received: '${filename}' (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
    } else {
      console.warn(`[ScheduleImportController] [DIAGNOSTIC] No file attached in request body.`);
      return res.status(400).json({
        success: false,
        error: 'No PDF file provided. Please upload a PDF file or provide file_base64.'
      });
    }

    if (!filename.toLowerCase().endsWith('.pdf')) {
      console.warn(`[ScheduleImportController] [DIAGNOSTIC] Rejected non-PDF filename: '${filename}'`);
      return res.status(400).json({
        success: false,
        error: `Invalid file type for '${filename}'. Only PDF documents (.pdf) are supported.`
      });
    }

    // 1. Extract PDF text & metadata
    console.log(`[ScheduleImportController] [DIAGNOSTIC] Starting PdfExtractionService.extractPdfContent...`);
    const pdfResult = await PdfExtractionService.extractPdfContent(fileBuffer, filename);
    console.log(`[ScheduleImportController] [DIAGNOSTIC] PDF extraction complete: ${pdfResult.pageCount} pages, ${pdfResult.text.length} chars, ${pdfResult.sections.length} sections, ${pdfResult.tables.length} tables.`);

    // 2. Fetch available site skills for catalog matching
    let availableSkills: Array<{ id: string; name: string; category?: string }> = [];
    try {
      const { data: skills } = await supabase.from('skills').select('id, name, category');
      if (skills && skills.length > 0) {
        availableSkills = skills;
      }
    } catch (err: any) {
      console.warn('Could not fetch skills catalog from Supabase, using defaults:', err.message);
    }

    // 3. AI / Deterministic Structured Extraction + Validation + Cycle Detection
    console.log(`[ScheduleImportController] [DIAGNOSTIC] Starting importService.extractScheduleFromPdf...`);
    const extraction = await importService.extractScheduleFromPdf(
      pdfResult,
      filename,
      availableSkills
    );

    const elapsed = Date.now() - reqStart;
    console.log(`[ScheduleImportController] [DIAGNOSTIC] Responding HTTP 200: ${extraction.tasks.length} tasks returned in ${elapsed}ms.`);

    return res.status(200).json({
      success: true,
      filename,
      page_count: pdfResult.pageCount,
      raw_text_length: pdfResult.text.length,
      tasks: extraction.tasks,
      warnings: extraction.warnings,
      unsupported_elements: extraction.unsupported_elements
    });
  } catch (err: any) {
    const elapsed = Date.now() - reqStart;
    console.error(`[ScheduleImportController] [DIAGNOSTIC] Extraction failed after ${elapsed}ms:`, err);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to extract schedule from PDF'
    });
  }
}

/**
 * Validate Edited Candidate Tasks on the fly
 * Route: POST /api/schedules/import/validate
 */
export async function validateScheduleHandler(req: Request, res: Response) {
  try {
    const { tasks } = req.body;
    if (!Array.isArray(tasks)) {
      return res.status(400).json({
        success: false,
        error: "Invalid request: 'tasks' must be an array."
      });
    }

    let availableSkills: Array<{ id: string; name: string }> = [];
    try {
      const { data: skills } = await supabase.from('skills').select('id, name');
      if (skills) availableSkills = skills;
    } catch (e) {}

    const warnings: string[] = [];
    const validated = importService.validateAndNormalizeCandidates(tasks, availableSkills, warnings);

    const hasCycles = warnings.some((w) => w.toLowerCase().includes('circular'));
    const hasUnresolvedErrors = validated.some((t) => t.needs_review && t.review_reasons.some((r) => r.includes('Duplicate') || r.includes('circular')));

    return res.status(200).json({
      success: !hasCycles,
      tasks: validated,
      warnings,
      can_confirm: !hasCycles && !hasUnresolvedErrors
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
}

/**
 * Confirm and Persist Extracted Tasks to Supabase
 * Route: POST /api/schedules/import/confirm
 */
export async function confirmScheduleHandler(req: Request, res: Response) {
  try {
    const parsed = ScheduleImportConfirmRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed on schedule confirmation request',
        details: parsed.error.format()
      });
    }

    const { site_id, tasks } = parsed.data;
    const result = await importService.confirmAndPersistSchedule(site_id, tasks);

    return res.status(201).json(result);
  } catch (err: any) {
    console.error('[ThermoShift] Schedule confirmation failed:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to persist schedule to database'
    });
  }
}
