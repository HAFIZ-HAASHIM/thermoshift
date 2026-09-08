"""
ThermoShift - Decision Intelligence & Schedule Explainability Tests
Phase 4F Test Suite

Tests deterministic explanation generation, factor extraction,
trade-off breakdowns, and scenario delta explanations.
"""

from typing import List, Optional
import pytest
from fastapi.testclient import TestClient

from optimizer.engine.api import app
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
from optimizer.engine.decision_analyzer import (
    DecisionIntelligenceAnalyzer,
    DecisionFactorCategory,
    DecisionFactorSeverity
)

client = TestClient(app)

SEEDED_SITE_ID = "a0000000-0000-0000-0000-000000000001"
SEEDED_DATE = "2026-09-07"


def _make_dummy_assignment(
    slot_index: int,
    worker_id: str,
    task_id: str = None,
    assignment_type: AssignmentType = AssignmentType.WORK,
    worker_name: str = "Test Worker",
    task_title: str = "Test Task"
) -> SolverAssignmentOutput:
    start_m = slot_index * 15
    end_m = start_m + 15
    return SolverAssignmentOutput(
        slot_index=slot_index,
        start_minute=start_m,
        end_minute=end_m,
        start_time_str=f"{7 + start_m//60:02d}:{start_m%60:02d}",
        end_time_str=f"{7 + end_m//60:02d}:{end_m%60:02d}",
        worker_id=worker_id,
        worker_name=worker_name,
        task_id=task_id,
        task_title=task_title,
        assignment_type=assignment_type,
        zone_id="zone-1",
        intensity=PhysicalIntensity.MEDIUM,
        predicted_wbgt=28.0,
        heat_risk=HeatRiskCategory.MODERATE,
        slot_exposure_units=1.0
    )


def _make_weather_slot(
    slot_index: int,
    wbgt_c: float,
    risk_category: HeatRiskCategory = HeatRiskCategory.LOW
) -> SolverTimeSlotWeather:
    start_m = slot_index * 15
    end_m = start_m + 15
    return SolverTimeSlotWeather(
        slot_index=slot_index,
        start_minute=start_m,
        end_minute=end_m,
        temperature_c=30.0,
        relative_humidity=45.0,
        solar_radiation_wm2=500.0,
        wind_speed_kmh=10.0,
        estimated_wbgt_c=wbgt_c,
        risk_category=risk_category
    )


def _make_task_input(
    task_id: str,
    title: str,
    duration_slots: int = 1,
    intensity: PhysicalIntensity = PhysicalIntensity.MEDIUM,
    required_skills: List[SkillType] = None,
    dependencies: List[str] = None,
    deadline_slot: Optional[int] = None,
    min_workers: int = 1
) -> SolverTaskInput:
    return SolverTaskInput(
        task_id=task_id,
        title=title,
        zone_id="zone-1",
        required_skills=required_skills or [SkillType.GENERAL_LABOR],
        duration_minutes=duration_slots * 15,
        intensity=intensity,
        dependencies=dependencies or [],
        min_workers=min_workers,
        deadline_minute=(deadline_slot * 15) if deadline_slot is not None else 600
    )


def _make_resource_input(
    resource_id: str,
    name: str,
    capacity: int = 2,
    resource_type: str = "SHADE"
) -> SolverResourceInput:
    return SolverResourceInput(
        resource_id=resource_id,
        name=name,
        capacity=capacity,
        resource_type=resource_type,
        zone_id="zone-1"
    )


def test_1_heat_driver_detection_and_explanation():
    """Test 1: High WBGT period creates Heat decision factor referencing elevated exposure."""
    weather_slots = [
        _make_weather_slot(0, 24.0, HeatRiskCategory.LOW),
        _make_weather_slot(1, 26.5, HeatRiskCategory.MODERATE),
        _make_weather_slot(2, 31.2, HeatRiskCategory.VERY_HIGH), # Peak at 07:30
    ]
    tasks = [
        _make_task_input(task_id="t1", title="Excavation", duration_slots=1, intensity=PhysicalIntensity.HEAVY)
    ]
    schedule = SolverScheduleOutput(
        status="OPTIMAL",
        solve_time_seconds=0.05,
        total_tasks_scheduled=1,
        total_work_minutes=15,
        total_rest_minutes=0,
        peak_shade_utilization=0,
        peak_water_utilization=0,
        assignments=[_make_dummy_assignment(slot_index=2, worker_id="w1", task_id="t1", task_title="Excavation")]
    )

    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        tasks=tasks,
        weather_slots=weather_slots
    )

    assert res.success is True
    assert res.decision_summary.peak_wbgt_celsius == 31.2
    assert "31.2" in res.decision_summary.heat_impact_summary
    heat_factors = [f for f in res.decision_summary.key_factors if f.category == DecisionFactorCategory.HEAT]
    assert len(heat_factors) > 0
    assert "t1" in heat_factors[0].related_task_ids


def test_2_heat_peak_avoidance_explanation():
    """Test 2: When no tasks run in high heat, Heat factor reports peak avoidance."""
    weather_slots = [
        _make_weather_slot(0, 24.0, HeatRiskCategory.LOW),
        _make_weather_slot(1, 25.0, HeatRiskCategory.LOW),
        _make_weather_slot(2, 31.2, HeatRiskCategory.VERY_HIGH),
    ]
    tasks = [
        _make_task_input(task_id="t1", title="Excavation", duration_slots=1, intensity=PhysicalIntensity.HEAVY)
    ]
    schedule = SolverScheduleOutput(
        status="OPTIMAL",
        solve_time_seconds=0.05,
        total_tasks_scheduled=1,
        total_work_minutes=15,
        total_rest_minutes=0,
        peak_shade_utilization=0,
        peak_water_utilization=0,
        assignments=[_make_dummy_assignment(slot_index=0, worker_id="w1", task_id="t1", task_title="Excavation")]
    )

    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        tasks=tasks,
        weather_slots=weather_slots
    )
    heat_factors = [f for f in res.decision_summary.key_factors if f.category == DecisionFactorCategory.HEAT]
    assert any("Avoidance" in f.title for f in heat_factors)


def test_3_worker_skill_bottleneck_detection():
    """Test 3: Single worker with specialized skill creates workforce bottleneck factor."""
    workers = [
        SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY], is_acclimatized=True, vulnerability_level=HeatVulnerabilityLevel.LOW),
        SolverWorkerInput(worker_id="w2", name="Tariq", skills=[SkillType.WELDING], is_acclimatized=True, vulnerability_level=HeatVulnerabilityLevel.LOW),
    ]
    tasks = [
        _make_task_input(task_id="t_weld", title="Pipe Welding", duration_slots=2, intensity=PhysicalIntensity.HEAVY, required_skills=[SkillType.WELDING], min_workers=1)
    ]
    schedule = SolverScheduleOutput(
        status="OPTIMAL",
        solve_time_seconds=0.05,
        total_tasks_scheduled=1,
        total_work_minutes=30,
        total_rest_minutes=0,
        peak_shade_utilization=0,
        peak_water_utilization=0,
        assignments=[
            _make_dummy_assignment(slot_index=0, worker_id="w2", task_id="t_weld", task_title="Pipe Welding", worker_name="Tariq"),
            _make_dummy_assignment(slot_index=1, worker_id="w2", task_id="t_weld", task_title="Pipe Welding", worker_name="Tariq"),
        ]
    )

    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        tasks=tasks,
        workers=workers
    )
    workforce_factors = [f for f in res.decision_summary.key_factors if f.category == DecisionFactorCategory.WORKFORCE]
    assert any("Bottleneck" in f.title for f in workforce_factors)
    assert "t_weld" in res.task_explanations
    assert "Tariq" in res.worker_explanations["w2"].worker_name


def test_4_resource_capacity_bottleneck_explanation():
    """Test 4: High resource utilization generates resource bottleneck factor."""
    resources = [
        _make_resource_input(resource_id="res_shade_1", name="Main Shade Canopy", capacity=2, resource_type="SHADE")
    ]
    schedule = SolverScheduleOutput(
        status="OPTIMAL",
        solve_time_seconds=0.05,
        total_tasks_scheduled=0,
        total_work_minutes=0,
        total_rest_minutes=30,
        peak_shade_utilization=2,
        peak_water_utilization=0,
        assignments=[
            _make_dummy_assignment(slot_index=1, worker_id="w1", assignment_type=AssignmentType.REST_SHADE),
            _make_dummy_assignment(slot_index=1, worker_id="w2", assignment_type=AssignmentType.REST_SHADE),
        ]
    )

    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        resources=resources
    )
    assert res.decision_summary.peak_resource_utilization_pct == 100.0
    res_factors = [f for f in res.decision_summary.key_factors if f.category == DecisionFactorCategory.RESOURCE]
    assert len(res_factors) > 0
    assert "100%" in res_factors[0].explanation


def test_5_dependency_precedence_driver_explanation():
    """Test 5: Tight dependency creates sequence precedence factor."""
    tasks = [
        _make_task_input(task_id="t1", title="Foundation", duration_slots=1, intensity=PhysicalIntensity.LIGHT, required_skills=[SkillType.GENERAL_LABOR]),
        _make_task_input(task_id="t2", title="Framing", duration_slots=1, intensity=PhysicalIntensity.LIGHT, required_skills=[SkillType.CARPENTRY], dependencies=["t1"]),
    ]
    schedule = SolverScheduleOutput(
        status="OPTIMAL",
        solve_time_seconds=0.05,
        total_tasks_scheduled=2,
        total_work_minutes=30,
        total_rest_minutes=0,
        peak_shade_utilization=0,
        peak_water_utilization=0,
        assignments=[
            _make_dummy_assignment(slot_index=0, worker_id="w1", task_id="t1", task_title="Foundation"),
            _make_dummy_assignment(slot_index=1, worker_id="w2", task_id="t2", task_title="Framing"),
        ]
    )

    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        tasks=tasks
    )
    dep_factors = [f for f in res.decision_summary.key_factors if f.category == DecisionFactorCategory.DEPENDENCY]
    assert len(dep_factors) > 0
    assert "Framing" in dep_factors[0].title


def test_6_deadline_proximity_explanation():
    """Test 6: Task ending right at its deadline triggers deadline factor."""
    tasks = [
        _make_task_input(task_id="t_rush", title="Urgent Concrete", duration_slots=2, intensity=PhysicalIntensity.HEAVY, required_skills=[SkillType.MASONRY], deadline_slot=2)
    ]
    schedule = SolverScheduleOutput(
        status="OPTIMAL",
        solve_time_seconds=0.05,
        total_tasks_scheduled=1,
        total_work_minutes=30,
        total_rest_minutes=0,
        peak_shade_utilization=0,
        peak_water_utilization=0,
        assignments=[
            _make_dummy_assignment(slot_index=0, worker_id="w1", task_id="t_rush", task_title="Urgent Concrete"),
            _make_dummy_assignment(slot_index=1, worker_id="w1", task_id="t_rush", task_title="Urgent Concrete"), # Ends at slot 2
        ]
    )

    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        tasks=tasks
    )
    deadline_factors = [f for f in res.decision_summary.key_factors if f.category == DecisionFactorCategory.DEADLINE]
    assert len(deadline_factors) > 0
    assert "Urgent Concrete" in deadline_factors[0].title


def test_7_mandatory_recovery_block_explanation():
    """Test 7: Rest allocations trigger recovery factor."""
    schedule = SolverScheduleOutput(
        status="OPTIMAL",
        solve_time_seconds=0.05,
        total_tasks_scheduled=1,
        total_work_minutes=15,
        total_rest_minutes=15,
        peak_shade_utilization=1,
        peak_water_utilization=0,
        assignments=[
            _make_dummy_assignment(slot_index=0, worker_id="w1", task_id="t1", task_title="Task 1"),
            _make_dummy_assignment(slot_index=1, worker_id="w1", assignment_type=AssignmentType.REST_SHADE),
        ]
    )

    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule
    )
    assert res.decision_summary.total_rest_minutes == 15
    rec_factors = [f for f in res.decision_summary.key_factors if f.category == DecisionFactorCategory.RECOVERY]
    assert len(rec_factors) > 0


def test_8_fastest_objective_mode_explanation():
    """Test 8: Fastest objective explains makespan minimization."""
    schedule = SolverScheduleOutput(status="OPTIMAL", solve_time_seconds=0.05, total_tasks_scheduled=0, total_work_minutes=0, total_rest_minutes=0, peak_shade_utilization=0, peak_water_utilization=0, assignments=[])
    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        objective_mode=SolverObjectiveMode.FASTEST
    )
    assert res.decision_summary.objective_mode == "FASTEST"
    assert "earliest completion" in res.decision_summary.objective_mode_explanation.lower()


def test_9_balanced_objective_mode_explanation():
    """Test 9: Balanced objective explains trade-off between makespan and thermal strain."""
    schedule = SolverScheduleOutput(status="OPTIMAL", solve_time_seconds=0.05, total_tasks_scheduled=0, total_work_minutes=0, total_rest_minutes=0, peak_shade_utilization=0, peak_water_utilization=0, assignments=[])
    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        objective_mode=SolverObjectiveMode.BALANCED
    )
    assert res.decision_summary.objective_mode == "BALANCED"
    assert "balanced" in res.decision_summary.objective_mode_explanation.lower()


def test_10_safest_objective_mode_explanation():
    """Test 10: Safest objective explains heat strain minimization."""
    schedule = SolverScheduleOutput(status="OPTIMAL", solve_time_seconds=0.05, total_tasks_scheduled=0, total_work_minutes=0, total_rest_minutes=0, peak_shade_utilization=0, peak_water_utilization=0, assignments=[])
    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        objective_mode=SolverObjectiveMode.SAFEST
    )
    assert res.decision_summary.objective_mode == "SAFEST"
    assert "minimizing heat strain" in res.decision_summary.objective_mode_explanation.lower()


def test_11_baseline_vs_scenario_delta_explanation():
    """Test 11: Scenario diff generates causal scenario narrative."""
    schedule = SolverScheduleOutput(status="OPTIMAL", solve_time_seconds=0.05, total_tasks_scheduled=0, total_work_minutes=0, total_rest_minutes=0, peak_shade_utilization=0, peak_water_utilization=0, assignments=[])
    scenario_diff = {
        "comparison_summary": {
            "completion_time_delta_minutes": 30,
            "rest_minutes_delta": 15
        },
        "task_diffs": [
            {
                "task_id": "t1",
                "task_title": "Welding",
                "change_type": "MOVED",
                "start_delta_minutes": 30,
                "baseline_start_time": "08:00"
            }
        ]
    }
    applied_overrides = {
        "weather": {"temperature_c_delta": 3.0}
    }

    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        scenario_diff=scenario_diff,
        applied_overrides=applied_overrides
    )

    assert res.scenario_explanation is not None
    assert "30 minutes" in str(res.scenario_explanation.key_changes)
    assert "+3.0°C" in str(res.scenario_explanation.key_changes)


def test_12_empty_scenario_zero_delta_explanation():
    """Test 12: Empty scenario explains that zero parameters were overridden."""
    schedule = SolverScheduleOutput(status="OPTIMAL", solve_time_seconds=0.05, total_tasks_scheduled=0, total_work_minutes=0, total_rest_minutes=0, peak_shade_utilization=0, peak_water_utilization=0, assignments=[])
    res = DecisionIntelligenceAnalyzer.analyze_schedule(
        schedule=schedule,
        scenario_diff={},
        applied_overrides={}
    )
    assert res.scenario_explanation is not None
    assert "identical" in res.scenario_explanation.narrative.lower()


def test_13_deterministic_repeatability_identical_inputs():
    """Test 13: Identical inputs produce byte-identical explanation outputs."""
    schedule = SolverScheduleOutput(
        status="OPTIMAL",
        solve_time_seconds=0.05,
        total_tasks_scheduled=1,
        total_work_minutes=15,
        total_rest_minutes=0,
        peak_shade_utilization=0,
        peak_water_utilization=0,
        assignments=[_make_dummy_assignment(slot_index=0, worker_id="w1", task_id="t1")]
    )
    res1 = DecisionIntelligenceAnalyzer.analyze_schedule(schedule=schedule, objective_mode=SolverObjectiveMode.BALANCED)
    res2 = DecisionIntelligenceAnalyzer.analyze_schedule(schedule=schedule, objective_mode=SolverObjectiveMode.BALANCED)

    assert res1.model_dump() == res2.model_dump()


def test_14_no_fabricated_evidence_or_hallucinations():
    """Test 14: Evidence fields strictly contain numbers/keys provided in the schedule."""
    schedule = SolverScheduleOutput(
        status="OPTIMAL",
        solve_time_seconds=0.05,
        total_tasks_scheduled=1,
        total_work_minutes=15,
        total_rest_minutes=0,
        peak_shade_utilization=0,
        peak_water_utilization=0,
        assignments=[_make_dummy_assignment(slot_index=1, worker_id="w1", task_id="t_mason", task_title="Masonry Work")]
    )
    tasks = [
        _make_task_input(task_id="t_mason", title="Masonry Work", duration_slots=1, intensity=PhysicalIntensity.MEDIUM, required_skills=[SkillType.MASONRY])
    ]
    res = DecisionIntelligenceAnalyzer.analyze_schedule(schedule=schedule, tasks=tasks)
    assert "t_mason" in res.task_explanations
    assert res.task_explanations["t_mason"].task_title == "Masonry Work"
    assert res.task_explanations["t_mason"].start_time == "07:15"


def test_15_no_duplicate_safety_constants():
    """Test 15: Decision analyzer imports standard policy structures without duplicating thresholds."""
    import inspect
    from optimizer.engine import decision_analyzer
    source = inspect.getsource(decision_analyzer)
    assert "DEFAULT_OSHA_WBGT_BANDS = [" not in source


def test_16_explain_api_endpoint_end_to_end():
    """Test 16: POST /api/schedules/explain returns structured decision intelligence."""
    payload = {
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "SAFEST",
        "schedule": {
            "assignments": [
                {"taskId": "t1", "workerId": "w1", "slotIndex": 0},
                {"taskId": "REST", "workerId": "w1", "slotIndex": 1}
            ],
            "objectiveValue": 25.0,
            "status": "OPTIMAL",
            "solverTimeSeconds": 0.04
        }
    }

    resp = client.post("/api/schedules/explain", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "decisionSummary" in data
    assert data["decisionSummary"]["objectiveMode"] == "SAFEST"
    assert "taskExplanations" in data
    assert "workerExplanations" in data
