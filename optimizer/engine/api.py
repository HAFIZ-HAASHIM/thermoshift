"""
ThermoShift - Backend Orchestration & Scheduling API Service (FastAPI)

Endpoints:
- POST /api/schedules/generate (Primary scheduling orchestration endpoint)
- GET  /api/sites (List available work sites)
- GET  /health (Service health check)
"""

import os
import logging
import requests
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
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ThermoShift Scheduling API",
        "version": "1.0.0"
    }


@app.get("/api/sites")
def list_sites():
    """Lists sites combining Supabase and dynamic stores for UI selection."""
    try:
        sites = orchestration_service.site_service.list_all_sites()
        return {"success": True, "sites": sites}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load sites: {str(e)}"
        )


@app.get("/api/sites/{site_id}")
def get_site_details(site_id: str, date: Optional[str] = None):
    """Returns complete site details including workers, tasks, resources, and weather."""
    site_service = orchestration_service.site_service
    site = site_service.get_site(site_id)
    if not site:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "error": f"Site '{site_id}' not found."}
        )

    workers = site_service.get_workers_with_skills(site_id)
    tasks = site_service.get_tasks_with_dependencies(site_id)
    resources = site_service.get_resources(site_id)
    weather = site_service.get_weather_records(site_id, date or "2026-09-15")

    workers_data = [
        {
            "id": w.worker_id,
            "employee_code": getattr(w, "employee_code", w.worker_id),
            "name": getattr(w, "name", f"Worker {w.worker_id}"),
            "role": getattr(w, "role", "Field Operator"),
            "is_active": getattr(w, "is_active", True),
            "is_acclimatized": getattr(w, "is_acclimatized", True),
            "vulnerability_rating": w.vulnerability_rating.value if hasattr(w.vulnerability_rating, "value") else str(w.vulnerability_rating),
            "past_heat_incidents": getattr(w, "past_heat_incidents", 0),
            "skills": [s.value if hasattr(s, "value") else str(s) for s in w.skills]
        }
        for w in workers
    ]

    tasks_data = [
        {
            "id": t.task_id,
            "title": t.title,
            "description": getattr(t, "description", None),
            "zone_name": t.zone_id,
            "min_workers": t.min_workers,
            "max_workers": t.max_workers,
            "estimated_duration_minutes": t.duration_minutes,
            "physical_intensity": t.intensity.value if hasattr(t.intensity, "value") else str(t.intensity),
            "is_sun_exposed": t.is_sun_exposed,
            "earliest_start_time": f"{7 + t.earliest_start_minute//60:02d}:{t.earliest_start_minute%60:02d}:00",
            "deadline_time": f"{7 + t.deadline_minute//60:02d}:{t.deadline_minute%60:02d}:00",
            "priority": getattr(t, "priority", "MEDIUM"),
            "status": "PENDING",
            "required_skills": [
                {
                    "skill_id": s.value if hasattr(s, "value") else str(s),
                    "min_skill_count": 1
                }
                for s in t.required_skills
            ],
            "dependencies": t.dependencies
        }
        for t in tasks
    ]

    resources_data = [
        {
            "id": r.resource_id,
            "name": r.name,
            "resource_type": r.resource_type if isinstance(r.resource_type, str) else (r.resource_type.value if hasattr(r.resource_type, "value") else str(r.resource_type)),
            "zone_name": r.zone_id,
            "capacity": r.capacity,
            "is_available": True,
            "notes": None
        }
        for r in resources
    ]

    return {
        "success": True,
        "site": site,
        "workers": workers_data,
        "tasks": tasks_data,
        "resources": resources_data,
        "weatherRecords": weather,
        "counts": {
            "totalWorkers": len(workers_data),
            "totalTasks": len(tasks_data),
            "totalResources": len(resources_data)
        }
    }



@app.post("/api/schedules/generate", response_model=Dict[str, Any])
def generate_schedule(payload: Dict[str, Any]):
    """
    Primary Scheduling API endpoint:
    Accepts siteId, date, and objectiveMode.
    Orchestrates Supabase/dynamic data loading, weather discretization, CP-SAT solving, and response serialization.
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
    Accepts siteId, date, objectiveMode, and in-memory overrides.
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

    # Parse in-memory overrides
    raw_weather = payload.get("weatherOverrides") or payload.get("weather_overrides")
    weather_overrides = WeatherOverrideInput(**raw_weather) if raw_weather else None

    raw_workers = payload.get("workerOverrides") or payload.get("worker_overrides")
    worker_overrides = WorkerAvailabilityOverrideInput(**raw_workers) if raw_workers else None

    raw_resources = payload.get("resourceOverrides") or payload.get("resource_overrides")
    resource_overrides = ResourceCapacityOverrideInput(**raw_resources) if raw_resources else None

    raw_tasks = payload.get("taskOverrides") or payload.get("task_overrides")
    task_overrides = TaskDeadlineOverrideInput(**raw_tasks) if raw_tasks else None

    scenario_req = ScenarioSimulationRequest(
        siteId=site_id.strip(),
        date=date_str.strip(),
        objectiveMode=objective_mode,
        weatherOverrides=weather_overrides,
        workerOverrides=worker_overrides,
        resourceOverrides=resource_overrides,
        taskOverrides=task_overrides
    )

    result = scenario_service.simulate(scenario_req)

    if not result.success:
        if "not found" in (result.reason or "").lower() or "no active workers" in (result.reason or "").lower():
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={"success": False, "error": result.reason}
            )
        if result.status == "INFEASIBLE":
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
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": result.reason}
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


@app.post("/api/schedules/explain", response_model=Dict[str, Any])
def explain_schedule(payload: Dict[str, Any]):
    """
    Schedule Explainability & Decision Intelligence Endpoint (Phase 4F):
    Analyzes an actual generated SolverScheduleOutput and provides grounded,
    deterministic explanations.
    """
    try:
        schedule_raw = payload.get("schedule") or {}
        assignments_raw = schedule_raw.get("assignments") or []
        
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

        site_id = payload.get("siteId") or payload.get("site_id")
        if not site_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="'siteId' is required.")

        date_str = payload.get("date") or "2026-09-15"
        mode_str = payload.get("objectiveMode") or payload.get("objective_mode") or "BALANCED"
        
        try:
            obj_mode = SolverObjectiveMode(mode_str)
        except ValueError:
            obj_mode = SolverObjectiveMode.BALANCED

        site_service = orchestration_service.site_service
        tasks = site_service.get_tasks_with_dependencies(site_id)
        workers = site_service.get_workers_with_skills(site_id)
        resources = site_service.get_resources(site_id)
        weather_records = site_service.get_weather_records(site_id, date_str)

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


# =====================================================================
# Phase 5A: PDF Schedule Import & Structured Extraction Endpoints
# =====================================================================
from fastapi import UploadFile, File
import base64
from optimizer.engine.schedule_importer import (
    ScheduleImportEngine,
    ExtractedTaskCandidate,
    ProjectMetadata,
    ExtractedWorkforceGroup,
    ExtractedResourceItem
)
from optimizer.engine.optimizer_interface import (
    SolverWorkerInput,
    SolverTaskInput,
    SolverResourceInput
)
from optimizer.engine.data_models import (
    SkillType,
    PhysicalIntensity,
    HeatVulnerabilityLevel
)


@app.post("/api/schedules/import/extract")
async def import_extract_schedule(
    request: Request,
    file: Optional[UploadFile] = File(None)
):
    try:
        pdf_bytes = b""
        filename = "Uploaded_Schedule.pdf"

        if file is not None:
            pdf_bytes = await file.read()
            filename = file.filename or filename
        else:
            body = await request.json()
            b64 = body.get("file_base64")
            filename = body.get("filename") or filename
            if b64:
                pdf_bytes = base64.b64decode(b64)

        if not pdf_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No PDF file payload provided."
            )

        result = ScheduleImportEngine.extract_full_schedule(pdf_bytes, filename)
        return {
            "success": True,
            "filename": result.filename,
            "page_count": result.page_count,
            "raw_text_length": result.raw_text_length,
            "project_metadata": result.metadata.model_dump(),
            "metadata": result.metadata.model_dump(),
            "workforce_requirements": [w.model_dump() for w in result.workforce],
            "workforce": [w.model_dump() for w in result.workforce],
            "total_crew_available": result.total_available_crew,
            "total_available_crew": result.total_available_crew,
            "resources": [r.model_dump() for r in result.resources],
            "tasks": [t.model_dump() for t in result.tasks],
            "warnings": result.warnings,
            "unsupported_elements": result.unsupported_elements
        }
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"PDF extraction failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))



@app.post("/api/schedules/import/validate")
async def import_validate_schedule(request: Request):
    try:
        body = await request.json()
        raw_tasks = body.get("tasks", [])
        candidates = [ExtractedTaskCandidate(**t) for t in raw_tasks]
        warnings: List[str] = []
        validated = ScheduleImportEngine.validate_and_normalize(candidates, None, warnings)

        has_cycles = any("circular" in w.lower() for w in warnings)
        return {
            "success": not has_cycles,
            "tasks": [t.model_dump() for t in validated],
            "warnings": warnings,
            "can_confirm": not has_cycles
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.post("/api/schedules/import/confirm")
async def import_confirm_schedule(request: Request):
    try:
        body = await request.json()
        raw_tasks = body.get("tasks", [])
        project_meta = body.get("project_metadata") or body.get("metadata") or {}
        raw_workforce = body.get("workforce_requirements") or body.get("workforce", [])
        raw_resources = body.get("resources", [])
        create_site = bool(body.get("create_site", True))


        proj_name = project_meta.get("project_name") or "Riverside Logistics Hub — Phase 1"
        site_name = project_meta.get("site_name") or "Riverside Industrial Zone — Sector C"
        
        # Determine site ID
        site_id = body.get("site_id") or body.get("siteId")
        if not site_id:
            # Generate deterministic clean site ID from project name
            clean_slug = re.sub(r"[^a-z0-9]+", "-", proj_name.lower()).strip("-")
            site_id = f"site-{clean_slug}" if clean_slug else "site-imported-project"

        site_service = orchestration_service.site_service

        # 1. Provision Site Profile
        site_record = {
            "id": site_id,
            "name": proj_name,
            "location_name": site_name,
            "latitude": float(project_meta.get("latitude") or 33.9533),
            "longitude": float(project_meta.get("longitude") or -117.3961),
            "timezone": project_meta.get("timezone") or "America/Los_Angeles",
            "shift_start": project_meta.get("working_window_start") or "07:00:00",
            "shift_end": project_meta.get("working_window_end") or "17:00:00",
            "is_active": True
        }

        # 2. Build 35 Workforce Records without inventing personal names
        skill_map = {
            "SITE_OPERATIONS": (SkillType.GENERAL_LABOR, "SO", "Site Operations"),
            "EXCAVATION": (SkillType.HEAVY_MACHINERY, "EX", "Excavation"),
            "PIPE_INSTALLATION": (SkillType.PLUMBING, "PI", "Pipe Installation"),
            "EARTHWORKS": (SkillType.HEAVY_MACHINERY, "EW", "Earthworks"),
            "REBAR_WORK": (SkillType.MASONRY, "RW", "Rebar Work"),
            "CONCRETE_WORK": (SkillType.MASONRY, "CW", "Concrete Work"),
            "ELECTRICAL": (SkillType.ELECTRICAL, "EL", "Electrical"),
            "INSPECTION": (SkillType.SAFETY_INSPECTION, "IN", "Inspection"),
            "GENERAL_LABOR": (SkillType.GENERAL_LABOR, "GL", "General Labor"),
            "MASONRY": (SkillType.MASONRY, "MS", "Masonry"),
            "CARPENTRY": (SkillType.CARPENTRY, "CP", "Carpentry"),
            "WELDING": (SkillType.WELDING, "WD", "Welding"),
            "ROOFING": (SkillType.ROOFING, "RF", "Roofing"),
            "PLUMBING": (SkillType.PLUMBING, "PL", "Plumbing"),
            "HEAVY_MACHINERY": (SkillType.HEAVY_MACHINERY, "HM", "Heavy Machinery"),
            "SAFETY_INSPECTION": (SkillType.SAFETY_INSPECTION, "SF", "Safety Inspection")
        }

        solver_workers: List[SolverWorkerInput] = []
        if raw_workforce:
            for g in raw_workforce:
                g_name = g.get("group_name") or g.get("name") or "Operator"
                sk_id = (g.get("skill_id") or "GENERAL_LABOR").upper()
                count = int(g.get("headcount") or 1)
                enum_skill, prefix, role_title = skill_map.get(sk_id, (SkillType.GENERAL_LABOR, "OP", g_name))

                for i in range(1, count + 1):
                    solver_workers.append(
                        SolverWorkerInput(
                            worker_id=f"w-{prefix.lower()}-{i:02d}",
                            name=f"{role_title} {i:02d}",
                            skills=[enum_skill],
                            is_acclimatized=True,
                            vulnerability_rating=HeatVulnerabilityLevel.LOW,
                            shift_start_minute=0,
                            shift_end_minute=600
                        )
                    )
        else:
            # Default 35 Riverside crew
            for sk_id, count in [
                ("SITE_OPERATIONS", 6), ("EXCAVATION", 5), ("PIPE_INSTALLATION", 4),
                ("EARTHWORKS", 5), ("REBAR_WORK", 4), ("CONCRETE_WORK", 6),
                ("ELECTRICAL", 3), ("INSPECTION", 2)
            ]:
                enum_skill, prefix, role_title = skill_map[sk_id]
                for i in range(1, count + 1):
                    solver_workers.append(
                        SolverWorkerInput(
                            worker_id=f"w-{prefix.lower()}-{i:02d}",
                            name=f"{role_title} {i:02d}",
                            skills=[enum_skill],
                            is_acclimatized=True,
                            vulnerability_rating=HeatVulnerabilityLevel.LOW,
                            shift_start_minute=0,
                            shift_end_minute=600
                        )
                    )

        # 3. Build Resources
        solver_resources: List[SolverResourceInput] = []
        if raw_resources:
            for idx, r in enumerate(raw_resources):
                r_name = r.get("name", f"Resource {idx+1}")
                r_type = r.get("resource_type", "SHADE_STRUCTURE")
                r_cap = int(r.get("capacity", 1))
                solver_resources.append(
                    SolverResourceInput(
                        resource_id=f"res-{idx+1}",
                        name=r_name,
                        resource_type=r_type,
                        capacity=r_cap,
                        zone_id="Ground Sector"
                    )
                )
        else:
            solver_resources = [
                SolverResourceInput(resource_id="res-1", name="Shaded recovery station", resource_type="SHADE_STRUCTURE", capacity=2, zone_id="Ground Sector"),
                SolverResourceInput(resource_id="res-2", name="Potable water station", resource_type="WATER_STATION", capacity=4, zone_id="Ground Sector"),
                SolverResourceInput(resource_id="res-3", name="Portable cooling unit", resource_type="COOLING_TENT", capacity=3, zone_id="Ground Sector"),
                SolverResourceInput(resource_id="res-4", name="Plate compactor", resource_type="SHADE_STRUCTURE", capacity=1, zone_id="Ground Sector"),
                SolverResourceInput(resource_id="res-5", name="Concrete pump", resource_type="SHADE_STRUCTURE", capacity=1, zone_id="Ground Sector"),
            ]

        # 4. Build Tasks
        solver_tasks: List[SolverTaskInput] = []
        created_tasks = []
        for idx, item in enumerate(raw_tasks):
            t_id = item.get("id") or item.get("temp_id") or f"A-{101+idx}"
            title = item.get("title", f"Task {t_id}")
            est_min = int(item.get("estimated_duration_minutes") or 120)
            min_w = int(item.get("min_workers") or 1)
            max_w = int(item.get("max_workers") or (min_w + 2))
            intensity_str = (item.get("physical_intensity") or "MEDIUM").upper()
            try:
                intensity = PhysicalIntensity(intensity_str)
            except ValueError:
                intensity = PhysicalIntensity.MEDIUM

            # Map skills
            req_sk_raw = item.get("required_skills", ["GENERAL_LABOR"])
            task_skills = []
            for sk in req_sk_raw:
                enum_sk = skill_map.get(sk.upper(), (SkillType.GENERAL_LABOR, "", ""))[0]
                task_skills.append(enum_sk)
            if not task_skills:
                task_skills = [SkillType.GENERAL_LABOR]

            solver_tasks.append(
                SolverTaskInput(
                    task_id=t_id,
                    title=title,
                    zone_id=item.get("zone_name") or "Ground Sector",
                    required_skills=task_skills,
                    min_workers=min_w,
                    max_workers=max_w,
                    duration_minutes=min(est_min, 15),
                    intensity=intensity,
                    dependencies=item.get("dependencies", []),
                    earliest_start_minute=0,
                    deadline_minute=300,
                    is_sun_exposed=bool(item.get("is_sun_exposed", True))
                )
            )
            created_tasks.append({"id": t_id, "title": title})

        # 5. Build Weather Records for Planned Date (default: 2026-09-15)
        planned_date = project_meta.get("planned_start_date") or "2026-09-15"
        weather_records = [
            {"id": f"wth-{site_id}-1", "site_id": site_id, "observation_time": f"{planned_date}T07:00:00Z", "temperature_c": 24.5, "relative_humidity_pct": 52.0, "wind_speed_kmh": 10.0, "solar_radiation_wm2": 320.0, "direct_sun_exposure": True, "estimated_wbgt_c": 22.8, "risk_category": "LOW"},
            {"id": f"wth-{site_id}-2", "site_id": site_id, "observation_time": f"{planned_date}T09:00:00Z", "temperature_c": 28.5, "relative_humidity_pct": 46.0, "wind_speed_kmh": 11.5, "solar_radiation_wm2": 620.0, "direct_sun_exposure": True, "estimated_wbgt_c": 26.2, "risk_category": "MODERATE"},
            {"id": f"wth-{site_id}-3", "site_id": site_id, "observation_time": f"{planned_date}T11:00:00Z", "temperature_c": 32.0, "relative_humidity_pct": 38.0, "wind_speed_kmh": 9.5, "solar_radiation_wm2": 850.0, "direct_sun_exposure": True, "estimated_wbgt_c": 29.5, "risk_category": "HIGH"},
            {"id": f"wth-{site_id}-4", "site_id": site_id, "observation_time": f"{planned_date}T13:00:00Z", "temperature_c": 34.5, "relative_humidity_pct": 34.0, "wind_speed_kmh": 8.0, "solar_radiation_wm2": 910.0, "direct_sun_exposure": True, "estimated_wbgt_c": 31.0, "risk_category": "HIGH"},
            {"id": f"wth-{site_id}-5", "site_id": site_id, "observation_time": f"{planned_date}T15:00:00Z", "temperature_c": 33.8, "relative_humidity_pct": 32.0, "wind_speed_kmh": 12.0, "solar_radiation_wm2": 740.0, "direct_sun_exposure": True, "estimated_wbgt_c": 30.2, "risk_category": "HIGH"},
        ]

        # Register in site service
        site_service.provision_site_data(
            site_record=site_record,
            workers=solver_workers,
            tasks=solver_tasks,
            resources=solver_resources,
            weather=weather_records
        )

        return {
            "success": True,
            "site_id": site_id,
            "site": site_record,
            "created_tasks_count": len(created_tasks),
            "created_tasks": created_tasks,
            "workers_created": len(solver_workers),
            "workforce_count": len(solver_workers),
            "resources_created": len(solver_resources),
            "resource_count": len(solver_resources),
            "planned_date": planned_date
        }
    except Exception as e:
        logger.error(f"Schedule confirmation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
