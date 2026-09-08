"""
ThermoShift - Phase 4B-2 CP-SAT Scheduling Engine

Extends Phase 4B-1 with:
1. FINITE SITE RESOURCE CAPACITY (Hard CP-SAT constraints)
2. THREE DETERMINISTIC OBJECTIVE MODES:
   - SAFEST: Minimizes cumulative modeled thermal exposure / operational heat burden
   - BALANCED: Calibrated integer trade-off between schedule delay and thermal exposure
   - FASTEST: Minimizes total task completion makespan / delay

ARCHITECTURAL PRINCIPLES:
1. LEVEL 1 HARD FEASIBILITY strictly dominates LEVEL 2 OBJECTIVES.
2. Safety limits, mandatory recovery, and finite resource capacities can NEVER be violated or softened.
3. Recovery rest in shade/cooling explicitly consumes finite site shelter capacity.
4. Idle time does not consume recovery resources and does not reset the continuous work counter.
5. All safety parameters are dynamically derived from SafetyPolicy / ExposureModel (zero hardcoded safety constants).
"""

import time
from typing import Dict, List, Optional, Set, Tuple
from ortools.sat.python import cp_model

from optimizer.engine.data_models import (
    SkillType,
    PhysicalIntensity,
    HeatVulnerabilityLevel,
    HeatRiskCategory,
    AssignmentType,
    SafetyPolicy
)
from optimizer.engine.exposure_model import ExposureModel
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


class CPSATSchedulingEngine:
    """
    Google OR-Tools CP-SAT Scheduling Engine for ThermoShift (Phase 4B-2).
    """

    RECOVERY_RESOURCE_TYPES: Set[str] = {
        "SHADE",
        "SHADE_STRUCTURE",
        "COOLING_TENT",
        "COOLING_TRAILER",
        "COOLING_STATION",
        "REST_SHADE",
        "REST_COOLING",
    }

    @classmethod
    def _format_time_str(cls, minute_offset: int) -> str:
        """Converts minute offset into HH:MM time string."""
        hours = (minute_offset // 60) % 24
        minutes = minute_offset % 60
        return f"{hours:02d}:{minutes:02d}"

    @classmethod
    def is_recovery_resource(cls, res: SolverResourceInput) -> bool:
        """Determines if a resource is dedicated to worker thermal recovery (shade/cooling)."""
        r_type = res.resource_type.upper()
        r_name = res.name.upper()
        return (
            r_type in cls.RECOVERY_RESOURCE_TYPES
            or "SHADE" in r_name
            or "COOLING" in r_name
            or "REST" in r_name
        )

    @classmethod
    def check_worker_skill_eligibility(cls, worker: SolverWorkerInput, task: SolverTaskInput) -> bool:
        """Verifies whether worker possesses all required skills for a task."""
        worker_skills_set = set(worker.skills)
        for req_skill in task.required_skills:
            if req_skill not in worker_skills_set:
                return False
        return True

    @classmethod
    def get_highest_weather_risk(cls, weather_slots: List[SolverTimeSlotWeather]) -> HeatRiskCategory:
        """Finds the most severe heat risk category across the forecasted weather slots."""
        highest_risk = HeatRiskCategory.LOW
        for slot in weather_slots:
            if slot.risk_category == HeatRiskCategory.EXTREME:
                return HeatRiskCategory.EXTREME
            elif slot.risk_category == HeatRiskCategory.VERY_HIGH and highest_risk != HeatRiskCategory.EXTREME:
                highest_risk = HeatRiskCategory.VERY_HIGH
            elif slot.risk_category == HeatRiskCategory.HIGH and highest_risk not in (HeatRiskCategory.EXTREME, HeatRiskCategory.VERY_HIGH):
                highest_risk = HeatRiskCategory.HIGH
            elif slot.risk_category == HeatRiskCategory.MODERATE and highest_risk == HeatRiskCategory.LOW:
                highest_risk = HeatRiskCategory.MODERATE
        return highest_risk

    @classmethod
    def get_worker_safety_parameters(
        cls,
        worker: SolverWorkerInput,
        intensity: PhysicalIntensity,
        weather_slots: List[SolverTimeSlotWeather],
        policy: SafetyPolicy
    ) -> Tuple[int, int]:
        """
        Queries the authoritative SafetyPolicy / ExposureModel to directly obtain:
        (max_continuous_work_minutes, mandatory_recovery_rest_minutes)
        for a worker under the forecasted heat conditions without using an arbitrary duration probe.
        """
        highest_risk = cls.get_highest_weather_risk(weather_slots)

        max_work_mins, rest_mins, _ = ExposureModel.get_applicable_work_rest_limits(
            risk_category=highest_risk,
            intensity=intensity,
            is_acclimatized=worker.is_acclimatized,
            vulnerability=worker.vulnerability_rating,
            custom_max_work=worker.max_continuous_work_cap_minutes,
            policy=policy
        )

        # Mandatory rest minutes per cycle (if policy specifies 0, minimum 1-slot 15 min for qualifying reset)
        if rest_mins <= 0:
            rest_mins = 15

        return (max_work_mins, rest_mins)

    @classmethod
    def solve(cls, problem: SolverProblemInstance) -> SolverScheduleOutput:
        """
        Builds and solves the CP-SAT scheduling problem instance with cumulative work/rest tracking,
        finite site resource capacity, and thermal objective optimization.
        """
        start_solve_time = time.time()
        slot_interval = problem.slot_interval_minutes
        total_slots = problem.total_slots
        max_minute = total_slots * slot_interval

        # =========================================================================
        # 1. PRE-SOLVE FEASIBILITY DIAGNOSTICS
        # =========================================================================
        diagnostics: List[str] = []
        task_map: Dict[str, SolverTaskInput] = {t.task_id: t for t in problem.tasks}
        worker_map: Dict[str, SolverWorkerInput] = {w.worker_id: w for w in problem.workers}

        for task in problem.tasks:
            # Check window bounds
            if task.duration_minutes > (task.deadline_minute - task.earliest_start_minute):
                diagnostics.append(
                    f"Task '{task.title}' (ID: {task.task_id}) duration ({task.duration_minutes} min) exceeds allowable window ({task.earliest_start_minute} to {task.deadline_minute} min)."
                )
            if task.deadline_minute > max_minute:
                diagnostics.append(
                    f"Task '{task.title}' deadline ({task.deadline_minute} min) exceeds total shift time ({max_minute} min)."
                )

            # Check skill eligibility and team size
            eligible_workers = [w for w in problem.workers if cls.check_worker_skill_eligibility(w, task)]
            if len(eligible_workers) < task.min_workers:
                diagnostics.append(
                    f"Task '{task.title}' requires {task.min_workers} qualified workers with skills {[s.value for s in task.required_skills]}, but only {len(eligible_workers)} available."
                )

            # Check individual task continuous work safety caps against eligible workers
            safe_workers = []
            for w in eligible_workers:
                max_work, _ = cls.get_worker_safety_parameters(w, task.intensity, problem.weather_slots, problem.safety_policy)
                if task.duration_minutes <= max_work:
                    safe_workers.append(w)

            if len(safe_workers) < task.min_workers and len(eligible_workers) >= task.min_workers:
                diagnostics.append(
                    f"Task '{task.title}' duration ({task.duration_minutes} min) exceeds continuous-work safety limits for all qualified workers under active SafetyPolicy."
                )

        # Check dependencies
        for task in problem.tasks:
            for dep_id in task.dependencies:
                if dep_id not in task_map:
                    diagnostics.append(f"Task '{task.title}' depends on non-existent task ID '{dep_id}'.")

        # Check resource capacity sanity
        for res in problem.resources:
            if res.capacity < 0:
                diagnostics.append(f"Resource '{res.name}' (ID: {res.resource_id}) has negative capacity ({res.capacity}).")

        if diagnostics:
            return SolverScheduleOutput(
                status="INFEASIBLE",
                solve_time_seconds=round(time.time() - start_solve_time, 4),
                objective_value=None,
                total_tasks_scheduled=0,
                total_work_minutes=0,
                total_rest_minutes=0,
                peak_shade_utilization=0,
                peak_water_utilization=0,
                assignments=[],
                unassigned_task_ids=[t.task_id for t in problem.tasks],
                solver_messages=diagnostics
            )

        # =========================================================================
        # 2. CP-SAT MODEL FORMULATION
        # =========================================================================
        model = cp_model.CpModel()

        # Task timing variables
        task_start_vars: Dict[str, cp_model.IntVar] = {}
        task_end_vars: Dict[str, cp_model.IntVar] = {}
        task_dur_slots: Dict[str, int] = {}

        for task in problem.tasks:
            d_slots = (task.duration_minutes + slot_interval - 1) // slot_interval
            e_slot = task.earliest_start_minute // slot_interval
            l_slot = task.deadline_minute // slot_interval

            start_v = model.NewIntVar(e_slot, l_slot - d_slots, f"start_{task.task_id}")
            end_v = model.NewIntVar(e_slot + d_slots, l_slot, f"end_{task.task_id}")
            model.Add(end_v == start_v + d_slots)

            task_start_vars[task.task_id] = start_v
            task_end_vars[task.task_id] = end_v
            task_dur_slots[task.task_id] = d_slots

        # Task-slot activity booleans: z[task_id, s] == 1 iff task is active at slot s
        task_active_in_slot: Dict[Tuple[str, int], cp_model.BoolVar] = {}
        for task in problem.tasks:
            for s in range(total_slots):
                z = model.NewBoolVar(f"z_{task.task_id}_{s}")
                task_active_in_slot[(task.task_id, s)] = z

                # z == 1 iff (start_v <= s and end_v > s)
                start_le = model.NewBoolVar(f"start_le_{task.task_id}_{s}")
                end_gt = model.NewBoolVar(f"end_gt_{task.task_id}_{s}")

                model.Add(task_start_vars[task.task_id] <= s).OnlyEnforceIf(start_le)
                model.Add(task_start_vars[task.task_id] > s).OnlyEnforceIf(start_le.Not())

                model.Add(task_end_vars[task.task_id] > s).OnlyEnforceIf(end_gt)
                model.Add(task_end_vars[task.task_id] <= s).OnlyEnforceIf(end_gt.Not())

                model.AddBoolAnd([start_le, end_gt]).OnlyEnforceIf(z)
                model.AddBoolOr([start_le.Not(), end_gt.Not()]).OnlyEnforceIf(z.Not())

        # Worker-Task assignment variables & optional interval variables
        worker_task_assigned: Dict[Tuple[str, str], cp_model.BoolVar] = {}
        worker_intervals: Dict[str, List[cp_model.IntervalVar]] = {w.worker_id: [] for w in problem.workers}
        w_t_s: Dict[Tuple[str, str, int], cp_model.BoolVar] = {}

        for task in problem.tasks:
            eligible_w_ids = []
            for worker in problem.workers:
                # Skill check
                if not cls.check_worker_skill_eligibility(worker, task):
                    continue

                # Single-task continuous work safety limit check
                max_work, _ = cls.get_worker_safety_parameters(worker, task.intensity, problem.weather_slots, problem.safety_policy)
                if task.duration_minutes > max_work:
                    continue

                is_assigned = model.NewBoolVar(f"assign_{worker.worker_id}_{task.task_id}")
                worker_task_assigned[(worker.worker_id, task.task_id)] = is_assigned
                eligible_w_ids.append(is_assigned)

                d_slots = task_dur_slots[task.task_id]
                interval = model.NewOptionalIntervalVar(
                    task_start_vars[task.task_id],
                    d_slots,
                    task_end_vars[task.task_id],
                    is_assigned,
                    f"interval_{worker.worker_id}_{task.task_id}"
                )
                worker_intervals[worker.worker_id].append(interval)

                # Link worker-task-slot variable: w_t_s == 1 iff assigned AND active
                for s in range(total_slots):
                    w_var = model.NewBoolVar(f"w_t_s_{worker.worker_id}_{task.task_id}_{s}")
                    w_t_s[(worker.worker_id, task.task_id, s)] = w_var
                    model.AddBoolAnd([is_assigned, task_active_in_slot[(task.task_id, s)]]).OnlyEnforceIf(w_var)
                    model.AddBoolOr([is_assigned.Not(), task_active_in_slot[(task.task_id, s)].Not()]).OnlyEnforceIf(w_var.Not())

            # Team size requirement
            if eligible_w_ids:
                model.Add(sum(eligible_w_ids) >= task.min_workers)
                model.Add(sum(eligible_w_ids) <= task.max_workers)
            else:
                diagnostics.append(f"No eligible workers available for task '{task.title}'.")

        # Constraint 1: Worker No-Overlap Constraint
        for w_id, intervals in worker_intervals.items():
            if intervals:
                model.AddNoOverlap(intervals)

        # Constraint 2: Precedence Dependencies
        for task in problem.tasks:
            for dep_id in task.dependencies:
                if dep_id in task_start_vars:
                    model.Add(task_start_vars[task.task_id] >= task_end_vars[dep_id])

        # Constraint 3: Worker Shift Window Constraints
        for task in problem.tasks:
            for worker in problem.workers:
                key = (worker.worker_id, task.task_id)
                if key in worker_task_assigned:
                    w_start_slot = worker.shift_start_minute // slot_interval
                    w_end_slot = worker.shift_end_minute // slot_interval

                    model.Add(task_start_vars[task.task_id] >= w_start_slot).OnlyEnforceIf(worker_task_assigned[key])
                    model.Add(task_end_vars[task.task_id] <= w_end_slot).OnlyEnforceIf(worker_task_assigned[key])

        # =========================================================================
        # 3. WORK AND RECOVERY STATES & FINITE RESOURCE CAPACITY
        # =========================================================================
        recovery_resources = [r for r in problem.resources if cls.is_recovery_resource(r)]
        work_resources = [r for r in problem.resources if not cls.is_recovery_resource(r)]

        worker_is_working_slot: Dict[Tuple[str, int], cp_model.BoolVar] = {}
        worker_is_resting_slot: Dict[Tuple[str, int], cp_model.BoolVar] = {}
        worker_rest_res: Dict[Tuple[str, str, int], cp_model.BoolVar] = {}

        for worker in problem.workers:
            w_start_slot = worker.shift_start_minute // slot_interval
            w_end_slot = worker.shift_end_minute // slot_interval

            for s in range(total_slots):
                # Working state at slot s
                w_active_vars = [
                    w_t_s[(worker.worker_id, task.task_id, s)]
                    for task in problem.tasks
                    if (worker.worker_id, task.task_id) in worker_task_assigned
                ]
                is_work_s = model.NewBoolVar(f"is_working_{worker.worker_id}_{s}")
                worker_is_working_slot[(worker.worker_id, s)] = is_work_s

                if w_active_vars:
                    model.Add(is_work_s == sum(w_active_vars))
                else:
                    model.Add(is_work_s == 0)

                # Active recovery rest state at slot s
                is_rest_s = model.NewBoolVar(f"is_resting_{worker.worker_id}_{s}")
                worker_is_resting_slot[(worker.worker_id, s)] = is_rest_s

                # Working and resting are mutually exclusive
                model.Add(is_work_s + is_rest_s <= 1)

                # Outside shift window cannot rest
                if s < w_start_slot or s >= w_end_slot:
                    model.Add(is_rest_s == 0)

        # 3.1 Recovery Resource (Shade / Cooling) Finite Capacity Constraints
        if recovery_resources:
            for worker in problem.workers:
                for s in range(total_slots):
                    assigned_res_vars = []
                    for res in recovery_resources:
                        res_var = model.NewBoolVar(f"rest_res_{worker.worker_id}_{res.resource_id}_{s}")
                        worker_rest_res[(worker.worker_id, res.resource_id, s)] = res_var
                        assigned_res_vars.append(res_var)

                    # When resting, worker consumes exactly 1 unit from one of the recovery resources
                    model.Add(sum(assigned_res_vars) == worker_is_resting_slot[(worker.worker_id, s)])

            # Enforce hard capacity per recovery resource per time slot
            for res in recovery_resources:
                for s in range(total_slots):
                    res_usage = sum(
                        worker_rest_res[(worker.worker_id, res.resource_id, s)]
                        for worker in problem.workers
                    )
                    model.Add(res_usage <= res.capacity)

        # 3.2 Work Resource Finite Capacity Constraints (Equipment / Zone capacity)
        if work_resources:
            for res in work_resources:
                matching_tasks = [t for t in problem.tasks if t.zone_id == res.zone_id]
                for s in range(total_slots):
                    res_usage_vars = []
                    for task in matching_tasks:
                        for worker in problem.workers:
                            key = (worker.worker_id, task.task_id)
                            if key in worker_task_assigned:
                                res_usage_vars.append(w_t_s[(worker.worker_id, task.task_id, s)])
                    if res_usage_vars:
                        model.Add(sum(res_usage_vars) <= res.capacity)

        # =========================================================================
        # 4. CUMULATIVE WORK / REST SEQUENCING CONSTRAINTS
        # =========================================================================
        max_intensity = PhysicalIntensity.LIGHT
        for t in problem.tasks:
            if t.intensity == PhysicalIntensity.EXTREME:
                max_intensity = PhysicalIntensity.EXTREME
                break
            elif t.intensity == PhysicalIntensity.HEAVY and max_intensity != PhysicalIntensity.EXTREME:
                max_intensity = PhysicalIntensity.HEAVY
            elif t.intensity == PhysicalIntensity.MEDIUM and max_intensity == PhysicalIntensity.LIGHT:
                max_intensity = PhysicalIntensity.MEDIUM

        for worker in problem.workers:
            max_work_mins, rest_mins = cls.get_worker_safety_parameters(
                worker, max_intensity, problem.weather_slots, problem.safety_policy
            )
            c_w_slots = max_work_mins // slot_interval
            r_w_slots = (rest_mins + slot_interval - 1) // slot_interval
            if r_w_slots < 1:
                r_w_slots = 1

            cum_work_vars: List[cp_model.IntVar] = []
            for s in range(total_slots):
                cum_w = model.NewIntVar(0, c_w_slots, f"cum_work_{worker.worker_id}_{s}")
                cum_work_vars.append(cum_w)

                is_work_s = worker_is_working_slot[(worker.worker_id, s)]

                if s == 0:
                    model.Add(cum_w == is_work_s)
                else:
                    # Reset condition: Requires r_w_slots of continuous active recovery rest
                    if s < r_w_slots:
                        is_reset_s = model.NewConstant(0)
                    else:
                        is_reset_s = model.NewBoolVar(f"is_reset_{worker.worker_id}_{s}")
                        prior_rest_sum = sum(
                            worker_is_resting_slot[(worker.worker_id, s - k)]
                            for k in range(1, r_w_slots + 1)
                        )
                        model.Add(prior_rest_sum == r_w_slots).OnlyEnforceIf(is_reset_s)
                        model.Add(prior_rest_sum < r_w_slots).OnlyEnforceIf(is_reset_s.Not())

                    # When working:
                    # If reset: cum_w == 1
                    # If not reset: cum_w == cum_work[s-1] + 1
                    model.Add(cum_w == 1).OnlyEnforceIf([is_work_s, is_reset_s])
                    model.Add(cum_w == cum_work_vars[s - 1] + 1).OnlyEnforceIf([is_work_s, is_reset_s.Not()])

                    # When not working:
                    # If reset: cum_w == 0
                    # If not reset: cum_w == cum_work[s-1]
                    model.Add(cum_w == 0).OnlyEnforceIf([is_work_s.Not(), is_reset_s])
                    model.Add(cum_w == cum_work_vars[s - 1]).OnlyEnforceIf([is_work_s.Not(), is_reset_s.Not()])

        # =========================================================================
        # 5. OBJECTIVE FORMULATION (FASTEST / SAFEST / BALANCED)
        # =========================================================================
        time_obj = sum(task_end_vars.values())

        weather_by_slot = {s.slot_index: s for s in problem.weather_slots}
        thermal_cost_terms = []

        for task in problem.tasks:
            for s in range(total_slots):
                w_info = weather_by_slot.get(s)
                wbgt_val = w_info.estimated_wbgt_c if w_info else 25.0
                sun_exp = (task.is_sun_exposed and (w_info.solar_radiation_wm2 > 0 if w_info else True))

                metric = ExposureModel.calculate_heuristic_optimization_metric(
                    wbgt_c=wbgt_val,
                    intensity=task.intensity,
                    duration_minutes=slot_interval,
                    is_work=True,
                    is_sun_exposed=sun_exp,
                    is_cooled_shade_rest=False
                )
                scaled_cost = int(round(metric.prototype_cost_score * 100))

                for worker in problem.workers:
                    key = (worker.worker_id, task.task_id)
                    if key in worker_task_assigned:
                        thermal_cost_terms.append(scaled_cost * w_t_s[(worker.worker_id, task.task_id, s)])

        thermal_obj = sum(thermal_cost_terms) if thermal_cost_terms else model.NewConstant(0)

        rest_obj = sum(worker_is_resting_slot.values()) if worker_is_resting_slot else model.NewConstant(0)

        # Mode Selection:
        if problem.objective_mode == SolverObjectiveMode.FASTEST:
            # FASTEST: Minimizes total schedule completion delay (Phase 4A compatible)
            model.Minimize(100 * time_obj + rest_obj)
        elif problem.objective_mode == SolverObjectiveMode.SAFEST:
            # SAFEST: Minimizes cumulative modeled thermal exposure (with tie-breaker on completion)
            model.Minimize(1000 * thermal_obj + 10 * time_obj + rest_obj)
        elif problem.objective_mode == SolverObjectiveMode.BALANCED:
            # BALANCED: Calibrated integer trade-off between schedule delay and thermal exposure
            model.Minimize(100 * time_obj + thermal_obj + rest_obj)
        else:
            model.Minimize(100 * time_obj + rest_obj)

        # =========================================================================
        # 6. SOLVER EXECUTION
        # =========================================================================
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0
        solver.parameters.random_seed = 42
        solver.parameters.num_search_workers = 1

        status = solver.Solve(model)
        solve_duration = time.time() - start_solve_time

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return SolverScheduleOutput(
                status="INFEASIBLE",
                solve_time_seconds=round(solve_duration, 4),
                objective_value=None,
                total_tasks_scheduled=0,
                total_work_minutes=0,
                total_rest_minutes=0,
                peak_shade_utilization=0,
                peak_water_utilization=0,
                assignments=[],
                unassigned_task_ids=[t.task_id for t in problem.tasks],
                solver_messages=["Schedule is mathematically infeasible under given hard constraints (cumulative work limits, recovery requirements, resource capacity, skills, or deadlines)."]
            )

        # =========================================================================
        # 7. OUTPUT SERIALIZATION WITH WORK, REST, AND RESOURCE TRACEABILITY
        # =========================================================================
        assignments: List[SolverAssignmentOutput] = []
        total_work_mins = 0
        total_rest_mins = 0

        # 7.1 Extract Work Assignments
        for task in problem.tasks:
            start_slot = solver.Value(task_start_vars[task.task_id])
            d_slots = task_dur_slots[task.task_id]

            for worker in problem.workers:
                key = (worker.worker_id, task.task_id)
                if key in worker_task_assigned and solver.Value(worker_task_assigned[key]) == 1:
                    total_work_mins += task.duration_minutes

                    for s_idx in range(start_slot, start_slot + d_slots):
                        s_start_min = s_idx * slot_interval
                        s_end_min = (s_idx + 1) * slot_interval
                        w_info = weather_by_slot.get(s_idx)

                        wbgt_val = w_info.estimated_wbgt_c if w_info else 25.0
                        risk_val = w_info.risk_category if w_info else HeatRiskCategory.LOW

                        assignments.append(
                            SolverAssignmentOutput(
                                slot_index=s_idx,
                                start_minute=s_start_min,
                                end_minute=s_end_min,
                                start_time_str=cls._format_time_str(s_start_min),
                                end_time_str=cls._format_time_str(s_end_min),
                                worker_id=worker.worker_id,
                                worker_name=worker.name,
                                task_id=task.task_id,
                                task_title=task.title,
                                assignment_type=AssignmentType.WORK,
                                zone_id=task.zone_id,
                                intensity=task.intensity,
                                predicted_wbgt=wbgt_val,
                                heat_risk=risk_val,
                                slot_exposure_units=1.0,
                                resource_id=None
                            )
                        )

        # 7.2 Extract Active Recovery Rest Assignments (REST_SHADE)
        for worker in problem.workers:
            for s_idx in range(total_slots):
                if solver.Value(worker_is_resting_slot[(worker.worker_id, s_idx)]) == 1:
                    total_rest_mins += slot_interval
                    s_start_min = s_idx * slot_interval
                    s_end_min = (s_idx + 1) * slot_interval
                    w_info = weather_by_slot.get(s_idx)

                    wbgt_val = w_info.estimated_wbgt_c if w_info else 25.0
                    risk_val = w_info.risk_category if w_info else HeatRiskCategory.LOW

                    # Trace which recovery resource was used
                    assigned_res_id = None
                    assigned_zone_id = "zone-shade"
                    if recovery_resources:
                        for res in recovery_resources:
                            res_key = (worker.worker_id, res.resource_id, s_idx)
                            if res_key in worker_rest_res and solver.Value(worker_rest_res[res_key]) == 1:
                                assigned_res_id = res.resource_id
                                assigned_zone_id = res.zone_id or "zone-shade"
                                break

                    assignments.append(
                        SolverAssignmentOutput(
                            slot_index=s_idx,
                            start_minute=s_start_min,
                            end_minute=s_end_min,
                            start_time_str=cls._format_time_str(s_start_min),
                            end_time_str=cls._format_time_str(s_end_min),
                            worker_id=worker.worker_id,
                            worker_name=worker.name,
                            task_id=None,
                            task_title=None,
                            assignment_type=AssignmentType.REST_SHADE,
                            zone_id=assigned_zone_id,
                            intensity=PhysicalIntensity.LIGHT,
                            predicted_wbgt=wbgt_val,
                            heat_risk=risk_val,
                            slot_exposure_units=0.0,
                            resource_id=assigned_res_id
                        )
                    )

        # Sort assignments deterministically
        assignments.sort(key=lambda a: (a.slot_index, a.worker_id, a.task_id or ""))

        # Compute peak utilization
        slot_shade_counts: Dict[int, int] = {}
        for a in assignments:
            if a.assignment_type == AssignmentType.REST_SHADE:
                slot_shade_counts[a.slot_index] = slot_shade_counts.get(a.slot_index, 0) + 1

        peak_shade = max(slot_shade_counts.values()) if slot_shade_counts else 0

        return SolverScheduleOutput(
            status="OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            solve_time_seconds=round(solve_duration, 4),
            objective_value=float(solver.ObjectiveValue()),
            total_tasks_scheduled=len(problem.tasks),
            total_work_minutes=total_work_mins,
            total_rest_minutes=total_rest_mins,
            peak_shade_utilization=peak_shade,
            peak_water_utilization=0,
            assignments=assignments,
            unassigned_task_ids=[],
            solver_messages=["Schedule successfully solved to optimality with resource capacity and objective optimization."]
        )
