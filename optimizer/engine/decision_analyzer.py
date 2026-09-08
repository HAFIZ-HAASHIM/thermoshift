"""
ThermoShift - Decision Intelligence & Schedule Explainability Engine
Phase 4F Non-Destructive Decision Analyzer

Inspects actual SolverScheduleOutput and problem telemetry to generate
grounded, deterministic explanations for:
- Why tasks were scheduled at specific times (heat avoidance, skill availability, resource limits, dependencies)
- Why workers were assigned or given mandatory recovery periods
- Trade-offs between Fastest, Balanced, and Safest objective modes
- Baseline vs Scenario schedule deltas and causal factors
"""

from typing import Dict, List, Optional, Any, Tuple, Union
from enum import Enum
import copy
from pydantic import BaseModel, Field

from optimizer.engine.data_models import (
    SkillType,
    PhysicalIntensity,
    HeatVulnerabilityLevel,
    HeatRiskCategory,
    AssignmentType,
    SafetyPolicy
)
from optimizer.engine.optimizer_interface import (
    SolverObjectiveMode,
    SolverProblemInstance,
    SolverScheduleOutput,
    SolverAssignmentOutput,
    SolverWorkerInput,
    SolverTaskInput,
    SolverResourceInput,
    SolverTimeSlotWeather
)


class DecisionFactorCategory(str, Enum):
    HEAT = "HEAT"
    WORKFORCE = "WORKFORCE"
    RESOURCE = "RESOURCE"
    DEPENDENCY = "DEPENDENCY"
    DEADLINE = "DEADLINE"
    RECOVERY = "RECOVERY"
    OPTIMIZATION = "OPTIMIZATION"


class DecisionFactorSeverity(str, Enum):
    INFO = "INFO"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class DecisionFactor(BaseModel):
    id: str
    category: DecisionFactorCategory
    severity: DecisionFactorSeverity
    title: str
    explanation: str
    fact: str
    reason: str
    impact: str
    related_task_ids: List[str] = Field(default_factory=list, alias="relatedTaskIds")
    related_worker_ids: List[str] = Field(default_factory=list, alias="relatedWorkerIds")
    related_resource_ids: List[str] = Field(default_factory=list, alias="relatedResourceIds")
    evidence: Dict[str, Any] = Field(default_factory=dict)
    source: str = "Deterministic Solver Telemetry"

    class Config:
        populate_by_name = True


class TaskExplanation(BaseModel):
    task_id: str = Field(..., alias="taskId")
    task_title: str = Field(..., alias="taskTitle")
    start_minute: int = Field(..., alias="startMinute")
    end_minute: int = Field(..., alias="endMinute")
    start_time: str = Field(..., alias="startTime")
    end_time: str = Field(..., alias="endTime")
    assigned_workers: List[str] = Field(default_factory=list, alias="assignedWorkers")
    primary_reason: str = Field(..., alias="primaryReason")
    factors: List[DecisionFactor] = Field(default_factory=list)
    scenario_delta_text: Optional[str] = Field(default=None, alias="scenarioDeltaText")

    class Config:
        populate_by_name = True


class WorkerExplanation(BaseModel):
    worker_id: str = Field(..., alias="workerId")
    worker_name: str = Field(..., alias="workerName")
    assigned_tasks: List[str] = Field(default_factory=list, alias="assignedTasks")
    total_work_minutes: int = Field(default=0, alias="totalWorkMinutes")
    total_rest_minutes: int = Field(default=0, alias="totalRestMinutes")
    mandatory_rest_blocks_count: int = Field(default=0, alias="mandatoryRestBlocksCount")
    reassignment_reason: Optional[str] = Field(default=None, alias="reassignmentReason")
    factors: List[DecisionFactor] = Field(default_factory=list)

    class Config:
        populate_by_name = True


class DecisionSummary(BaseModel):
    headline: str
    subheadline: str
    objective_mode: str = Field(..., alias="objectiveMode")
    objective_mode_explanation: str = Field(..., alias="objectiveModeExplanation")
    key_factors: List[DecisionFactor] = Field(default_factory=list, alias="keyFactors")
    heat_impact_summary: str = Field(..., alias="heatImpactSummary")
    workforce_impact_summary: str = Field(..., alias="workforceImpactSummary")
    resource_impact_summary: str = Field(..., alias="resourceImpactSummary")
    deadline_impact_summary: str = Field(..., alias="deadlineImpactSummary")
    recovery_impact_summary: str = Field(..., alias="recoveryImpactSummary")
    completion_time_minutes: int = Field(..., alias="completionTimeMinutes")
    total_work_minutes: int = Field(..., alias="totalWorkMinutes")
    total_rest_minutes: int = Field(..., alias="totalRestMinutes")
    peak_wbgt_celsius: float = Field(..., alias="peakWbgtCelsius")
    peak_wbgt_time: str = Field(..., alias="peakWbgtTime")
    peak_resource_utilization_pct: float = Field(..., alias="peakResourceUtilizationPct")

    class Config:
        populate_by_name = True


class ScenarioExplanation(BaseModel):
    headline: str
    narrative: str
    key_changes: List[str] = Field(default_factory=list, alias="keyChanges")
    bottleneck_factor: Optional[str] = Field(default=None, alias="bottleneckFactor")

    class Config:
        populate_by_name = True


class ScheduleExplanationRequest(BaseModel):
    site_id: Optional[str] = Field(default=None, alias="siteId")
    date: Optional[str] = Field(default=None)
    objective_mode: Optional[str] = Field(default="BALANCED", alias="objectiveMode")
    schedule: Dict[str, Any]
    site_context: Optional[Dict[str, Any]] = Field(default=None, alias="siteContext")
    baseline_schedule: Optional[Dict[str, Any]] = Field(default=None, alias="baselineSchedule")
    scenario_diff: Optional[Dict[str, Any]] = Field(default=None, alias="scenarioDiff")
    applied_overrides: Optional[Dict[str, Any]] = Field(default=None, alias="appliedOverrides")

    class Config:
        populate_by_name = True


class ScheduleExplanationResponse(BaseModel):
    success: bool
    decision_summary: DecisionSummary = Field(..., alias="decisionSummary")
    task_explanations: Dict[str, TaskExplanation] = Field(default_factory=dict, alias="taskExplanations")
    worker_explanations: Dict[str, WorkerExplanation] = Field(default_factory=dict, alias="workerExplanations")
    scenario_explanation: Optional[ScenarioExplanation] = Field(default=None, alias="scenarioExplanation")

    class Config:
        populate_by_name = True


class DecisionIntelligenceAnalyzer:
    """
    Deterministic Decision Intelligence Analyzer for ThermoShift schedules.
    Inspects schedule outputs, environmental slots, and operational constraints
    to build evidence-based explanations without LLM hallucination risk.
    """

    @classmethod
    def analyze_schedule(
        cls,
        schedule: SolverScheduleOutput,
        problem: Optional[SolverProblemInstance] = None,
        tasks: Optional[List[Any]] = None,
        workers: Optional[List[Any]] = None,
        resources: Optional[List[Any]] = None,
        weather_slots: Optional[List[Any]] = None,
        objective_mode: Optional[SolverObjectiveMode] = None,
        baseline_schedule: Optional[SolverScheduleOutput] = None,
        scenario_diff: Optional[Dict[str, Any]] = None,
        applied_overrides: Optional[Dict[str, Any]] = None
    ) -> ScheduleExplanationResponse:
        """
        Main entry point to extract decision intelligence from solver outputs.
        """
        if problem is not None:
            tasks = tasks or problem.tasks
            workers = workers or problem.workers
            resources = resources or problem.resources
            weather_slots = weather_slots or problem.weather_slots
            objective_mode = objective_mode or problem.objective_mode

        tasks = tasks or []
        workers = workers or []
        resources = resources or []
        weather_slots = weather_slots or []
        objective_mode = objective_mode or SolverObjectiveMode.BALANCED

        tasks_by_id = {}
        for t in tasks:
            tid = getattr(t, "task_id", getattr(t, "id", None))
            if tid:
                tasks_by_id[tid] = t

        workers_by_id = {}
        for w in workers:
            wid = getattr(w, "worker_id", getattr(w, "id", None))
            if wid:
                workers_by_id[wid] = w

        resources_by_id = {}
        for r in resources:
            rid = getattr(r, "resource_id", getattr(r, "id", None))
            if rid:
                resources_by_id[rid] = r

        # Extract normalized assignments
        normalized_assignments = cls._normalize_assignments(schedule.assignments)

        # 1. Analyze Core Drivers
        heat_factors = cls._analyze_heat_drivers(normalized_assignments, weather_slots, tasks_by_id)
        workforce_factors = cls._analyze_workforce_drivers(normalized_assignments, workers_by_id, tasks_by_id)
        resource_factors, peak_utilization = cls._analyze_resource_drivers(normalized_assignments, resources_by_id, tasks_by_id)
        dependency_factors = cls._analyze_dependency_drivers(normalized_assignments, tasks_by_id)
        deadline_factors = cls._analyze_deadline_drivers(normalized_assignments, tasks_by_id)
        recovery_factors = cls._analyze_recovery_drivers(normalized_assignments, workers_by_id, tasks_by_id)
        opt_factors, opt_explanation = cls._analyze_objective_mode(objective_mode, schedule)

        # 2. Combine Key Factors
        all_factors = (
            heat_factors
            + workforce_factors
            + resource_factors
            + dependency_factors
            + deadline_factors
            + recovery_factors
            + opt_factors
        )

        severity_order = {
            DecisionFactorSeverity.CRITICAL: 0,
            DecisionFactorSeverity.HIGH: 1,
            DecisionFactorSeverity.MODERATE: 2,
            DecisionFactorSeverity.INFO: 3
        }
        key_factors = sorted(all_factors, key=lambda f: severity_order.get(f.severity, 99))[:8]

        # 3. Peak WBGT info
        peak_wbgt = 0.0
        peak_wbgt_time = "13:00"
        for slot in weather_slots:
            w_c = getattr(slot, "estimated_wbgt_c", getattr(slot, "predicted_wbgt", getattr(slot, "wbgt_celsius", 0.0)))
            if w_c > peak_wbgt:
                peak_wbgt = w_c
                s_idx = getattr(slot, "slot_index", 0)
                hour = 7 + (s_idx * 15) // 60
                minute = (s_idx * 15) % 60
                peak_wbgt_time = f"{hour:02d}:{minute:02d}"

        # 4. Completion & Summary Metrics
        completion_min = 0
        total_work_min = 0
        total_rest_min = 0

        for asgn in normalized_assignments:
            end_m = (asgn["slot_index"] + 1) * 15
            is_rest = asgn.get("is_rest", False) or asgn.get("task_id") == "REST"
            if not is_rest and end_m > completion_min:
                completion_min = end_m
            if is_rest:
                total_rest_min += 15
            else:
                total_work_min += 15

        # 5. Build Headlines & Category Summaries
        headline, subheadline = cls._build_headline_and_subheadline(
            peak_wbgt, peak_utilization, key_factors, objective_mode, total_rest_min
        )

        heat_summary = cls._summarize_heat_impact(peak_wbgt, peak_wbgt_time, heat_factors)
        workforce_summary = cls._summarize_workforce_impact(workforce_factors, len(workers))
        resource_summary = cls._summarize_resource_impact(peak_utilization, resource_factors)
        deadline_summary = cls._summarize_deadline_impact(deadline_factors)
        recovery_summary = cls._summarize_recovery_impact(total_rest_min, recovery_factors)

        decision_summary = DecisionSummary(
            headline=headline,
            subheadline=subheadline,
            objectiveMode=objective_mode.value if hasattr(objective_mode, "value") else str(objective_mode),
            objectiveModeExplanation=opt_explanation,
            keyFactors=key_factors,
            heatImpactSummary=heat_summary,
            workforceImpactSummary=workforce_summary,
            resourceImpactSummary=resource_summary,
            deadlineImpactSummary=deadline_summary,
            recoveryImpactSummary=recovery_summary,
            completionTimeMinutes=completion_min,
            totalWorkMinutes=total_work_min,
            totalRestMinutes=total_rest_min,
            peakWbgtCelsius=round(peak_wbgt, 1),
            peakWbgtTime=peak_wbgt_time,
            peakResourceUtilizationPct=round(peak_utilization, 1)
        )

        # 6. Task Explanations
        task_explanations = cls._build_task_explanations(
            normalized_assignments, tasks_by_id, all_factors, weather_slots, scenario_diff
        )

        # 7. Worker Explanations
        worker_explanations = cls._build_worker_explanations(
            normalized_assignments, workers_by_id, tasks_by_id, all_factors, scenario_diff
        )

        # 8. Scenario Delta Explanation
        scenario_explanation = None
        if scenario_diff is not None or applied_overrides is not None:
            scenario_explanation = cls._analyze_scenario_delta(
                scenario_diff=scenario_diff or {},
                applied_overrides=applied_overrides or {},
                baseline_schedule=baseline_schedule,
                scenario_schedule=schedule
            )

        return ScheduleExplanationResponse(
            success=True,
            decisionSummary=decision_summary,
            taskExplanations=task_explanations,
            workerExplanations=worker_explanations,
            scenarioExplanation=scenario_explanation
        )

    # -------------------------------------------------------------------------
    # Helper: Normalize Assignments
    # -------------------------------------------------------------------------

    @classmethod
    def _normalize_assignments(cls, assignments: List[Any]) -> List[Dict[str, Any]]:
        norm = []
        for a in assignments:
            if isinstance(a, dict):
                tid = a.get("task_id") or a.get("taskId")
                wid = a.get("worker_id") or a.get("workerId")
                s_idx = a.get("slot_index", a.get("slotIndex", 0))
                asgn_type = a.get("assignment_type", a.get("assignmentType", "WORK"))
                asgn_type_str = asgn_type.value if hasattr(asgn_type, "value") else str(asgn_type)
                is_rest = (tid == "REST") or (tid is None) or ("REST" in asgn_type_str.upper()) or ("RECOVERY" in asgn_type_str.upper())
            else:
                tid = getattr(a, "task_id", None)
                wid = getattr(a, "worker_id", None)
                s_idx = getattr(a, "slot_index", 0)
                asgn_type = getattr(a, "assignment_type", None)
                asgn_type_str = asgn_type.value if hasattr(asgn_type, "value") else str(asgn_type)
                is_rest = (tid == "REST") or (tid is None) or ("REST" in asgn_type_str.upper()) or ("RECOVERY" in asgn_type_str.upper())

            norm.append({
                "task_id": tid,
                "worker_id": wid,
                "slot_index": s_idx,
                "is_rest": is_rest
            })
        return norm

    # -------------------------------------------------------------------------
    # Driver Analysis Subroutines
    # -------------------------------------------------------------------------

    @classmethod
    def _analyze_heat_drivers(
        cls,
        assignments: List[Dict[str, Any]],
        weather_slots: List[Any],
        tasks_by_id: Dict[str, Any]
    ) -> List[DecisionFactor]:
        factors = []
        if not weather_slots:
            return factors

        # Detect high heat slots (WBGT >= 29.0°C)
        high_heat_slots = []
        peak_wbgt = 0.0
        peak_slot_idx = 0

        for s in weather_slots:
            w_c = getattr(s, "estimated_wbgt_c", getattr(s, "predicted_wbgt", getattr(s, "wbgt_celsius", 0.0)))
            s_idx = getattr(s, "slot_index", 0)
            if w_c >= 29.0:
                high_heat_slots.append(s_idx)
            if w_c > peak_wbgt:
                peak_wbgt = w_c
                peak_slot_idx = s_idx

        if peak_wbgt >= 29.0:
            peak_h = 7 + (peak_slot_idx * 15) // 60
            peak_m = (peak_slot_idx * 15) % 60
            peak_time_str = f"{peak_h:02d}:{peak_m:02d}"

            tasks_in_heat = set()
            for asgn in assignments:
                if not asgn["is_rest"] and asgn["task_id"] and asgn["slot_index"] in high_heat_slots:
                    tasks_in_heat.add(asgn["task_id"])

            if tasks_in_heat:
                task_titles = []
                for tid in tasks_in_heat:
                    t_obj = tasks_by_id.get(tid)
                    t_title = getattr(t_obj, "title", getattr(t_obj, "name", tid)) if t_obj else tid
                    task_titles.append(t_title)

                factors.append(DecisionFactor(
                    id="heat-elevated-exposure",
                    category=DecisionFactorCategory.HEAT,
                    severity=DecisionFactorSeverity.HIGH,
                    title="Work Scheduled Under Elevated Heat",
                    explanation=f"Tasks ({', '.join(task_titles[:2])}) require mandatory rest pacing due to WBGT exceeding 29.0°C.",
                    fact=f"WBGT reaches peak of {peak_wbgt:.1f}°C at {peak_time_str}.",
                    reason="Heavy/moderate tasks executed during elevated thermal load require enforced recovery cycles under the active SafetyPolicy.",
                    impact=f"{len(tasks_in_heat)} task(s) active during heat window with reduced continuous work allowances.",
                    relatedTaskIds=list(tasks_in_heat),
                    evidence={"peakWbgt": peak_wbgt, "peakTime": peak_time_str}
                ))
            else:
                factors.append(DecisionFactor(
                    id="heat-peak-avoidance",
                    category=DecisionFactorCategory.HEAT,
                    severity=DecisionFactorSeverity.INFO,
                    title="Heat Peak Avoidance",
                    explanation=f"All heavy outdoor tasks were scheduled outside the maximum heat window (peak {peak_wbgt:.1f}°C at {peak_time_str}).",
                    fact=f"No high-intensity outdoor tasks assigned during peak WBGT slots.",
                    reason="The optimizer placed demanding tasks in cooler morning intervals to minimize thermal strain and recovery overhead.",
                    impact="Reduced mandatory recovery overhead and maximized continuous labor efficiency.",
                    evidence={"peakWbgt": peak_wbgt}
                ))

        return factors

    @classmethod
    def _analyze_workforce_drivers(
        cls,
        assignments: List[Dict[str, Any]],
        workers_by_id: Dict[str, Any],
        tasks_by_id: Dict[str, Any]
    ) -> List[DecisionFactor]:
        factors = []
        skill_counts: Dict[str, List[str]] = {}

        for wid, w in workers_by_id.items():
            is_act = getattr(w, "is_active", True)
            if is_act:
                skills = getattr(w, "skills", [])
                for skill in skills:
                    s_val = skill.value if hasattr(skill, "value") else str(skill)
                    skill_counts.setdefault(s_val, []).append(wid)

        for tid, task in tasks_by_id.items():
            req_skill = getattr(task, "required_skill", None)
            if req_skill is None:
                r_skills = getattr(task, "required_skills", [])
                if r_skills:
                    req_skill = r_skills[0]

            min_w = getattr(task, "min_workers", 1)
            t_title = getattr(task, "title", getattr(task, "name", tid))

            if req_skill:
                s_val = req_skill.value if hasattr(req_skill, "value") else str(req_skill)
                qualified_workers = skill_counts.get(s_val, [])
                if len(qualified_workers) == 1 and min_w >= 1:
                    sole_w_id = qualified_workers[0]
                    sole_w = workers_by_id.get(sole_w_id)
                    sole_name = getattr(sole_w, "name", sole_w_id) if sole_w else sole_w_id

                    factors.append(DecisionFactor(
                        id=f"workforce-skill-bottleneck-{tid}",
                        category=DecisionFactorCategory.WORKFORCE,
                        severity=DecisionFactorSeverity.MODERATE,
                        title=f"Single-Worker Skill Bottleneck ({s_val})",
                        explanation=f"Worker {sole_name} is the only available personnel with required '{s_val}' trade skill for '{t_title}'.",
                        fact=f"Only 1 qualified active worker available for skill '{s_val}'.",
                        reason=f"Task '{t_title}' cannot be parallelized or handed off to alternative workers.",
                        impact="Constrains sequential task placement and limits rescheduling flexibility.",
                        relatedTaskIds=[tid],
                        relatedWorkerIds=[sole_w_id],
                        evidence={"skill": s_val, "worker": sole_name}
                    ))

        return factors

    @classmethod
    def _analyze_resource_drivers(
        cls,
        assignments: List[Dict[str, Any]],
        resources_by_id: Dict[str, Any],
        tasks_by_id: Dict[str, Any]
    ) -> Tuple[List[DecisionFactor], float]:
        factors = []
        peak_utilization_pct = 0.0

        if not resources_by_id:
            return factors, 0.0

        max_slot = max((asgn["slot_index"] for asgn in assignments), default=0) + 1
        resource_slot_usage: Dict[str, List[int]] = {r_id: [0] * max_slot for r_id in resources_by_id}

        for asgn in assignments:
            s_idx = asgn["slot_index"]
            if s_idx < max_slot:
                if asgn["is_rest"]:
                    for r_id, res in resources_by_id.items():
                        r_type = getattr(res, "type", getattr(res, "resource_type", "SHADE"))
                        r_type_str = r_type.value if hasattr(r_type, "value") else str(r_type)
                        if any(t in r_type_str.upper() for t in ["SHADE", "REST", "COOLING"]):
                            resource_slot_usage[r_id][s_idx] += 1
                elif asgn["task_id"] in tasks_by_id:
                    task = tasks_by_id[asgn["task_id"]]
                    reqs = getattr(task, "resource_requirements", [])
                    for req in reqs:
                        req_rid = getattr(req, "resource_id", None)
                        req_qty = getattr(req, "quantity", 1)
                        if req_rid in resource_slot_usage:
                            resource_slot_usage[req_rid][s_idx] += req_qty

        for r_id, usage_per_slot in resource_slot_usage.items():
            res = resources_by_id[r_id]
            cap = getattr(res, "capacity", 1)
            r_name = getattr(res, "name", r_id)
            peak_u = max(usage_per_slot, default=0)
            util_pct = (peak_u / cap * 100.0) if cap > 0 else 0.0
            if util_pct > peak_utilization_pct:
                peak_utilization_pct = util_pct

            if util_pct >= 85.0:
                peak_slot_idx = usage_per_slot.index(peak_u)
                peak_h = 7 + (peak_slot_idx * 15) // 60
                peak_m = (peak_slot_idx * 15) % 60
                factors.append(DecisionFactor(
                    id=f"resource-bottleneck-{r_id}",
                    category=DecisionFactorCategory.RESOURCE,
                    severity=DecisionFactorSeverity.HIGH if util_pct >= 100.0 else DecisionFactorSeverity.MODERATE,
                    title=f"Peak Resource Utilization ({r_name})",
                    explanation=f"Resource '{r_name}' reaches {util_pct:.0f}% capacity ({peak_u}/{cap}) at {peak_h:02d}:{peak_m:02d}.",
                    fact=f"Maximum utilization is {peak_u} of {cap} units.",
                    reason="Simultaneous worker recovery breaks and equipment tasks compete for limited on-site infrastructure.",
                    impact="Forces task and recovery staggering to avoid exceeding physical site capacity.",
                    relatedResourceIds=[r_id],
                    evidence={"capacity": cap, "peakUsage": peak_u, "utilizationPct": util_pct}
                ))

        return factors, peak_utilization_pct

    @classmethod
    def _analyze_dependency_drivers(
        cls,
        assignments: List[Dict[str, Any]],
        tasks_by_id: Dict[str, Any]
    ) -> List[DecisionFactor]:
        factors = []
        task_start_slots: Dict[str, int] = {}
        task_end_slots: Dict[str, int] = {}

        for asgn in assignments:
            if not asgn["is_rest"] and asgn["task_id"]:
                tid = asgn["task_id"]
                s_idx = asgn["slot_index"]
                task_start_slots[tid] = min(task_start_slots.get(tid, 999), s_idx)
                task_end_slots[tid] = max(task_end_slots.get(tid, -1), s_idx + 1)

        for tid, task in tasks_by_id.items():
            deps = getattr(task, "dependencies", []) or getattr(task, "prerequisite_task_ids", [])
            t_title = getattr(task, "title", getattr(task, "name", tid))
            for pred_id in deps:
                if pred_id in task_end_slots and tid in task_start_slots:
                    pred_end = task_end_slots[pred_id]
                    task_start = task_start_slots[tid]
                    pred_obj = tasks_by_id.get(pred_id)
                    pred_title = getattr(pred_obj, "title", getattr(pred_obj, "name", pred_id)) if pred_obj else pred_id
                    if task_start == pred_end:
                        factors.append(DecisionFactor(
                            id=f"dependency-tight-{tid}-{pred_id}",
                            category=DecisionFactorCategory.DEPENDENCY,
                            severity=DecisionFactorSeverity.INFO,
                            title=f"Tight Sequence Precedence ({t_title})",
                            explanation=f"Task '{t_title}' begins immediately after prerequisite '{pred_title}' completes.",
                            fact=f"Prerequisite '{pred_title}' ends at slot {pred_end}; '{t_title}' begins at slot {task_start}.",
                            reason="Strict finish-to-start dependency constraint was satisfied with zero idle delay.",
                            impact="Predecessor timing directly dictates successor execution window.",
                            relatedTaskIds=[tid, pred_id]
                        ))

        return factors

    @classmethod
    def _analyze_deadline_drivers(
        cls,
        assignments: List[Dict[str, Any]],
        tasks_by_id: Dict[str, Any]
    ) -> List[DecisionFactor]:
        factors = []
        task_end_slots: Dict[str, int] = {}

        for asgn in assignments:
            if not asgn["is_rest"] and asgn["task_id"]:
                tid = asgn["task_id"]
                task_end_slots[tid] = max(task_end_slots.get(tid, -1), asgn["slot_index"] + 1)

        for tid, task in tasks_by_id.items():
            dl = getattr(task, "latest_end_slot", None)
            if dl is None:
                dl = getattr(task, "deadline_slot", None)
            if dl is None and getattr(task, "deadline_minute", None) is not None:
                dl = getattr(task, "deadline_minute") // 15
            
            t_title = getattr(task, "title", getattr(task, "name", tid))
            if dl is not None and tid in task_end_slots:
                end_slot = task_end_slots[tid]
                margin_slots = dl - end_slot
                if margin_slots <= 1:
                    margin_min = margin_slots * 15
                    factors.append(DecisionFactor(
                        id=f"deadline-tight-{tid}",
                        category=DecisionFactorCategory.DEADLINE,
                        severity=DecisionFactorSeverity.HIGH if margin_slots == 0 else DecisionFactorSeverity.MODERATE,
                        title=f"Tight Deadline Margin ({t_title})",
                        explanation=f"Task '{t_title}' finishes within {margin_min} minutes of its configured deadline.",
                        fact=f"Completed at slot {end_slot} (deadline is slot {dl}).",
                        reason="Task prioritization was elevated by the solver to satisfy strict completion cutoff.",
                        impact="Reduced buffer for unexpected on-site disruptions or extended recovery breaks.",
                        relatedTaskIds=[tid],
                        evidence={"marginMinutes": margin_min, "deadlineSlot": dl}
                    ))

        return factors

    @classmethod
    def _analyze_recovery_drivers(
        cls,
        assignments: List[Dict[str, Any]],
        workers_by_id: Dict[str, Any],
        tasks_by_id: Dict[str, Any]
    ) -> List[DecisionFactor]:
        factors = []
        rest_by_worker: Dict[str, int] = {}

        for asgn in assignments:
            if asgn["is_rest"] and asgn["worker_id"]:
                wid = asgn["worker_id"]
                rest_by_worker[wid] = rest_by_worker.get(wid, 0) + 15

        if rest_by_worker:
            total_rest = sum(rest_by_worker.values())
            max_w_id = max(rest_by_worker, key=rest_by_worker.get)
            max_m = rest_by_worker[max_w_id]
            w_obj = workers_by_id.get(max_w_id)
            w_name = getattr(w_obj, "name", max_w_id) if w_obj else max_w_id

            factors.append(DecisionFactor(
                id="recovery-mandatory-pacing",
                category=DecisionFactorCategory.RECOVERY,
                severity=DecisionFactorSeverity.MODERATE,
                title="Mandatory Recovery Blocks Scheduled",
                explanation=f"{total_rest} total minutes of shade/cooling recovery allocated across {len(rest_by_worker)} workers.",
                fact=f"Worker {w_name} received highest allocation ({max_m} min rest).",
                reason="Mandated by SafetyPolicy work/rest sequencing after reaching continuous work thresholds.",
                impact="Safely mitigates cumulative heat exposure and maintains recovery boundaries.",
                relatedWorkerIds=[max_w_id],
                evidence={"totalRestMinutes": total_rest, "maxWorkerRest": max_m}
            ))

        return factors

    @classmethod
    def _analyze_objective_mode(
        cls,
        mode: Union[SolverObjectiveMode, str],
        schedule: SolverScheduleOutput
    ) -> Tuple[List[DecisionFactor], str]:
        factors = []
        mode_str = mode.value if hasattr(mode, "value") else str(mode)

        if mode_str == "FASTEST":
            explanation = "Prioritized earliest completion time (minimizing makespan) while strictly satisfying all hard safety, resource, trade skill, and precedence constraints."
            factors.append(DecisionFactor(
                id="objective-fastest",
                category=DecisionFactorCategory.OPTIMIZATION,
                severity=DecisionFactorSeverity.INFO,
                title="Optimization Mode: FASTEST (Makespan Minimized)",
                explanation=explanation,
                fact="CP-SAT objective function assigned primary weight to minimizing schedule completion time.",
                reason="Workforce tasks are compressed into earliest feasible slots compatible with safety caps.",
                impact="Maximizes project velocity without violating maximum continuous-work thresholds."
            ))
        elif mode_str == "SAFEST":
            explanation = "Placed maximum optimization weight on minimizing heat strain and exposure penalties, prioritizing cooler morning hours over total shift duration."
            factors.append(DecisionFactor(
                id="objective-safest",
                category=DecisionFactorCategory.OPTIMIZATION,
                severity=DecisionFactorSeverity.INFO,
                title="Optimization Mode: SAFEST (Thermal Strain Minimized)",
                explanation=explanation,
                fact="CP-SAT objective function penalized task execution during elevated WBGT intervals.",
                reason="Staggers tasks into cooler environmental periods and expands protective rest buffers.",
                impact="Reduces cumulative worker thermal strain while remaining within project bounds."
            ))
        else:
            explanation = "Balanced project completion time against environmental heat exposure penalties while strictly upholding all hard safety constraints."
            factors.append(DecisionFactor(
                id="objective-balanced",
                category=DecisionFactorCategory.OPTIMIZATION,
                severity=DecisionFactorSeverity.INFO,
                title="Optimization Mode: BALANCED (Trade-off Optimized)",
                explanation=explanation,
                fact="CP-SAT objective function balanced makespan minimization and thermal penalty reduction.",
                reason="Provides optimal operational velocity while avoiding unnecessary heat exposure.",
                impact="Maintains robust project pacing alongside prudent heat mitigation."
            ))

        return factors, explanation

    @classmethod
    def _analyze_scenario_delta(
        cls,
        scenario_diff: Dict[str, Any],
        applied_overrides: Dict[str, Any],
        baseline_schedule: Optional[SolverScheduleOutput],
        scenario_schedule: SolverScheduleOutput
    ) -> ScenarioExplanation:
        summary = scenario_diff.get("comparison_summary", {})
        task_diffs = scenario_diff.get("task_diffs", [])

        moved_tasks = [t for t in task_diffs if t.get("change_type") == "MOVED"]
        reassigned_tasks = [t for t in task_diffs if t.get("change_type") == "WORKERS_CHANGED"]

        key_changes = []
        bottleneck = None

        if "weather" in applied_overrides:
            w_ov = applied_overrides["weather"]
            deltas = []
            if "temperature_c_delta" in w_ov:
                deltas.append(f"Temperature {w_ov['temperature_c_delta']:+0.1f}°C")
            if "relative_humidity_delta" in w_ov:
                deltas.append(f"Humidity {w_ov['relative_humidity_delta']:+0.1f}%")
            if "solar_radiation_wm2_delta" in w_ov:
                deltas.append(f"Solar Radiation {w_ov['solar_radiation_wm2_delta']:+0.0f} W/m²")
            key_changes.append(f"Weather Override: {', '.join(deltas)}")
            bottleneck = "Elevated environmental heat stress"

        if "workers" in applied_overrides:
            w_ov = applied_overrides["workers"]
            unavail = [wid for wid, av in w_ov.items() if not av]
            if unavail:
                key_changes.append(f"Workforce Absence: {len(unavail)} worker(s) marked unavailable ({', '.join(unavail[:2])})")
                bottleneck = f"Workforce reduction ({len(unavail)} worker(s) unavailable)"

        if "resources" in applied_overrides:
            r_ov = applied_overrides["resources"]
            res_changes = [f"Resource {rid} capacity → {cap}" for rid, cap in r_ov.items()]
            key_changes.append(f"Resource Capacity Adjusted: {', '.join(res_changes)}")
            bottleneck = "Rest & shade resource capacity constraint"

        if "tasks" in applied_overrides:
            t_ov = applied_overrides["tasks"]
            task_changes = [f"Task {tid} deadline → slot {dl}" for tid, dl in t_ov.items()]
            key_changes.append(f"Task Deadlines Accelerated: {', '.join(task_changes)}")
            bottleneck = "Accelerated task completion deadline"

        time_delta = summary.get("completion_time_delta_minutes", 0)
        rest_delta = summary.get("rest_minutes_delta", 0)

        if time_delta != 0:
            key_changes.append(f"Shift Completion Time: {time_delta:+d} minutes relative to baseline")
        if rest_delta != 0:
            key_changes.append(f"Mandatory Rest Allocation: {rest_delta:+d} minutes total recovery")
        if moved_tasks:
            key_changes.append(f"Task Schedule Adjustments: {len(moved_tasks)} task(s) shifted timing")
        if reassigned_tasks:
            key_changes.append(f"Personnel Reassignments: {len(reassigned_tasks)} task(s) changed crew")

        headline = "Scenario Simulation: Feasible Schedule Generated"
        if not key_changes:
            key_changes.append("No active overrides applied; scenario is identical to baseline schedule.")
            narrative = "The scenario produced identical results to baseline because zero operational parameters were overridden."
        else:
            narrative = f"The scenario adjusted operational inputs resulting in {len(moved_tasks)} shifted tasks and {time_delta:+d} min completion delta. All hard safety constraints remained strictly enforced."

        return ScenarioExplanation(
            headline=headline,
            narrative=narrative,
            keyChanges=key_changes,
            bottleneckFactor=bottleneck
        )

    # -------------------------------------------------------------------------
    # Building Task & Worker Explanations
    # -------------------------------------------------------------------------

    @classmethod
    def _build_task_explanations(
        cls,
        assignments: List[Dict[str, Any]],
        tasks_by_id: Dict[str, Any],
        all_factors: List[DecisionFactor],
        weather_slots: List[Any],
        scenario_diff: Optional[Dict[str, Any]]
    ) -> Dict[str, TaskExplanation]:
        result = {}

        task_info: Dict[str, Dict[str, Any]] = {}
        for asgn in assignments:
            if not asgn["is_rest"] and asgn["task_id"]:
                t_id = asgn["task_id"]
                s_idx = asgn["slot_index"]
                w_id = asgn["worker_id"]
                if t_id not in task_info:
                    task_info[t_id] = {
                        "min_slot": s_idx,
                        "max_slot": s_idx + 1,
                        "workers": set()
                    }
                else:
                    task_info[t_id]["min_slot"] = min(task_info[t_id]["min_slot"], s_idx)
                    task_info[t_id]["max_slot"] = max(task_info[t_id]["max_slot"], s_idx + 1)
                if w_id:
                    task_info[t_id]["workers"].add(w_id)

        diff_map = {}
        if scenario_diff and "task_diffs" in scenario_diff:
            for td in scenario_diff["task_diffs"]:
                diff_map[td["task_id"]] = td

        for t_id, info in task_info.items():
            task = tasks_by_id.get(t_id)
            title = getattr(task, "title", getattr(task, "name", t_id)) if task else t_id
            start_m = info["min_slot"] * 15
            end_m = info["max_slot"] * 15

            start_h = 7 + start_m // 60
            start_min = start_m % 60
            end_h = 7 + end_m // 60
            end_min = end_m % 60

            start_time_str = f"{start_h:02d}:{start_min:02d}"
            end_time_str = f"{end_h:02d}:{end_min:02d}"

            task_factors = [f for f in all_factors if t_id in f.related_task_ids]

            if any(f.category == DecisionFactorCategory.DEADLINE for f in task_factors):
                primary_reason = "Scheduled to satisfy strict task completion deadline."
            elif any(f.category == DecisionFactorCategory.DEPENDENCY for f in task_factors):
                primary_reason = "Scheduled immediately following completion of prerequisite tasks."
            elif any(f.category == DecisionFactorCategory.WORKFORCE for f in task_factors):
                primary_reason = "Scheduled based on specialized trade skill availability."
            elif any(f.category == DecisionFactorCategory.HEAT for f in task_factors):
                primary_reason = "Scheduled in optimal thermal window to minimize heat exposure."
            else:
                primary_reason = "Scheduled in earliest feasible slot satisfying worker and resource constraints."

            delta_text = None
            if t_id in diff_map:
                td = diff_map[t_id]
                if td.get("change_type") == "MOVED":
                    s_delta = td.get("start_delta_minutes", 0)
                    delta_text = f"Shifted {s_delta:+d} minutes relative to baseline ({td.get('baseline_start_time')} → {start_time_str})."
                elif td.get("change_type") == "WORKERS_CHANGED":
                    delta_text = f"Crew reassigned relative to baseline (Added: {', '.join(td.get('workers_added', []))})."

            result[t_id] = TaskExplanation(
                taskId=t_id,
                taskTitle=title,
                startMinute=start_m,
                endMinute=end_m,
                startTime=start_time_str,
                endTime=end_time_str,
                assignedWorkers=sorted(list(info["workers"])),
                primaryReason=primary_reason,
                factors=task_factors,
                scenarioDeltaText=delta_text
            )

        return result

    @classmethod
    def _build_worker_explanations(
        cls,
        assignments: List[Dict[str, Any]],
        workers_by_id: Dict[str, Any],
        tasks_by_id: Dict[str, Any],
        all_factors: List[DecisionFactor],
        scenario_diff: Optional[Dict[str, Any]]
    ) -> Dict[str, WorkerExplanation]:
        result = {}

        worker_tasks: Dict[str, set] = {}
        worker_work_min: Dict[str, int] = {}
        worker_rest_min: Dict[str, int] = {}
        worker_rest_blocks: Dict[str, int] = {}

        for asgn in assignments:
            w_id = asgn["worker_id"]
            if w_id:
                if asgn["is_rest"]:
                    worker_rest_min[w_id] = worker_rest_min.get(w_id, 0) + 15
                    worker_rest_blocks[w_id] = worker_rest_blocks.get(w_id, 0) + 1
                elif asgn["task_id"]:
                    worker_tasks.setdefault(w_id, set()).add(asgn["task_id"])
                    worker_work_min[w_id] = worker_work_min.get(w_id, 0) + 15

        for w_id, w in workers_by_id.items():
            tasks_list = sorted(list(worker_tasks.get(w_id, set())))
            work_m = worker_work_min.get(w_id, 0)
            rest_m = worker_rest_min.get(w_id, 0)
            blocks = worker_rest_blocks.get(w_id, 0)

            worker_factors = [f for f in all_factors if w_id in f.related_worker_ids]

            reassignment = None
            is_act = getattr(w, "is_active", True)
            if not is_act:
                reassignment = "Worker is unavailable for this shift."
            elif not tasks_list:
                reassignment = "Worker kept on reserve for shift balancing."

            w_name = getattr(w, "name", w_id)

            result[w_id] = WorkerExplanation(
                workerId=w_id,
                workerName=w_name,
                assignedTasks=tasks_list,
                totalWorkMinutes=work_m,
                totalRestMinutes=rest_m,
                mandatoryRestBlocksCount=blocks,
                reassignmentReason=reassignment,
                factors=worker_factors
            )

        return result

    # -------------------------------------------------------------------------
    # Narrative & Summary Helpers
    # -------------------------------------------------------------------------

    @classmethod
    def _build_headline_and_subheadline(
        cls,
        peak_wbgt: float,
        peak_resource_util: float,
        key_factors: List[DecisionFactor],
        mode: Union[SolverObjectiveMode, str],
        total_rest: int
    ) -> Tuple[str, str]:
        mode_val = mode.value if hasattr(mode, "value") else str(mode)

        if peak_wbgt >= 31.0 and peak_resource_util >= 85.0:
            headline = "Schedule Optimized Around Afternoon Heat Peak & Constrained Recovery Resources"
            subheadline = f"Peak WBGT reached {peak_wbgt:.1f}°C with recovery infrastructure utilized at {peak_resource_util:.0f}% capacity."
        elif peak_wbgt >= 30.0:
            headline = "Schedule Structured Around Elevated Heat Risk & Mandatory Cooling Pacing"
            subheadline = f"Environmental heat required {total_rest} minutes of structured recovery under the active SafetyPolicy."
        elif peak_resource_util >= 90.0:
            headline = "Schedule Sequenced Around High Site Resource Utilization"
            subheadline = f"Peak resource utilization reached {peak_resource_util:.0f}%, necessitating staggered task and rest intervals."
        else:
            headline = f"Schedule Optimized for {mode_val.capitalize()} Operational Flow"
            subheadline = "Balanced task dependencies, trade skill allocations, and preventive safety pacing."

        return headline, subheadline

    @classmethod
    def _summarize_heat_impact(cls, peak_wbgt: float, peak_time: str, factors: List[DecisionFactor]) -> str:
        if peak_wbgt >= 29.0:
            return f"Peak WBGT reaches {peak_wbgt:.1f}°C at {peak_time}. Work/rest cycles and continuous work limits are actively enforced."
        return f"Environmental conditions remain moderate (Peak WBGT {peak_wbgt:.1f}°C at {peak_time}). Normal continuous work allowances apply."

    @classmethod
    def _summarize_workforce_impact(cls, factors: List[DecisionFactor], total_workers: int) -> str:
        skill_factors = [f for f in factors if "skill" in f.id.lower()]
        if skill_factors:
            return f"Workforce allocation is constrained by {len(skill_factors)} specialized trade skill bottleneck(s) across {total_workers} active workers."
        return f"Workforce trade skills and availability are well-distributed across {total_workers} active crew members."

    @classmethod
    def _summarize_resource_impact(cls, peak_util: float, factors: List[DecisionFactor]) -> str:
        if peak_util >= 85.0:
            return f"Site shade/cooling capacity reaches {peak_util:.0f}% utilization, requiring staggered recovery cycles."
        return f"Resource capacity remains sufficient throughout the shift (Peak utilization {peak_util:.0f}%)."

    @classmethod
    def _summarize_deadline_impact(cls, factors: List[DecisionFactor]) -> str:
        tight_factors = [f for f in factors if f.severity in [DecisionFactorSeverity.HIGH, DecisionFactorSeverity.CRITICAL]]
        if tight_factors:
            return f"{len(tight_factors)} task(s) operate with tight completion margins close to their hard deadlines."
        return "All scheduled tasks comfortably satisfy required completion windows."

    @classmethod
    def _summarize_recovery_impact(cls, total_rest: int, factors: List[DecisionFactor]) -> str:
        if total_rest > 0:
            return f"{total_rest} total minutes of mandatory shade/cooling recovery allocated to prevent continuous heat strain."
        return "Zero mandatory recovery blocks required under current environmental and workload parameters."
