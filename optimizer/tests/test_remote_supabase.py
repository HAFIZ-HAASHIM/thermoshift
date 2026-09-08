"""
ThermoShift - Live Supabase Remote Integration Test
Validates table availability, record counts, and absence of sensitive fields.
"""

import requests
import pytest

BASE_URL = "https://rzxdmvvfqiphgojmwjdc.supabase.co/rest/v1/"
HEADERS = {
    "apikey": "sb_publishable_3v9caM8hW_mCctxYPlxq5g_2XxMFZW0",
    "Authorization": "Bearer sb_publishable_3v9caM8hW_mCctxYPlxq5g_2XxMFZW0",
    "Prefer": "count=exact"
}


def test_remote_supabase_all_13_tables_exist():
    tables = [
        "sites",
        "skills",
        "workers",
        "worker_skills",
        "tasks",
        "task_required_skills",
        "task_dependencies",
        "resources",
        "weather_records",
        "schedules",
        "schedule_assignments",
        "simulation_runs",
        "compliance_logs"
    ]
    for table in tables:
        url = f"{BASE_URL}{table}?select=*&limit=1"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        assert resp.status_code in (200, 206), f"Table {table} returned HTTP {resp.status_code}: {resp.text}"


def test_remote_supabase_exact_record_counts():
    # 1. Sites = 1
    resp = requests.get(f"{BASE_URL}sites?select=*", headers=HEADERS, timeout=10)
    assert resp.status_code == 200
    sites = resp.json()
    assert len(sites) == 1
    demo_site_id = sites[0]["id"]

    # 2. Workers = 22
    resp = requests.get(f"{BASE_URL}workers?select=*", headers=HEADERS, timeout=10)
    workers = resp.json()
    assert len(workers) == 22
    assert all(w["site_id"] == demo_site_id for w in workers)

    # 3. Tasks = 5
    resp = requests.get(f"{BASE_URL}tasks?select=*", headers=HEADERS, timeout=10)
    tasks = resp.json()
    assert len(tasks) == 5
    assert all(t["site_id"] == demo_site_id for t in tasks)

    # 4. Worker Skills > 0
    resp = requests.get(f"{BASE_URL}worker_skills?select=*", headers=HEADERS, timeout=10)
    assert len(resp.json()) == 28

    # 5. Task Required Skills > 0
    resp = requests.get(f"{BASE_URL}task_required_skills?select=*", headers=HEADERS, timeout=10)
    assert len(resp.json()) == 8

    # 6. Task Dependencies = 3
    resp = requests.get(f"{BASE_URL}task_dependencies?select=*", headers=HEADERS, timeout=10)
    assert len(resp.json()) == 3

    # 7. Resources = 5
    resp = requests.get(f"{BASE_URL}resources?select=*", headers=HEADERS, timeout=10)
    assert len(resp.json()) == 5

    # 8. Weather Records = 5
    resp = requests.get(f"{BASE_URL}weather_records?select=*", headers=HEADERS, timeout=10)
    assert len(resp.json()) == 5


def test_remote_supabase_no_medical_notes_in_workers_schema():
    resp = requests.get(f"{BASE_URL}workers?select=*&limit=1", headers=HEADERS, timeout=10)
    assert resp.status_code in (200, 206)
    sample_worker = resp.json()[0]
    assert "medical_notes" not in sample_worker, "medical_notes must not exist in live workers table"
