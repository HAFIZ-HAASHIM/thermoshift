/**
 * ThermoShift - Schedule Generation Hook
 * Orchestrates schedule generation API calls, objective selection, and error/infeasible state management.
 */

import { useState, useCallback } from 'react';
import {
  ObjectiveMode,
  ScheduleOutput,
  ScheduleSummary,
  ScheduleGenerationResponse
} from '../types/schedule';
import { SchedulingApiService } from '../services/schedulingService';

export interface UseScheduleGenerationState {
  objectiveMode: ObjectiveMode;
  setObjectiveMode: (mode: ObjectiveMode) => void;
  isGenerating: boolean;
  schedule: ScheduleOutput | null;
  summary: ScheduleSummary | null;
  status: 'IDLE' | 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'ERROR' | 'BAD_REQUEST' | 'NOT_FOUND' | 'NETWORK_ERROR';
  errorMessage: string | null;
  infeasibleDetails: {
    solverMessages?: string[];
    unassignedTaskIds?: string[];
    solveTimeSeconds?: number;
  } | null;
  generateSchedule: (siteId: string, date: string, persist?: boolean) => Promise<void>;
  resetSchedule: () => void;
}

export function useScheduleGeneration(initialMode: ObjectiveMode = 'BALANCED'): UseScheduleGenerationState {
  const [objectiveMode, setObjectiveMode] = useState<ObjectiveMode>(initialMode);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [schedule, setSchedule] = useState<ScheduleOutput | null>(null);
  const [summary, setSummary] = useState<ScheduleSummary | null>(null);
  const [status, setStatus] = useState<UseScheduleGenerationState['status']>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infeasibleDetails, setInfeasibleDetails] = useState<UseScheduleGenerationState['infeasibleDetails']>(null);

  const generateSchedule = useCallback(
    async (siteId: string, date: string, persist: boolean = false) => {
      setIsGenerating(true);
      setErrorMessage(null);
      setInfeasibleDetails(null);

      try {
        const response: ScheduleGenerationResponse = await SchedulingApiService.generateSchedule({
          siteId,
          date,
          objectiveMode,
          persist
        });

        if (response.success && response.schedule) {
          setSchedule(response.schedule);
          setSummary(response.summary || null);
          setStatus(response.schedule.status as any);
        } else if (response.status === 'INFEASIBLE') {
          setSchedule(null);
          setSummary(null);
          setStatus('INFEASIBLE');
          setErrorMessage(response.reason || 'No feasible schedule exists under current constraints.');
          setInfeasibleDetails(response.details || null);
        } else {
          setSchedule(null);
          setSummary(null);
          setStatus(response.status as any || 'ERROR');
          setErrorMessage(response.error || response.reason || 'Failed to generate schedule.');
        }
      } catch (err: any) {
        setSchedule(null);
        setSummary(null);
        setStatus('ERROR');
        setErrorMessage(err?.message || 'Unexpected error occurred while generating schedule.');
      } finally {
        setIsGenerating(false);
      }
    },
    [objectiveMode]
  );

  const resetSchedule = useCallback(() => {
    setSchedule(null);
    setSummary(null);
    setStatus('IDLE');
    setErrorMessage(null);
    setInfeasibleDetails(null);
  }, []);

  return {
    objectiveMode,
    setObjectiveMode,
    isGenerating,
    schedule,
    summary,
    status,
    errorMessage,
    infeasibleDetails,
    generateSchedule,
    resetSchedule
  };
}
