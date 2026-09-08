/**
 * ThermoShift Backend - Schedule Controller
 */

import { Request, Response } from 'express';
import { SchedulingService } from '../services/schedulingService';

const schedulingService = new SchedulingService();

export async function generateScheduleHandler(req: Request, res: Response) {
  try {
    const { siteId, date, objectiveMode, persist } = req.body;

    if (!siteId || typeof siteId !== 'string' || !siteId.trim()) {
      return res.status(400).json({
        success: false,
        error: "Invalid request: 'siteId' is required and must be a non-empty string."
      });
    }

    if (!date || typeof date !== 'string' || !date.trim()) {
      return res.status(400).json({
        success: false,
        error: "Invalid request: 'date' is required and must be a valid date string (YYYY-MM-DD)."
      });
    }

    const validModes = ['FASTEST', 'SAFEST', 'BALANCED'];
    const mode = (objectiveMode || 'BALANCED').toUpperCase();
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid objectiveMode '${objectiveMode}'. Must be one of: FASTEST, SAFEST, BALANCED.`
      });
    }

    const result = await schedulingService.generateSchedule({
      siteId: siteId.trim(),
      date: date.trim(),
      objectiveMode: mode as any,
      persist: Boolean(persist)
    });

    if (!result.success) {
      return res.status(result.statusCode || 400).json(result);
    }

    return res.status(200).json({
      success: true,
      schedule: result.schedule,
      summary: result.summary
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Unexpected backend error: ${err.message}`
    });
  }
}
