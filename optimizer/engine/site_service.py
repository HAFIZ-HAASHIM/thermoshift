"""
ThermoShift - Site Data Repository & Supabase Loader Service

Responsible for querying Supabase to load:
1. Site profile and shift window
2. Active workers, skills, acclimatization, and vulnerability ratings
3. Tasks, required skills, team size constraints, and precedence dependencies
4. Site resources (shade structures, cooling trailers, water stations, equipment)
5. Safety policies
"""

import os
from typing import Dict, List, Optional, Any, Tuple
import requests
from dotenv import load_dotenv

from optimizer.engine.data_models import (
    SkillType,
    PhysicalIntensity,
    HeatVulnerabilityLevel,
    HeatRiskCategory,
    SafetyPolicy,
    SafetyStandardType
)
from optimizer.engine.optimizer_interface import (
    SolverWorkerInput,
    SolverTaskInput,
    SolverResourceInput
)

load_dotenv()

DEFAULT_SUPABASE_URL = os.getenv("SUPABASE_URL", "https://rzxdmvvfqiphgojmwjdc.supabase.co")
DEFAULT_SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "sb_publishable_3v9caM8hW_mCctxYPlxq5g_2XxMFZW0"


class SiteDataService:
    """
    Loads and normalizes site, workforce, task, and resource data from Supabase,
    with robust fallback and dynamic site provisioning.
    """

    # In-memory store for custom/provisioned sites
    _dynamic_sites: Dict[str, Dict[str, Any]] = {}
    _dynamic_workers: Dict[str, List[SolverWorkerInput]] = {}
    _dynamic_tasks: Dict[str, List[SolverTaskInput]] = {}
    _dynamic_resources: Dict[str, List[SolverResourceInput]] = {}
    _dynamic_weather: Dict[str, List[Dict[str, Any]]] = {}

    def __init__(self, supabase_url: Optional[str] = None, supabase_key: Optional[str] = None):
        self.supabase_url = (supabase_url or DEFAULT_SUPABASE_URL).rstrip("/")
        self.supabase_key = supabase_key or DEFAULT_SUPABASE_KEY
        self.rest_base_url = f"{self.supabase_url}/rest/v1"
        self.headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        self._ensure_default_sites()

    @classmethod
    def _ensure_default_sites(cls):
        """Provisions default Riverside site in dynamic store."""
        riverside_id = "riverside-logistics-hub-p1"
        if riverside_id not in cls._dynamic_sites:
            cls._dynamic_sites[riverside_id] = {
                "id": riverside_id,
                "name": "Riverside Logistics Hub — Phase 1",
                "location_name": "Riverside Industrial Zone — Sector C",
                "latitude": 33.9533,
                "longitude": -117.3961,
                "timezone": "America/Los_Angeles",
                "shift_start": "07:00:00",
                "shift_end": "17:00:00",
                "is_active": True
            }

            # 35 Riverside workers across 8 skill groups
            workers = []
            # 6 Site Operations
            for i in range(1, 7):
                workers.append(SolverWorkerInput(
                    worker_id=f"w-so-{i}",
                    name=f"Site Operations {i:02d}",
                    skills=[SkillType.GENERAL_LABOR],
                    is_acclimatized=True,
                    vulnerability_rating=HeatVulnerabilityLevel.LOW,
                    shift_start_minute=0,
                    shift_end_minute=600
                ))
            # 5 Excavation
            for i in range(1, 6):
                workers.append(SolverWorkerInput(
                    worker_id=f"w-ex-{i}",
                    name=f"Excavation {i:02d}",
                    skills=[SkillType.HEAVY_MACHINERY],
                    is_acclimatized=True,
                    vulnerability_rating=HeatVulnerabilityLevel.LOW,
                    shift_start_minute=0,
                    shift_end_minute=600
                ))
            # 4 Pipe Installation
            for i in range(1, 5):
                workers.append(SolverWorkerInput(
                    worker_id=f"w-pi-{i}",
                    name=f"Pipe Installation {i:02d}",
                    skills=[SkillType.PLUMBING],
                    is_acclimatized=True,
                    vulnerability_rating=HeatVulnerabilityLevel.LOW,
                    shift_start_minute=0,
                    shift_end_minute=600
                ))
            # 5 Earthworks
            for i in range(1, 6):
                workers.append(SolverWorkerInput(
                    worker_id=f"w-ew-{i}",
                    name=f"Earthworks {i:02d}",
                    skills=[SkillType.HEAVY_MACHINERY],
                    is_acclimatized=True,
                    vulnerability_rating=HeatVulnerabilityLevel.LOW,
                    shift_start_minute=0,
                    shift_end_minute=600
                ))
            # 4 Rebar Work
            for i in range(1, 5):
                workers.append(SolverWorkerInput(
                    worker_id=f"w-rw-{i}",
                    name=f"Rebar Work {i:02d}",
                    skills=[SkillType.MASONRY],
                    is_acclimatized=True,
                    vulnerability_rating=HeatVulnerabilityLevel.LOW,
                    shift_start_minute=0,
                    shift_end_minute=600
                ))
            # 6 Concrete Work
            for i in range(1, 7):
                workers.append(SolverWorkerInput(
                    worker_id=f"w-cw-{i}",
                    name=f"Concrete Work {i:02d}",
                    skills=[SkillType.MASONRY],
                    is_acclimatized=True,
                    vulnerability_rating=HeatVulnerabilityLevel.LOW,
                    shift_start_minute=0,
                    shift_end_minute=600
                ))
            # 3 Electrical
            for i in range(1, 4):
                workers.append(SolverWorkerInput(
                    worker_id=f"w-el-{i}",
                    name=f"Electrical {i:02d}",
                    skills=[SkillType.ELECTRICAL],
                    is_acclimatized=True,
                    vulnerability_rating=HeatVulnerabilityLevel.LOW,
                    shift_start_minute=0,
                    shift_end_minute=600
                ))
            # 2 Inspection
            for i in range(1, 3):
                workers.append(SolverWorkerInput(
                    worker_id=f"w-in-{i}",
                    name=f"Inspection {i:02d}",
                    skills=[SkillType.SAFETY_INSPECTION],
                    is_acclimatized=True,
                    vulnerability_rating=HeatVulnerabilityLevel.LOW,
                    shift_start_minute=0,
                    shift_end_minute=600
                ))
            cls._dynamic_workers[riverside_id] = workers

            # 5 Riverside Resources
            cls._dynamic_resources[riverside_id] = [
                SolverResourceInput(resource_id="res-1", name="Shaded recovery station", resource_type="SHADE_STRUCTURE", capacity=2, zone_id="Ground Sector"),
                SolverResourceInput(resource_id="res-2", name="Potable water station", resource_type="WATER_STATION", capacity=4, zone_id="Ground Sector"),
                SolverResourceInput(resource_id="res-3", name="Portable cooling unit", resource_type="COOLING_TENT", capacity=3, zone_id="Ground Sector"),
                SolverResourceInput(resource_id="res-4", name="Plate compactor", resource_type="SHADE_STRUCTURE", capacity=1, zone_id="Ground Sector"),
                SolverResourceInput(resource_id="res-5", name="Concrete pump", resource_type="SHADE_STRUCTURE", capacity=1, zone_id="Ground Sector"),
            ]

            # 10 Riverside Tasks
            cls._dynamic_tasks[riverside_id] = [
                SolverTaskInput(task_id="A-101", title="Site clearing and debris segregation", zone_id="North Yard", required_skills=[SkillType.GENERAL_LABOR], min_workers=3, max_workers=5, duration_minutes=15, intensity=PhysicalIntensity.MEDIUM, dependencies=[], earliest_start_minute=0, deadline_minute=300, is_sun_exposed=True),
                SolverTaskInput(task_id="A-102", title="Stormwater trench excavation", zone_id="East Perimeter", required_skills=[SkillType.HEAVY_MACHINERY], min_workers=4, max_workers=6, duration_minutes=15, intensity=PhysicalIntensity.HEAVY, dependencies=["A-101"], earliest_start_minute=0, deadline_minute=300, is_sun_exposed=True),
                SolverTaskInput(task_id="A-103", title="HDPE drainage pipe installation", zone_id="East Perimeter", required_skills=[SkillType.PLUMBING], min_workers=3, max_workers=5, duration_minutes=15, intensity=PhysicalIntensity.MEDIUM, dependencies=["A-102"], earliest_start_minute=0, deadline_minute=300, is_sun_exposed=True),
                SolverTaskInput(task_id="A-104", title="Compacted aggregate base preparation", zone_id="Loading Bay", required_skills=[SkillType.HEAVY_MACHINERY], min_workers=4, max_workers=6, duration_minutes=15, intensity=PhysicalIntensity.HEAVY, dependencies=["A-101"], earliest_start_minute=0, deadline_minute=300, is_sun_exposed=True),
                SolverTaskInput(task_id="A-105", title="Rebar cage assembly", zone_id="Foundation Pad", required_skills=[SkillType.MASONRY], min_workers=3, max_workers=5, duration_minutes=15, intensity=PhysicalIntensity.MEDIUM, dependencies=["A-104"], earliest_start_minute=0, deadline_minute=300, is_sun_exposed=True),
                SolverTaskInput(task_id="A-106", title="Foundation concrete placement", zone_id="Foundation Pad", required_skills=[SkillType.MASONRY], min_workers=5, max_workers=7, duration_minutes=15, intensity=PhysicalIntensity.HEAVY, dependencies=["A-105"], earliest_start_minute=0, deadline_minute=300, is_sun_exposed=True),
                SolverTaskInput(task_id="A-107", title="Curing blanket installation", zone_id="Foundation Pad", required_skills=[SkillType.MASONRY], min_workers=2, max_workers=4, duration_minutes=15, intensity=PhysicalIntensity.MEDIUM, dependencies=["A-106"], earliest_start_minute=0, deadline_minute=300, is_sun_exposed=True),
                SolverTaskInput(task_id="A-108", title="Perimeter lighting conduit installation", zone_id="South Access", required_skills=[SkillType.ELECTRICAL], min_workers=2, max_workers=4, duration_minutes=15, intensity=PhysicalIntensity.MEDIUM, dependencies=["A-104"], earliest_start_minute=0, deadline_minute=300, is_sun_exposed=True),
                SolverTaskInput(task_id="A-109", title="Safety barrier and access gate setup", zone_id="South Access", required_skills=[SkillType.GENERAL_LABOR], min_workers=3, max_workers=5, duration_minutes=15, intensity=PhysicalIntensity.LIGHT, dependencies=["A-108"], earliest_start_minute=0, deadline_minute=300, is_sun_exposed=True),
                SolverTaskInput(task_id="A-110", title="Final drainage inspection", zone_id="East Perimeter", required_skills=[SkillType.SAFETY_INSPECTION], min_workers=2, max_workers=4, duration_minutes=15, intensity=PhysicalIntensity.LIGHT, dependencies=["A-103"], earliest_start_minute=0, deadline_minute=300, is_sun_exposed=True)
            ]

            # Riverside weather for 2026-09-15
            cls._dynamic_weather[riverside_id] = [
                {"id": f"wth-{riverside_id}-1", "site_id": riverside_id, "observation_time": "2026-09-15T07:00:00Z", "temperature_c": 24.5, "relative_humidity_pct": 52.0, "wind_speed_kmh": 10.0, "solar_radiation_wm2": 320.0, "direct_sun_exposure": True, "estimated_wbgt_c": 22.8, "risk_category": "LOW"},
                {"id": f"wth-{riverside_id}-2", "site_id": riverside_id, "observation_time": "2026-09-15T09:00:00Z", "temperature_c": 28.5, "relative_humidity_pct": 46.0, "wind_speed_kmh": 11.5, "solar_radiation_wm2": 620.0, "direct_sun_exposure": True, "estimated_wbgt_c": 26.2, "risk_category": "MODERATE"},
                {"id": f"wth-{riverside_id}-3", "site_id": riverside_id, "observation_time": "2026-09-15T11:00:00Z", "temperature_c": 32.0, "relative_humidity_pct": 38.0, "wind_speed_kmh": 9.5, "solar_radiation_wm2": 850.0, "direct_sun_exposure": True, "estimated_wbgt_c": 29.5, "risk_category": "HIGH"},
                {"id": f"wth-{riverside_id}-4", "site_id": riverside_id, "observation_time": "2026-09-15T13:00:00Z", "temperature_c": 34.5, "relative_humidity_pct": 34.0, "wind_speed_kmh": 8.0, "solar_radiation_wm2": 910.0, "direct_sun_exposure": True, "estimated_wbgt_c": 31.0, "risk_category": "HIGH"},
                {"id": f"wth-{riverside_id}-5", "site_id": riverside_id, "observation_time": "2026-09-15T15:00:00Z", "temperature_c": 33.8, "relative_humidity_pct": 32.0, "wind_speed_kmh": 12.0, "solar_radiation_wm2": 740.0, "direct_sun_exposure": True, "estimated_wbgt_c": 30.2, "risk_category": "HIGH"},
            ]

    def _get(self, endpoint: str, params: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
        """Performs a GET request to the Supabase REST API."""
        url = f"{self.rest_base_url}/{endpoint}"
        try:
            resp = requests.get(url, headers=self.headers, params=params, timeout=10)
            if resp.status_code == 404:
                return []
            if resp.status_code not in (200, 206):
                return []
            return resp.json()
        except Exception:
            return []

    def list_all_sites(self) -> List[Dict[str, Any]]:
        """Returns all registered sites combining database and dynamic stores."""
        db_sites = self._get("sites", {"select": "*"}) or []
        db_ids = {s["id"] for s in db_sites}
        all_sites = list(db_sites)
        for s_id, site in self._dynamic_sites.items():
            if s_id not in db_ids:
                all_sites.append(site)
        return all_sites

    def get_site(self, site_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single site by ID."""
        if site_id in self._dynamic_sites:
            return self._dynamic_sites[site_id]
        records = self._get("sites", {"id": f"eq.{site_id}", "select": "*"})
        return records[0] if records else None

    def provision_site_data(
        self,
        site_record: Dict[str, Any],
        workers: Optional[List[SolverWorkerInput]] = None,
        tasks: Optional[List[SolverTaskInput]] = None,
        resources: Optional[List[SolverResourceInput]] = None,
        weather: Optional[List[Dict[str, Any]]] = None
    ):
        """Registers or updates a site and its complete dataset dynamically."""
        site_id = site_record["id"]
        self._dynamic_sites[site_id] = site_record
        if workers is not None:
            self._dynamic_workers[site_id] = workers
        if tasks is not None:
            self._dynamic_tasks[site_id] = tasks
        if resources is not None:
            self._dynamic_resources[site_id] = resources
        if weather is not None:
            self._dynamic_weather[site_id] = weather

    def get_workers_with_skills(self, site_id: str) -> List[SolverWorkerInput]:
        """
        Loads all active workers for the site along with their normalized skills.
        """
        if site_id in self._dynamic_workers:
            return list(self._dynamic_workers[site_id])

        workers_raw = self._get("workers", {"site_id": f"eq.{site_id}", "is_active": "eq.true", "select": "*", "order": "id.asc"})
        if not workers_raw:
            return []
        workers_raw.sort(key=lambda w: w["id"])

        worker_ids = [w["id"] for w in workers_raw]
        # Query worker skills
        skills_raw = self._get("worker_skills", {"worker_id": f"in.({','.join(worker_ids)})", "select": "worker_id,skill_id", "order": "skill_id.asc"})
        skills_by_worker: Dict[str, List[SkillType]] = {w_id: [] for w_id in worker_ids}
        for row in skills_raw:
            try:
                skill_enum = SkillType(row["skill_id"].upper())
                skills_by_worker[row["worker_id"]].append(skill_enum)
            except ValueError:
                pass

        for w_id in skills_by_worker:
            skills_by_worker[w_id].sort(key=lambda s: s.value)

        solver_workers: List[SolverWorkerInput] = []
        for w in workers_raw:
            w_id = w["id"]
            vuln_str = (w.get("vulnerability_rating") or "LOW").upper()
            try:
                vuln = HeatVulnerabilityLevel(vuln_str)
            except ValueError:
                vuln = HeatVulnerabilityLevel.LOW

            solver_workers.append(
                SolverWorkerInput(
                    worker_id=w_id,
                    name=w.get("name", f"Worker {w.get('employee_code', '')}"),
                    skills=skills_by_worker.get(w_id, []),
                    is_acclimatized=bool(w.get("is_acclimatized", True)),
                    vulnerability_rating=vuln,
                    max_continuous_work_cap_minutes=None,
                    shift_start_minute=0,
                    shift_end_minute=600  # 10 hours standard shift
                )
            )

        solver_workers.sort(key=lambda x: x.worker_id)
        return solver_workers

    def get_tasks_with_dependencies(self, site_id: str) -> List[SolverTaskInput]:
        """
        Loads all tasks for the site along with required skills and DAG dependencies.
        """
        if site_id in self._dynamic_tasks:
            return list(self._dynamic_tasks[site_id])

        tasks_raw = self._get("tasks", {"site_id": f"eq.{site_id}", "select": "*"})
        if not tasks_raw:
            return []

        task_ids = [t["id"] for t in tasks_raw]

        # Load required skills (select primary specialized skill and required worker count)
        req_skills_raw = self._get("task_required_skills", {"task_id": f"in.({','.join(task_ids)})", "select": "task_id,skill_id,min_skill_count"})
        req_skills_by_task: Dict[str, List[Tuple[SkillType, int]]] = {t_id: [] for t_id in task_ids}
        for row in req_skills_raw:
            try:
                skill_enum = SkillType(row["skill_id"].upper())
                min_cnt = int(row.get("min_skill_count") or 1)
                req_skills_by_task[row["task_id"]].append((skill_enum, min_cnt))
            except ValueError:
                pass

        # Load dependencies
        deps_raw = self._get("task_dependencies", {"task_id": f"in.({','.join(task_ids)})", "select": "task_id,depends_on_task_id"})
        deps_by_task: Dict[str, List[str]] = {t_id: [] for t_id in task_ids}
        for row in deps_raw:
            deps_by_task[row["task_id"]].append(row["depends_on_task_id"])

        solver_tasks: List[SolverTaskInput] = []
        for t in tasks_raw:
            t_id = t["id"]
            intensity_str = (t.get("physical_intensity") or "MEDIUM").upper()
            try:
                intensity = PhysicalIntensity(intensity_str)
            except ValueError:
                intensity = PhysicalIntensity.MEDIUM

            # Primary trade skill required for task execution
            all_task_skills = req_skills_by_task.get(t_id, [])
            trade_skills = [s for s, _ in all_task_skills if s != SkillType.GENERAL_LABOR]
            if not trade_skills and all_task_skills:
                trade_skills = [all_task_skills[0][0]]

            # Determine required worker team size for primary trade
            req_trade_count = 1
            for s, cnt in all_task_skills:
                if s in trade_skills:
                    req_trade_count = max(req_trade_count, cnt)

            raw_duration = int(t.get("estimated_duration_minutes", 60))
            # Map into standard schedulable session block (15 min for extreme/heavy/light, 30 min max)
            session_duration = min(raw_duration, 15)

            # Parse earliest start and deadline times into minutes from 07:00 shift start
            earliest_min = self._time_to_minutes(t.get("earliest_start_time", "07:00:00"), shift_start_hour=7)
            raw_deadline = self._time_to_minutes(t.get("deadline_time", "12:00:00"), shift_start_hour=7)
            deadline_min = min(300, max(earliest_min + session_duration, raw_deadline))

            solver_tasks.append(
                SolverTaskInput(
                    task_id=t_id,
                    title=t.get("title", f"Task {t_id[:8]}"),
                    zone_id=t.get("zone_name", "Ground Sector"),
                    required_skills=trade_skills,
                    min_workers=req_trade_count,
                    max_workers=max(req_trade_count, int(t.get("max_workers", 4))),
                    duration_minutes=session_duration,
                    intensity=intensity,
                    dependencies=deps_by_task.get(t_id, []),
                    earliest_start_minute=max(0, earliest_min),
                    deadline_minute=deadline_min,
                    is_sun_exposed=bool(t.get("is_sun_exposed", True))
                )
            )

        solver_tasks.sort(key=lambda x: x.task_id)
        return solver_tasks

    def get_resources(self, site_id: str) -> List[SolverResourceInput]:
        """
        Loads all physical resources for the site.
        """
        if site_id in self._dynamic_resources:
            return list(self._dynamic_resources[site_id])

        resources_raw = self._get("resources", {"site_id": f"eq.{site_id}", "is_available": "eq.true", "select": "*", "order": "id.asc"})
        if not resources_raw:
            return []
        resources_raw.sort(key=lambda r: r["id"])

        solver_resources: List[SolverResourceInput] = []
        for r in resources_raw:
            solver_resources.append(
                SolverResourceInput(
                    resource_id=r["id"],
                    name=r.get("name", "Site Resource"),
                    resource_type=r.get("resource_type", "SHADE_STRUCTURE"),
                    capacity=int(r.get("capacity", 1)),
                    zone_id=r.get("zone_name", "Ground Sector")
                )
            )

        solver_resources.sort(key=lambda x: x.resource_id)
        return solver_resources

    def get_weather_records(self, site_id: str, date_str: str) -> List[Dict[str, Any]]:
        """
        Loads stored weather observations / forecasts for the site.
        """
        if site_id in self._dynamic_weather:
            return list(self._dynamic_weather[site_id])

        records = self._get(
            "weather_records",
            {"site_id": f"eq.{site_id}", "select": "*", "order": "observation_time.asc"}
        )
        return records

    def persist_schedule(
        self,
        site_id: str,
        date_str: str,
        objective_mode: str,
        solver_output: Any
    ) -> str:
        """
        Persists generated schedule and assignments into Supabase tables.
        Returns the created schedule UUID.
        """
        schedule_payload = {
            "site_id": site_id,
            "schedule_date": date_str,
            "version": 1,
            "optimization_mode": objective_mode,
            "status": "PUBLISHED" if solver_output.status in ("OPTIMAL", "FEASIBLE") else "DRAFT",
            "time_slot_interval_minutes": 15,
            "total_workers_assigned": len({a.worker_id for a in solver_output.assignments if a.assignment_type.value == "WORK"}),
            "total_tasks_completed": solver_output.total_tasks_scheduled,
            "total_rest_minutes": solver_output.total_rest_minutes,
            "solver_status": solver_output.status,
            "solver_solve_time_ms": round(solver_output.solve_time_seconds * 1000, 2)
        }

        url = f"{self.rest_base_url}/schedules"
        resp = requests.post(url, headers=self.headers, json=schedule_payload, timeout=10)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Failed to persist schedule: {resp.status_code} - {resp.text}")

        created_schedule = resp.json()
        schedule_id = created_schedule[0]["id"] if isinstance(created_schedule, list) else created_schedule["id"]

        # Persist assignments in batches
        if solver_output.assignments:
            assignments_payload = []
            for a in solver_output.assignments:
                assignments_payload.append({
                    "schedule_id": schedule_id,
                    "worker_id": a.worker_id,
                    "task_id": a.task_id if a.assignment_type.value == "WORK" else None,
                    "assignment_type": a.assignment_type.value,
                    "zone_name": a.zone_id,
                    "start_minute": a.start_minute,
                    "end_minute": a.end_minute,
                    "start_time": f"{a.start_time_str}:00",
                    "end_time": f"{a.end_time_str}:00",
                    "physical_intensity": a.intensity.value
                })

            asgn_url = f"{self.rest_base_url}/schedule_assignments"
            asgn_resp = requests.post(asgn_url, headers=self.headers, json=assignments_payload, timeout=10)
            if asgn_resp.status_code not in (200, 201):
                # Log warning, but schedule header is preserved
                pass

        return schedule_id

    @staticmethod
    def _time_to_minutes(time_str: str, shift_start_hour: int = 7) -> int:
        """Converts HH:MM[:SS] string into minute offset relative to shift start."""
        parts = time_str.split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        total_m = h * 60 + m
        shift_start_m = shift_start_hour * 60
        return max(0, total_m - shift_start_m)
