"""
ThermoShift - Phase 4A CP-SAT Scheduler Test Suite

Validates all 11 mandatory test scenarios:
1. One worker + one task -> feasible.
2. Worker without required skill -> assignment rejected / infeasible.
3. Two overlapping tasks + one worker -> no overlap in worker schedule.
4. Two qualified workers + two tasks -> both scheduled concurrently.
5. Task requiring two workers -> both assigned simultaneously.
6. Task dependency -> dependent task starts strictly after predecessor ends.
7. Task outside working window -> infeasible.
8. Continuous-work safety limit -> solver respects SafetyPolicy continuous-work caps.
9. Insufficient qualified workers -> explicit infeasible result.
10. Deadline conflict -> explicit infeasible result rather than unsafe schedule.
11. Deterministic repeatability -> identical inputs yield identical outputs.
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


def make_standard_policy() -> SafetyPolicy:
    """Standard OSHA/NIOSH test policy with continuous work caps."""
    return SafetyPolicy(
        policy_id="pol-std",
        name="Standard Policy",
        standard=SafetyStandardType.OSHA,
        wbgt_bands=[
            WbgtBandThreshold(category=HeatRiskCategory.LOW, wbgt_min_celsius=0.0, wbgt_max_celsius=25.9, description="Low Risk"),
            WbgtBandThreshold(category=HeatRiskCategory.MODERATE, wbgt_min_celsius=26.0, wbgt_max_celsius=28.9, description="Moderate Risk"),
            WbgtBandThreshold(category=HeatRiskCategory.HIGH, wbgt_min_celsius=29.0, wbgt_max_celsius=31.0, description="High Risk"),
            WbgtBandThreshold(category=HeatRiskCategory.VERY_HIGH, wbgt_min_celsius=31.1, wbgt_max_celsius=32.5, description="Very High Risk"),
            WbgtBandThreshold(category=HeatRiskCategory.EXTREME, wbgt_min_celsius=32.6, wbgt_max_celsius=50.0, description="Extreme Risk")
        ],
        work_rest_rules=[
            WorkRestRule(risk_category=HeatRiskCategory.LOW, intensity=PhysicalIntensity.LIGHT, acclimatized=True, work_minutes=60, rest_minutes=0),
            WorkRestRule(risk_category=HeatRiskCategory.LOW, intensity=PhysicalIntensity.MEDIUM, acclimatized=True, work_minutes=60, rest_minutes=0),
            WorkRestRule(risk_category=HeatRiskCategory.LOW, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=50, rest_minutes=10),
            WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=20, rest_minutes=40),
            WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.MEDIUM, acclimatized=True, work_minutes=30, rest_minutes=30)
        ],
        acclimatization_policy=AcclimatizationPolicy(
            unacclimatized_max_continuous_work_minutes=30,
            unacclimatized_rest_multiplier=1.5
        )
    )


def make_weather_slots(total_slots: int = 40, risk: HeatRiskCategory = HeatRiskCategory.LOW) -> List[SolverTimeSlotWeather]:
    wbgt_map = {
        HeatRiskCategory.LOW: 24.0,
        HeatRiskCategory.MODERATE: 27.5,
        HeatRiskCategory.HIGH: 30.0,
        HeatRiskCategory.EXTREME: 34.0
    }
    slots = []
    for i in range(total_slots):
        slots.append(
            SolverTimeSlotWeather(
                slot_index=i,
                start_minute=i * 15,
                end_minute=(i + 1) * 15,
                temperature_c=28.0,
                relative_humidity=50.0,
                solar_radiation_wm2=500.0,
                wind_speed_kmh=10.0,
                estimated_wbgt_c=wbgt_map[risk],
                risk_category=risk
            )
        )
    return slots


def test_scenario_1_one_worker_one_task_feasible():
    """Scenario 1: One worker + one task -> feasible."""
    worker = SolverWorkerInput(
        worker_id="w1",
        name="Carlos",
        skills=[SkillType.MASONRY],
        shift_start_minute=0,
        shift_end_minute=480
    )
    task = SolverTaskInput(
        task_id="t1",
        title="Masonry Wall",
        zone_id="z1",
        required_skills=[SkillType.MASONRY],
        min_workers=1,
        max_workers=1,
        duration_minutes=60,
        intensity=PhysicalIntensity.MEDIUM,
        earliest_start_minute=0,
        deadline_minute=480
    )
    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[worker],
        tasks=[task],
        resources=[],
        weather_slots=make_weather_slots(),
        safety_policy=make_standard_policy()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 1
    assert len(output.assignments) == 4  # 60 min / 15 min slots = 4 slots
    assert output.assignments[0].worker_id == "w1"
    assert output.assignments[0].task_id == "t1"


def test_scenario_2_worker_without_required_skill_rejected():
    """Scenario 2: Worker without required skill -> assignment rejected / infeasible."""
    worker = SolverWorkerInput(
        worker_id="w1",
        name="Carlos",
        skills=[SkillType.CARPENTRY],  # Does NOT have WELDING
        shift_start_minute=0,
        shift_end_minute=480
    )
    task = SolverTaskInput(
        task_id="t1",
        title="Beam Welding",
        zone_id="z1",
        required_skills=[SkillType.WELDING],
        min_workers=1,
        max_workers=1,
        duration_minutes=30,
        intensity=PhysicalIntensity.MEDIUM,
        earliest_start_minute=0,
        deadline_minute=480
    )
    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[worker],
        tasks=[task],
        resources=[],
        weather_slots=make_weather_slots(),
        safety_policy=make_standard_policy()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status == "INFEASIBLE"
    assert output.total_tasks_scheduled == 0
    assert "t1" in output.unassigned_task_ids


def test_scenario_3_two_overlapping_tasks_one_worker_no_overlap():
    """Scenario 3: Two tasks + one worker -> tasks must be scheduled sequentially without overlap."""
    worker = SolverWorkerInput(
        worker_id="w1",
        name="Carlos",
        skills=[SkillType.MASONRY],
        shift_start_minute=0,
        shift_end_minute=480
    )
    task1 = SolverTaskInput(
        task_id="t1",
        title="Task 1",
        zone_id="z1",
        required_skills=[SkillType.MASONRY],
        duration_minutes=30,
        intensity=PhysicalIntensity.MEDIUM,
        earliest_start_minute=0,
        deadline_minute=480
    )
    task2 = SolverTaskInput(
        task_id="t2",
        title="Task 2",
        zone_id="z1",
        required_skills=[SkillType.MASONRY],
        duration_minutes=30,
        intensity=PhysicalIntensity.MEDIUM,
        earliest_start_minute=0,
        deadline_minute=480
    )
    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[worker],
        tasks=[task1, task2],
        resources=[],
        weather_slots=make_weather_slots(),
        safety_policy=make_standard_policy()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 2

    # Verify no time slots share the same worker
    assigned_slots = [a.slot_index for a in output.assignments]
    assert len(assigned_slots) == len(set(assigned_slots))  # All slot indices for w1 are unique


def test_scenario_4_two_qualified_workers_two_tasks_concurrent():
    """Scenario 4: Two qualified workers + two tasks -> both scheduled concurrently."""
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.MASONRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.MASONRY])

    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.MEDIUM)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.MEDIUM)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_slots(),
        safety_policy=make_standard_policy()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 2


def test_scenario_5_task_requiring_two_workers_simultaneous_assignment():
    """Scenario 5: Task requiring two workers -> both assigned simultaneously."""
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.CARPENTRY])

    task = SolverTaskInput(
        task_id="t1",
        title="Heavy Formwork",
        zone_id="z1",
        required_skills=[SkillType.CARPENTRY],
        min_workers=2,
        max_workers=2,
        duration_minutes=30,
        intensity=PhysicalIntensity.MEDIUM
    )
    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[task],
        resources=[],
        weather_slots=make_weather_slots(),
        safety_policy=make_standard_policy()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 1
    # 30 min duration = 2 slots * 2 workers = 4 assignment records
    assert len(output.assignments) == 4

    w1_slots = {a.slot_index for a in output.assignments if a.worker_id == "w1"}
    w2_slots = {a.slot_index for a in output.assignments if a.worker_id == "w2"}
    assert w1_slots == w2_slots  # Both workers worked identical simultaneous slots


def test_scenario_6_task_dependency_precedence():
    """Scenario 6: Task dependency -> Task B starts strictly after Task A finishes."""
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.GENERAL_LABOR])

    taskA = SolverTaskInput(
        task_id="tA",
        title="Excavation",
        zone_id="z1",
        required_skills=[SkillType.GENERAL_LABOR],
        duration_minutes=30,
        intensity=PhysicalIntensity.LIGHT
    )
    taskB = SolverTaskInput(
        task_id="tB",
        title="Backfill",
        zone_id="z1",
        required_skills=[SkillType.GENERAL_LABOR],
        duration_minutes=30,
        intensity=PhysicalIntensity.LIGHT,
        dependencies=["tA"]
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1],
        tasks=[taskA, taskB],
        resources=[],
        weather_slots=make_weather_slots(),
        safety_policy=make_standard_policy()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status in ("OPTIMAL", "FEASIBLE")
    tA_slots = [a.slot_index for a in output.assignments if a.task_id == "tA"]
    tB_slots = [a.slot_index for a in output.assignments if a.task_id == "tB"]

    assert max(tA_slots) < min(tB_slots)


def test_scenario_7_task_outside_working_window_infeasible():
    """Scenario 7: Task duration exceeds working window -> Infeasible."""
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.MASONRY])
    task = SolverTaskInput(
        task_id="t1",
        title="Long Masonry",
        zone_id="z1",
        required_skills=[SkillType.MASONRY],
        duration_minutes=120,  # Needs 120 min
        earliest_start_minute=0,
        deadline_minute=60,    # Only 60 min window available
        intensity=PhysicalIntensity.MEDIUM
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1],
        tasks=[task],
        resources=[],
        weather_slots=make_weather_slots(),
        safety_policy=make_standard_policy()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status == "INFEASIBLE"
    assert "t1" in output.unassigned_task_ids


def test_scenario_8_continuous_work_safety_limit_respected():
    """Scenario 8: Continuous-work safety limit -> Task duration exceeding policy continuous limit is rejected."""
    # In HIGH heat, HEAVY work has a 20-minute continuous work limit
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.ROOFING], is_acclimatized=True)
    task = SolverTaskInput(
        task_id="t1",
        title="Continuous Hot Roof Installation",
        zone_id="z1",
        required_skills=[SkillType.ROOFING],
        duration_minutes=45,  # Exceeds 20-minute continuous cap
        intensity=PhysicalIntensity.HEAVY
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1],
        tasks=[task],
        resources=[],
        weather_slots=make_weather_slots(risk=HeatRiskCategory.HIGH),
        safety_policy=make_standard_policy()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status == "INFEASIBLE"
    assert "t1" in output.unassigned_task_ids
    assert any("exceeds continuous-work safety limits" in msg for msg in output.solver_messages)


def test_scenario_9_insufficient_qualified_workers_infeasible():
    """Scenario 9: Insufficient qualified workers -> Explicit infeasible diagnostic."""
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])  # Only 1 worker
    task = SolverTaskInput(
        task_id="t1",
        title="Heavy Truss Lift",
        zone_id="z1",
        required_skills=[SkillType.CARPENTRY],
        min_workers=3,  # Requires 3
        duration_minutes=30,
        intensity=PhysicalIntensity.MEDIUM
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1],
        tasks=[task],
        resources=[],
        weather_slots=make_weather_slots(),
        safety_policy=make_standard_policy()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status == "INFEASIBLE"
    assert any("requires 3 qualified workers" in msg for msg in output.solver_messages)


def test_scenario_10_deadline_conflict_under_resource_contention():
    """Scenario 10: Two tasks contending for 1 worker with tight deadline -> Infeasible rather than violating constraints."""
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.MASONRY])
    # Both tasks require 30 min, same worker, but both must finish by minute 30
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.MASONRY], duration_minutes=30, deadline_minute=30, intensity=PhysicalIntensity.MEDIUM)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.MASONRY], duration_minutes=30, deadline_minute=30, intensity=PhysicalIntensity.MEDIUM)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_slots(),
        safety_policy=make_standard_policy()
    )

    output = CPSATSchedulingEngine.solve(problem)

    assert output.status == "INFEASIBLE"


def test_scenario_11_deterministic_repeatability():
    """Scenario 11: Deterministic repeatability -> Identical input yields identical assignments and objective."""
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.CARPENTRY])
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.MEDIUM)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.MEDIUM)

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[t1, t2],
        resources=[],
        weather_slots=make_weather_slots(),
        safety_policy=make_standard_policy()
    )

    out1 = CPSATSchedulingEngine.solve(problem)
    out2 = CPSATSchedulingEngine.solve(problem)

    assert out1.status == out2.status
    assert out1.objective_value == out2.objective_value
    assert len(out1.assignments) == len(out2.assignments)
    for a1, a2 in zip(out1.assignments, out2.assignments):
        assert a1.slot_index == a2.slot_index
        assert a1.worker_id == a2.worker_id
        assert a1.task_id == a2.task_id
