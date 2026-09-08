"""
Test suite for Optimizer Interface Contracts
"""
import pytest
from optimizer.engine.data_models import (
    SkillType,
    PhysicalIntensity,
    HeatVulnerabilityLevel,
    HeatRiskCategory,
    SafetyPolicy,
    SafetyStandardType
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


def test_solver_problem_instance_creation_and_validation():
    workers = [
        SolverWorkerInput(
            worker_id="w-01",
            name="Carlos Ramirez",
            skills=[SkillType.MASONRY],
            is_acclimatized=True,
            vulnerability_rating=HeatVulnerabilityLevel.LOW
        )
    ]
    tasks = [
        SolverTaskInput(
            task_id="t-01",
            title="Foundation Pour",
            zone_id="zone-a",
            required_skills=[SkillType.MASONRY],
            min_workers=1,
            max_workers=2,
            duration_minutes=120,
            intensity=PhysicalIntensity.HEAVY
        )
    ]
    resources = [
        SolverResourceInput(
            resource_id="res-01",
            name="East Shade Tent",
            resource_type="SHADE_STRUCTURE",
            capacity=8,
            zone_id="zone-a"
        )
    ]
    weather_slots = [
        SolverTimeSlotWeather(
            slot_index=0,
            start_minute=0,
            end_minute=15,
            temperature_c=28.0,
            relative_humidity=50.0,
            solar_radiation_wm2=400.0,
            wind_speed_kmh=10.0,
            estimated_wbgt_c=25.2,
            risk_category=HeatRiskCategory.LOW
        )
    ]
    policy = SafetyPolicy(
        policy_id="policy-default",
        name="Default OSHA Safety Policy",
        standard=SafetyStandardType.OSHA
    )

    instance = SolverProblemInstance(
        site_id="site-01",
        shift_date="2026-07-15",
        objective_mode=SolverObjectiveMode.BALANCED,
        workers=workers,
        tasks=tasks,
        resources=resources,
        weather_slots=weather_slots,
        safety_policy=policy
    )

    assert instance.site_id == "site-01"
    assert len(instance.workers) == 1
    assert len(instance.tasks) == 1
    assert instance.objective_mode == SolverObjectiveMode.BALANCED
