"""
ThermoShift - Schema & Migration Automated Verification Test
Validates that the SQL migrations and seed data satisfy all Phase 2 integrity requirements.
"""

import os
import re
import pytest

SCHEMA_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "supabase", "migrations", "20260906000000_initial_schema.sql")
SEED_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "supabase", "seed.sql")


def test_migration_contains_all_11_required_tables():
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    required_tables = [
        "sites",
        "workers",
        "worker_skills",
        "tasks",
        "task_dependencies",
        "resources",
        "weather_records",
        "schedules",
        "schedule_assignments",
        "simulation_runs",
        "compliance_logs",
    ]

    for table in required_tables:
        pattern = rf"CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?{table}\b"
        match = re.search(pattern, content, re.IGNORECASE)
        assert match is not None, f"Missing required table: {table}"


def test_migration_enables_rls_on_all_tables():
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    required_tables = [
        "sites",
        "workers",
        "worker_skills",
        "tasks",
        "task_dependencies",
        "resources",
        "weather_records",
        "schedules",
        "schedule_assignments",
        "simulation_runs",
        "compliance_logs",
    ]

    for table in required_tables:
        pattern = rf"ALTER\s+TABLE\s+{table}\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY"
        match = re.search(pattern, content, re.IGNORECASE)
        assert match is not None, f"RLS not enabled for table: {table}"


def test_migration_and_seed_have_no_medical_notes():
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        schema_content = f.read()
    assert "medical_notes" not in schema_content, "medical_notes must not exist in schema"

    with open(SEED_FILE, "r", encoding="utf-8") as f:
        seed_content = f.read()
    assert "medical_notes" not in seed_content, "medical_notes must not exist in seed"


def test_seed_contains_exact_worker_and_task_counts():
    with open(SEED_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    # Count workers inserted: ('b0000000-0000-0000-0000-0000000000..')
    worker_matches = re.findall(r"'b0000000-0000-0000-0000-[0-9a-f]{12}'", content)
    unique_workers = set(worker_matches)
    assert len(unique_workers) == 22, f"Expected exactly 22 workers in seed, found {len(unique_workers)}"

    # Count tasks inserted: ('c0000000-0000-0000-0000-0000000000..')
    task_matches = re.findall(r"'c0000000-0000-0000-0000-[0-9a-f]{12}'", content)
    unique_tasks = set(task_matches)
    assert len(unique_tasks) == 5, f"Expected exactly 5 tasks in seed, found {len(unique_tasks)}"

    # Check resources inserted: ('d0000000-0000-0000-0000-0000000000..')
    resource_matches = re.findall(r"'d0000000-0000-0000-0000-[0-9a-f]{12}'", content)
    unique_resources = set(resource_matches)
    assert len(unique_resources) >= 5, f"Expected at least 5 resources in seed, found {len(unique_resources)}"
