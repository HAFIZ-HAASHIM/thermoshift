/**
 * ThermoShift Backend - Schedule Routes
 */

import { Router } from 'express';
import { generateScheduleHandler } from '../controllers/scheduleController';

const router = Router();

router.post('/generate', generateScheduleHandler);

export default router;
