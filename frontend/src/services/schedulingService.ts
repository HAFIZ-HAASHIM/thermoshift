/**
 * ThermoShift - Frontend Scheduling API Service
 * Handles communication with the Phase 4C backend orchestration endpoint.
 */

import {
  ScheduleGenerationRequest,
  ScheduleGenerationResponse
} from '../types/schedule';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export class SchedulingApiService {
  /**
   * Invokes the primary backend schedule generation endpoint.
   * Handles HTTP 200 (Success), HTTP 422 (Infeasible), HTTP 400 (Bad Request),
   * HTTP 404 (Not Found), and network exceptions.
   */
  public static async generateSchedule(
    request: ScheduleGenerationRequest
  ): Promise<ScheduleGenerationResponse> {
    const endpoint = `${API_BASE_URL}/api/schedules/generate`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          siteId: request.siteId,
          date: request.date,
          objectiveMode: request.objectiveMode,
          persist: request.persist ?? false
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return {
          success: true,
          status: data.status || 'OPTIMAL',
          schedule: data.schedule,
          summary: data.summary
        };
      }

      if (response.status === 422) {
        // Structured infeasible problem state
        return {
          success: false,
          status: 'INFEASIBLE',
          reason: data.reason || 'No feasible schedule exists under current constraints.',
          details: data.details || {}
        };
      }

      if (response.status === 400) {
        return {
          success: false,
          status: 'BAD_REQUEST',
          error: data.error || 'Invalid scheduling request parameters.',
          reason: data.error
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          status: 'NOT_FOUND',
          error: data.error || 'The requested site or environmental data was not found.',
          reason: data.error
        };
      }

      // Other HTTP errors (500, 502, 504)
      return {
        success: false,
        status: 'SERVER_ERROR',
        error: data.error || data.reason || `Server returned error status ${response.status}.`,
        reason: data.reason
      };
    } catch (err: any) {
      // Network connectivity error
      return {
        success: false,
        status: 'NETWORK_ERROR',
        error: `Could not connect to the ThermoShift backend service at ${API_BASE_URL}. Please ensure the backend server is running.`,
        reason: err?.message || 'Network connection failed.'
      };
    }
  }

  /**
   * Invokes the What-If scenario simulation endpoint (Phase 4E).
   * Runs the SAME existing CP-SAT pipeline on temporary in-memory overrides.
   */
  public static async simulateSchedule(
    request: import('../types/schedule').ScenarioSimulationRequest
  ): Promise<import('../types/schedule').ScenarioSimulationResult> {
    const endpoint = `${API_BASE_URL}/api/schedules/simulate`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(request)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return {
          success: true,
          status: data.status || 'OPTIMAL',
          baselineSchedule: data.baselineSchedule,
          scenarioSchedule: data.scenarioSchedule,
          comparisonSummary: data.comparisonSummary,
          taskDiffs: data.taskDiffs || [],
          appliedOverrides: data.appliedOverrides || {}
        };
      }

      if (response.status === 422) {
        return {
          success: false,
          status: 'INFEASIBLE',
          baselineSchedule: data.baselineSchedule,
          scenarioSchedule: data.scenarioSchedule,
          comparisonSummary: data.comparisonSummary,
          taskDiffs: data.taskDiffs || [],
          appliedOverrides: data.appliedOverrides || {},
          reason: data.reason || 'Scenario is infeasible under current safety constraints.',
          details: data.details || {}
        };
      }

      if (response.status === 400 || response.status === 404) {
        return {
          success: false,
          status: response.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST',
          taskDiffs: [],
          appliedOverrides: {},
          error: data.error || data.reason || 'Invalid simulation request.',
          reason: data.error || data.reason
        };
      }

      return {
        success: false,
        status: 'SERVER_ERROR',
        taskDiffs: [],
        appliedOverrides: {},
        error: data.error || data.reason || `Server returned error status ${response.status}.`,
        reason: data.reason
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'NETWORK_ERROR',
        taskDiffs: [],
        appliedOverrides: {},
        error: `Could not connect to the simulation service at ${API_BASE_URL}.`,
        reason: err?.message || 'Network connection failed.'
      };
    }
  }

  /**
   * Health check to verify backend operational readiness.
   */
  public static async checkHealth(): Promise<{ healthy: boolean; message: string }> {
    try {
      const resp = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
      if (resp.ok) {
        const data = await resp.json();
        return { healthy: true, message: data.service || 'ThermoShift Backend Healthy' };
      }
      return { healthy: false, message: `Backend responded with HTTP ${resp.status}` };
    } catch {
      return { healthy: false, message: 'Backend unreachable' };
    }
  }

  /**
   * Invokes the Decision Intelligence & Explainability endpoint (Phase 4F).
   * Extracts deterministic fact-reason-impact evidence from schedule and solver outputs.
   */
  public static async explainSchedule(
    request: import('../types/decision_intelligence').ScheduleExplanationRequest
  ): Promise<import('../types/decision_intelligence').ScheduleExplanationResponse | null> {
    const endpoint = `${API_BASE_URL}/api/schedules/explain`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        console.warn(`Explainability API returned HTTP ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (data.success) {
        return data as import('../types/decision_intelligence').ScheduleExplanationResponse;
      }
      return null;
    } catch (err) {
      console.warn('Could not fetch decision intelligence explanation:', err);
      return null;
    }
  }
}

