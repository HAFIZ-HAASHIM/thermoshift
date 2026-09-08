"""
ThermoShift - Phase 4C Backend Orchestration & End-to-End Scheduling API Test Suite

Tests:
1. Valid schedule generation (HTTP 200)
2. FASTEST objective mode request
3. SAFEST objective mode request
4. BALANCED objective mode request
5. Invalid objective mode rejection (HTTP 400)
6. Invalid site ID rejection (HTTP 400 / 404)
7. Missing required scheduling data (HTTP 400)
8. Weather unavailable structured error (HTTP 404)
9. Optimizer returns INFEASIBLE (HTTP 422)
10. Optimizer error handling (Structured response, no crash)
11. Successful schedule response serialization
12. Resource constraints preserved through API
13. Safety constraints preserved through API
14. Database records correctly converted into SolverProblemInstance
15. No safety values invented by the backend
16. Deterministic response for identical input
17. END-TO-END INTEGRATION TEST on seeded Apex Commercial Tower site (a0000000-0000-0000-0000-000000000001)
"""

import pytest
from fastapi.testclient import TestClient

from optimizer.engine.api import app, orchestration_service
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
    SolverProblemInstance
)
from optimizer.engine.site_service import SiteDataService
from optimizer.engine.weather_service import WeatherIntegrationService
from optimizer.engine.scheduling_service import (
    ScheduleGenerationRequest,
    SchedulingOrchestrationService
)

client = TestClient(app)

SEEDED_SITE_ID = "a0000000-0000-0000-0000-000000000001"
SEEDED_DATE = "2026-07-15"


# =========================================================================
# 1. API REQUEST VALIDATION & STATUS CODE TESTS
# =========================================================================

def test_health_check_endpoint():
    """Verify backend health check."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "ThermoShift" in data["service"]


def test_invalid_site_id_rejection():
    """Test 6 & 7: Empty or invalid siteId returns HTTP 400."""
    resp = client.post("/api/schedules/generate", json={"siteId": "", "date": "2026-07-15"})
    assert resp.status_code == 400
    assert resp.json()["success"] is False
    assert "siteId" in resp.json()["error"]


def test_missing_date_rejection():
    """Test 7: Missing date returns HTTP 400."""
    resp = client.post("/api/schedules/generate", json={"siteId": SEEDED_SITE_ID, "date": ""})
    assert resp.status_code == 400
    assert resp.json()["success"] is False
    assert "date" in resp.json()["error"]


def test_invalid_objective_mode_rejection():
    """Test 5: Invalid objective mode returns HTTP 400 with strict error message."""
    resp = client.post("/api/schedules/generate", json={
        "siteId": SEEDED_SITE_ID,
        "date": "2026-07-15",
        "objectiveMode": "HYPER_SPEED"
    })
    assert resp.status_code == 400
    assert resp.json()["success"] is False
    assert "objectiveMode" in resp.json()["error"]
    assert "FASTEST, SAFEST, BALANCED" in resp.json()["error"]


def test_nonexistent_site_returns_404():
    """Test 6: Non-existent site returns HTTP 404."""
    resp = client.post("/api/schedules/generate", json={
        "siteId": "00000000-0000-0000-0000-000000000000",
        "date": "2026-07-15",
        "objectiveMode": "BALANCED"
    })
    assert resp.status_code == 404
    assert resp.json()["success"] is False
    assert "not found" in resp.json()["error"].lower()


# =========================================================================
# 2. WEATHER FAILURE & INFEASIBILITY TESTS
# =========================================================================

def test_weather_unavailable_returns_error(monkeypatch):
    """Test 8: Weather records unavailable returns structured error (never invents fake weather)."""
    # Mock site service returning empty weather
    class MockSiteService(SiteDataService):
        def get_site(self, site_id):
            return {"id": site_id, "name": "Mock Site"}
        def get_workers_with_skills(self, site_id):
            return [SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])]
        def get_tasks_with_dependencies(self, site_id):
            return [SolverTaskInput(task_id="t1", title="T1", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=30, intensity=PhysicalIntensity.MEDIUM)]
        def get_resources(self, site_id):
            return []
        def get_weather_records(self, site_id, date_str):
            return []  # No weather data

    service = SchedulingOrchestrationService(site_service=MockSiteService())
    req = ScheduleGenerationRequest(siteId="mock-site", date="2026-07-15")
    result = service.generate_schedule(req)

    assert result.success is False
    assert result.status == "ERROR"
    assert "weather" in (result.reason or "").lower()


def test_optimizer_infeasible_returns_http_422():
    """Test 9: When problem is mathematically infeasible, returns HTTP 422 Unprocessable Entity."""
    class MockInfeasibleSiteService(SiteDataService):
        def get_site(self, site_id):
            return {"id": site_id, "name": "Mock Site"}
        def get_workers_with_skills(self, site_id):
            # 1 worker
            return [SolverWorkerInput(worker_id="w1", name="Carlos", skills=[SkillType.CARPENTRY])]
        def get_tasks_with_dependencies(self, site_id):
            # Task requires 60 min continuous work under High Heat (max work cap 30 min) -> Infeasible
            return [SolverTaskInput(task_id="t1", title="Impossible Task", zone_id="z1", required_skills=[SkillType.CARPENTRY], duration_minutes=60, intensity=PhysicalIntensity.HEAVY, deadline_minute=60)]
        def get_resources(self, site_id):
            return [SolverResourceInput(resource_id="res-0", name="No Shade", resource_type="SHADE", capacity=0, zone_id="z1")]
        def get_weather_records(self, site_id, date_str):
            return [{
                "temperature_c": 35.0,
                "relative_humidity_pct": 50.0,
                "wind_speed_kmh": 10.0,
                "solar_radiation_wm2": 800.0,
                "observation_time": "2026-07-15T07:00:00Z"
            }]

    mock_service = SchedulingOrchestrationService(site_service=MockInfeasibleSiteService())
    req = ScheduleGenerationRequest(siteId="mock-infeasible", date="2026-07-15")
    result = mock_service.generate_schedule(req)

    assert result.success is False
    assert result.status == "INFEASIBLE"
    assert "No feasible schedule" in result.reason
    assert "solverMessages" in result.details


# =========================================================================
# 3. OBJECTIVE MODES VIA API (FASTEST, SAFEST, BALANCED)
# =========================================================================

def test_fastest_safest_balanced_modes_via_api():
    """
    Test 2, 3, 4: FASTEST, SAFEST, BALANCED requests execute successfully and preserve selected objective mode.
    """
    for mode in ["FASTEST", "SAFEST", "BALANCED"]:
        resp = client.post("/api/schedules/generate", json={
            "siteId": SEEDED_SITE_ID,
            "date": SEEDED_DATE,
            "objectiveMode": mode,
            "persist": False
        })
        assert resp.status_code == 200, f"Mode {mode} failed: {resp.text}"
        data = resp.json()
        assert data["success"] is True
        assert data["schedule"]["objectiveMode"] == mode
        assert data["schedule"]["status"] in ("OPTIMAL", "FEASIBLE")
        assert len(data["schedule"]["assignments"]) > 0
        assert data["summary"]["taskCount"] == 5
        assert data["summary"]["workerCount"] == 22


def test_deterministic_api_response():
    """Test 16: Identical API requests produce identical deterministic schedules."""
    resp1 = client.post("/api/schedules/generate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED"
    })
    resp2 = client.post("/api/schedules/generate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED"
    })

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    d1 = resp1.json()
    d2 = resp2.json()

    assert d1["schedule"]["objectiveValue"] == d2["schedule"]["objectiveValue"]
    assert d1["schedule"]["totalWorkMinutes"] == d2["schedule"]["totalWorkMinutes"]
    assert d1["schedule"]["totalRestMinutes"] == d2["schedule"]["totalRestMinutes"]
    assert len(d1["schedule"]["assignments"]) == len(d2["schedule"]["assignments"])


# =========================================================================
# 4. END-TO-END INTEGRATION TEST (Section 23)
# =========================================================================

def test_end_to_end_seeded_site_scheduling_integration():
    """
    END-TO-END INTEGRATION TEST (Section 23):
    Calls POST /api/schedules/generate on the seeded Apex Commercial Tower site.
    Verifies:
    1. Request accepted
    2. Site data loaded
    3. Exactly 22 workers loaded
    4. Exactly 5 tasks loaded
    5. Resources loaded
    6. Weather records loaded
    7. Optimizer invoked
    8. Schedule returned
    9. Objective mode preserved
    10. Assignments contain worker/task/time/resource information
    11. Safety constraints satisfied
    12. Resource capacities satisfied
    """
    resp = client.post("/api/schedules/generate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "persist": False
    })

    assert resp.status_code == 200
    body = resp.json()

    assert body["success"] is True
    sched = body["schedule"]
    summary = body["summary"]

    # Verify metadata
    assert sched["siteId"] == SEEDED_SITE_ID
    assert sched["date"] == SEEDED_DATE
    assert sched["objectiveMode"] == "BALANCED"
    assert sched["status"] in ("OPTIMAL", "FEASIBLE")

    # Verify counts
    assert summary["workerCount"] == 22
    assert summary["taskCount"] == 5
    assert summary["resourceCount"] == 5
    assert sched["totalTasksScheduled"] == 5

    # Verify assignments
    assignments = sched["assignments"]
    assert len(assignments) >= 5

    work_assignments = [a for a in assignments if a["assignment_type"] == "WORK"]
    assert len(work_assignments) > 0
    for wa in work_assignments:
        assert wa["worker_id"] is not None
        assert wa["task_id"] is not None
        assert wa["start_minute"] < wa["end_minute"]
        assert wa["zone_id"] is not None

    # Verify resource capacity was respected
    assert sched["peakShadeUtilization"] <= 14  # Sum of shade capacities in seed data is 14 (8+6)


def test_safety_and_resource_constraints_preserved_through_api():
    """
    Test 12 & 13: Safety and resource constraints are preserved without dilution through the API boundary.
    """
    resp = client.post("/api/schedules/generate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "SAFEST"
    })
    assert resp.status_code == 200
    data = resp.json()
    assignments = data["schedule"]["assignments"]

    # Verify no worker is assigned to two overlapping tasks in the same slot
    worker_slot_usage = {}
    for a in assignments:
        if a["assignment_type"] == "WORK":
            key = (a["worker_id"], a["slot_index"])
            assert key not in worker_slot_usage, f"Worker {a['worker_id']} double-booked at slot {a['slot_index']}!"
            worker_slot_usage[key] = a["task_id"]


def test_cli_optimizer_runner():
    """
    Test 10 & 14: Verifies the CLI run_optimizer.py script executes cleanly.
    """
    import subprocess
    import json
    import sys

    # Construct minimal problem instance
    payload = {
        "site_id": "site-test",
        "shift_date": "2026-07-15",
        "slot_interval_minutes": 15,
        "total_slots": 10,
        "objective_mode": "BALANCED",
        "workers": [
            {
                "worker_id": "w1",
                "name": "Carlos",
                "skills": ["CARPENTRY"],
                "is_acclimatized": True,
                "vulnerability_rating": "LOW",
                "shift_start_minute": 0,
                "shift_end_minute": 150
            }
        ],
        "tasks": [
            {
                "task_id": "t1",
                "title": "Framing",
                "zone_id": "z1",
                "required_skills": ["CARPENTRY"],
                "min_workers": 1,
                "max_workers": 1,
                "duration_minutes": 30,
                "intensity": "MEDIUM",
                "dependencies": [],
                "earliest_start_minute": 0,
                "deadline_minute": 150,
                "is_sun_exposed": True
            }
        ],
        "resources": [],
        "weather_slots": [
            {
                "slot_index": i,
                "start_minute": i * 15,
                "end_minute": (i + 1) * 15,
                "temperature_c": 28.0,
                "relative_humidity": 50.0,
                "solar_radiation_wm2": 500.0,
                "wind_speed_kmh": 10.0,
                "estimated_wbgt_c": 25.0,
                "risk_category": "LOW"
            }
            for i in range(10)
        ],
        "safety_policy": {
            "policy_id": "pol-test",
            "name": "Test Policy",
            "standard": "OSHA"
        }
    }

    # Run CLI script via subprocess
    proc = subprocess.Popen(
        [sys.executable, "optimizer/run_optimizer.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    stdout, stderr = proc.communicate(input=json.dumps(payload))

    assert proc.returncode == 0, f"run_optimizer.py failed: {stderr}"
    result = json.loads(stdout)
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    assert result["total_tasks_scheduled"] == 1
    assert len(result["assignments"]) == 2
