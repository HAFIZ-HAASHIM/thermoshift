"""
ThermoShift - Backend Orchestration & Scheduling API Service (FastAPI)

Endpoints:
- POST /api/schedules/generate (Primary scheduling orchestration endpoint)
- GET  /api/sites (List available work sites)
- GET  /health (Service health check)
"""

import os
import logging
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger("thermoshift.api")

from optimizer.engine.data_models import (
    AssignmentType,
    PhysicalIntensity,
    HeatRiskCategory,
    SafetyPolicy,
    SafetyStandardType
)
from optimizer.engine.exposure_model import (
    DEFAULT_OSHA_WBGT_BANDS,
    DEFAULT_WORK_REST_RULES
)
from optimizer.engine.optimizer_interface import (
    SolverObjectiveMode,
    SolverScheduleOutput,
    SolverAssignmentOutput
)
from optimizer.engine.weather_service import WeatherIntegrationService
from optimizer.engine.decision_analyzer import DecisionIntelligenceAnalyzer
from optimizer.engine.scheduling_service import (
    ScheduleGenerationRequest,
    ScheduleGenerationResult,
    SchedulingOrchestrationService
)
from optimizer.engine.site_service import SiteDataService

app = FastAPI(
    title="ThermoShift Backend Scheduling API",
    description="Heat-aware workforce scheduling & physical resource orchestration API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestration_service = SchedulingOrchestrationService()


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ThermoShift Scheduling API",
        "version": "1.0.0"
    }


@app.get("/api/sites")
def list_sites():
    """Lists sites from Supabase for UI selection."""
    try:
        sites = orchestration_service.site_service._get("sites", {"select": "*"})
        return {"success": True, "sites": sites}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load sites: {str(e)}"
        )


@app.post("/api/schedules/generate", response_model=Dict[str, Any])
def generate_schedule(payload: Dict[str, Any]):
    """
    Primary Scheduling API endpoint:
    Accepts siteId, date, and objectiveMode.
    Orchestrates Supabase data loading, weather discretization, CP-SAT solving, and response serialization.
    """
    # 1. Validate payload fields
    site_id = payload.get("siteId") or payload.get("site_id")
    if not site_id or not isinstance(site_id, str) or not site_id.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Invalid request: 'siteId' is required and must be a non-empty string."}
        )

    date_str = payload.get("date")
    if not date_str or not isinstance(date_str, str) or not date_str.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Invalid request: 'date' is required and must be a valid date string (YYYY-MM-DD)."}
        )

    raw_mode = payload.get("objectiveMode") or payload.get("objective_mode") or "BALANCED"
    try:
        objective_mode = SolverObjectiveMode(str(raw_mode).upper())
    except ValueError:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "success": False,
                "error": f"Invalid objectiveMode '{raw_mode}'. Must be one of: FASTEST, SAFEST, BALANCED."
            }
        )

    persist = bool(payload.get("persist", False))

    request_obj = ScheduleGenerationRequest(
        siteId=site_id.strip(),
        date=date_str.strip(),
        objectiveMode=objective_mode,
        persist=persist
    )

    # 2. Execute Orchestration
    result = orchestration_service.generate_schedule(request_obj)

    # 3. Handle 404 / Missing Data
    if not result.success and result.status == "ERROR":
        if "not found" in (result.reason or "").lower() or "no active workers" in (result.reason or "").lower() or "no weather" in (result.reason or "").lower():
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"success": False, "error": result.reason}
            )
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": result.reason}
        )

    # 4. Handle 422 Infeasible Schedule
    if not result.success and result.status == "INFEASIBLE":
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "status": "INFEASIBLE",
                "reason": result.reason,
                "details": result.details
            }
        )

    # 5. Return Success Response (HTTP 200)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "status": result.status,
            "schedule": result.schedule,
            "summary": result.summary if isinstance(result.summary, dict) else (result.summary.model_dump() if result.summary else None)
        }
    )


from optimizer.engine.scenario_service import (
    ScenarioSimulationRequest,
    ScenarioSimulationService,
    WeatherOverrideInput,
    WorkerAvailabilityOverrideInput,
    ResourceCapacityOverrideInput,
    TaskDeadlineOverrideInput
)

scenario_service = ScenarioSimulationService(
    site_service=orchestration_service.site_service,
    orchestration_service=orchestration_service
)


@app.post("/api/schedules/simulate", response_model=Dict[str, Any])
def simulate_schedule(payload: Dict[str, Any]):
    """
    What-If Scenario Simulation Endpoint (Phase 4E):
    Accepts siteId, date, objectiveMode, and in-memory overrides:
    - weatherOverrides: temperature_c_delta, relative_humidity_delta, solar_radiation_wm2_delta, direct_wbgt_c_delta
    - workerOverrides: unavailable_worker_ids
    - resourceOverrides: resource_capacities
    - taskOverrides: task_deadlines_minutes, task_deadlines_time
    Re-runs the exact same CP-SAT solver in memory and returns a deterministic comparison against baseline.
    """
    site_id = payload.get("siteId") or payload.get("site_id")
    if not site_id or not isinstance(site_id, str) or not site_id.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Invalid request: 'siteId' is required and must be a non-empty string."}
        )

    date_str = payload.get("date")
    if not date_str or not isinstance(date_str, str) or not date_str.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": "Invalid request: 'date' is required and must be a valid date string (YYYY-MM-DD)."}
        )

    raw_mode = payload.get("objectiveMode") or payload.get("objective_mode") or "BALANCED"
    try:
        objective_mode = SolverObjectiveMode(str(raw_mode).upper())
    except ValueError:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "success": False,
                "error": f"Invalid objectiveMode '{raw_mode}'. Must be one of: FASTEST, SAFEST, BALANCED."
            }
        )

    # Parse overrides
    w_ov = None
    if payload.get("weatherOverrides") or payload.get("weather_overrides"):
        w_dict = payload.get("weatherOverrides") or payload.get("weather_overrides")
        w_ov = WeatherOverrideInput(**w_dict)

    worker_ov = None
    if payload.get("workerOverrides") or payload.get("worker_overrides"):
        worker_dict = payload.get("workerOverrides") or payload.get("worker_overrides")
        worker_ov = WorkerAvailabilityOverrideInput(**worker_dict)

    res_ov = None
    if payload.get("resourceOverrides") or payload.get("resource_overrides"):
        res_dict = payload.get("resourceOverrides") or payload.get("resource_overrides")
        res_ov = ResourceCapacityOverrideInput(**res_dict)

    task_ov = None
    if payload.get("taskOverrides") or payload.get("task_overrides"):
        task_dict = payload.get("taskOverrides") or payload.get("task_overrides")
        task_ov = TaskDeadlineOverrideInput(**task_dict)

    sim_request = ScenarioSimulationRequest(
        siteId=site_id.strip(),
        date=date_str.strip(),
        objectiveMode=objective_mode,
        baseScheduleId=payload.get("baseScheduleId") or payload.get("base_schedule_id"),
        weatherOverrides=w_ov,
        workerOverrides=worker_ov,
        resourceOverrides=res_ov,
        taskOverrides=task_ov
    )

    result = scenario_service.simulate(sim_request)

    if not result.success and result.status == "NOT_FOUND":
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "error": result.reason}
        )

    if not result.success and result.status == "ERROR":
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": result.reason}
        )

    if not result.success and result.status == "INFEASIBLE":
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "status": "INFEASIBLE",
                "reason": result.reason,
                "baselineSchedule": result.baseline_schedule,
                "scenarioSchedule": result.scenario_schedule,
                "comparisonSummary": result.comparison_summary.model_dump() if result.comparison_summary else None,
                "taskDiffs": [d.model_dump() for d in result.task_diffs],
                "appliedOverrides": result.applied_overrides,
                "details": result.details
            }
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "status": result.status,
            "baselineSchedule": result.baseline_schedule,
            "scenarioSchedule": result.scenario_schedule,
            "comparisonSummary": result.comparison_summary.model_dump() if result.comparison_summary else None,
            "taskDiffs": [d.model_dump() for d in result.task_diffs],
            "appliedOverrides": result.applied_overrides
        }
    )


from optimizer.engine.decision_analyzer import (
    DecisionIntelligenceAnalyzer,
    ScheduleExplanationRequest,
    ScheduleExplanationResponse
)


@app.post("/api/schedules/explain", response_model=Dict[str, Any])
def explain_schedule(payload: Dict[str, Any]):
    """
    Schedule Explainability & Decision Intelligence Endpoint (Phase 4F):
    Analyzes an actual generated SolverScheduleOutput and provides grounded,
    deterministic explanations for heat pacing, resource bottlenecks, skill
    constraints, deadline pressure, and objective mode trade-offs.
    """
    try:
        schedule_raw = payload.get("schedule") or {}
        assignments_raw = schedule_raw.get("assignments") or []
        
        # Reconstruct SolverAssignmentOutput objects
        assignments = []
        for a in assignments_raw:
            s_idx = int(a.get("slot_index") if "slot_index" in a else a.get("slotIndex", 0))
            t_id = a.get("task_id") or a.get("taskId")
            w_id = a.get("worker_id") or a.get("workerId") or "w1"
            asgn_type = AssignmentType.REST_SHADE if (t_id == "REST" or a.get("assignmentType") in ["REST", "REST_SHADE"]) else AssignmentType.WORK
            
            start_m = s_idx * 15
            end_m = start_m + 15
            assignments.append(
                SolverAssignmentOutput(
                    slot_index=s_idx,
                    start_minute=start_m,
                    end_minute=end_m,
                    start_time_str=f"{7 + start_m//60:02d}:{start_m%60:02d}",
                    end_time_str=f"{7 + end_m//60:02d}:{end_m%60:02d}",
                    worker_id=w_id,
                    worker_name=a.get("worker_name") or a.get("workerName") or w_id,
                    task_id=t_id,
                    task_title=a.get("task_title") or a.get("taskTitle") or t_id,
                    assignment_type=asgn_type,
                    zone_id=a.get("zone_id", "zone-1"),
                    intensity=PhysicalIntensity.MEDIUM,
                    predicted_wbgt=float(a.get("predicted_wbgt", 28.0)),
                    heat_risk=HeatRiskCategory.MODERATE,
                    slot_exposure_units=1.0
                )
            )
        
        schedule_obj = SolverScheduleOutput(
            status=schedule_raw.get("status", "OPTIMAL"),
            solve_time_seconds=float(schedule_raw.get("solve_time_seconds", schedule_raw.get("solverTimeSeconds", 0.0))),
            objective_value=float(schedule_raw.get("objective_value", schedule_raw.get("objectiveValue", 0.0))) if schedule_raw.get("objective_value") is not None or schedule_raw.get("objectiveValue") is not None else None,
            total_tasks_scheduled=len([a for a in assignments if a.task_id and a.task_id != "REST"]),
            total_work_minutes=len([a for a in assignments if a.task_id and a.task_id != "REST"]) * 15,
            total_rest_minutes=len([a for a in assignments if a.task_id == "REST" or a.assignment_type == AssignmentType.REST_SHADE]) * 15,
            peak_shade_utilization=0,
            peak_water_utilization=0,
            assignments=assignments
        )

        site_id = payload.get("siteId") or payload.get("site_id") or "a0000000-0000-0000-0000-000000000001"
        date_str = payload.get("date") or "2026-09-07"
        mode_str = payload.get("objectiveMode") or payload.get("objective_mode") or "BALANCED"
        
        try:
            obj_mode = SolverObjectiveMode(mode_str)
        except ValueError:
            obj_mode = SolverObjectiveMode.BALANCED

        # Fetch site resources/tasks/workers/weather for rich grounding
        site_service = orchestration_service.site_service
        try:
            tasks = site_service.get_tasks_with_dependencies(site_id)
        except Exception:
            tasks = []
        try:
            workers = site_service.get_workers_with_skills(site_id)
        except Exception:
            workers = []
        try:
            resources = site_service.get_resources(site_id)
        except Exception:
            resources = []
        try:
            weather_records = site_service.get_weather_records(site_id, date_str)
        except Exception:
            weather_records = []

        policy = SafetyPolicy(
            policy_id="policy-default-osha",
            name="Default OSHA Occupational Heat Safety Policy",
            standard=SafetyStandardType.OSHA,
            wbgt_bands=DEFAULT_OSHA_WBGT_BANDS,
            work_rest_rules=DEFAULT_WORK_REST_RULES
        )

        weather_slots = []
        if weather_records:
            try:
                weather_slots = WeatherIntegrationService.generate_weather_slots(
                    weather_records=weather_records,
                    shift_start_hour=7,
                    shift_duration_hours=5,
                    slot_interval_minutes=15,
                    policy=policy
                )
            except Exception:
                weather_slots = []

        explanation = DecisionIntelligenceAnalyzer.analyze_schedule(
            schedule=schedule_obj,
            tasks=tasks,
            workers=workers,
            resources=resources,
            weather_slots=weather_slots,
            objective_mode=obj_mode,
            scenario_diff=payload.get("scenarioDiff") or payload.get("scenario_diff"),
            applied_overrides=payload.get("appliedOverrides") or payload.get("applied_overrides")
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=explanation.model_dump(by_alias=True)
        )
    except Exception as e:
        logger.error(f"Error analyzing schedule explainability: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze schedule explainability: {str(e)}"
        )


