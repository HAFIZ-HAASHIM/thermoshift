"""
ThermoShift - Python Data Models (Pydantic v2)
Mirrors shared TypeScript interfaces with runtime validation.
All safety thresholds, work-rest cycles, and exposure models are configurable via SafetyPolicy.
"""

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class SkillType(str, Enum):
    CARPENTRY = "CARPENTRY"
    ELECTRICAL = "ELECTRICAL"
    MASONRY = "MASONRY"
    HEAVY_MACHINERY = "HEAVY_MACHINERY"
    GENERAL_LABOR = "GENERAL_LABOR"
    WELDING = "WELDING"
    ROOFING = "ROOFING"
    PLUMBING = "PLUMBING"
    SAFETY_INSPECTION = "SAFETY_INSPECTION"


class HeatVulnerabilityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class PhysicalIntensity(str, Enum):
    LIGHT = "LIGHT"
    MEDIUM = "MEDIUM"
    HEAVY = "HEAVY"
    EXTREME = "EXTREME"


class HeatRiskCategory(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    VERY_HIGH = "VERY_HIGH"
    EXTREME = "EXTREME"


class AssignmentType(str, Enum):
    WORK = "WORK"
    REST_SHADE = "REST_SHADE"
    HYDRATION_BREAK = "HYDRATION_BREAK"
    STANDBY = "STANDBY"


class SafetyStandardType(str, Enum):
    OSHA = "OSHA"
    NIOSH = "NIOSH"
    ACGIH = "ACGIH"
    CUSTOM = "CUSTOM"


class AcclimatizationPolicy(BaseModel):
    """
    Authoritative Occupational Acclimatization Policy.
    Reference: NIOSH (2016) 'Criteria for a Recommended Standard: Occupational Exposure to Heat and Hot Environments' (Pub No. 2016-106).
    """
    reference_source: str = "NIOSH (2016) Criteria for a Recommended Standard"
    acclimatization_days_threshold: int = 14
    unacclimatized_max_continuous_work_minutes: int = 30
    unacclimatized_rest_multiplier: float = 1.5  # Policy-mandated rest time expansion for non-acclimatized workers
    initial_day_max_exposure_pct: int = 20  # NIOSH Rule: Day 1 should not exceed 20% normal duration


class WbgtBandThreshold(BaseModel):
    category: HeatRiskCategory
    wbgt_min_celsius: float
    wbgt_max_celsius: float
    description: str


class WorkRestRule(BaseModel):
    """
    Occupational Safety Policy Work/Rest Guideline (OSHA/NIOSH/ACGIH).
    Defines hard limits for work duration and mandatory recovery rest.
    """
    risk_category: HeatRiskCategory
    intensity: PhysicalIntensity
    acclimatized: bool
    work_minutes: int
    rest_minutes: int
    mandatory_hydration_ml_per_hour: int = 1000


class VulnerabilityAdjustment(BaseModel):
    """
    Operational administrative risk classification for site supervisors.
    NOTE: This is NOT a clinical factor or medical diagnosis. It specifies operational
    precautionary policies such as reduced continuous work limits.
    """
    vulnerability_level: HeatVulnerabilityLevel
    operational_rest_multiplier: float = 1.0
    max_continuous_work_cap_minutes: Optional[int] = None
    description: str = "Administrative precaution level"


class SafetyPolicy(BaseModel):
    """
    Authoritative Occupational Safety Policy specification.
    Defines hard safety constraints that must be satisfied before optimization objectives.
    """
    policy_id: str
    name: str
    standard: SafetyStandardType = SafetyStandardType.OSHA
    version: str = "1.0"
    wbgt_bands: List[WbgtBandThreshold] = Field(default_factory=list)
    work_rest_rules: List[WorkRestRule] = Field(default_factory=list)
    vulnerability_adjustments: List[VulnerabilityAdjustment] = Field(default_factory=list)
    acclimatization_policy: AcclimatizationPolicy = Field(default_factory=AcclimatizationPolicy)
    solar_radiation_adjustment_c: float = 2.5
    allow_overtime_in_extreme_heat: bool = False


class WorkerHeatProfile(BaseModel):
    """
    Worker operational heat parameters for safety policy compliance.
    Non-medical: does not store clinical diagnoses or physiological measurements.
    """
    acclimatized: bool = True
    heat_vulnerability: HeatVulnerabilityLevel = HeatVulnerabilityLevel.LOW
    past_heat_incidents: int = 0
    hydration_status: Optional[str] = "OPTIMAL"
    custom_max_continuous_work_minutes: Optional[int] = None


class Worker(BaseModel):
    id: str
    name: str
    employee_code: str
    role: str
    skills: List[SkillType]
    heat_profile: WorkerHeatProfile = Field(default_factory=WorkerHeatProfile)
    is_active: bool = True


class Task(BaseModel):
    id: str
    title: str
    zone_id: str
    required_skills: List[SkillType]
    min_workers: int = 1
    max_workers: int = 4
    duration_minutes: int
    intensity: PhysicalIntensity = PhysicalIntensity.MEDIUM
    dependencies: List[str] = Field(default_factory=list)
    earliest_start_time: str = "07:00"
    deadline_time: str = "17:00"
    is_sun_exposed: bool = True


class WorkZone(BaseModel):
    id: str
    name: str
    has_shade_cover: bool = False
    solar_exposure_factor: float = 1.0
    water_station_nearby: bool = True
    max_worker_capacity: int = 20


class SiteResources(BaseModel):
    max_shade_area_workers: int = 10
    water_stations_count: int = 4
    misting_fans_active: int = 2
    cooling_station_capacity: int = 5


class EnvironmentalPoint(BaseModel):
    time_str: str  # e.g. "07:00", "08:00"
    minute_offset: int  # minutes from shift start
    temperature_c: float
    relative_humidity: float
    solar_radiation_wm2: float = 600.0
    wind_speed_kmh: float = 10.0
    wbgt_celsius: float
    risk_category: HeatRiskCategory


class ScheduleAssignment(BaseModel):
    id: str
    worker_id: str
    worker_name: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    zone_id: str
    zone_name: str
    type: AssignmentType
    start_time: str
    end_time: str
    start_minute: int
    end_minute: int
    duration_minutes: int
    intensity: PhysicalIntensity
    predicted_wbgt: float
    heat_risk: HeatRiskCategory
    hydration_alert: bool = False


class OptimizationMetrics(BaseModel):
    total_workers_assigned: int
    total_tasks_completed: int
    unassigned_tasks_count: int
    total_rest_minutes: int
    total_shade_utilization_peak: int
    max_continuous_exposure_minutes: int
    deadline_met: bool
    solver_status: str
    solver_solve_time_ms: float
    reasons_infeasible: List[str] = Field(default_factory=list)


class SchedulePlan(BaseModel):
    schedule_id: str
    site_id: str
    generated_at: str
    shift_date: str
    time_slot_interval_minutes: int = 15
    assignments: List[ScheduleAssignment]
    metrics: OptimizationMetrics
    warnings: List[str] = Field(default_factory=list)


class OptimizationPayload(BaseModel):
    site_id: str
    shift_date: str
    shift_start: str = "07:00"
    shift_end: str = "17:00"
    slot_size_minutes: int = 15
    workers: List[Worker]
    tasks: List[Task]
    zones: List[WorkZone]
    resources: SiteResources
    weather_forecast: List[EnvironmentalPoint]
    safety_policy: Optional[SafetyPolicy] = None
