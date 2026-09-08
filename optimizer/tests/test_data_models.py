"""
Test suite for ThermoShift data models with configurable SafetyPolicy
"""
import pytest
from optimizer.engine.data_models import (
    Worker,
    WorkerHeatProfile,
    SkillType,
    HeatVulnerabilityLevel,
    Task,
    PhysicalIntensity,
    WorkZone,
    SiteResources,
    EnvironmentalPoint,
    HeatRiskCategory,
    SafetyPolicy,
    SafetyStandardType,
    WbgtBandThreshold,
    WorkRestRule,
    VulnerabilityAdjustment,
    OptimizationPayload
)


def test_worker_model_validation():
    worker = Worker(
        id="w-01",
        name="Carlos Ramirez",
        employee_code="CR-101",
        role="Senior Mason",
        skills=[SkillType.MASONRY, SkillType.GENERAL_LABOR],
        heat_profile=WorkerHeatProfile(
            acclimatized=True,
            heat_vulnerability=HeatVulnerabilityLevel.LOW,
            past_heat_incidents=0
        )
    )
    assert worker.id == "w-01"
    assert worker.skills[0] == SkillType.MASONRY
    assert worker.heat_profile.acclimatized is True


def test_task_model_validation():
    task = Task(
        id="t-01",
        title="Foundation Rebar Tying",
        zone_id="zone-a",
        required_skills=[SkillType.CARPENTRY, SkillType.GENERAL_LABOR],
        min_workers=2,
        max_workers=4,
        duration_minutes=180,
        intensity=PhysicalIntensity.HEAVY,
        is_sun_exposed=True
    )
    assert task.duration_minutes == 180
    assert task.intensity == PhysicalIntensity.HEAVY


def test_safety_policy_and_optimization_payload_validation():
    policy = SafetyPolicy(
        policy_id="policy-osha-default",
        name="OSHA Standard Heat Protocol",
        standard=SafetyStandardType.OSHA,
        wbgt_bands=[
            WbgtBandThreshold(
                category=HeatRiskCategory.LOW,
                wbgt_min_celsius=0.0,
                wbgt_max_celsius=25.9,
                description="Low Risk"
            ),
            WbgtBandThreshold(
                category=HeatRiskCategory.EXTREME,
                wbgt_min_celsius=32.2,
                wbgt_max_celsius=50.0,
                description="Extreme Risk"
            )
        ],
        work_rest_rules=[
            WorkRestRule(
                risk_category=HeatRiskCategory.EXTREME,
                intensity=PhysicalIntensity.HEAVY,
                acclimatized=False,
                work_minutes=15,
                rest_minutes=45,
                mandatory_hydration_ml_per_hour=1200
            )
        ],
        vulnerability_adjustments=[
            VulnerabilityAdjustment(
                vulnerability_level=HeatVulnerabilityLevel.HIGH,
                operational_rest_multiplier=1.5
            )
        ]
    )

    worker = Worker(
        id="w-01",
        name="Alice",
        employee_code="A-1",
        role="Electrician",
        skills=[SkillType.ELECTRICAL]
    )
    task = Task(
        id="t-01",
        title="Conduit Installation",
        zone_id="zone-1",
        required_skills=[SkillType.ELECTRICAL],
        min_workers=1,
        max_workers=2,
        duration_minutes=60
    )
    zone = WorkZone(id="zone-1", name="West Wing Roof", has_shade_cover=False)
    resources = SiteResources(max_shade_area_workers=8, water_stations_count=3)
    weather_point = EnvironmentalPoint(
        time_str="08:00",
        minute_offset=60,
        temperature_c=31.5,
        relative_humidity=65.0,
        wbgt_celsius=29.8,
        risk_category=HeatRiskCategory.HIGH
    )

    payload = OptimizationPayload(
        site_id="site-demo-01",
        shift_date="2026-07-15",
        workers=[worker],
        tasks=[task],
        zones=[zone],
        resources=resources,
        weather_forecast=[weather_point],
        safety_policy=policy
    )

    assert payload.site_id == "site-demo-01"
    assert payload.safety_policy is not None
    assert payload.safety_policy.standard == SafetyStandardType.OSHA
    assert payload.safety_policy.work_rest_rules[0].work_minutes == 15
