"""
ThermoShift - Occupational Safety & Exposure Modeling Architecture

ARCHITECTURAL SEPARATION:
1. AUTHORITATIVE OCCUPATIONAL SAFETY CONSTRAINTS (Primary Safety Boundary)
   - Evaluates strict compliance against OSHA / NIOSH / ISO 7243 standards.
   - Enforces hard maximum work duration caps, mandatory recovery breaks in shade/cooling,
     and NIOSH-grounded unacclimatized exposure limits.
   - Safety constraints must ALWAYS be satisfied first.

2. ENGINEERING OPTIMIZATION OBJECTIVE (Prototype Heuristic)
   - Computes a mathematical cost metric ("Thermal Work Index" / Heuristic Strain Score)
     used strictly as a penalty/objective function for mathematical optimization (e.g., CP-SAT).
   - CLASSIFICATION: ENGINEERING ASSUMPTION / PROTOTYPE PARAMETER.
   - NOT a physiological constant, medical measurement, or clinical diagnosis.
"""

from typing import Dict, List, Optional
from enum import Enum
from pydantic import BaseModel, Field

from optimizer.engine.data_models import (
    PhysicalIntensity,
    HeatVulnerabilityLevel,
    HeatRiskCategory,
    SafetyPolicy,
    SafetyStandardType,
    WorkRestRule,
    WbgtBandThreshold,
    AcclimatizationPolicy,
    VulnerabilityAdjustment
)
from optimizer.engine.heat_methodology import (
    HeatMethodologyEngine,
    EnvironmentalReading,
    HeatMetrics,
    CalculationQuality
)


# Default Authoritative Baselines (OSHA/NIOSH standard work-rest thresholds)
DEFAULT_OSHA_WBGT_BANDS = [
    WbgtBandThreshold(category=HeatRiskCategory.LOW, wbgt_min_celsius=0.0, wbgt_max_celsius=25.9, description="Low Risk - Normal continuous operations"),
    WbgtBandThreshold(category=HeatRiskCategory.MODERATE, wbgt_min_celsius=26.0, wbgt_max_celsius=28.9, description="Moderate Risk - Caution, mandatory hydration reminders"),
    WbgtBandThreshold(category=HeatRiskCategory.HIGH, wbgt_min_celsius=29.0, wbgt_max_celsius=31.0, description="High Risk - Work/rest cycles enforced, active shade monitoring"),
    WbgtBandThreshold(category=HeatRiskCategory.VERY_HIGH, wbgt_min_celsius=31.1, wbgt_max_celsius=32.5, description="Very High Risk - 50/50 work/rest regimens, strict hydration"),
    WbgtBandThreshold(category=HeatRiskCategory.EXTREME, wbgt_min_celsius=32.6, wbgt_max_celsius=50.0, description="Extreme Danger - Minimal continuous outdoor work, cooling trailer mandatory")
]

# Standard NIOSH/OSHA Work/Rest defaults by (Risk Band, Intensity, Acclimatized)
DEFAULT_WORK_REST_RULES = [
    # LOW Risk (< 26°C WBGT)
    WorkRestRule(risk_category=HeatRiskCategory.LOW, intensity=PhysicalIntensity.LIGHT, acclimatized=True, work_minutes=60, rest_minutes=0, mandatory_hydration_ml_per_hour=500),
    WorkRestRule(risk_category=HeatRiskCategory.LOW, intensity=PhysicalIntensity.MEDIUM, acclimatized=True, work_minutes=60, rest_minutes=0, mandatory_hydration_ml_per_hour=750),
    WorkRestRule(risk_category=HeatRiskCategory.LOW, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=50, rest_minutes=10, mandatory_hydration_ml_per_hour=1000),
    WorkRestRule(risk_category=HeatRiskCategory.LOW, intensity=PhysicalIntensity.EXTREME, acclimatized=True, work_minutes=45, rest_minutes=15, mandatory_hydration_ml_per_hour=1000),

    # MODERATE Risk (26.0 - 28.9°C WBGT)
    WorkRestRule(risk_category=HeatRiskCategory.MODERATE, intensity=PhysicalIntensity.LIGHT, acclimatized=True, work_minutes=60, rest_minutes=0, mandatory_hydration_ml_per_hour=750),
    WorkRestRule(risk_category=HeatRiskCategory.MODERATE, intensity=PhysicalIntensity.MEDIUM, acclimatized=True, work_minutes=45, rest_minutes=15, mandatory_hydration_ml_per_hour=1000),
    WorkRestRule(risk_category=HeatRiskCategory.MODERATE, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=30, rest_minutes=30, mandatory_hydration_ml_per_hour=1000),
    WorkRestRule(risk_category=HeatRiskCategory.MODERATE, intensity=PhysicalIntensity.EXTREME, acclimatized=True, work_minutes=20, rest_minutes=40, mandatory_hydration_ml_per_hour=1200),

    # HIGH Risk (29.0 - 31.0°C WBGT)
    WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.LIGHT, acclimatized=True, work_minutes=45, rest_minutes=15, mandatory_hydration_ml_per_hour=1000),
    WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.MEDIUM, acclimatized=True, work_minutes=30, rest_minutes=30, mandatory_hydration_ml_per_hour=1000),
    WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=20, rest_minutes=40, mandatory_hydration_ml_per_hour=1200),
    WorkRestRule(risk_category=HeatRiskCategory.HIGH, intensity=PhysicalIntensity.EXTREME, acclimatized=True, work_minutes=15, rest_minutes=45, mandatory_hydration_ml_per_hour=1200),

    # VERY HIGH Risk (31.1 - 32.5°C WBGT)
    WorkRestRule(risk_category=HeatRiskCategory.VERY_HIGH, intensity=PhysicalIntensity.LIGHT, acclimatized=True, work_minutes=30, rest_minutes=30, mandatory_hydration_ml_per_hour=1000),
    WorkRestRule(risk_category=HeatRiskCategory.VERY_HIGH, intensity=PhysicalIntensity.MEDIUM, acclimatized=True, work_minutes=20, rest_minutes=40, mandatory_hydration_ml_per_hour=1200),
    WorkRestRule(risk_category=HeatRiskCategory.VERY_HIGH, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=15, rest_minutes=45, mandatory_hydration_ml_per_hour=1200),
    WorkRestRule(risk_category=HeatRiskCategory.VERY_HIGH, intensity=PhysicalIntensity.EXTREME, acclimatized=True, work_minutes=10, rest_minutes=50, mandatory_hydration_ml_per_hour=1200),

    # EXTREME Danger (> 32.5°C WBGT)
    WorkRestRule(risk_category=HeatRiskCategory.EXTREME, intensity=PhysicalIntensity.LIGHT, acclimatized=True, work_minutes=15, rest_minutes=45, mandatory_hydration_ml_per_hour=1200),
    WorkRestRule(risk_category=HeatRiskCategory.EXTREME, intensity=PhysicalIntensity.MEDIUM, acclimatized=True, work_minutes=10, rest_minutes=50, mandatory_hydration_ml_per_hour=1200),
    WorkRestRule(risk_category=HeatRiskCategory.EXTREME, intensity=PhysicalIntensity.HEAVY, acclimatized=True, work_minutes=5, rest_minutes=55, mandatory_hydration_ml_per_hour=1200),
    WorkRestRule(risk_category=HeatRiskCategory.EXTREME, intensity=PhysicalIntensity.EXTREME, acclimatized=True, work_minutes=0, rest_minutes=60, mandatory_hydration_ml_per_hour=1200),
]


class ExposureCalculationRequest(BaseModel):
    worker_id: str
    is_acclimatized: bool = True
    vulnerability_rating: HeatVulnerabilityLevel = HeatVulnerabilityLevel.LOW
    custom_max_work_minutes: Optional[int] = None

    is_work_assignment: bool = True
    task_intensity: PhysicalIntensity = PhysicalIntensity.MEDIUM
    duration_minutes: int
    is_sun_exposed: bool = True
    is_cooled_shade_rest: bool = False

    environmental_reading: EnvironmentalReading


class SafetyConstraintResult(BaseModel):
    is_compliant: bool
    risk_category: HeatRiskCategory
    work_rest_rule: WorkRestRule
    max_continuous_work_minutes: int
    mandatory_rest_minutes_per_hour: int
    mandatory_hydration_ml: int
    violations: List[str] = Field(default_factory=list)


class HeuristicOptimizationMetric(BaseModel):
    """
    ENGINEERING ASSUMPTION / PROTOTYPE PARAMETER.
    Relative numerical penalty used by optimizer objective to minimize hot-work duration.
    Does NOT represent clinical thermal strain or medical risk.
    """
    environmental_factor: float
    workload_weight: float
    prototype_cost_score: float
    description: str = "Prototype optimization heuristic metric"


class ExposureCalculationResult(BaseModel):
    worker_id: str
    duration_minutes: int
    is_work: bool
    heat_metrics: HeatMetrics
    risk_category: HeatRiskCategory
    work_rest_guideline: WorkRestRule

    # Authoritative Safety Constraint Results
    safety_compliance: SafetyConstraintResult
    cumulative_exposure_cap_exceeded: bool
    recommended_water_ml: int

    # Engineering Optimization Prototype Metric (Heuristic)
    optimization_metric: HeuristicOptimizationMetric
    net_exposure_increment: float  # Maintained as heuristic objective value for solver


class ExposureModel:
    """
    Authoritative Occupational Safety Policy Checker & Engineering Exposure Scorer.
    """

    # =========================================================================
    # ENGINEERING OPTIMIZATION WEIGHTS (Prototype solver objective parameters)
    # Strictly for load-balancing / objective function heuristics.
    # NOT physiological or medical constants.
    # =========================================================================
    HEURISTIC_WORKLOAD_WEIGHTS = {
        PhysicalIntensity.LIGHT: 1.0,
        PhysicalIntensity.MEDIUM: 1.6,
        PhysicalIntensity.HEAVY: 2.4,
        PhysicalIntensity.EXTREME: 3.2
    }

    HEURISTIC_RECOVERY_WEIGHTS = {
        "AMBIENT_SHADE": 1.4,
        "COOLED_SHELTER": 2.2
    }

    @classmethod
    def get_risk_category(cls, wbgt_c: Optional[float], policy: Optional[SafetyPolicy] = None) -> HeatRiskCategory:
        """
        Maps WBGT temperature to occupational heat risk bands.
        """
        if wbgt_c is None:
            # When data is insufficient to compute WBGT, classify conservatively as HIGH risk
            return HeatRiskCategory.HIGH

        bands = policy.wbgt_bands if policy and policy.wbgt_bands else DEFAULT_OSHA_WBGT_BANDS
        for band in bands:
            if band.wbgt_min_celsius <= wbgt_c <= band.wbgt_max_celsius:
                return band.category
        if wbgt_c > 32.5:
            return HeatRiskCategory.EXTREME
        return HeatRiskCategory.LOW

    @classmethod
    def get_applicable_work_rest_limits(
        cls,
        risk_category: HeatRiskCategory,
        intensity: PhysicalIntensity,
        is_acclimatized: bool,
        vulnerability: HeatVulnerabilityLevel = HeatVulnerabilityLevel.LOW,
        custom_max_work: Optional[int] = None,
        policy: Optional[SafetyPolicy] = None
    ) -> Tuple[int, int, WorkRestRule]:
        """
        Directly extracts (max_continuous_work_minutes, mandatory_rest_minutes, matched_rule)
        from SafetyPolicy for a given risk category, intensity, and worker profile.
        Eliminates the need for artificial duration probe calls.
        """
        rules = policy.work_rest_rules if policy and policy.work_rest_rules else DEFAULT_WORK_REST_RULES
        acclim_policy = policy.acclimatization_policy if policy and policy.acclimatization_policy else AcclimatizationPolicy()

        # Find matching base rule
        matched_rule = None
        for r in rules:
            if r.risk_category == risk_category and r.intensity == intensity:
                matched_rule = r
                break

        if not matched_rule:
            matched_rule = WorkRestRule(
                risk_category=risk_category,
                intensity=intensity,
                acclimatized=is_acclimatized,
                work_minutes=30 if is_acclimatized else 20,
                rest_minutes=30 if is_acclimatized else 40,
                mandatory_hydration_ml_per_hour=1000
            )

        max_work = matched_rule.work_minutes
        mandatory_rest = matched_rule.rest_minutes

        # Enforce Acclimatization Policy (NIOSH progressive duration restrictions)
        if not is_acclimatized:
            max_work = min(max_work, acclim_policy.unacclimatized_max_continuous_work_minutes)
            mandatory_rest = min(60, int(mandatory_rest * acclim_policy.unacclimatized_rest_multiplier))

        # Enforce Supervisor Administrative Precautions (Vulnerability Adjustment)
        if policy and policy.vulnerability_adjustments:
            for va in policy.vulnerability_adjustments:
                if va.vulnerability_level == vulnerability:
                    if va.max_continuous_work_cap_minutes is not None:
                        max_work = min(max_work, va.max_continuous_work_cap_minutes)
                    mandatory_rest = min(60, int(mandatory_rest * va.operational_rest_multiplier))

        if custom_max_work is not None:
            max_work = min(max_work, custom_max_work)

        return (max_work, mandatory_rest, matched_rule)

    @classmethod
    def evaluate_safety_constraints(
        cls,
        risk_category: HeatRiskCategory,
        intensity: PhysicalIntensity,
        is_acclimatized: bool,
        duration_minutes: int,
        is_work: bool,
        vulnerability: HeatVulnerabilityLevel = HeatVulnerabilityLevel.LOW,
        custom_max_work: Optional[int] = None,
        policy: Optional[SafetyPolicy] = None
    ) -> SafetyConstraintResult:
        """
        AUTHORITATIVE OCCUPATIONAL SAFETY EVALUATION.
        Enforces policy work/rest limits, NIOSH acclimatization restrictions, and supervisor caps.
        """
        max_work, mandatory_rest, matched_rule = cls.get_applicable_work_rest_limits(
            risk_category=risk_category,
            intensity=intensity,
            is_acclimatized=is_acclimatized,
            vulnerability=vulnerability,
            custom_max_work=custom_max_work,
            policy=policy
        )

        violations = []
        if is_work and duration_minutes > max_work:
            violations.append(
                f"Assigned work duration ({duration_minutes} min) exceeds maximum allowable continuous work limit ({max_work} min) for {risk_category.value} risk."
            )

        hydration_ml = int(matched_rule.mandatory_hydration_ml_per_hour * (duration_minutes / 60.0))

        return SafetyConstraintResult(
            is_compliant=(len(violations) == 0),
            risk_category=risk_category,
            work_rest_rule=matched_rule,
            max_continuous_work_minutes=max_work,
            mandatory_rest_minutes_per_hour=mandatory_rest,
            mandatory_hydration_ml=hydration_ml,
            violations=violations
        )

    @classmethod
    def calculate_heuristic_optimization_metric(
        cls,
        wbgt_c: Optional[float],
        intensity: PhysicalIntensity,
        duration_minutes: int,
        is_work: bool,
        is_sun_exposed: bool,
        is_cooled_shade_rest: bool
    ) -> HeuristicOptimizationMetric:
        """
        ENGINEERING OPTIMIZATION OBJECTIVE FUNCTION.
        Computes a non-clinical heuristic cost value for CP-SAT solver objective minimization.
        """
        effective_wbgt = wbgt_c if wbgt_c is not None else 28.0
        wbgt_excess = max(effective_wbgt - 24.0, 0.0)
        env_factor = 1.0 + (wbgt_excess * 0.25)
        if is_sun_exposed:
            env_factor *= 1.15

        workload_w = cls.HEURISTIC_WORKLOAD_WEIGHTS.get(intensity, 1.6)

        if is_work:
            # Heuristic penalty cost for work under heat (to minimize hot-work duration)
            cost_score = env_factor * workload_w * (duration_minutes / 15.0)
        else:
            # Heuristic benefit for scheduled recovery rest
            rec_w = cls.HEURISTIC_RECOVERY_WEIGHTS["COOLED_SHELTER"] if is_cooled_shade_rest else cls.HEURISTIC_RECOVERY_WEIGHTS["AMBIENT_SHADE"]
            cost_score = -1.0 * rec_w * (duration_minutes / 15.0)

        return HeuristicOptimizationMetric(
            environmental_factor=round(env_factor, 3),
            workload_weight=round(workload_w, 2),
            prototype_cost_score=round(cost_score, 3)
        )

    @classmethod
    def calculate_assignment_exposure(
        cls,
        req: ExposureCalculationRequest,
        policy: Optional[SafetyPolicy] = None
    ) -> ExposureCalculationResult:
        if req.duration_minutes <= 0:
            raise ValueError(f"Duration must be greater than 0 minutes, got {req.duration_minutes}")

        metrics = HeatMethodologyEngine.calculate_all_metrics(req.environmental_reading)
        risk_cat = cls.get_risk_category(metrics.estimated_wbgt_c, policy)

        # 1. Authoritative Safety Constraint Evaluation (Hard Boundaries)
        safety_eval = cls.evaluate_safety_constraints(
            risk_category=risk_cat,
            intensity=req.task_intensity,
            is_acclimatized=req.is_acclimatized,
            duration_minutes=req.duration_minutes,
            is_work=req.is_work_assignment,
            vulnerability=req.vulnerability_rating,
            custom_max_work=req.custom_max_work_minutes,
            policy=policy
        )

        # 2. Engineering Optimization Heuristic Metric (Solver Objective)
        heuristic = cls.calculate_heuristic_optimization_metric(
            wbgt_c=metrics.estimated_wbgt_c,
            intensity=req.task_intensity,
            duration_minutes=req.duration_minutes,
            is_work=req.is_work_assignment,
            is_sun_exposed=(req.is_sun_exposed and req.environmental_reading.direct_sun_exposure),
            is_cooled_shade_rest=req.is_cooled_shade_rest
        )

        return ExposureCalculationResult(
            worker_id=req.worker_id,
            duration_minutes=req.duration_minutes,
            is_work=req.is_work_assignment,
            heat_metrics=metrics,
            risk_category=risk_cat,
            work_rest_guideline=safety_eval.work_rest_rule,
            safety_compliance=safety_eval,
            cumulative_exposure_cap_exceeded=not safety_eval.is_compliant,
            recommended_water_ml=safety_eval.mandatory_hydration_ml,
            optimization_metric=heuristic,
            net_exposure_increment=heuristic.prototype_cost_score
        )
