/**
 * ThermoShift Backend - Python Optimizer Bridge Service
 * Spawns the CP-SAT optimizer subprocess via stdin/stdout streaming JSON.
 */

import { spawn } from 'child_process';
import path from 'path';

export interface OptimizerExecutionResult {
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'ERROR';
  solveTimeSeconds: number;
  objectiveValue?: number | null;
  totalTasksScheduled: number;
  totalWorkMinutes: number;
  totalRestMinutes: number;
  peakShadeUtilization: number;
  peakWaterUtilization: number;
  assignments: any[];
  unassignedTaskIds: string[];
  solverMessages: string[];
}

export class OptimizerService {
  private pythonBin: string;
  private scriptPath: string;

  constructor() {
    this.pythonBin = process.env.PYTHON_BIN_PATH || 'python';
    this.scriptPath = process.env.OPTIMIZER_SCRIPT_PATH || path.resolve(__dirname, '../../../optimizer/run_optimizer.py');
  }

  public async runOptimizer(problemInstance: any): Promise<OptimizerExecutionResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonBin, [this.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn Python optimizer process: ${err.message}`));
      });

      child.on('close', (code) => {
        if (!stdoutData.trim()) {
          return reject(new Error(`Optimizer process exited with code ${code}: ${stderrData}`));
        }

        try {
          const parsed = JSON.parse(stdoutData);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse optimizer output JSON: ${stdoutData}. Stderr: ${stderrData}`));
        }
      });

      // Write payload to stdin
      child.stdin.write(JSON.stringify(problemInstance));
      child.stdin.end();
    });
  }
}
