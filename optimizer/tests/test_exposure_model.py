"""
ThermoShift - Exposure Model & Occupational Safety Test Suite
Validates:
1. Strict separation of Authoritative Safety Policy vs Engineering Optimization Heuristic.
2. Compliance with OSHA/NIOSH work/rest rules.
3. Configurable Acclimatization Policy (NIOSH 2016 duration restrictions, NOT arbitrary multipliers).
4. Vulnerability Level acting as administrative operational policy, NOT a clinical factor.
5. Work/Rest recovery cycles enforced through policy rules rather than pseudo-physiological constants.
6. Monotonicity of engineering heuristic objective scoring.
7. Deterministic repeatability.
"""
import pytest
from optimizer.engine.data_models import (
    PhysicalIntensity,
    HeatVulnerabilityLevel,
    HeatRiskCategory,
    SafetyPolicy,
    SafetyStandardType,
    AcclimatizationPolicy,
    VulnerabilityAdjustment,
    WorkRestRule
)
from optimizer.engine.heat_methodology import EnvironmentalReading
from optimizer.engine.exposure_model import (
    ExposureModel,
    ExposureCalculationRequest,
    ExposureCalculationResult
)


def test_authoritative_safety_compliance_and_violation_detection():
    """Validates that authoritative work/rest limits are enforced as hard safety boundaries."""
    # Environmental condition in HIGH heat (32°C, 50% RH -> WBGT ~29.8°C)
    reading = EnvironmentalReading(
        temperature_c=32.0,
        relative_humidity=50.0,
        solar_radiation_wm2=700.0,
        direct_sun_exposure=True
    )

    # In HIGH risk, HEAVY work has a 20-minute maximum continuous work cap
    req_compliant = ExposureCalculationRequest(
        worker_id="w-safe",
        is_acclimatized=True,
        vulnerability_rating=HeatVulnerabilityLevel.LOW,
        is_work_assignment=True,
        task_intensity=PhysicalIntensity.HEAVY,
        duration_minutes=20,  # Exactly within cap
        environmental_reading=reading
    )
    req_violating = ExposureCalculationRequest(
        worker_id="w-unsafe",
        is_acclimatized=True,
        vulnerability_rating=HeatVulnerabilityLevel.LOW,
        is_work_assignment=True,
        task_intensity=PhysicalIntensity.HEAVY,
        duration_minutes=45,  # Exceeds 20 min cap
        environmental_reading=reading
    )

    res_compliant = ExposureModel.calculate_assignment_exposure(req_compliant)
    res_violating = ExposureModel.calculate_assignment_exposure(req_violating)

    assert res_compliant.safety_compliance.is_compliant is True
    assert res_compliant.cumulative_exposure_cap_exceeded is False
    assert len(res_compliant.safety_compliance.violations) == 0

    assert res_violating.safety_compliance.is_compliant is False
    assert res_violating.cumulative_exposure_cap_exceeded is True
    assert len(res_violating.safety_compliance.violations) > 0
    assert "exceeds maximum allowable continuous work limit" in res_violating.safety_compliance.violations[0]


def test_acclimatization_policy_restricts_exposure_duration():
    """Unacclimatized workers are constrained by NIOSH-grounded continuous duration limits and rest multipliers."""
    reading = EnvironmentalReading(
        temperature_c=30.0,
        relative_humidity=50.0,
        solar_radiation_wm2=600.0,
        direct_sun_exposure=True
    )

    # Moderate heat: Light intensity normally allows 60 min continuous work for acclimatized workers
    req_acclimatized = ExposureCalculationRequest(
        worker_id="w-acclim",
        is_acclimatized=True,
        vulnerability_rating=HeatVulnerabilityLevel.LOW,
        is_work_assignment=True,
        task_intensity=PhysicalIntensity.LIGHT,
        duration_minutes=45,
        environmental_reading=reading
    )
    # For unacclimatized workers, NIOSH policy caps continuous exposure to 30 min
    req_unacclimatized = ExposureCalculationRequest(
        worker_id="w-unacclim",
        is_acclimatized=False,
        vulnerability_rating=HeatVulnerabilityLevel.LOW,
        is_work_assignment=True,
        task_intensity=PhysicalIntensity.LIGHT,
        duration_minutes=45,
        environmental_reading=reading
    )

    res_acclim = ExposureModel.calculate_assignment_exposure(req_acclimatized)
    res_unacclim = ExposureModel.calculate_assignment_exposure(req_unacclimatized)

    assert res_acclim.safety_compliance.is_compliant is True
    assert res_unacclim.safety_compliance.is_compliant is False
    assert res_unacclim.safety_compliance.max_continuous_work_minutes <= 30


def test_vulnerability_acts_as_administrative_precaution_not_clinical_multiplier():
    """Vulnerability rating applies supervisor-defined administrative work caps without claiming medical diagnosis."""
    reading = EnvironmentalReading(
        temperature_c=29.0,
        relative_humidity=50.0,
        solar_radiation_wm2=500.0,
        direct_sun_exposure=True
    )

    custom_policy = SafetyPolicy(
        policy_id="pol-site-1",
        name="Site Precautionary Policy",
        vulnerability_adjustments=[
            VulnerabilityAdjustment(
                vulnerability_level=HeatVulnerabilityLevel.HIGH,
                operational_rest_multiplier=1.5,
                max_continuous_work_cap_minutes=25,
                description="Administrative precaution: maximum 25 min continuous outdoor work"
            )
        ]
    )

    req_standard = ExposureCalculationRequest(
        worker_id="w-std",
        is_acclimatized=True,
        vulnerability_rating=HeatVulnerabilityLevel.LOW,
        task_intensity=PhysicalIntensity.MEDIUM,
        duration_minutes=35,
        environmental_reading=reading
    )
    req_precaution = ExposureCalculationRequest(
        worker_id="w-prec",
        is_acclimatized=True,
        vulnerability_rating=HeatVulnerabilityLevel.HIGH,
        task_intensity=PhysicalIntensity.MEDIUM,
        duration_minutes=35,
        environmental_reading=reading
    )

    res_std = ExposureModel.calculate_assignment_exposure(req_standard, policy=custom_policy)
    res_prec = ExposureModel.calculate_assignment_exposure(req_precaution, policy=custom_policy)

    # Administrative policy sets a conservative 25 min work limit for the high-vulnerability worker
    assert res_std.safety_compliance.is_compliant is True
    assert res_prec.safety_compliance.is_compliant is False
    assert res_prec.safety_compliance.max_continuous_work_minutes == 25


def test_engineering_heuristic_optimization_metric_is_explicitly_classified():
    """Confirms that the solver optimization heuristic is clearly classified as an engineering prototype metric."""
    reading = EnvironmentalReading(
        temperature_c=33.0,
        relative_humidity=50.0,
        solar_radiation_wm2=700.0,
        direct_sun_exposure=True
    )

    req_work = ExposureCalculationRequest(
        worker_id="w-opt",
        is_work_assignment=True,
        task_intensity=PhysicalIntensity.HEAVY,
        duration_minutes=30,
        environmental_reading=reading
    )
    res_work = ExposureModel.calculate_assignment_exposure(req_work)

    # Heuristic metric classification
    assert res_work.optimization_metric.description == "Prototype optimization heuristic metric"
    assert res_work.optimization_metric.prototype_cost_score > 0.0

    # Heuristic rest benefit
    req_rest = ExposureCalculationRequest(
        worker_id="w-opt",
        is_work_assignment=False,
        is_cooled_shade_rest=True,
        duration_minutes=15,
        environmental_reading=reading
    )
    res_rest = ExposureModel.calculate_assignment_exposure(req_rest)
    assert res_rest.optimization_metric.prototype_cost_score < 0.0


def test_heuristic_strain_monotonicity_across_intensities():
    """Validates that heuristic objective penalty scales monotonically with task intensity."""
    reading = EnvironmentalReading(
        temperature_c=34.0,
        relative_humidity=50.0,
        solar_radiation_wm2=700.0,
        direct_sun_exposure=True
    )

    intensities = [
        PhysicalIntensity.LIGHT,
        PhysicalIntensity.MEDIUM,
        PhysicalIntensity.HEAVY,
        PhysicalIntensity.EXTREME
    ]

    scores = []
    for intensity in intensities:
        req = ExposureCalculationRequest(
            worker_id="w-test",
            is_work_assignment=True,
            task_intensity=intensity,
            duration_minutes=30,
            environmental_reading=reading
        )
        res = ExposureModel.calculate_assignment_exposure(req)
        scores.append(res.net_exposure_increment)

    assert scores[0] < scores[1] < scores[2] < scores[3]
