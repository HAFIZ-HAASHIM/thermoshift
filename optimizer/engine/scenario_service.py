"""
ThermoShift - What-If Scenario Simulation & Comparison Service (Phase 4E)

Enables site supervisors to test operational "what-if" hypotheses in memory:
1. Environmental heat stress increases / shifts
2. Worker availability exclusions (sick leave, heat fatigue, dispatch)
3. Finite site resource capacity reductions (broken shade misting, trailer maintenance)
4. Accelerated task deadlines

Architectural Invariants:
- Uses the EXACT SAME SafetyPolicy, HeatMethodologyEngine, and CP-SAT scheduler.
- Zero duplicate scheduling or heat logic.
- Completely in-memory: NEVER mutates production Supabase records.
- Deterministic diff comparison between Baseline and Scenario schedules.
"""

from typing import Dict, List, Optional, Any, Set, Tuple
from enum import Enum
from pydantic import BaseModel, Field
import copy

from optimizer.engine.data_models import (
    SafetyPolicy,
    SafetyStandardType,
    HeatRiskCategory,
    PhysicalIntensity
)
from optimizer.engine.exposure_model import (
    DEFAULT_OSHA_WBGT_BANDS,
    DEFAULT_WORK_REST_RULES,
    ExposureModel
)
from optimizer.engine.heat_methodology import (
    HeatMethodologyEngine,
    EnvironmentalReading
)
from optimizer.engine.optimizer_interface import (
    SolverObjectiveMode,
    SolverProblemInstance,
    SolverWorkerInput,
    SolverTaskInput,
    SolverResourceInput,
    SolverTimeSlotWeather,
    SolverScheduleOutput,
    SolverAssignmentOutput
)
from optimizer.engine.scheduler import CPSATSchedulingEngine
from optimizer.engine.site_service import SiteDataService
from optimizer.engine.weather_service import WeatherIntegrationService
from optimizer.engine.scheduling_service import (
    ScheduleGenerationRequest,
    ScheduleGenerationResult,
    SchedulingOrchestrationService
)


class TaskChangeType(str, Enum):
    UNCHANGED = "UNCHANGED"
    MOVED_EARLIER = "MOVED_EARLIER"
    MOVED_LATER = "MOVED_LATER"
    WORKERS_CHANGED = "WORKERS_CHANGED"
    TIMING_AND_WORKERS_CHANGED = "TIMING_AND_WORKERS_CHANGED"
    NEWLY_UNSCHEDULED = "NEWLY_UNSCHEDULED"
    NEWLY_SCHEDULED = "NEWLY_SCHEDULED"


class WeatherOverrideInput(BaseModel):
    temperature_c_delta: Optional[float] = None
    temperature_c: Optional[float] = None
    relative_humidity_delta: Optional[float] = None
    relative_humidity: Optional[float] = None
    solar_radiation_wm2_delta: Optional[float] = None
    solar_radiation_wm2: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    direct_wbgt_c_delta: Optional[float] = None


class WorkerAvailabilityOverrideInput(BaseModel):
    unavailable_worker_ids: List[str] = Field(default_factory=list)


class ResourceCapacityOverrideInput(BaseModel):
    # Mapping of resource_id -> new integer capacity
    resource_capacities: Dict[str, int] = Field(default_factory=dict)


class TaskDeadlineOverrideInput(BaseModel):
    # Mapping of task_id -> new deadline in minutes from shift start (or HH:MM time string)
    task_deadlines_minutes: Dict[str, int] = Field(default_factory=dict)
    task_deadlines_time: Dict[str, str] = Field(default_factory=dict)


class ScenarioSimulationRequest(BaseModel):
    site_id: str = Field(..., alias="siteId")
    date: str
    objective_mode: SolverObjectiveMode = Field(default=SolverObjectiveMode.BALANCED, alias="objectiveMode")
    base_schedule_id: Optional[str] = Field(default=None, alias="baseScheduleId")

    weather_overrides: Optional[WeatherOverrideInput] = Field(default=None, alias="weatherOverrides")
    worker_overrides: Optional[WorkerAvailabilityOverrideInput] = Field(default=None, alias="workerOverrides")
    resource_overrides: Optional[ResourceCapacityOverrideInput] = Field(default=None, alias="resourceOverrides")
    task_overrides: Optional[TaskDeadlineOverrideInput] = Field(default=None, alias="taskOverrides")

    class Config:
        populate_by_name = True


class TaskScheduleDiff(BaseModel):
    task_id: str
    task_title: str
    baseline_start_minute: Optional[int] = None
    baseline_end_minute: Optional[int] = None
    baseline_start_time: Optional[str] = None
    baseline_end_time: Optional[str] = None
    baseline_workers: List[str] = Field(default_factory=list)

    scenario_start_minute: Optional[int] = None
    scenario_end_minute: Optional[int] = None
    scenario_start_time: Optional[str] = None
    scenario_end_time: Optional[str] = None
    scenario_workers: List[str] = Field(default_factory=list)

    start_delta_minutes: int = 0
    end_delta_minutes: int = 0
    workers_added: List[str] = Field(default_factory=list)
    workers_removed: List[str] = Field(default_factory=list)
    change_type: TaskChangeType = TaskChangeType.UNCHANGED
    summary_text: str = ""


class ComparisonSummary(BaseModel):
    tasks_changed_count: int = 0
    workers_affected_count: int = 0
    work_minutes_delta: int = 0
    rest_minutes_delta: int = 0
    peak_shade_delta: int = 0
    completion_time_delta_minutes: int = 0
    feasibility_changed: bool = False
    baseline_status: str
    scenario_status: str


class ScenarioSimulationResult(BaseModel):
    success: bool
    status: str
    baseline_schedule: Optional[Dict[str, Any]] = None
    scenario_schedule: Optional[Dict[str, Any]] = None
    comparison_summary: Optional[ComparisonSummary] = None
    task_diffs: List[TaskScheduleDiff] = Field(default_factory=list)
    applied_overrides: Dict[str, Any] = Field(default_factory=dict)
    reason: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class ScenarioSimulationService:
    """
    Orchestrates in-memory scenario simulations and computes deterministic diffs.
    """

    def __init__(
        self,
        site_service: Optional[SiteDataService] = None,
        orchestration_service: Optional[SchedulingOrchestrationService] = None
    ):
        self.site_service = site_service or SiteDataService()
        self.orchestration_service = orchestration_service or SchedulingOrchestrationService(site_service=self.site_service)

    def simulate(self, req: ScenarioSimulationRequest) -> ScenarioSimulationResult:
        """
        Executes a What-If scenario simulation:
        1. Generates or loads the baseline schedule.
        2. Clones the problem instance in memory.
        3. Applies scenario overrides.
        4. Invokes CP-SAT engine.
        5. Computes structured baseline vs. scenario diff.
        """
        # 1. Generate Baseline Schedule
        base_req = ScheduleGenerationRequest(
            siteId=req.site_id,
            date=req.date,
            objectiveMode=req.objective_mode,
            persist=False
        )
        base_result = self.orchestration_service.generate_schedule(base_req)

        if not base_result.success and base_result.status in ("ERROR", "NOT_FOUND"):
            status_code = "NOT_FOUND" if "not found" in (base_result.reason or "").lower() else "ERROR"
            return ScenarioSimulationResult(
                success=False,
                status=status_code,
                reason=base_result.reason
            )

        # 2. Load Raw Site Entities
        site = self.site_service.get_site(req.site_id)
        if not site:
            return ScenarioSimulationResult(
                success=False,
                status="NOT_FOUND",
                reason=f"Site '{req.site_id}' not found."
            )

        workers = self.site_service.get_workers_with_skills(req.site_id)
        tasks = self.site_service.get_tasks_with_dependencies(req.site_id)
        resources = self.site_service.get_resources(req.site_id)
        weather_records = self.site_service.get_weather_records(req.site_id, req.date)

        if not weather_records:
            return ScenarioSimulationResult(
                success=False,
                status="NOT_FOUND",
                reason=f"No weather records found for date '{req.date}'."
            )

        # 2B. Standard OSHA/NIOSH & India MoLE Heat Safety Policy Reference
        policy = SafetyPolicy(
            policy_id="policy-default-osha",
            name="Default OSHA Occupational Heat Safety Policy",
            standard=SafetyStandardType.OSHA,
            wbgt_bands=DEFAULT_OSHA_WBGT_BANDS,
            work_rest_rules=DEFAULT_WORK_REST_RULES
        )

        # 3. Apply Scenario Overrides in Memory
        applied_overrides: Dict[str, Any] = {}

        # 3A. Weather Overrides
        cloned_weather = copy.deepcopy(weather_records)
        if req.weather_overrides:
            w_ov = req.weather_overrides
            applied_overrides["weather"] = w_ov.model_dump(exclude_none=True)

            for r in cloned_weather:
                if w_ov.temperature_c is not None:
                    r["temperature_c"] = w_ov.temperature_c
                elif w_ov.temperature_c_delta is not None:
                    r["temperature_c"] = float(r["temperature_c"]) + w_ov.temperature_c_delta

                if w_ov.relative_humidity is not None:
                    r["relative_humidity_pct"] = w_ov.relative_humidity
                elif w_ov.relative_humidity_delta is not None:
                    r["relative_humidity_pct"] = max(5.0, min(100.0, float(r["relative_humidity_pct"]) + w_ov.relative_humidity_delta))

                if w_ov.solar_radiation_wm2 is not None:
                    r["solar_radiation_wm2"] = w_ov.solar_radiation_wm2
                elif w_ov.solar_radiation_wm2_delta is not None:
                    r["solar_radiation_wm2"] = max(0.0, float(r.get("solar_radiation_wm2") or 600.0) + w_ov.solar_radiation_wm2_delta)

                if w_ov.wind_speed_kmh is not None:
                    r["wind_speed_kmh"] = max(0.1, w_ov.wind_speed_kmh)

        weather_slots = WeatherIntegrationService.generate_weather_slots(
            weather_records=cloned_weather,
            shift_start_hour=7,
            shift_duration_hours=5,
            slot_interval_minutes=15,
            policy=policy
        )

        # If direct WBGT delta requested, adjust computed slot WBGTs and reclassify
        if req.weather_overrides and req.weather_overrides.direct_wbgt_c_delta is not None:
            delta = req.weather_overrides.direct_wbgt_c_delta
            for s in weather_slots:
                s.estimated_wbgt_c = round(s.estimated_wbgt_c + delta, 2)
                s.risk_category = ExposureModel.get_risk_category(s.estimated_wbgt_c, policy)

        # 3B. Worker Availability Overrides
        active_workers: List[SolverWorkerInput] = []
        unavailable_ids = set(req.worker_overrides.unavailable_worker_ids if req.worker_overrides else [])
        if unavailable_ids:
            applied_overrides["unavailable_workers"] = list(unavailable_ids)

        for w in workers:
            if w.worker_id not in unavailable_ids:
                active_workers.append(w)

        # 3C. Resource Capacity Overrides
        scenario_resources: List[SolverResourceInput] = []
        res_caps = req.resource_overrides.resource_capacities if req.resource_overrides else {}
        if res_caps:
            applied_overrides["resource_capacities"] = res_caps

        for r in resources:
            cloned_r = copy.deepcopy(r)
            if r.resource_id in res_caps:
                cloned_r.capacity = max(0, res_caps[r.resource_id])
            scenario_resources.append(cloned_r)

        # 3D. Task Deadline Overrides
        scenario_tasks: List[SolverTaskInput] = []
        task_deadlines_min = req.task_overrides.task_deadlines_minutes if req.task_overrides else {}
        task_deadlines_str = req.task_overrides.task_deadlines_time if req.task_overrides else {}
        if task_deadlines_min or task_deadlines_str:
            applied_overrides["task_deadlines"] = {**task_deadlines_min, **task_deadlines_str}

        for t in tasks:
            cloned_t = copy.deepcopy(t)
            if t.task_id in task_deadlines_min:
                cloned_t.deadline_minute = min(300, max(0, task_deadlines_min[t.task_id]))
            elif t.task_id in task_deadlines_str:
                parsed_m = SiteDataService._time_to_minutes(task_deadlines_str[t.task_id], shift_start_hour=7)
                cloned_t.deadline_minute = min(300, max(0, parsed_m))
            scenario_tasks.append(cloned_t)

        # 4. Construct Scenario Problem Instance
        scenario_problem = SolverProblemInstance(
            site_id=req.site_id,
            shift_date=req.date,
            slot_interval_minutes=15,
            total_slots=len(weather_slots),
            objective_mode=req.objective_mode,
            workers=active_workers,
            tasks=scenario_tasks,
            resources=scenario_resources,
            weather_slots=weather_slots,
            safety_policy=policy
        )

        # 5. Execute Solver on Scenario
        scenario_output = CPSATSchedulingEngine.solve(scenario_problem)

        # 6. Format Scenario Schedule Dict
        scenario_schedule_dict = {
            "scheduleId": f"scenario-{req.site_id[:8]}-{req.date}",
            "siteId": req.site_id,
            "date": req.date,
            "objectiveMode": req.objective_mode.value,
            "status": scenario_output.status,
            "solveTimeSeconds": scenario_output.solve_time_seconds,
            "objectiveValue": scenario_output.objective_value,
            "totalTasksScheduled": scenario_output.total_tasks_scheduled,
            "totalWorkMinutes": scenario_output.total_work_minutes,
            "totalRestMinutes": scenario_output.total_rest_minutes,
            "peakShadeUtilization": scenario_output.peak_shade_utilization,
            "assignments": [a.model_dump() for a in scenario_output.assignments],
            "solverMessages": scenario_output.solver_messages,
            "unassignedTaskIds": scenario_output.unassigned_task_ids
        }

        # 7. Compute Baseline vs Scenario Comparison
        base_schedule_dict = base_result.schedule or {}
        task_diffs, comparison_summary = self._compute_schedule_diff(
            base_schedule=base_schedule_dict,
            scenario_schedule=scenario_schedule_dict,
            tasks=tasks,
            unavailable_worker_ids=unavailable_ids
        )

        is_feasible = scenario_output.status in ("OPTIMAL", "FEASIBLE")

        return ScenarioSimulationResult(
            success=is_feasible,
            status=scenario_output.status,
            baseline_schedule=base_schedule_dict,
            scenario_schedule=scenario_schedule_dict,
            comparison_summary=comparison_summary,
            task_diffs=task_diffs,
            applied_overrides=applied_overrides,
            reason=None if is_feasible else "Scenario is infeasible under active constraints.",
            details={
                "solverMessages": scenario_output.solver_messages,
                "unassignedTaskIds": scenario_output.unassigned_task_ids,
                "solveTimeSeconds": scenario_output.solve_time_seconds
            } if not is_feasible else None
        )

    @staticmethod
    def _compute_schedule_diff(
        base_schedule: Dict[str, Any],
        scenario_schedule: Dict[str, Any],
        tasks: List[SolverTaskInput],
        unavailable_worker_ids: Optional[Set[str]] = None
    ) -> Tuple[List[TaskScheduleDiff], ComparisonSummary]:
        """
        Deterministically compares baseline and scenario schedules.
        """
        task_map = {t.task_id: t.title for t in tasks}

        base_asgns = base_schedule.get("assignments", [])
        scen_asgns = scenario_schedule.get("assignments", [])

        # Index work assignments by task_id
        base_task_info: Dict[str, Dict[str, Any]] = {}
        for a in base_asgns:
            if a.get("assignment_type") == "WORK" and a.get("task_id"):
                t_id = a["task_id"]
                if t_id not in base_task_info:
                    base_task_info[t_id] = {
                        "start_minute": a["start_minute"],
                        "end_minute": a["end_minute"],
                        "start_time": a["start_time_str"],
                        "end_time": a["end_time_str"],
                        "workers": []
                    }
                base_task_info[t_id]["start_minute"] = min(base_task_info[t_id]["start_minute"], a["start_minute"])
                base_task_info[t_id]["end_minute"] = max(base_task_info[t_id]["end_minute"], a["end_minute"])
                base_task_info[t_id]["workers"].append(a["worker_id"])

        scen_task_info: Dict[str, Dict[str, Any]] = {}
        for a in scen_asgns:
            if a.get("assignment_type") == "WORK" and a.get("task_id"):
                t_id = a["task_id"]
                if t_id not in scen_task_info:
                    scen_task_info[t_id] = {
                        "start_minute": a["start_minute"],
                        "end_minute": a["end_minute"],
                        "start_time": a["start_time_str"],
                        "end_time": a["end_time_str"],
                        "workers": []
                    }
                scen_task_info[t_id]["start_minute"] = min(scen_task_info[t_id]["start_minute"], a["start_minute"])
                scen_task_info[t_id]["end_minute"] = max(scen_task_info[t_id]["end_minute"], a["end_minute"])
                scen_task_info[t_id]["workers"].append(a["worker_id"])

        all_task_ids = sorted(list(set(list(task_map.keys()) + list(base_task_info.keys()) + list(scen_task_info.keys()))))
        task_diffs: List[TaskScheduleDiff] = []
        tasks_changed_count = 0
        affected_workers: Set[str] = set(unavailable_worker_ids or set())

        for t_id in all_task_ids:
            title = task_map.get(t_id, f"Task {t_id[:8]}")
            b_info = base_task_info.get(t_id)
            s_info = scen_task_info.get(t_id)

            if b_info and not s_info:
                # Newly unscheduled
                tasks_changed_count += 1
                diff = TaskScheduleDiff(
                    task_id=t_id,
                    task_title=title,
                    baseline_start_minute=b_info["start_minute"],
                    baseline_end_minute=b_info["end_minute"],
                    baseline_start_time=b_info["start_time"],
                    baseline_end_time=b_info["end_time"],
                    baseline_workers=b_info["workers"],
                    change_type=TaskChangeType.NEWLY_UNSCHEDULED,
                    summary_text=f"Task unscheduled in scenario due to constraints."
                )
                task_diffs.append(diff)
                for w_id in b_info["workers"]:
                    affected_workers.add(w_id)
                continue

            if not b_info and s_info:
                # Newly scheduled
                tasks_changed_count += 1
                diff = TaskScheduleDiff(
                    task_id=t_id,
                    task_title=title,
                    scenario_start_minute=s_info["start_minute"],
                    scenario_end_minute=s_info["end_minute"],
                    scenario_start_time=s_info["start_time"],
                    scenario_end_time=s_info["end_time"],
                    scenario_workers=s_info["workers"],
                    change_type=TaskChangeType.NEWLY_SCHEDULED,
                    summary_text=f"Task newly scheduled at {s_info['start_time']}."
                )
                task_diffs.append(diff)
                for w_id in s_info["workers"]:
                    affected_workers.add(w_id)
                continue

            if b_info and s_info:
                start_delta = s_info["start_minute"] - b_info["start_minute"]
                end_delta = s_info["end_minute"] - b_info["end_minute"]
                b_set = set(b_info["workers"])
                s_set = set(s_info["workers"])
                workers_added = list(s_set - b_set)
                workers_removed = list(b_set - s_set)

                timing_changed = (start_delta != 0 or end_delta != 0)
                workers_changed = (len(workers_added) > 0 or len(workers_removed) > 0)

                if timing_changed and workers_changed:
                    change_type = TaskChangeType.TIMING_AND_WORKERS_CHANGED
                    tasks_changed_count += 1
                    summary_text = f"Timing shifted ({start_delta:+d} min) and worker team re-assigned."
                elif timing_changed:
                    change_type = TaskChangeType.MOVED_EARLIER if start_delta < 0 else TaskChangeType.MOVED_LATER
                    tasks_changed_count += 1
                    summary_text = f"Start shifted {abs(start_delta)} min {'earlier' if start_delta < 0 else 'later'}."
                elif workers_changed:
                    change_type = TaskChangeType.WORKERS_CHANGED
                    tasks_changed_count += 1
                    summary_text = f"Worker assignment updated ({len(workers_added)} added, {len(workers_removed)} removed)."
                else:
                    change_type = TaskChangeType.UNCHANGED
                    summary_text = "Schedule timing and worker assignments identical."

                if change_type != TaskChangeType.UNCHANGED:
                    for w in workers_added + workers_removed:
                        affected_workers.add(w)

                diff = TaskScheduleDiff(
                    task_id=t_id,
                    task_title=title,
                    baseline_start_minute=b_info["start_minute"],
                    baseline_end_minute=b_info["end_minute"],
                    baseline_start_time=b_info["start_time"],
                    baseline_end_time=b_info["end_time"],
                    baseline_workers=b_info["workers"],
                    scenario_start_minute=s_info["start_minute"],
                    scenario_end_minute=s_info["end_minute"],
                    scenario_start_time=s_info["start_time"],
                    scenario_end_time=s_info["end_time"],
                    scenario_workers=s_info["workers"],
                    start_delta_minutes=start_delta,
                    end_delta_minutes=end_delta,
                    workers_added=workers_added,
                    workers_removed=workers_removed,
                    change_type=change_type,
                    summary_text=summary_text
                )
                task_diffs.append(diff)

        # Global metrics deltas
        base_work_min = base_schedule.get("totalWorkMinutes", 0)
        scen_work_min = scenario_schedule.get("totalWorkMinutes", 0)
        base_rest_min = base_schedule.get("totalRestMinutes", 0)
        scen_rest_min = scenario_schedule.get("totalRestMinutes", 0)
        base_peak_shade = base_schedule.get("peakShadeUtilization", 0)
        scen_peak_shade = scenario_schedule.get("peakShadeUtilization", 0)

        base_end_max = max([a["end_minute"] for a in base_asgns if a.get("assignment_type") == "WORK"], default=0)
        scen_end_max = max([a["end_minute"] for a in scen_asgns if a.get("assignment_type") == "WORK"], default=0)

        summary = ComparisonSummary(
            tasks_changed_count=tasks_changed_count,
            workers_affected_count=len(affected_workers),
            work_minutes_delta=scen_work_min - base_work_min,
            rest_minutes_delta=scen_rest_min - base_rest_min,
            peak_shade_delta=scen_peak_shade - base_peak_shade,
            completion_time_delta_minutes=scen_end_max - base_end_max,
            feasibility_changed=(base_schedule.get("status") != scenario_schedule.get("status")),
            baseline_status=base_schedule.get("status", "UNKNOWN"),
            scenario_status=scenario_schedule.get("status", "UNKNOWN")
        )

        return task_diffs, summary
