"""
ThermoShift - Phase 4B-1 Cumulative Work / Rest Scheduler Test Suite

Validates all 15 mandatory test scenarios:
1. Single task below continuous-work limit -> Feasible.
2. Single task exceeding continuous-work limit -> INFEASIBLE.
3. Two consecutive tasks whose combined duration exceeds limit -> Mandatory rest required between them.
4. Three tasks requiring multiple recovery periods -> Successfully scheduled with recovery periods.
5. Insufficient shift time after mandatory recovery -> INFEASIBLE.
6. Rest exactly equal to required recovery -> Valid reset.
7. Rest shorter than required -> Does not reset, exceeds limit -> INFEASIBLE.
8. Idle gap shorter than required recovery -> Does not reset continuous work.
9. Idle gap exactly equal to required recovery -> Resets continuous work.
10. Multi-worker task increments each worker's cumulative work independently.
11. One worker requires more recovery than another (e.g. unacclimatized) -> Schedules respect both.
12. Dependency chain plus mandatory rest -> Precedence and rest respected.
13. Deadline conflict caused specifically by mandatory recovery -> Explicit INFEASIBLE.
14. Deterministic repeatability -> Identical schedules across repeated runs.
15. Safety constraint cannot be overridden by objective.
"""

from typing import List
import pytest
from optimizer.engine.data_models import (
    SkillType,
    PhysicalIntensity,
    HeatVulnerabilityLevel,
    HeatRiskCategory,
    AssignmentType,
    SafetyPolicy,
    SafetyStandardType,
    WorkRestRule,
    WbgtBandThreshold,
    AcclimatizationPolicy,
    VulnerabilityAdjustment
)
from optimizer.engine.optimizer_interface import (
    SolverProblemInstance,
    SolverWorkerInput,
    SolverTaskInput,
    SolverResourceInput,
    SolverTimeSlotWeather,
    SolverObjectiveMode
)
from optimizer.engine.scheduler import CPSATSchedulingEngine


def make_test_policy_30min_work_15min_rest() -> SafetyPolicy:
    """Policy with 30 min continuous work limit and 15 min mandatory recovery."""
    return SafetyPolicy(
        policy_id="pol-30-15",
        name="30min Work 15min Rest Policy",
        standard=SafetyStandardType.OSHA,
        wbgt_bands=[
            WbgtBandThreshold(category=HeatRiskCategory.LOW, wbgt_min_celsius=0.0, wbgt_max_celsius=25.9, description="Low Risk"),
            WbgtBandThreshold(category=HeatRiskCategory.HIGH, wbgt_min_celsius=29.0, wbgt_max_celsius=31.0, description="High Risk")
        ],
        work_rest_rules=[
            WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=30, rest_minutes=15),
            WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.MEDIUM, acclimatized=True, work_minutes=30, rest_minutes=15),
            WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.LIGHT, acclimatized=True, work_minutes=30, rest_minutes=15)
        ],
        acclimatization_policy=AcclimatizationPolicy(
            unacclimatized_max_continuous_work_minutes=15,  # Unacclimatized gets lower 15 min cap
            unacclimatized_rest_multiplier=2.0              # 30 min rest
        )
    )


def make_weather_high_heat(total_slots: int = 40) -> List[SolverTimeSlotWeather]:
    return [
        SolverTimeSlotWeather(
            slot_index=i,
            start_minute=i * 15,
            end_minute=(i + 1) * 15,
            temperature_c=32.0,
            relative_humidity=55.0,
            solar_radiation_wm2=700.0,
            wind_speed_kmh=8.0,
            estimated_wbgt_c=30.0,
            risk_category=HeatRiskCategory.HIGH
        )
        for i in range(total_slots)
    ]


def test_scenario_1_single_task_below_continuous_work_limit():
    """Scenario 1: Single task below continuous-work limit (30 min limit, 30 min task) -> Feasible."""
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.MASONRY], is_acclimatized=True)
    task = SolverTaskInput(
        task_id="t1",
        title="Masonry Wall",
        zone_id="z1",
        required_skills=[SkillType.MASONRY],
        duration_minutes=30,
        intensity=PhysicalIntensity.HEAVY
    )
    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[task],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 1
    assert len(output.assignments) == 2  # 30 min / 15 min slots = 2 slots


def test_scenario_2_single_task_exceeding_continuous_work_limit_infeasible():
    """Scenario 2: Single task exceeding continuous-work limit (30 min limit, 45 min task) -> INFEASIBLE."""
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.MASONRY], is_acclimatized=True)
    task = SolverTaskInput(
        task_id="t1",
        title="Long Masonry Wall",
        zone_id="z1",
        required_skills=[SkillType.MASONRY],
        duration_minutes=45,  # Exceeds 30 min continuous cap
        intensity=PhysicalIntensity.HEAVY
    )
    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[task],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status == "INFEASIBLE"
    assert "t1" in output.unassigned_task_ids


def test_scenario_3_two_consecutive_tasks_combined_duration_exceeds_limit_rest_required():
    """
    Scenario 3: Two consecutive tasks (20 min + 20 min = 40 min > 30 min limit) ->
    Must insert a mandatory recovery period (15 min rest) between them.
    """
    # Slot size 15 min: each 20 min task takes 2 slots (30 min allocation).
    # 2 slots + 2 slots = 4 slots (60 min) > 2 slots (30 min limit).
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    t1 = SolverTaskInput(task_id="t1", title="Formwork A", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=15, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Formwork B", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 2

    # Total work = 1 slot (t1) + 2 slots (t2) = 3 slots (45 min) > 30 min limit.
    # Therefore, there MUST be at least 1 slot of recovery between them!
    t1_slots = {a.slot_index for a in output.assignments if a.task_id == "t1"}
    t2_slots = {a.slot_index for a in output.assignments if a.task_id == "t2"}
    rest_slots = {a.slot_index for a in output.assignments if a.assignment_type == AssignmentType.REST_SHADE}

    # Verify rest slot exists and separates the two tasks
    assert len(rest_slots) >= 1
    assert max(t1_slots) < min(rest_slots) < min(t2_slots) or max(t2_slots) < min(rest_slots) < min(t1_slots)


def test_scenario_4_three_tasks_requiring_multiple_recovery_periods():
    """Scenario 4: Three tasks requiring multiple recovery periods."""
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t3 = SolverTaskInput(task_id="t3", title="Task 3", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[t1, t2, t3],
        resources=[],
        weather_slots=make_weather_high_heat(total_slots=40),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 3
    assert output.total_rest_minutes >= 30  # At least two 15-min rest periods


def test_scenario_5_insufficient_shift_time_after_mandatory_recovery_infeasible():
    """Scenario 5: Insufficient shift time after mandatory recovery -> INFEASIBLE."""
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], shift_start_minute=0, shift_end_minute=75, is_acclimatized=True)
    # Total needed: 30 min (t1) + 15 min (rest) + 30 min (t2) + 15 min (rest) + 30 min (t3) = 120 min > 75 min shift
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t3 = SolverTaskInput(task_id="t3", title="Task 3", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[t1, t2, t3],
        resources=[],
        weather_slots=make_weather_high_heat(total_slots=5),  # 75 min shift = 5 slots
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status == "INFEASIBLE"


def test_scenario_6_rest_exactly_equal_to_required_recovery_valid():
    """Scenario 6: Rest exactly equal to required recovery (15 min) successfully resets counter."""
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_rest_minutes == 15  # Exactly 1 slot (15 min) between the two tasks


def test_scenario_7_rest_shorter_than_required_not_sufficient():
    """
    Scenario 7: Policy requiring 30 min recovery cannot be satisfied with a 15 min rest break.
    """
    policy_30min_rest = SafetyPolicy(
        policy_id="pol-30-30",
        name="30min Work 30min Rest Policy",
        standard=SafetyStandardType.OSHA,
        wbgt_bands=[WbgtBandThreshold(category=HeatRiskCategory.HIGH, wbgt_min_celsius=29.0, wbgt_max_celsius=31.0, description="High Risk")],
        work_rest_rules=[WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=30, rest_minutes=30)]
    )

    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], shift_start_minute=0, shift_end_minute=75, is_acclimatized=True)
    # Needs: 30 min work + 30 min rest + 30 min work = 90 min > 75 min shift
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_high_heat(total_slots=5),  # 75 min = 5 slots
        safety_policy=policy_30min_rest
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status == "INFEASIBLE"


def test_scenario_8_idle_gap_shorter_than_required_recovery_does_not_reset_counter():
    """
    Scenario 8: Idle gap shorter than required recovery (e.g. 15 min idle when 30 min is required)
    does NOT reset continuous work counter.
    """
    policy_30min_rest = SafetyPolicy(
        policy_id="pol-30-30",
        name="30min Work 30min Rest Policy",
        standard=SafetyStandardType.OSHA,
        wbgt_bands=[WbgtBandThreshold(category=HeatRiskCategory.HIGH, wbgt_min_celsius=29.0, wbgt_max_celsius=31.0, description="High Risk")],
        work_rest_rules=[WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=30, rest_minutes=30)]
    )

    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=15, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=policy_30min_rest
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    # Must have at least 30 min (2 slots) recovery between t1 and t2
    assert output.total_rest_minutes >= 30


def test_scenario_9_idle_gap_equal_to_required_recovery_resets_continuous_work():
    """Scenario 9: Idle gap exactly equal to required recovery resets continuous work."""
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_rest_minutes == 15


def test_scenario_10_multi_worker_task_increments_each_worker_cumulative_work_independently():
    """Scenario 10: Multi-worker task increments each worker's cumulative work independently."""
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.CARPENTRY], is_acclimatized=True)

    task_shared = SolverTaskInput(
        task_id="t_shared",
        title="Shared Heavy Formwork",
        zone_id="z1",
        required_skills=[SkillType.CARPENTRY],
        min_workers=2,
        max_workers=2,
        duration_minutes=30,
        intensity=PhysicalIntensity.HEAVY
    )
    t_w1_solo = SolverTaskInput(
        task_id="t_solo",
        title="Solo Work",
        zone_id="z1",
        required_skills=[SkillType.CARPENTRY],
        min_workers=1,
        max_workers=1,
        duration_minutes=15,
        intensity=PhysicalIntensity.HEAVY
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[task_shared, t_w1_solo],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 2
    # The worker assigned to both tasks performs 30 + 15 = 45 min total work (> 30 min limit) -> requires rest break
    assert output.total_rest_minutes >= 15
    rest_assignments = [a for a in output.assignments if a.assignment_type == AssignmentType.REST_SHADE]
    assert len(rest_assignments) >= 1


def test_scenario_11_one_worker_requires_more_recovery_than_another():
    """
    Scenario 11: One worker (unacclimatized, 15 min limit) requires more frequent recovery
    than another (acclimatized, 30 min limit).
    """
    w_acclim = SolverWorkerInput(worker_id="w_acc", name="Acclimatized", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    w_unacclim = SolverWorkerInput(worker_id="w_unacc", name="Unacclimatized", skills=[SkillType.CARPENTRY], is_acclimatized=False)

    # 30 min task: w_unacclim cannot perform it (15 min cap), but w_acclim can
    t_heavy = SolverTaskInput(
        task_id="t_heavy",
        title="Heavy Task",
        zone_id="z1",
        required_skills=[SkillType.CARPENTRY],
        min_workers=1,
        max_workers=1,
        duration_minutes=30,
        intensity=PhysicalIntensity.HEAVY
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w_acclim, w_unacclim],
        tasks=[t_heavy],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assigned_workers = {a.worker_id for a in output.assignments if a.assignment_type == AssignmentType.WORK}
    assert "w_acc" in assigned_workers
    assert "w_unacc" not in assigned_workers  # Unacclimatized worker is safely excluded from 30 min task


def test_scenario_12_dependency_chain_plus_mandatory_rest():
    """Scenario 12: Dependency chain (A -> B) plus mandatory rest -> Precedence and rest respected."""
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.GENERAL_LABOR], is_acclimatized=True)

    tA = SolverTaskInput(task_id="tA", title="Task A", zone_id="z1", required_skills=[SkillType.GENERAL_LABOR], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    tB = SolverTaskInput(task_id="tB", title="Task B", zone_id="z1", required_skills=[SkillType.GENERAL_LABOR], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, dependencies=["tA"])

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[tA, tB],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    tA_slots = [a.slot_index for a in output.assignments if a.task_id == "tA"]
    tB_slots = [a.slot_index for a in output.assignments if a.task_id == "tB"]
    rest_slots = [a.slot_index for a in output.assignments if a.assignment_type == AssignmentType.REST_SHADE]

    assert max(tA_slots) < min(rest_slots) <= max(rest_slots) < min(tB_slots)


def test_scenario_13_deadline_conflict_caused_specifically_by_mandatory_recovery():
    """Scenario 13: Deadline conflict caused specifically by mandatory recovery -> Explicit INFEASIBLE."""
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    # Needs: 30 min (t1) + 15 min (rest) + 30 min (t2) = 75 min total time
    # But deadline is set to 60 min
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, deadline_minute=60, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, deadline_minute=60, intensity=PhysicalIntensity.HEAVY)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status == "INFEASIBLE"


def test_scenario_14_deterministic_repeatability():
    """Scenario 14: Deterministic repeatability across multiple executions."""
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    out1 = CPSATSchedulingEngine.solve(problem)
    out2 = CPSATSchedulingEngine.solve(problem)

    assert out1.status == out2.status
    assert out1.objective_value == out2.objective_value
    assert len(out1.assignments) == len(out2.assignments)
    for a1, a2 in zip(out1.assignments, out2.assignments):
        assert a1.slot_index == a2.slot_index
        assert a1.worker_id == a2.worker_id
        assert a1.assignment_type == a2.assignment_type


def test_scenario_15_safety_constraint_cannot_be_overridden_by_objective():
    """
    Scenario 15: Safety constraint cannot be overridden by objective.
    Even though omitting rest would achieve a lower sum(end_slots), the solver MUST NOT omit rest.
    """
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    # If rest could be bypassed, end of t2 would be slot 4 (60 min).
    # With mandatory 15 min rest (1 slot), end of t2 MUST be at slot 5 (75 min).
    assert output.total_rest_minutes >= 15
    t2_end_slots = [a.slot_index for a in output.assignments if a.task_id == "t2"]
    assert max(t2_end_slots) >= 4  # Slot index 4 is the 5th slot


def test_direct_safety_policy_lookup_without_duration_probe():
    """
    Verifies that get_applicable_work_rest_limits extracts policy parameters directly
    without requiring any duration_minutes probe.
    """
    policy = make_test_policy_30min_work_15min_rest()
    worker_acc = SolverWorkerInput(worker_id="w_acc", name="Acclimatized", skills=[SkillType.CARPENTRY], is_acclimatized=True)
    worker_unacc = SolverWorkerInput(worker_id="w_unacc", name="Unacclimatized", skills=[SkillType.CARPENTRY], is_acclimatized=False)

    weather_slots = make_weather_high_heat()

    # Acclimatized lookup
    max_work_acc, rest_acc = CPSATSchedulingEngine.get_worker_safety_parameters(
        worker=worker_acc,
        intensity=PhysicalIntensity.HEAVY,
        weather_slots=weather_slots,
        policy=policy
    )
    assert max_work_acc == 30
    assert rest_acc == 15

    # Unacclimatized lookup (NIOSH policy: 15 min continuous cap, 30 min rest)
    max_work_unacc, rest_unacc = CPSATSchedulingEngine.get_worker_safety_parameters(
        worker=worker_unacc,
        intensity=PhysicalIntensity.HEAVY,
        weather_slots=weather_slots,
        policy=policy
    )
    assert max_work_unacc == 15
    assert rest_unacc == 30
