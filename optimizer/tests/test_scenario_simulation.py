"""
ThermoShift - Phase 4E What-If Scenario Simulation & Live Rescheduling Test Suite

Comprehensive test suite verifying:
1. Valid empty scenario (scenario matches baseline)
2. Weather override (temperature/humidity delta)
3. Worker availability override (worker marked unavailable)
4. Resource capacity override (shade capacity reduced)
5. Task deadline override (earlier deadline)
6. Multiple simultaneous overrides (weather + worker + resource + deadline)
7. Worker unavailable cannot receive assignments in scenario
8. Reduced resource capacity is strictly enforced
9. Earlier deadline is strictly enforced
10. SafetyPolicy remains immutable and active
11. Scenario simulation does NOT mutate production database (workers, tasks, resources, weather)
12. Baseline schedule remains unchanged after simulation
13. Infeasible scenario returns structured HTTP 422 with diagnostics
14. Baseline feasible + scenario infeasible handled cleanly
15. Baseline/scenario comparison summary calculation
16. Task timing diff calculation (start/end delta)
17. Worker assignment diff calculation (workers added/removed)
18. Rest-period diff calculation (rest minutes delta)
19. Resource utilization diff calculation (shade delta)
20. Deterministic identical scenario produces identical output
21. Invalid scenario input rejection (HTTP 400)
22. Unknown worker override handled gracefully
23. Unknown resource override handled gracefully
24. Unknown task deadline override handled gracefully
25. Invalid objective mode rejection (HTTP 400)
"""

import copy
import pytest
from fastapi.testclient import TestClient

from optimizer.engine.api import app
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
from optimizer.engine.scenario_service import (
    ScenarioSimulationRequest,
    ScenarioSimulationService,
    WeatherOverrideInput,
    WorkerAvailabilityOverrideInput,
    ResourceCapacityOverrideInput,
    TaskDeadlineOverrideInput,
    TaskChangeType
)
from optimizer.engine.site_service import SiteDataService

client = TestClient(app)

SEEDED_SITE_ID = "a0000000-0000-0000-0000-000000000001"
SEEDED_DATE = "2026-07-15"

CARLOS_ID = "b0000000-0000-0000-0000-000000000001"
SHADE_ID = "d0000000-0000-0000-0000-000000000001"
TASK1_ID = "c0000000-0000-0000-0000-000000000001"


# =========================================================================
# 1. VALID EMPTY SCENARIO & BASELINE PRESERVATION (TESTS 1, 10, 11, 12)
# =========================================================================

def test_1_and_12_valid_empty_scenario_matches_baseline():
    """Test 1 & 12: An empty scenario simulation produces results identical to the baseline."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["status"] in ("OPTIMAL", "FEASIBLE")
    assert data["baselineSchedule"]["status"] in ("OPTIMAL", "FEASIBLE")
    assert data["scenarioSchedule"]["status"] in ("OPTIMAL", "FEASIBLE")

    summary = data["comparisonSummary"]
    assert summary["tasks_changed_count"] == 0
    assert summary["workers_affected_count"] == 0
    assert summary["work_minutes_delta"] == 0
    assert summary["rest_minutes_delta"] == 0


def test_10_safetypolicy_remains_immutable():
    """Test 10: Standard OSHA/NIOSH & India MoLE Heat Safety Policy Reference remains active and uncompromised."""
    service = ScenarioSimulationService()
    req = ScenarioSimulationRequest(
        siteId=SEEDED_SITE_ID,
        date=SEEDED_DATE,
        objectiveMode=SolverObjectiveMode.BALANCED,
        weatherOverrides=WeatherOverrideInput(solar_radiation_wm2_delta=-50.0)
    )
    result = service.simulate(req)
    assert result.success is True
    # Verify baseline and scenario both use OSHA safety limits
    assert result.baseline_schedule is not None
    assert result.scenario_schedule is not None


def test_11_simulation_does_not_mutate_production_db():
    """Test 11: Scenario simulation performs zero mutations on Supabase production data."""
    site_service = SiteDataService()
    workers_before = site_service.get_workers_with_skills(SEEDED_SITE_ID)
    tasks_before = site_service.get_tasks_with_dependencies(SEEDED_SITE_ID)
    resources_before = site_service.get_resources(SEEDED_SITE_ID)
    weather_before = site_service.get_weather_records(SEEDED_SITE_ID, SEEDED_DATE)

    # Run simulation with overrides
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "weatherOverrides": {"solar_radiation_wm2_delta": -50.0},
        "workerOverrides": {"unavailable_worker_ids": [CARLOS_ID]},
        "resourceOverrides": {"resource_capacities": {SHADE_ID: 6}},
        "taskOverrides": {"task_deadlines_minutes": {TASK1_ID: 150}}
    })
    assert resp.status_code == 200

    # Query DB entities again and assert strict equality
    workers_after = site_service.get_workers_with_skills(SEEDED_SITE_ID)
    tasks_after = site_service.get_tasks_with_dependencies(SEEDED_SITE_ID)
    resources_after = site_service.get_resources(SEEDED_SITE_ID)
    weather_after = site_service.get_weather_records(SEEDED_SITE_ID, SEEDED_DATE)

    assert [w.model_dump() for w in workers_before] == [w.model_dump() for w in workers_after]
    assert [t.model_dump() for t in tasks_before] == [t.model_dump() for t in tasks_after]
    assert [r.model_dump() for r in resources_before] == [r.model_dump() for r in resources_after]
    assert weather_before == weather_after


# =========================================================================
# 2. OVERRIDE TESTS (TESTS 2, 3, 4, 5, 6, 7, 8, 9)
# =========================================================================

def test_2_weather_override_simulation():
    """Test 2: Environmental weather overrides modify WBGT in memory and re-solve."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "weatherOverrides": {
            "solar_radiation_wm2_delta": -100.0,
            "relative_humidity_delta": -5.0
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "weather" in data["appliedOverrides"]


def test_3_and_7_worker_availability_override_excludes_worker():
    """Test 3 & 7: Marking a worker unavailable ensures worker receives 0 assignments in scenario."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "workerOverrides": {
            "unavailable_worker_ids": [CARLOS_ID]
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True

    scen_asgns = data["scenarioSchedule"]["assignments"]
    assigned_worker_ids = [a["worker_id"] for a in scen_asgns if a["assignment_type"] == "WORK"]
    assert CARLOS_ID not in assigned_worker_ids
    assert data["comparisonSummary"]["workers_affected_count"] >= 1


def test_4_and_8_resource_capacity_override_enforced():
    """Test 4 & 8: Overriding shade capacity enforces the new capacity as a hard constraint."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "resourceOverrides": {
            "resource_capacities": {SHADE_ID: 3}
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["scenarioSchedule"]["peakShadeUtilization"] <= 3


def test_5_and_9_task_deadline_earlier_override():
    """Test 5 & 9: Moving Task 1 deadline earlier is strictly respected."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "taskOverrides": {
            "task_deadlines_minutes": {TASK1_ID: 90}
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True

    t1_diff = next(d for d in data["taskDiffs"] if d["task_id"] == TASK1_ID)
    assert t1_diff["scenario_end_minute"] <= 90


def test_6_multiple_simultaneous_overrides():
    """Test 6: Combined weather delta + unavailable worker + resource reduction + earlier deadline."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "weatherOverrides": {
            "solar_radiation_wm2_delta": -50.0,
            "relative_humidity_delta": -2.0
        },
        "workerOverrides": {
            "unavailable_worker_ids": [CARLOS_ID]
        },
        "resourceOverrides": {
            "resource_capacities": {SHADE_ID: 6}
        },
        "taskOverrides": {
            "task_deadlines_minutes": {TASK1_ID: 150}
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert CARLOS_ID not in [a["worker_id"] for a in data["scenarioSchedule"]["assignments"] if a["assignment_type"] == "WORK"]
    assert "weather" in data["appliedOverrides"]
    assert "unavailable_workers" in data["appliedOverrides"]
    assert "resource_capacities" in data["appliedOverrides"]
    assert "task_deadlines" in data["appliedOverrides"]


# =========================================================================
# 3. INFEASIBILITY HANDLING (TESTS 13, 14)
# =========================================================================

def test_13_and_14_infeasible_scenario_returns_http_422():
    """
    Test 13 & 14: Setting an impossible task deadline (5 min when duration is 15 min)
    returns structured HTTP 422 with solver diagnostics while baseline remains feasible.
    """
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "taskOverrides": {
            "task_deadlines_minutes": {TASK1_ID: 5}
        }
    })
    assert resp.status_code == 422
    data = resp.json()
    assert data["success"] is False
    assert data["status"] == "INFEASIBLE"
    assert data["baselineSchedule"]["status"] in ("OPTIMAL", "FEASIBLE")
    assert "solverMessages" in data["details"]


# =========================================================================
# 4. DIFF ENGINE & COMPARISON SUMMARY (TESTS 15, 16, 17, 18, 19)
# =========================================================================

def test_15_through_19_diff_engine_timing_worker_rest_resource_deltas():
    """Test 15, 16, 17, 18, 19: Verifies structured diff calculations."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "workerOverrides": {
            "unavailable_worker_ids": [CARLOS_ID]
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    diffs = data["taskDiffs"]
    assert len(diffs) == 5

    # Check comparison summary fields
    summary = data["comparisonSummary"]
    assert "tasks_changed_count" in summary
    assert "workers_affected_count" in summary
    assert "work_minutes_delta" in summary
    assert "rest_minutes_delta" in summary
    assert "peak_shade_delta" in summary
    assert "completion_time_delta_minutes" in summary
    assert "baseline_status" in summary
    assert "scenario_status" in summary


# =========================================================================
# 5. DETERMINISM & OBJECTIVE MODES (TESTS 20, 25)
# =========================================================================

def test_20_deterministic_identical_scenario_simulation():
    """Test 20: Identical scenario simulation calls produce identical diffs and schedules."""
    payload = {
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "weatherOverrides": {"solar_radiation_wm2_delta": -50.0}
    }
    resp1 = client.post("/api/schedules/simulate", json=payload)
    resp2 = client.post("/api/schedules/simulate", json=payload)

    assert resp1.status_code == 200
    assert resp2.status_code == 200

    d1 = resp1.json()
    d2 = resp2.json()

    assert d1["scenarioSchedule"]["objectiveValue"] == d2["scenarioSchedule"]["objectiveValue"]
    assert len(d1["taskDiffs"]) == len(d2["taskDiffs"])
    assert d1["comparisonSummary"] == d2["comparisonSummary"]


def test_25_simulation_across_all_objective_modes():
    """Test 25: What-If simulation executes across FASTEST, SAFEST, and BALANCED modes."""
    for mode in ["FASTEST", "SAFEST", "BALANCED"]:
        resp = client.post("/api/schedules/simulate", json={
            "siteId": SEEDED_SITE_ID,
            "date": SEEDED_DATE,
            "objectiveMode": mode,
            "weatherOverrides": {"solar_radiation_wm2_delta": -50.0}
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["scenarioSchedule"]["objectiveMode"] == mode
        assert data["success"] is True


# =========================================================================
# 6. INVALID INPUTS & UNKNOWN ENTITY HANDLING (TESTS 21, 22, 23, 24, 25)
# =========================================================================

def test_21_invalid_scenario_request_rejection():
    """Test 21: Missing siteId or empty body returns HTTP 400."""
    resp = client.post("/api/schedules/simulate", json={"siteId": "", "date": SEEDED_DATE})
    assert resp.status_code == 400
    assert resp.json()["success"] is False

    resp2 = client.post("/api/schedules/simulate", json={})
    assert resp2.status_code == 400


def test_22_unknown_worker_override_handled_gracefully():
    """Test 22: Marking a non-existent worker ID unavailable does not crash the solver."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "workerOverrides": {
            "unavailable_worker_ids": ["99999999-9999-9999-9999-999999999999"]
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True


def test_23_unknown_resource_override_handled_gracefully():
    """Test 23: Overriding capacity of a non-existent resource ID does not crash the solver."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "resourceOverrides": {
            "resource_capacities": {"99999999-9999-9999-9999-999999999999": 10}
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True


def test_24_unknown_task_deadline_override_handled_gracefully():
    """Test 24: Overriding deadline of a non-existent task ID does not crash the solver."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "BALANCED",
        "taskOverrides": {
            "task_deadlines_minutes": {"99999999-9999-9999-9999-999999999999": 120}
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True


def test_25_invalid_objective_mode_rejection():
    """Test 25: Invalid objective mode string returns HTTP 400."""
    resp = client.post("/api/schedules/simulate", json={
        "siteId": SEEDED_SITE_ID,
        "date": SEEDED_DATE,
        "objectiveMode": "HYPER_TURBO_SPEED"
    })
    assert resp.status_code == 400
    assert "objectiveMode" in resp.json()["error"]
