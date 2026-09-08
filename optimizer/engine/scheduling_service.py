"""
ThermoShift - Scheduling Orchestrator Service

Orchestrates the end-to-end scheduling pipeline:
1. Validates scheduling input payload
2. Loads site, workforce, tasks, resources, and weather via services
3. Assembles the mathematically complete SolverProblemInstance
4. Executes the CP-SAT scheduling engine (Phase 4B-2)
5. Optionally persists the optimized schedule to Supabase
6. Formats clean JSON responses with execution summaries
"""

from typing import Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field

from optimizer.engine.data_models import (
    SafetyPolicy,
    SafetyStandardType
)
from optimizer.engine.exposure_model import (
    DEFAULT_OSHA_WBGT_BANDS,
    DEFAULT_WORK_REST_RULES
)
from optimizer.engine.optimizer_interface import (
    SolverObjectiveMode,
    SolverProblemInstance,
    SolverScheduleOutput
)
from optimizer.engine.scheduler import CPSATSchedulingEngine
from optimizer.engine.site_service import SiteDataService
from optimizer.engine.weather_service import WeatherIntegrationService


class ScheduleGenerationRequest(BaseModel):
    site_id: str = Field(..., alias="siteId")
    date: str
    objective_mode: SolverObjectiveMode = Field(default=SolverObjectiveMode.BALANCED, alias="objectiveMode")
    persist: bool = False

    class Config:
        populate_by_name = True


class ScheduleGenerationResult(BaseModel):
    success: bool
    status: str
    schedule_id: Optional[str] = None
    schedule: Optional[Dict[str, Any]] = None
    summary: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class SchedulingOrchestrationService:
    """
    Core backend orchestrator connecting Supabase, Weather Services, and CP-SAT Optimizer.
    """

    def __init__(self, site_service: Optional[SiteDataService] = None):
        self.site_service = site_service or SiteDataService()

    def generate_schedule(self, req: ScheduleGenerationRequest) -> ScheduleGenerationResult:
        """
        Executes the full end-to-end scheduling orchestration flow.
        """
        # 1. Load Site Profile
        site = self.site_service.get_site(req.site_id)
        if not site:
            return ScheduleGenerationResult(
                success=False,
                status="ERROR",
                reason=f"Site with ID '{req.site_id}' not found."
            )

        # 2. Load Workers & Skills
        workers = self.site_service.get_workers_with_skills(req.site_id)
        if not workers:
            return ScheduleGenerationResult(
                success=False,
                status="ERROR",
                reason=f"No active workers found for site '{req.site_id}'."
            )

        # 3. Load Tasks & Dependencies
        tasks = self.site_service.get_tasks_with_dependencies(req.site_id)
        if not tasks:
            return ScheduleGenerationResult(
                success=False,
                status="ERROR",
                reason=f"No tasks found for site '{req.site_id}'."
            )

        # 4. Load Resources
        resources = self.site_service.get_resources(req.site_id)

        # 5. Load & Discretize Weather Records
        weather_records = self.site_service.get_weather_records(req.site_id, req.date)
        if not weather_records:
            return ScheduleGenerationResult(
                success=False,
                status="ERROR",
                reason=f"No weather observations or forecasts available for site '{req.site_id}' on date '{req.date}'."
            )

        # 6. Safety Policy (Standard OSHA/NIOSH & India MoLE Heat Safety Policy Reference)
        policy = SafetyPolicy(
            policy_id="policy-default-osha",
            name="Default OSHA Occupational Heat Safety Policy",
            standard=SafetyStandardType.OSHA,
            wbgt_bands=DEFAULT_OSHA_WBGT_BANDS,
            work_rest_rules=DEFAULT_WORK_REST_RULES
        )

        try:
            weather_slots = WeatherIntegrationService.generate_weather_slots(
                weather_records=weather_records,
                shift_start_hour=7,
                shift_duration_hours=5,
                slot_interval_minutes=15,
                policy=policy
            )
        except ValueError as ve:
            return ScheduleGenerationResult(
                success=False,
                status="ERROR",
                reason=str(ve)
            )

        # 7. Construct SolverProblemInstance
        problem_instance = SolverProblemInstance(
            site_id=req.site_id,
            shift_date=req.date,
            slot_interval_minutes=15,
            total_slots=len(weather_slots),
            objective_mode=req.objective_mode,
            workers=workers,
            tasks=tasks,
            resources=resources,
            weather_slots=weather_slots,
            safety_policy=policy
        )

        # 8. Execute CP-SAT Scheduling Engine
        solver_output = CPSATSchedulingEngine.solve(problem_instance)

        # 9. Handle Infeasible Status
        if solver_output.status not in ("OPTIMAL", "FEASIBLE"):
            return ScheduleGenerationResult(
                success=False,
                status="INFEASIBLE",
                reason="No feasible schedule exists under current safety, resource, and deadline constraints.",
                details={
                    "solverMessages": solver_output.solver_messages,
                    "unassignedTaskIds": solver_output.unassigned_task_ids,
                    "solveTimeSeconds": solver_output.solve_time_seconds
                }
            )

        # 10. Optional Persistence to Supabase
        schedule_id = None
        if req.persist:
            try:
                schedule_id = self.site_service.persist_schedule(
                    site_id=req.site_id,
                    date_str=req.date,
                    objective_mode=req.objective_mode.value,
                    solver_output=solver_output
                )
            except Exception as e:
                # Log persistence failure, schedule generation succeeded
                schedule_id = None

        # 11. Format Schedule Response Payload
        max_heat_risk = CPSATSchedulingEngine.get_highest_weather_risk(weather_slots).value

        schedule_dict = {
            "scheduleId": schedule_id or f"sched-{req.site_id[:8]}-{req.date}",
            "siteId": req.site_id,
            "date": req.date,
            "objectiveMode": req.objective_mode.value,
            "status": solver_output.status,
            "solveTimeSeconds": solver_output.solve_time_seconds,
            "objectiveValue": solver_output.objective_value,
            "totalTasksScheduled": solver_output.total_tasks_scheduled,
            "totalWorkMinutes": solver_output.total_work_minutes,
            "totalRestMinutes": solver_output.total_rest_minutes,
            "peakShadeUtilization": solver_output.peak_shade_utilization,
            "assignments": [a.model_dump() for a in solver_output.assignments]
        }

        summary_dict = {
            "heatRisk": max_heat_risk,
            "taskCount": len(tasks),
            "workerCount": len(workers),
            "resourceCount": len(resources),
            "peakShadeUtilization": solver_output.peak_shade_utilization,
            "totalWorkMinutes": solver_output.total_work_minutes,
            "totalRestMinutes": solver_output.total_rest_minutes
        }

        return ScheduleGenerationResult(
            success=True,
            status=solver_output.status,
            schedule_id=schedule_id,
            schedule=schedule_dict,
            summary=summary_dict
        )
