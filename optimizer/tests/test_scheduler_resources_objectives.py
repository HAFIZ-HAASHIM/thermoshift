"""
ThermoShift - Phase 4B-2 Test Suite: Site Resource Capacity & Thermal Objective Modes

Tests:
1. Finite site resource capacity (Hard CP-SAT constraint)
2. Recovery resource (shade/cooling) consumption vs work resource consumption
3. Multi-worker resource accounting
4. Hard safety hierarchy over optimization objectives
5. Three deterministic objective modes (SAFEST, BALANCED, FASTEST)
6. Critical Adversarial Test (Schedule A vs Schedule B)
7. Second Critical Test (Resource bottleneck & staggering vs infeasibility)
"""

import pytest
from typing import List

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
    AcclimatizationPolicy
)
from optimizer.engine.optimizer_interface import (
    SolverObjectiveMode,
    SolverWorkerInput,
    SolverTaskInput,
    SolverResourceInput,
    SolverTimeSlotWeather,
    SolverProblemInstance,
    SolverScheduleOutput
)
from optimizer.engine.scheduler import CPSATSchedulingEngine


# =========================================================================
# TEST FIXTURES & BUILDERS
# =========================================================================

def make_test_policy_30min_work_15min_rest() -> SafetyPolicy:
    """Standard High Risk Policy: 30 min max continuous work, 15 min mandatory rest."""
    return SafetyPolicy(
        policy_id="pol-high-30-15",
        name="High Risk 30W/15R Policy",
        standard=SafetyStandardType.OSHA,
        wbgt_bands=[
            WbgtBandThreshold(category=HeatRiskCategory.HIGH, wbgt_min_celsius=29.0, wbgt_max_celsius=31.0, description="High Risk")
        ],
        work_rest_rules=[
            WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=30, rest_minutes=15),
            WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.MEDIUM, acclimatized=True, work_minutes=30, rest_minutes=15),
            WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.LIGHT, acclimatized=True, work_minutes=45, rest_minutes=15)
        ]
    )


def make_weather_uniform_high_heat(total_slots: int = 40) -> List[SolverTimeSlotWeather]:
    """Uniform high heat forecast across all slots (WBGT 30.0°C)."""
    return [
        SolverTimeSlotWeather(
            slot_index=i,
            start_minute=i * 15,
            end_minute=(i + 1) * 15,
            temperature_c=32.0,
            relative_humidity=50.0,
            solar_radiation_wm2=600.0,
            wind_speed_kmh=10.0,
            estimated_wbgt_c=30.0,
            risk_category=HeatRiskCategory.HIGH
        )
        for i in range(total_slots)
    ]


def make_weather_varying_heat(total_slots: int = 40) -> List[SolverTimeSlotWeather]:
    """
    Varying weather forecast:
    - Slots 0..3: Hot morning peak (WBGT 33.0°C, extreme sun)
    - Slots 4..10: Moderate/Cool period (WBGT 25.0°C, low solar)
    - Slots 11..39: Moderate heat (WBGT 28.0°C)
    """
    slots = []
    for i in range(total_slots):
        if i < 4:
            # Hot morning
            wbgt = 33.0
            solar = 900.0
            risk = HeatRiskCategory.EXTREME
        elif 4 <= i <= 10:
            # Cool mid-morning window
            wbgt = 25.0
            solar = 100.0
            risk = HeatRiskCategory.LOW
        else:
            wbgt = 28.0
            solar = 500.0
            risk = HeatRiskCategory.MODERATE

        slots.append(
            SolverTimeSlotWeather(
                slot_index=i,
                start_minute=i * 15,
                end_minute=(i + 1) * 15,
                temperature_c=30.0,
                relative_humidity=45.0,
                solar_radiation_wm2=solar,
                wind_speed_kmh=10.0,
                estimated_wbgt_c=wbgt,
                risk_category=risk
            )
        )
    return slots


# =========================================================================
# PART 1: RESOURCE CAPACITY TESTS
# =========================================================================

def test_resource_capacity_1_two_workers_simultaneous_infeasible():
    """
    Test 1: Resource capacity = 1.
    Two workers both require shade recovery at the same time, but deadline prevents staggering -> INFEASIBLE.
    """
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.MASONRY])

    # Both workers work slots 0,1 (30 min). Limit is 30 min. Both must rest at slot 2 (15 min).
    # Task 1 & 2 start at 0 and finish at 30 min.
    # Task 3 & 4 must start at 45 min and deadline is 75 min (duration 30 min).
    t1 = SolverTaskInput(task_id="t1", title="Carpentry A", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=30)
    t2 = SolverTaskInput(task_id="t2", title="Masonry A", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=30)
    t3 = SolverTaskInput(task_id="t3", title="Carpentry B", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=45, deadline_minute=75)
    t4 = SolverTaskInput(task_id="t4", title="Masonry B", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=45, deadline_minute=75)

    shade_resource = SolverResourceInput(
        resource_id="res-shade-1",
        name="Small Pop-up Shade Tent",
        resource_type="SHADE",
        capacity=1,  # Only 1 worker can rest in shade at a time!
        zone_id="zone-shade"
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[t1, t2, t3, t4],
        resources=[shade_resource],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)
    # Since both workers must take mandatory rest at slot 2 (30-45 min) to work t3 & t4, but shade capacity is 1:
    assert output.status == "INFEASIBLE"


def test_resource_capacity_2_two_workers_simultaneous_feasible():
    """
    Test 2: Resource capacity = 2.
    Two workers needing shade recovery simultaneously -> FEASIBLE.
    """
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.MASONRY])

    t1 = SolverTaskInput(task_id="t1", title="Carpentry A", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=30)
    t2 = SolverTaskInput(task_id="t2", title="Masonry A", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=30)
    t3 = SolverTaskInput(task_id="t3", title="Carpentry B", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=45, deadline_minute=75)
    t4 = SolverTaskInput(task_id="t4", title="Masonry B", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=45, deadline_minute=75)

    shade_resource = SolverResourceInput(
        resource_id="res-shade-2",
        name="Medium Shade Canopy",
        resource_type="SHADE_STRUCTURE",
        capacity=2,  # Exactly 2 capacity
        zone_id="zone-shade"
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[t1, t2, t3, t4],
        resources=[shade_resource],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)
    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 4
    assert output.peak_shade_utilization == 2
    # Verify both workers were assigned shade resource
    rest_assignments = [a for a in output.assignments if a.assignment_type == AssignmentType.REST_SHADE]
    assert len(rest_assignments) == 2
    for ra in rest_assignments:
        assert ra.resource_id == "res-shade-2"


def test_resource_capacity_2_three_workers_solver_staggers():
    """
    Test 3: Resource capacity = 2.
    Three workers all need recovery -> solver staggers their recovery so at most 2 use shade concurrently.
    """
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.MASONRY])
    w3 = SolverWorkerInput(worker_id="w3", name="David", skills=[SkillType.ELECTRICAL])

    # Three independent 30-min tasks followed by three second-round 30-min tasks within 120 min window
    t1_1 = SolverTaskInput(task_id="t1_1", title="C1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=120)
    t1_2 = SolverTaskInput(task_id="t1_2", title="C2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=120)

    t2_1 = SolverTaskInput(task_id="t2_1", title="M1", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=120)
    t2_2 = SolverTaskInput(task_id="t2_2", title="M2", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=120)

    t3_1 = SolverTaskInput(task_id="t3_1", title="E1", zone_id="z3", required_skills=[SkillType.ELECTRICAL], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=120)
    t3_2 = SolverTaskInput(task_id="t3_2", title="E2", zone_id="z3", required_skills=[SkillType.ELECTRICAL], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=120)

    shade_resource = SolverResourceInput(
        resource_id="res-shade-2",
        name="Medium Shade Canopy",
        resource_type="SHADE_STRUCTURE",
        capacity=2,
        zone_id="zone-shade"
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2, w3],
        tasks=[t1_1, t1_2, t2_1, t2_2, t3_1, t3_2],
        resources=[shade_resource],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)
    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 6
    assert output.peak_shade_utilization <= 2  # Hard capacity never exceeded!


def test_resource_capacity_does_not_affect_workers_when_not_required():
    """
    Test 4: Resource capacity = 1, but workers do not require recovery (short 15-min tasks well below 30-min cap) -> feasible.
    """
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.MASONRY])

    t1 = SolverTaskInput(task_id="t1", title="Quick Carpentry", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=15, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Quick Masonry", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=15, intensity=PhysicalIntensity.HEAVY)

    shade_resource = SolverResourceInput(
        resource_id="res-shade-1",
        name="Small Shade",
        resource_type="SHADE",
        capacity=1,
        zone_id="zone-shade"
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[t1, t2],
        resources=[shade_resource],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)
    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 2
    assert output.peak_shade_utilization == 0  # No recovery was needed, zero shade consumed!


def test_required_recovery_cannot_be_silently_removed_when_resource_full():
    """
    Test 5: Required recovery cannot be silently removed or shortened because resource capacity is full.
    """
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.CARPENTRY])

    # Task requires 30 min, then immediate task 30 min, deadline 60 min (impossible because 15 min rest is required)
    t1 = SolverTaskInput(task_id="t1", title="T1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=60)
    t2 = SolverTaskInput(task_id="t2", title="T2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=60)

    shade_zero = SolverResourceInput(
        resource_id="res-shade-0",
        name="Broken Shade",
        resource_type="SHADE",
        capacity=0,  # Zero capacity
        zone_id="zone-shade"
    )

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1],  # 1 worker doing 30 min + 30 min
        tasks=[t1, t2],
        resources=[shade_zero],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)
    # Cannot do 60 min continuous work without rest, and cannot rest because shade capacity is 0 -> INFEASIBLE
    assert output.status == "INFEASIBLE"


def test_multi_worker_task_resource_accounting():
    """
    Test 7: Multi-worker task resource accounting.
    A task requiring 2 workers in a zone with equipment capacity = 1 -> INFEASIBLE.
    With equipment capacity = 2 -> FEASIBLE.
    """
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.CARPENTRY])

    task_2w = SolverTaskInput(
        task_id="t-team",
        title="Heavy Beam Placement",
        zone_id="zone-crane",
        required_skills=[SkillType.CARPENTRY],
        min_workers=2,
        max_workers=2,
        duration_minutes=30,
        intensity=PhysicalIntensity.HEAVY
    )

    # Equipment capacity = 1
    crane_res_1 = SolverResourceInput(
        resource_id="res-crane-1",
        name="Single Operator Harness",
        resource_type="WORK_EQUIPMENT",
        capacity=1,
        zone_id="zone-crane"
    )

    problem_infeasible = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[task_2w],
        resources=[crane_res_1],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    out_infeasible = CPSATSchedulingEngine.solve(problem_infeasible)
    assert out_infeasible.status == "INFEASIBLE"

    # Equipment capacity = 2
    crane_res_2 = SolverResourceInput(
        resource_id="res-crane-2",
        name="Dual Operator Station",
        resource_type="WORK_EQUIPMENT",
        capacity=2,
        zone_id="zone-crane"
    )

    problem_feasible = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[task_2w],
        resources=[crane_res_2],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    out_feasible = CPSATSchedulingEngine.solve(problem_feasible)
    assert out_feasible.status in ("OPTIMAL", "FEASIBLE")
    assert out_feasible.total_tasks_scheduled == 1


def test_different_resources_have_independent_capacities():
    """
    Test 8: Different resources have independent capacities.
    Shade canopy (cap 1) + Cooling trailer (cap 1) = total recovery capacity 2.
    Two workers resting simultaneously can be assigned to different recovery resources.
    """
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.MASONRY])

    t1 = SolverTaskInput(task_id="t1", title="C1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=30)
    t2 = SolverTaskInput(task_id="t2", title="M1", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=0, deadline_minute=30)
    t3 = SolverTaskInput(task_id="t3", title="C2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=45, deadline_minute=75)
    t4 = SolverTaskInput(task_id="t4", title="M2", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, earliest_start_minute=45, deadline_minute=75)

    res_shade = SolverResourceInput(resource_id="res-shade", name="Shade Canopy", resource_type="SHADE_STRUCTURE", capacity=1, zone_id="zone-shade")
    res_cooling = SolverResourceInput(resource_id="res-cooling", name="AC Trailer", resource_type="COOLING_TENT", capacity=1, zone_id="zone-entry")

    problem = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[t1, t2, t3, t4],
        resources=[res_shade, res_cooling],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    output = CPSATSchedulingEngine.solve(problem)
    assert output.status in ("OPTIMAL", "FEASIBLE")
    assert output.total_tasks_scheduled == 4

    # Verify each worker was allocated to a distinct resource at slot 2 (30-45 min)
    slot_2_rests = [a for a in output.assignments if a.slot_index == 2 and a.assignment_type == AssignmentType.REST_SHADE]
    assert len(slot_2_rests) == 2
    used_res_ids = {a.resource_id for a in slot_2_rests}
    assert used_res_ids == {"res-shade", "res-cooling"}


# =========================================================================
# PART 2: OBJECTIVE MODES & CRITICAL ADVERSARIAL TESTS
# =========================================================================

def test_critical_adversarial_schedule_a_vs_schedule_b():
    """
    CRITICAL ADVERSARIAL TEST (Section 19):
    Schedule A: Finishes earlier, higher modeled thermal exposure.
    Schedule B: Finishes later, lower modeled thermal exposure.
    Both are fully safety-feasible.

    Expected:
    - FASTEST selects Schedule A (earlier completion)
    - SAFEST selects Schedule B (lower thermal exposure)
    - BALANCED selects deterministic trade-off
    """
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])

    # 30-minute task with flexible window (slots 0 to 10 = 0 to 150 min)
    task = SolverTaskInput(
        task_id="t-flex",
        title="Flexible Formwork",
        zone_id="z1",
        required_skills=[SkillType.CARPENTRY],
        duration_minutes=30,  # 2 slots
        intensity=PhysicalIntensity.HEAVY,
        earliest_start_minute=0,
        deadline_minute=150
    )

    weather_slots = make_weather_varying_heat(total_slots=10)
    policy = make_test_policy_30min_work_15min_rest()

    # 1. FASTEST Mode:
    prob_fastest = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        objective_mode=SolverObjectiveMode.FASTEST,
        workers=[w],
        tasks=[task],
        resources=[],
        weather_slots=weather_slots,
        safety_policy=policy
    )
    out_fastest = CPSATSchedulingEngine.solve(prob_fastest)
    assert out_fastest.status in ("OPTIMAL", "FEASIBLE")
    fastest_work_slots = [a.slot_index for a in out_fastest.assignments if a.assignment_type == AssignmentType.WORK]
    # FASTEST must start immediately at slot 0 (Schedule A)
    assert min(fastest_work_slots) == 0
    assert max(fastest_work_slots) == 1

    # 2. SAFEST Mode:
    prob_safest = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        objective_mode=SolverObjectiveMode.SAFEST,
        workers=[w],
        tasks=[task],
        resources=[],
        weather_slots=weather_slots,
        safety_policy=policy
    )
    out_safest = CPSATSchedulingEngine.solve(prob_safest)
    assert out_safest.status in ("OPTIMAL", "FEASIBLE")
    safest_work_slots = [a.slot_index for a in out_safest.assignments if a.assignment_type == AssignmentType.WORK]
    # SAFEST must shift work into the cooler window (slots 4..10) (Schedule B)
    assert min(safest_work_slots) >= 4

    # 3. BALANCED Mode:
    prob_balanced = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        objective_mode=SolverObjectiveMode.BALANCED,
        workers=[w],
        tasks=[task],
        resources=[],
        weather_slots=weather_slots,
        safety_policy=policy
    )
    out_balanced = CPSATSchedulingEngine.solve(prob_balanced)
    assert out_balanced.status in ("OPTIMAL", "FEASIBLE")
    balanced_work_slots = [a.slot_index for a in out_balanced.assignments if a.assignment_type == AssignmentType.WORK]
    # In this scenario, the thermal savings (WBGT 33°C down to 25°C = huge delta) outweigh a 4-slot delay in BALANCED
    assert min(balanced_work_slots) >= 4


def test_critical_resource_bottleneck_scenario():
    """
    SECOND CRITICAL TEST (Section 20):
    Resource bottleneck scenario:
    - 3 workers require shade recovery
    - Shade capacity is smaller than simultaneous recovery demand (capacity = 2)
    - All workers still have mandatory recovery requirements

    Expected:
    - Solver staggers work/rest so shade capacity is never exceeded.
    - If deadline is compressed so staggering is impossible, returns INFEASIBLE.
    - NEVER removes or shortens mandatory recovery to force feasibility.
    """
    w1 = SolverWorkerInput(worker_id="w1", name="Worker 1", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Worker 2", skills=[SkillType.MASONRY])
    w3 = SolverWorkerInput(worker_id="w3", name="Worker 3", skills=[SkillType.ELECTRICAL])

    # Feasible Case (Window = 120 min):
    tasks_feasible = [
        SolverTaskInput(task_id="t1_a", title="T1 A", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=120),
        SolverTaskInput(task_id="t1_b", title="T1 B", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=120),
        SolverTaskInput(task_id="t2_a", title="T2 A", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=120),
        SolverTaskInput(task_id="t2_b", title="T2 B", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=120),
        SolverTaskInput(task_id="t3_a", title="T3 A", zone_id="z3", required_skills=[SkillType.ELECTRICAL], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=120),
        SolverTaskInput(task_id="t3_b", title="T3 B", zone_id="z3", required_skills=[SkillType.ELECTRICAL], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=120),
    ]

    shade_res = SolverResourceInput(
        resource_id="res-shade-bottleneck",
        name="Bottleneck Shade",
        resource_type="SHADE",
        capacity=2,
        zone_id="zone-shade"
    )

    prob_feas = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2, w3],
        tasks=tasks_feasible,
        resources=[shade_res],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    out_feas = CPSATSchedulingEngine.solve(prob_feas)
    assert out_feas.status in ("OPTIMAL", "FEASIBLE")
    assert out_feas.peak_shade_utilization <= 2

    # Infeasible Case: Tighten deadline to 75 min (0-30 min work + 15 min rest + 30 min work = 75 min).
    # All 3 workers must work 0-30 min and rest 30-45 min simultaneously. With shade capacity 2, it is impossible!
    tasks_tight = [
        SolverTaskInput(task_id="t1_a", title="T1 A", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=75),
        SolverTaskInput(task_id="t1_b", title="T1 B", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=75),
        SolverTaskInput(task_id="t2_a", title="T2 A", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=75),
        SolverTaskInput(task_id="t2_b", title="T2 B", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=75),
        SolverTaskInput(task_id="t3_a", title="T3 A", zone_id="z3", required_skills=[SkillType.ELECTRICAL], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=75),
        SolverTaskInput(task_id="t3_b", title="T3 B", zone_id="z3", required_skills=[SkillType.ELECTRICAL], duration_minutes=30, intensity=PhysicalIntensity.HEAVY, deadline_minute=75),
    ]

    prob_tight = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2, w3],
        tasks=tasks_tight,
        resources=[shade_res],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    out_tight = CPSATSchedulingEngine.solve(prob_tight)
    assert out_tight.status == "INFEASIBLE"


def test_all_three_objectives_respect_identical_hard_safety_constraints():
    """
    Test 14: All three objectives respect identical HARD safety constraints.
    A task exceeding the single continuous work limit without recovery cannot be scheduled in ANY mode.
    """
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    task_excessive = SolverTaskInput(
        task_id="t-excess",
        title="Excessive Continuous Work",
        zone_id="z1",
        required_skills=[SkillType.CARPENTRY],
        duration_minutes=45,  # Exceeds 30 min limit
        intensity=PhysicalIntensity.HEAVY
    )

    for mode in [SolverObjectiveMode.FASTEST, SolverObjectiveMode.SAFEST, SolverObjectiveMode.BALANCED]:
        problem = SolverProblemInstance(
            site_id="s1",
            shift_date="2026-07-15",
            objective_mode=mode,
            workers=[w],
            tasks=[task_excessive],
            resources=[],
            weather_slots=make_weather_uniform_high_heat(),
            safety_policy=make_test_policy_30min_work_15min_rest()
        )
        output = CPSATSchedulingEngine.solve(problem)
        assert output.status == "INFEASIBLE", f"Mode {mode} allowed a safety violation!"


def test_deterministic_behavior_across_objective_modes():
    """
    Test 17: Objective mode solving is fully deterministic across repeated runs.
    """
    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    t1 = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="Task 2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    for mode in [SolverObjectiveMode.FASTEST, SolverObjectiveMode.SAFEST, SolverObjectiveMode.BALANCED]:
        prob = SolverProblemInstance(
            site_id="s1",
            shift_date="2026-07-15",
            objective_mode=mode,
            workers=[w],
            tasks=[t1, t2],
            resources=[],
            weather_slots=make_weather_varying_heat(),
            safety_policy=make_test_policy_30min_work_15min_rest()
        )
        out1 = CPSATSchedulingEngine.solve(prob)
        out2 = CPSATSchedulingEngine.solve(prob)

        assert out1.status == out2.status
        assert out1.objective_value == out2.objective_value
        assert len(out1.assignments) == len(out2.assignments)


def test_resource_capacity_respected_in_all_objective_modes():
    """
    Test 15: No objective mode (FASTEST, SAFEST, BALANCED) can exceed finite resource capacity.
    """
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.MASONRY])

    t1 = SolverTaskInput(task_id="t1", title="C1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t2 = SolverTaskInput(task_id="t2", title="M1", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t3 = SolverTaskInput(task_id="t3", title="C2", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)
    t4 = SolverTaskInput(task_id="t4", title="M2", zone_id="z2", required_skills=[SkillType.MASONRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    shade_res = SolverResourceInput(
        resource_id="res-shade-single",
        name="Single Shade",
        resource_type="SHADE",
        capacity=1,
        zone_id="zone-shade"
    )

    for mode in [SolverObjectiveMode.FASTEST, SolverObjectiveMode.SAFEST, SolverObjectiveMode.BALANCED]:
        problem = SolverProblemInstance(
            site_id="s1",
            shift_date="2026-07-15",
            objective_mode=mode,
            workers=[w1, w2],
            tasks=[t1, t2, t3, t4],
            resources=[shade_res],
            weather_slots=make_weather_uniform_high_heat(),
            safety_policy=make_test_policy_30min_work_15min_rest()
        )
        out = CPSATSchedulingEngine.solve(problem)
        assert out.status in ("OPTIMAL", "FEASIBLE")
        assert out.peak_shade_utilization <= 1, f"Mode {mode} exceeded shade capacity!"


def test_changing_objective_mode_does_not_change_safety_policy_values():
    """
    Test 18: Changing objective mode does not mutate or modify safety policy rules or limits.
    """
    policy = make_test_policy_30min_work_15min_rest()
    orig_rules_count = len(policy.work_rest_rules)
    orig_work_mins = policy.work_rest_rules[0].work_minutes
    orig_rest_mins = policy.work_rest_rules[0].rest_minutes

    w = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    t = SolverTaskInput(task_id="t1", title="Task 1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.HEAVY)

    for mode in [SolverObjectiveMode.FASTEST, SolverObjectiveMode.SAFEST, SolverObjectiveMode.BALANCED]:
        prob = SolverProblemInstance(
            site_id="s1",
            shift_date="2026-07-15",
            objective_mode=mode,
            workers=[w],
            tasks=[t],
            resources=[],
            weather_slots=make_weather_uniform_high_heat(),
            safety_policy=policy
        )
        _ = CPSATSchedulingEngine.solve(prob)

        # Verify policy object remained unchanged
        assert len(policy.work_rest_rules) == orig_rules_count
        assert policy.work_rest_rules[0].work_minutes == orig_work_mins
        assert policy.work_rest_rules[0].rest_minutes == orig_rest_mins


def test_zone_specific_work_resource_capacity_enforcement():
    """
    Test 9: Work resources enforce independent capacities per zone.
    Zone A has equipment capacity 1 (only 1 worker active).
    Zone B has equipment capacity 2 (2 workers active).
    """
    w1 = SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])
    w2 = SolverWorkerInput(worker_id="w2", name="Elena", skills=[SkillType.CARPENTRY])

    # Two tasks in Zone A (equipment capacity 1) -> must be executed sequentially (cannot overlap)
    t_a1 = SolverTaskInput(task_id="ta1", title="Task A1", zone_id="zone-a", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.LIGHT)
    t_a2 = SolverTaskInput(task_id="ta2", title="Task A2", zone_id="zone-a", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.LIGHT)

    res_zone_a = SolverResourceInput(
        resource_id="res-a",
        name="Zone A Single Crane",
        resource_type="WORK_EQUIPMENT",
        capacity=1,
        zone_id="zone-a"
    )

    prob = SolverProblemInstance(
        site_id="s1",
        shift_date="2026-07-15",
        workers=[w1, w2],
        tasks=[t_a1, t_a2],
        resources=[res_zone_a],
        weather_slots=make_weather_uniform_high_heat(),
        safety_policy=make_test_policy_30min_work_15min_rest()
    )

    out = CPSATSchedulingEngine.solve(prob)
    assert out.status in ("OPTIMAL", "FEASIBLE")
    # Verify tasks ta1 and ta2 do not overlap in time
    ta1_slots = {a.slot_index for a in out.assignments if a.task_id == "ta1"}
    ta2_slots = {a.slot_index for a in out.assignments if a.task_id == "ta2"}
    assert len(ta1_slots.intersection(ta2_slots)) == 0

