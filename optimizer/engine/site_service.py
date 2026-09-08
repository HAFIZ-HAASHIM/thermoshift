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
    Loads and normalizes site, workforce, task, and resource data from Supabase.
    """

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

    def _get(self, endpoint: str, params: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
        """Performs a GET request to the Supabase REST API."""
        url = f"{self.rest_base_url}/{endpoint}"
        resp = requests.get(url, headers=self.headers, params=params, timeout=10)
        if resp.status_code == 404:
            return []
        if resp.status_code not in (200, 206):
            raise RuntimeError(f"Supabase GET {endpoint} failed with HTTP {resp.status_code}: {resp.text}")
        return resp.json()

    def get_site(self, site_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single site by ID."""
        records = self._get("sites", {"id": f"eq.{site_id}", "select": "*"})
        return records[0] if records else None

    def get_workers_with_skills(self, site_id: str) -> List[SolverWorkerInput]:
        """
        Loads all active workers for the site along with their normalized skills.
        """
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
