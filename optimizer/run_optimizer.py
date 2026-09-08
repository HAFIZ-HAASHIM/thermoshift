"""
ThermoShift - Standalone CLI Optimizer Runner (Python <-> Node Bridge)

Accepts a SolverProblemInstance JSON payload via stdin (or file argument),
runs the CP-SAT scheduling engine, and outputs SolverScheduleOutput JSON to stdout.
"""

import os
import sys
import json
from pydantic import ValidationError

# Ensure repository root is in sys.path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from optimizer.engine.optimizer_interface import SolverProblemInstance, SolverScheduleOutput
from optimizer.engine.scheduler import CPSATSchedulingEngine


def main():
    try:
        # Read from file argument or stdin
        if len(sys.argv) > 1 and sys.argv[1] != "-":
            with open(sys.argv[1], "r", encoding="utf-8") as f:
                input_data = f.read()
        else:
            input_data = sys.stdin.read()

        if not input_data or not input_data.strip():
            err_output = SolverScheduleOutput(
                status="ERROR",
                solve_time_seconds=0.0,
                objective_value=None,
                total_tasks_scheduled=0,
                total_work_minutes=0,
                total_rest_minutes=0,
                peak_shade_utilization=0,
                peak_water_utilization=0,
                assignments=[],
                unassigned_task_ids=[],
                solver_messages=["Empty input provided to optimizer."]
            )
            print(err_output.model_dump_json(indent=2))
            sys.exit(1)

        problem_data = json.loads(input_data)
        problem_instance = SolverProblemInstance.model_validate(problem_data)

        output = CPSATSchedulingEngine.solve(problem_instance)
        print(output.model_dump_json(indent=2))
        sys.exit(0)

    except ValidationError as ve:
        err_output = SolverScheduleOutput(
            status="ERROR",
            solve_time_seconds=0.0,
            objective_value=None,
            total_tasks_scheduled=0,
            total_work_minutes=0,
            total_rest_minutes=0,
            peak_shade_utilization=0,
            peak_water_utilization=0,
            assignments=[],
            unassigned_task_ids=[],
            solver_messages=[f"SolverProblemInstance validation error: {str(ve)}"]
        )
        print(err_output.model_dump_json(indent=2))
        sys.exit(1)
    except Exception as e:
        err_output = SolverScheduleOutput(
            status="ERROR",
            solve_time_seconds=0.0,
            objective_value=None,
            total_tasks_scheduled=0,
            total_work_minutes=0,
            total_rest_minutes=0,
            peak_shade_utilization=0,
            peak_water_utilization=0,
            assignments=[],
            unassigned_task_ids=[],
            solver_messages=[f"Unexpected optimizer error: {str(e)}"]
        )
        print(err_output.model_dump_json(indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
