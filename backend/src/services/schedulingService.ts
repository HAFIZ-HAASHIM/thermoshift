/**
 * ThermoShift Backend - Scheduling Orchestration Service
 */

import { SiteService } from './siteService';
import { WeatherService } from './weatherService';
import { OptimizerService } from './optimizerService';

export interface ScheduleRequest {
  siteId: string;
  date: string;
  objectiveMode?: 'FASTEST' | 'SAFEST' | 'BALANCED';
  persist?: boolean;
}

export class SchedulingService {
  private siteService: SiteService;
  private weatherService: WeatherService;
  private optimizerService: OptimizerService;

  constructor(
    siteService?: SiteService,
    weatherService?: WeatherService,
    optimizerService?: OptimizerService
  ) {
    this.siteService = siteService || new SiteService();
    this.weatherService = weatherService || new WeatherService();
    this.optimizerService = optimizerService || new OptimizerService();
  }

  public async generateSchedule(req: ScheduleRequest) {
    // 1. Load site
    const site = await this.siteService.getSite(req.siteId);
    if (!site) {
      return { success: false, status: 'ERROR', statusCode: 404, error: `Site with ID '${req.siteId}' not found.` };
    }

    // 2. Load workforce
    const workers = await this.siteService.getWorkers(req.siteId);
    if (!workers || workers.length === 0) {
      return { success: false, status: 'ERROR', statusCode: 404, error: `No active workers found for site '${req.siteId}'.` };
    }

    // 3. Load tasks
    const tasks = await this.siteService.getTasks(req.siteId);
    if (!tasks || tasks.length === 0) {
      return { success: false, status: 'ERROR', statusCode: 404, error: `No tasks found for site '${req.siteId}'.` };
    }

    // 4. Load resources
    const resources = await this.siteService.getResources(req.siteId);

    // 5. Load weather
    const weatherRecords = await this.siteService.getWeatherRecords(req.siteId, req.date);
    if (!weatherRecords || weatherRecords.length === 0) {
      return { success: false, status: 'ERROR', statusCode: 404, error: `No weather records available for site '${req.siteId}' on date '${req.date}'.` };
    }

    const weatherSlots = this.weatherService.discretizeWeather(weatherRecords, 40);

    // 6. Build Problem Instance
    const problemInstance = {
      site_id: req.siteId,
      shift_date: req.date,
      slot_interval_minutes: 15,
      total_slots: weatherSlots.length,
      objective_mode: req.objectiveMode || 'BALANCED',
      workers,
      tasks,
      resources,
      weather_slots: weatherSlots,
      safety_policy: {
        policy_id: 'policy-default-osha',
        name: 'Default OSHA Heat Safety Policy',
        standard: 'OSHA',
        wbgt_bands: [],
        work_rest_rules: [],
        vulnerability_adjustments: [],
        acclimatization_policy: {
          reference_source: 'NIOSH (2016) Criteria for a Recommended Standard',
          acclimatization_days_threshold: 14,
          unacclimatized_max_continuous_work_minutes: 30,
          unacclimatized_rest_multiplier: 1.5,
          initial_day_max_exposure_pct: 20
        },
        solar_radiation_adjustment_c: 2.5,
        allow_overtime_in_extreme_heat: false
      }
    };

    // 7. Invoke Optimizer
    const solverOutput = await this.optimizerService.runOptimizer(problemInstance);

    if (solverOutput.status !== 'OPTIMAL' && solverOutput.status !== 'FEASIBLE') {
      return {
        success: false,
        status: 'INFEASIBLE',
        statusCode: 422,
        reason: 'No feasible schedule exists under current safety, resource, and deadline constraints.',
        details: {
          solverMessages: solverOutput.solverMessages,
          unassignedTaskIds: solverOutput.unassignedTaskIds,
          solveTimeSeconds: solverOutput.solveTimeSeconds
        }
      };
    }

    // 8. Optional persistence
    let scheduleId = null;
    if (req.persist) {
      scheduleId = await this.siteService.persistSchedule(req.siteId, req.date, req.objectiveMode || 'BALANCED', solverOutput);
    }

    return {
      success: true,
      statusCode: 200,
      schedule: {
        scheduleId: scheduleId || `sched-${req.siteId.slice(0, 8)}-${req.date}`,
        siteId: req.siteId,
        date: req.date,
        objectiveMode: req.objectiveMode || 'BALANCED',
        status: solverOutput.status,
        solveTimeSeconds: solverOutput.solveTimeSeconds,
        objectiveValue: solverOutput.objectiveValue,
        totalTasksScheduled: solverOutput.totalTasksScheduled,
        totalWorkMinutes: solverOutput.totalWorkMinutes,
        totalRestMinutes: solverOutput.totalRestMinutes,
        peakShadeUtilization: solverOutput.peakShadeUtilization,
        assignments: solverOutput.assignments
      },
      summary: {
        heatRisk: weatherSlots[0]?.risk_category || 'MODERATE',
        taskCount: tasks.length,
        workerCount: workers.length,
        resourceCount: resources.length,
        peakShadeUtilization: solverOutput.peakShadeUtilization
      }
    };
  }
}
