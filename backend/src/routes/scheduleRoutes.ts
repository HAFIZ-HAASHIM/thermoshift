/**
 * ThermoShift Backend - Schedule Routes
 * Phase 4C & Phase 5A: Schedule Generation, Simulation & PDF AI Import
 */

import { Router } from 'express';
import multer from 'multer';
import { generateScheduleHandler } from '../controllers/scheduleController';
import {
  extractScheduleHandler,
  validateScheduleHandler,
  confirmScheduleHandler
} from '../controllers/scheduleImportController';

const router = Router();
const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB max file size
});

// Phase 4C: Schedule Generation
router.post('/generate', generateScheduleHandler);

// Phase 5A: PDF Schedule Import & Confirmation Endpoints
router.post('/import/extract', upload.single('file'), extractScheduleHandler);
router.post('/import/validate', validateScheduleHandler);
router.post('/import/confirm', confirmScheduleHandler);

export default router;
