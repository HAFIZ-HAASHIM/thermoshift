"""
ThermoShift - Optimizer Interface Data Contract
Defines the clean boundary and mathematical inputs/outputs for the future
Google OR-Tools CP-SAT scheduling engine (Phase 5).
"""

from typing import List, Dict, Optional, Any
from enum import Enum
from pydantic import BaseModel, Field

from optimizer.engine.data_models import (
    SkillType,
    PhysicalIntensity,
    HeatVulnerabilityLevel,
    HeatRiskCategory,
    AssignmentType,
    SafetyPolicy
)
from optimizer.engine.exposure_model import ExposureCalculationResult


class SolverObjectiveMode(str, Enum):
    SAFEST = "SAFEST"        # Minimizes cumulative thermal strain & maximizes rest recovery
    BALANCED = "BALANCED"    # Balances on-time task completion with strict safety margins
    FASTEST = "FASTEST"      # Prioritizes early task completion while respecting mandatory safety caps


class SolverWorkerInput(BaseModel):
    worker_id: str
    name: str
    skills: List[SkillType]
    is_acclimatized: bool = True
    vulnerability_rating: HeatVulnerabilityLevel = HeatVulnerabilityLevel.LOW
    max_continuous_work_cap_minutes: Optional[int] = None
    shift_start_minute: int = 0
    shift_end_minute: int = 600  # 10 hours = 600 minutes


class SolverTaskInput(BaseModel):
    task_id: str
    title: str
    zone_id: str
    required_skills: List[SkillType]
    min_workers: int = 1
    max_workers: int = 4
    duration_minutes: int
    intensity: PhysicalIntensity
    dependencies: List[str] = Field(default_factory=list)
    earliest_start_minute: int = 0
    deadline_minute: int = 600
    is_sun_exposed: bool = True


class SolverResourceInput(BaseModel):
    resource_id: str
    name: str
    resource_type: str
    capacity: int
    zone_id: str


class SolverTimeSlotWeather(BaseModel):
    slot_index: int
    start_minute: int
    end_minute: int
    temperature_c: float
    relative_humidity: float
    solar_radiation_wm2: float
    wind_speed_kmh: float
    estimated_wbgt_c: float
    risk_category: HeatRiskCategory


class SolverProblemInstance(BaseModel):
    """
    Complete mathematical problem formulation payload passed to OR-Tools CP-SAT.
    """
    site_id: str
    shift_date: str
    slot_interval_minutes: int = 15
    total_slots: int = 40  # e.g. 10 hours @ 15 min slots = 40 slots
    objective_mode: SolverObjectiveMode = SolverObjectiveMode.FASTEST
    workers: List[SolverWorkerInput]
    tasks: List[SolverTaskInput]
    resources: List[SolverResourceInput]
    weather_slots: List[SolverTimeSlotWeather]
    safety_policy: SafetyPolicy


class SolverAssignmentOutput(BaseModel):
    slot_index: int
    start_minute: int
    end_minute: int
    start_time_str: str
    end_time_str: str
    worker_id: str
    worker_name: str
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    assignment_type: AssignmentType
    zone_id: str
    intensity: PhysicalIntensity
    predicted_wbgt: float
    heat_risk: HeatRiskCategory
    slot_exposure_units: float
    resource_id: Optional[str] = None


class SolverScheduleOutput(BaseModel):
    """
    Standardized solver response structure.
    """
    status: str  # OPTIMAL, FEASIBLE, INFEASIBLE, ERROR
    solve_time_seconds: float
    objective_value: Optional[float] = None
    total_tasks_scheduled: int
    total_work_minutes: int
    total_rest_minutes: int
    peak_shade_utilization: int
    peak_water_utilization: int
    assignments: List[SolverAssignmentOutput]
    unassigned_task_ids: List[str] = Field(default_factory=list)
    solver_messages: List[str] = Field(default_factory=list)
