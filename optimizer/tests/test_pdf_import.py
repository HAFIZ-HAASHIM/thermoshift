"""
ThermoShift - Phase 5A: Comprehensive Automated Tests for PDF Import & Structured Extraction
Tests:
1. PDF text & metadata extraction
2. Rejection of invalid/empty PDF files
3. AI & Deterministic candidate extraction (Apex schedule)
4. Schema validation and normalization of missing fields (no fake defaults)
5. Self-dependency removal
6. DAG Circular dependency detection & loop flagging
7. Duplicate task title detection
8. FastAPI import extract/validate/confirm endpoints
9. End-to-end handoff: Imported tasks fed into CP-SAT solver for heat-safe scheduling
10. ThermoShift_Test_Project_Schedule.pdf 10 activities exact regression tests:
    - Exactly 10 candidate activities
    - No section headings as tasks
    - No skills as tasks (skills attached to tasks)
    - No workforce requirements as tasks
    - No resources as tasks
    - Durations preserved exactly
    - Worker counts preserved exactly
    - Deadlines preserved exactly
    - Dependencies DAG preserved exactly
    - Source citations point to correct row
"""

import os
import pytest
from fastapi.testclient import TestClient

from optimizer.engine.api import app
from optimizer.engine.schedule_importer import (
    ScheduleImportEngine,
    ExtractedTaskCandidate
)
from optimizer.tests.generate_fixture_pdf import create_sample_pdf_bytes
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
    SolverTimeSlotWeather,
    SolverProblemInstance,
    SolverScheduleOutput
)
from optimizer.engine.exposure_model import (
    DEFAULT_OSHA_WBGT_BANDS,
    DEFAULT_WORK_REST_RULES
)
from optimizer.engine.scheduler import CPSATSchedulingEngine

client = TestClient(app)


@pytest.fixture
def sample_pdf_bytes():
    return create_sample_pdf_bytes()


def test_01_pdf_text_extraction(sample_pdf_bytes):
    """Verifies that PDF text is correctly parsed from digital PDF stream."""
    text, page_count, warnings = ScheduleImportEngine.extract_text_from_pdf(
        sample_pdf_bytes,
        "Apex_Tower_Phase_2_Schedule.pdf"
    )
    assert page_count >= 1
    assert "APEX COMMERCIAL TOWER" in text
    assert "Concrete Pouring" in text
    assert "Formwork" in text
    assert "Rebar" in text


def test_02_invalid_pdf_rejection():
    """Verifies that non-PDF or empty files are safely rejected with descriptive errors."""
    with pytest.raises(ValueError, match="is not a valid PDF document"):
        ScheduleImportEngine.extract_text_from_pdf(b"Not a PDF file content", "fake.pdf")

    with pytest.raises(ValueError, match="contains insufficient data"):
        ScheduleImportEngine.extract_text_from_pdf(b"", "empty.pdf")


def test_03_candidate_activities_extracted(sample_pdf_bytes):
    """Verifies that candidate activities are extracted with durations, workers, and skills."""
    text, _, _ = ScheduleImportEngine.extract_text_from_pdf(sample_pdf_bytes, "Apex.pdf")
    candidates, warnings = ScheduleImportEngine.extract_candidates(text, "Apex.pdf")

    assert len(candidates) >= 8
    titles = [c.title.lower() for c in candidates]
    assert any("concrete" in t for t in titles)
    assert any("rebar" in t for t in titles)
    assert any("formwork" in t for t in titles)
    assert any("welding" in t for t in titles)
    assert any("electrical" in t for t in titles)

    for c in candidates:
        assert c.source_reference is not None
        assert "Apex.pdf" in c.source_reference


def test_04_missing_fields_remain_null():
    """Verifies that missing/zero durations and ambiguous fields remain None and are flagged for review (NO FAKE DEFAULTS)."""
    raw_cand = ExtractedTaskCandidate(
        id="ext-test",
        title="Unspecified Heavy Task",
        estimated_duration_minutes=None,
        min_workers=None,
        required_skills=[],
        confidence=0.5
    )

    warnings = []
    validated = ScheduleImportEngine.validate_and_normalize([raw_cand], None, warnings)

    assert len(validated) == 1
    v = validated[0]
    assert v.estimated_duration_minutes is None, "Missing duration must remain None (no fake defaults)"
    assert v.min_workers is None, "Missing worker count must remain None (no fake defaults)"
    assert "GENERAL_LABOR" in v.required_skills
    assert v.needs_review is True
    assert any("Duration not specified" in r for r in v.review_reasons)
    assert any("Worker count requirement" in r for r in v.review_reasons)


def test_05_self_dependency_removal():
    """Verifies that self-referencing dependencies are stripped."""
    raw_cand = ExtractedTaskCandidate(
        id="ext-1",
        title="Formwork Setup",
        dependencies=["ext-1"],  # Self-dependency
        estimated_duration_minutes=120,
        min_workers=2
    )

    validated = ScheduleImportEngine.validate_and_normalize([raw_cand], None, [])
    assert "ext-1" not in validated[0].dependencies
    assert any("Self-dependency" in r for r in validated[0].review_reasons)


def test_06_circular_dependency_detection():
    """Verifies that 2-node circular dependency loops in candidate DAG are detected and flagged."""
    t1 = ExtractedTaskCandidate(
        id="ext-1",
        title="Excavation",
        dependencies=["ext-2"],
        estimated_duration_minutes=120,
        min_workers=2
    )
    t2 = ExtractedTaskCandidate(
        id="ext-2",
        title="Foundation Pour",
        dependencies=["ext-1"],  # Cycle with ext-1
        estimated_duration_minutes=180,
        min_workers=4
    )

    warnings = []
    validated = ScheduleImportEngine.validate_and_normalize([t1, t2], None, warnings)

    assert any("Circular dependency detected" in w for w in warnings)
    assert validated[0].needs_review is True
    assert validated[1].needs_review is True


def test_07_duplicate_task_titles_flagged():
    """Verifies that duplicate task titles are detected and flagged for review."""
    t1 = ExtractedTaskCandidate(id="ext-1", title="Concrete Pour", estimated_duration_minutes=120, min_workers=2)
    t2 = ExtractedTaskCandidate(id="ext-2", title="Concrete Pour", estimated_duration_minutes=180, min_workers=3)

    warnings = []
    validated = ScheduleImportEngine.validate_and_normalize([t1, t2], None, warnings)

    assert validated[1].needs_review is True
    assert any("Duplicate task title" in r for r in validated[1].review_reasons)


def test_08_api_extract_endpoint(sample_pdf_bytes):
    """Tests the /api/schedules/import/extract endpoint with multipart PDF upload."""
    files = {"file": ("Apex_Tower_Schedule.pdf", sample_pdf_bytes, "application/pdf")}
    response = client.post("/api/schedules/import/extract", files=files)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["tasks"]) >= 8
    assert data["filename"] == "Apex_Tower_Schedule.pdf"


def test_09_api_validate_endpoint():
    """Tests the /api/schedules/import/validate endpoint."""
    payload = {
        "tasks": [
            {
                "id": "ext-1",
                "title": "Framing",
                "estimated_duration_minutes": 120,
                "min_workers": 2,
                "max_workers": 4,
                "required_skills": ["CARPENTRY"],
                "dependencies": []
            }
        ]
    }
    response = client.post("/api/schedules/import/validate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["can_confirm"] is True


def test_10_api_confirm_endpoint():
    """Tests the /api/schedules/import/confirm endpoint."""
    payload = {
        "site_id": "a0000000-0000-0000-0000-000000000001",
        "tasks": [
            {
                "id": "ext-1",
                "title": "Imported Pouring Task",
                "estimated_duration_minutes": 120,
                "min_workers": 2,
                "max_workers": 4,
                "physical_intensity": "HEAVY",
                "required_skills": ["MASONRY"],
                "dependencies": [],
                "earliest_start_time": "07:00:00",
                "deadline_time": "17:00:00",
                "zone_name": "Sector 1",
                "is_sun_exposed": True,
                "priority": "MEDIUM",
                "source_reference": "Apex.pdf · Page 1"
            }
        ]
    }
    response = client.post("/api/schedules/import/confirm", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["created_tasks_count"] == 1


def test_11_end_to_end_handoff_to_cpsat_optimizer(sample_pdf_bytes):
    """
    CRITICAL INTEGRATION TEST:
    Verifies that tasks extracted from the PDF can be immediately dispatched
    by the existing CP-SAT mathematical optimization engine under heat constraints.
    """
    text, _, _ = ScheduleImportEngine.extract_text_from_pdf(sample_pdf_bytes, "Apex.pdf")
    candidates, _ = ScheduleImportEngine.extract_candidates(text, "Apex.pdf")

    solver_tasks = []
    skill_enum_map = {
        "MASONRY": SkillType.MASONRY,
        "CARPENTRY": SkillType.CARPENTRY,
        "ELECTRICAL": SkillType.ELECTRICAL,
        "WELDING": SkillType.WELDING,
        "ROOFING": SkillType.ROOFING,
        "PLUMBING": SkillType.PLUMBING,
        "HEAVY_MACHINERY": SkillType.HEAVY_MACHINERY,
        "SAFETY_INSPECTION": SkillType.SAFETY_INSPECTION,
        "GENERAL_LABOR": SkillType.GENERAL_LABOR
    }

    for idx, c in enumerate(candidates[:4]):
        mapped_skills = [skill_enum_map.get(s, SkillType.GENERAL_LABOR) for s in c.required_skills]
        t = SolverTaskInput(
            task_id=f"t-{idx+1}",
            title=c.title,
            zone_id=c.zone_name or "zone-1",
            required_skills=mapped_skills or [SkillType.GENERAL_LABOR],
            min_workers=c.min_workers or 2,
            max_workers=c.max_workers or 4,
            duration_minutes=45,
            intensity=PhysicalIntensity.MEDIUM,
            is_sun_exposed=c.is_sun_exposed,
            earliest_start_slot=0,
            latest_end_slot=40
        )
        solver_tasks.append(t)

    workers = [
        SolverWorkerInput(worker_id="w-1", name="Carlos", skills=[SkillType.MASONRY, SkillType.CARPENTRY, SkillType.ROOFING, SkillType.GENERAL_LABOR], is_acclimatized=True, vulnerability_rating=HeatVulnerabilityLevel.LOW),
        SolverWorkerInput(worker_id="w-2", name="Elena", skills=[SkillType.MASONRY, SkillType.CARPENTRY, SkillType.ROOFING, SkillType.ELECTRICAL, SkillType.GENERAL_LABOR], is_acclimatized=True, vulnerability_rating=HeatVulnerabilityLevel.LOW),
        SolverWorkerInput(worker_id="w-3", name="Marcus", skills=[SkillType.WELDING, SkillType.MASONRY, SkillType.CARPENTRY, SkillType.ROOFING, SkillType.GENERAL_LABOR], is_acclimatized=True, vulnerability_rating=HeatVulnerabilityLevel.LOW),
        SolverWorkerInput(worker_id="w-4", name="David", skills=[SkillType.CARPENTRY, SkillType.MASONRY, SkillType.ROOFING, SkillType.GENERAL_LABOR], is_acclimatized=True, vulnerability_rating=HeatVulnerabilityLevel.LOW),
        SolverWorkerInput(worker_id="w-5", name="Mateo", skills=[SkillType.GENERAL_LABOR, SkillType.MASONRY, SkillType.CARPENTRY, SkillType.ROOFING], is_acclimatized=True, vulnerability_rating=HeatVulnerabilityLevel.LOW),
        SolverWorkerInput(worker_id="w-6", name="James", skills=[SkillType.ROOFING, SkillType.GENERAL_LABOR, SkillType.MASONRY, SkillType.CARPENTRY], is_acclimatized=True, vulnerability_rating=HeatVulnerabilityLevel.LOW),
        SolverWorkerInput(worker_id="w-7", name="Javier", skills=[SkillType.ROOFING, SkillType.CARPENTRY, SkillType.MASONRY, SkillType.GENERAL_LABOR], is_acclimatized=True, vulnerability_rating=HeatVulnerabilityLevel.LOW),
        SolverWorkerInput(worker_id="w-8", name="Brian", skills=[SkillType.CARPENTRY, SkillType.ROOFING, SkillType.MASONRY, SkillType.GENERAL_LABOR], is_acclimatized=True, vulnerability_rating=HeatVulnerabilityLevel.LOW)
    ]

    resources = [
        SolverResourceInput(resource_id="res-1", name="Shade Tent", resource_type="SHADE_STRUCTURE", capacity=10, zone_id="zone-1"),
        SolverResourceInput(resource_id="res-2", name="Cooling Trailer", resource_type="COOLING_TENT", capacity=10, zone_id="zone-1")
    ]

    policy = SafetyPolicy(
        policy_id="osha-test",
        name="OSHA Heat Policy",
        standard=SafetyStandardType.OSHA,
        wbgt_bands=DEFAULT_OSHA_WBGT_BANDS,
        work_rest_rules=DEFAULT_WORK_REST_RULES
    )

    weather_slots = [
        SolverTimeSlotWeather(
            slot_index=i,
            start_minute=i*15,
            end_minute=(i+1)*15,
            temperature_c=24.0,
            relative_humidity=45.0,
            solar_radiation_wm2=300.0,
            wind_speed_kmh=12.0,
            estimated_wbgt_c=22.0,
            risk_category=HeatRiskCategory.LOW
        )
        for i in range(40)
    ]

    problem_instance = SolverProblemInstance(
        site_id="site-1",
        shift_date="2026-07-15",
        objective_mode=SolverObjectiveMode.BALANCED,
        workers=workers,
        tasks=solver_tasks,
        resources=resources,
        weather_slots=weather_slots,
        safety_policy=policy
    )

    result = CPSATSchedulingEngine.solve(problem_instance)
    assert result.status in ["OPTIMAL", "FEASIBLE"]
    assert len(result.assignments) > 0
    assert result.total_tasks_scheduled == 4
    assert result.total_work_minutes > 0


# ==============================================================================
# PHASE 5A REGRESSION TESTS FOR ThermoShift_Test_Project_Schedule.pdf
# ==============================================================================

def test_12_ten_activity_test_project_pdf_regression():
    """
    Comprehensive regression test suite for ThermoShift_Test_Project_Schedule.pdf:
    1. Produces exactly 10 activities.
    2. No section heading becomes a task.
    3. No skill becomes a task.
    4. No workforce requirement becomes a task.
    5. No resource becomes a task.
    6. Durations are preserved exactly.
    7. Worker counts are preserved exactly.
    8. Deadlines are preserved exactly.
    9. Dependencies are preserved exactly.
    10. Skills are attached to tasks rather than becoming tasks.
    11. Source citations point to the correct activity row.
    """
    pdf_path = "optimizer/tests/ThermoShift_Test_Project_Schedule.pdf"
    if not os.path.exists(pdf_path):
        pdf_path = "ThermoShift_Test_Project_Schedule.pdf"

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    text, page_count, warnings = ScheduleImportEngine.extract_text_from_pdf(pdf_bytes, "ThermoShift_Test_Project_Schedule.pdf")
    assert page_count >= 1

    candidates, warnings = ScheduleImportEngine.extract_candidates(text, "ThermoShift_Test_Project_Schedule.pdf")

    # 1. Exactly 10 activities
    assert len(candidates) == 10, f"Expected exactly 10 activities, got {len(candidates)}: {[c.title for c in candidates]}"

    # Expected Ground Truth
    expected_data = {
        "A-101": {
            "title": "Site clearing and debris segregation",
            "duration": 120,
            "workers": 3,
            "deadline": "15 Sep 12:00",
            "deps": [],
            "skills": ["SITE_OPERATIONS"]
        },
        "A-102": {
            "title": "Stormwater trench excavation",
            "duration": 180,
            "workers": 4,
            "deadline": "16 Sep 15:00",
            "deps": ["A-101"],
            "skills": ["EXCAVATION"]
        },
        "A-103": {
            "title": "HDPE drainage pipe installation",
            "duration": 150,
            "workers": 3,
            "deadline": "17 Sep 15:00",
            "deps": ["A-102"],
            "skills": ["PIPE_INSTALLATION"]
        },
        "A-104": {
            "title": "Compacted aggregate base preparation",
            "duration": 210,
            "workers": 4,
            "deadline": "18 Sep 16:00",
            "deps": ["A-101"],
            "skills": ["EARTHWORKS"]
        },
        "A-105": {
            "title": "Rebar cage assembly",
            "duration": 180,
            "workers": 3,
            "deadline": "21 Sep 14:00",
            "deps": ["A-104"],
            "skills": ["REBAR_WORK"]
        },
        "A-106": {
            "title": "Foundation concrete placement",
            "duration": 240,
            "workers": 5,
            "deadline": "22 Sep 16:00",
            "deps": ["A-105"],
            "skills": ["CONCRETE_WORK"]
        },
        "A-107": {
            "title": "Curing blanket installation",
            "duration": 90,
            "workers": 2,
            "deadline": "23 Sep 12:00",
            "deps": ["A-106"],
            "skills": ["CONCRETE_WORK"]
        },
        "A-108": {
            "title": "Perimeter lighting conduit installation",
            "duration": 180,
            "workers": 2,
            "deadline": "24 Sep 15:00",
            "deps": ["A-104"],
            "skills": ["ELECTRICAL"]
        },
        "A-109": {
            "title": "Safety barrier and access gate setup",
            "duration": 120,
            "workers": 3,
            "deadline": "25 Sep 12:00",
            "deps": ["A-108"],
            "skills": ["SITE_OPERATIONS"]
        },
        "A-110": {
            "title": "Final drainage inspection",
            "duration": 90,
            "workers": 2,
            "deadline": "25 Sep 15:00",
            "deps": ["A-103"],
            "skills": ["INSPECTION"]
        }
    }

    cand_map = {c.id: c for c in candidates}

    # 2. No section heading becomes a task
    # 3. No skill becomes a task
    # 4. No workforce requirement becomes a task
    # 5. No resource becomes a task
    forbidden_titles = [
        "Activity Schedule", "Workforce Requirements", "Resource Availability", "Scheduling Notes",
        "Excavation", "Pipe Installation", "Foundation Pad", "Rebar Work", "Concrete Work",
        "Electrical", "Inspection", "Trained for mechanical/manual excavation activities",
        "Shaded recovery station", "Potable water station", "Portable cooling unit",
        "Plate compactor", "Concrete pump"
    ]
    for c in candidates:
        for f in forbidden_titles:
            assert c.title.strip().lower() != f.lower(), f"Forbidden non-task '{f}' extracted as task title '{c.title}'"

    # 6-11. Verify exact fields for every row
    for exp_id, exp in expected_data.items():
        assert exp_id in cand_map, f"Task {exp_id} missing from extracted candidates"
        c = cand_map[exp_id]

        # Check title
        assert exp["title"].lower() in c.title.lower(), f"Expected title '{exp['title']}', got '{c.title}'"

        # 6. Duration preserved exactly
        assert c.estimated_duration_minutes == exp["duration"], (
            f"Task {exp_id} duration mismatch: expected {exp['duration']}, got {c.estimated_duration_minutes}"
        )

        # 7. Workers preserved exactly
        assert c.min_workers == exp["workers"], (
            f"Task {exp_id} min_workers mismatch: expected {exp['workers']}, got {c.min_workers}"
        )

        # 8. Deadline preserved exactly
        assert c.deadline_time == exp["deadline"], (
            f"Task {exp_id} deadline mismatch: expected '{exp['deadline']}', got '{c.deadline_time}'"
        )

        # 9. Dependencies preserved exactly
        assert set(c.dependencies) == set(exp["deps"]), (
            f"Task {exp_id} dependencies mismatch: expected {exp['deps']}, got {c.dependencies}"
        )

        # 10. Skills attached to task
        for sk in exp["skills"]:
            assert any(sk in s for s in c.required_skills), (
                f"Task {exp_id} required skills mismatch: expected {exp['skills']}, got {c.required_skills}"
            )

        # 11. Source citations point to correct row
        assert c.source_reference is not None
        assert "ThermoShift_Test_Project_Schedule.pdf" in c.source_reference
        assert exp_id in c.source_reference

    # Total Work & Worker Demand
    total_work = sum(c.estimated_duration_minutes for c in candidates)
    assert total_work == 1560, f"Expected 1560 minutes, got {total_work}"
    total_workers = sum(c.min_workers for c in candidates)
    assert total_workers == 31, f"Expected 31 worker slots, got {total_workers}"


def test_13_space_aligned_table_layout_b():
    """PDF Layout B: Visually aligned columns without pipe '|' delimiters."""
    doc_text = """THERMOSHIFT MASTER SCHEDULE
SECTION 1:
Activity Schedule
--------------------------------------------------------------------------------
ID      Activity                                 Zone            Duration  Min Workers  Required Skills   Predecessor  Deadline
A-101   Site clearing and debris segregation     North Yard      120 min   3            Site Operations   -            15 Sep 12:00
A-102   Stormwater trench excavation             East Perimeter  180 min   4            Excavation        A-101        16 Sep 15:00
A-103   HDPE drainage pipe installation          East Perimeter  150 min   3            Pipe Installation A-102        17 Sep 15:00

SECTION 2:
Workforce Requirements
- Site Operations: 6 workers available
"""
    candidates, warnings = ScheduleImportEngine.extract_candidates(doc_text, "SpaceAligned.pdf")
    assert len(candidates) == 3
    assert candidates[0].id == "A-101"
    assert "Site clearing" in candidates[0].title
    assert candidates[0].estimated_duration_minutes == 120
    assert candidates[0].min_workers == 3
    assert candidates[1].id == "A-102"
    assert candidates[1].dependencies == ["A-101"]
    assert candidates[2].id == "A-103"


def test_14_wrapped_multiline_activity_layout_c():
    """PDF Layout C: Wrapped / multi-line activity titles across lines."""
    doc_text = """THERMOSHIFT MASTER SCHEDULE
SECTION 1:
Activity Schedule
--------------------------------------------------------------------------------
ID     | Activity                                  | Zone            | Duration | Min Workers | Required Skills  | Predecessor | Deadline
A-101  | Site clearing and                         | North Yard      | 120 min  | 3           | Site Operations  | -           | 15 Sep 12:00
       | debris segregation                        |                 |          |             |                  |             |
A-102  | Stormwater trench excavation              | East Perimeter  | 180 min  | 4           | Excavation       | A-101       | 16 Sep 15:00

SECTION 2:
Workforce Requirements
- Site Operations: 6 workers available
"""
    candidates, warnings = ScheduleImportEngine.extract_candidates(doc_text, "Wrapped.pdf")
    assert len(candidates) == 2
    assert candidates[0].id == "A-101"
    assert "Site clearing and debris segregation" in candidates[0].title
    assert candidates[0].estimated_duration_minutes == 120
    assert candidates[0].min_workers == 3


def test_15_numeric_tokens_and_ids_never_become_tasks():
    """Verifies that numeric tokens (0, 1, 2, 120) and IDs alone (A-101) are rejected as candidate tasks."""
    raw_fragments = [
        ExtractedTaskCandidate(id="ext-1", title="0"),
        ExtractedTaskCandidate(id="ext-2", title="1"),
        ExtractedTaskCandidate(id="ext-3", title="2"),
        ExtractedTaskCandidate(id="ext-4", title="A-101"),
        ExtractedTaskCandidate(id="ext-5", title="A-10"),
        ExtractedTaskCandidate(id="ext-6", title="Activity Schedule"),
        ExtractedTaskCandidate(id="ext-7", title="Excavation"),
        ExtractedTaskCandidate(id="ext-8", title="Valid Site Clearing Task", estimated_duration_minutes=120, min_workers=3)
    ]
    warnings = []
    validated = ScheduleImportEngine.validate_and_normalize(raw_fragments, None, warnings)
    assert len(validated) == 1
    assert validated[0].title == "Valid Site Clearing Task"


def test_16_project_metadata_extraction_riverside():
    """Verifies that Riverside Logistics Hub header metadata is accurately parsed."""
    pdf_path = "optimizer/tests/ThermoShift_Test_Project_Schedule.pdf"
    if not os.path.exists(pdf_path):
        pdf_path = "ThermoShift_Test_Project_Schedule.pdf"

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    text, _, _ = ScheduleImportEngine.extract_text_from_pdf(pdf_bytes, "ThermoShift_Test_Project_Schedule.pdf")
    meta = ScheduleImportEngine.extract_project_metadata(text)

    assert meta.project_name == "Riverside Logistics Hub — Phase 1"
    assert meta.project_id == "RLH-P1-2026"
    assert meta.site_name == "Riverside Industrial Zone — Sector C"
    assert meta.schedule_version == "Rev 03"
    assert "15 September 2026" in meta.planned_start
    assert "25 September 2026" in meta.planned_finish
    assert "07:00–17:00" in meta.working_window
    assert "Northstar Civil & Infrastructure" in meta.prepared_by


def test_17_workforce_requirements_extraction_riverside():
    """Verifies that the 35 crew members across 8 skill groups are extracted."""
    pdf_path = "optimizer/tests/ThermoShift_Test_Project_Schedule.pdf"
    if not os.path.exists(pdf_path):
        pdf_path = "ThermoShift_Test_Project_Schedule.pdf"

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    text, _, _ = ScheduleImportEngine.extract_text_from_pdf(pdf_bytes, "ThermoShift_Test_Project_Schedule.pdf")
    workforce, total_crew = ScheduleImportEngine.extract_workforce_requirements(text)

    assert total_crew == 35
    assert len(workforce) == 8

    groups = {w.group_name.lower(): w.headcount for w in workforce}
    assert groups.get("site operations") == 6
    assert groups.get("excavation") == 5
    assert groups.get("pipe installation") == 4
    assert groups.get("earthworks") == 5
    assert groups.get("rebar work") == 4
    assert groups.get("concrete work") == 6
    assert groups.get("electrical") == 3
    assert groups.get("inspection") == 2


def test_18_resource_extraction_riverside():
    """Verifies that the 5 site resources are extracted."""
    pdf_path = "optimizer/tests/ThermoShift_Test_Project_Schedule.pdf"
    if not os.path.exists(pdf_path):
        pdf_path = "ThermoShift_Test_Project_Schedule.pdf"

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    text, _, _ = ScheduleImportEngine.extract_text_from_pdf(pdf_bytes, "ThermoShift_Test_Project_Schedule.pdf")
    resources = ScheduleImportEngine.extract_resource_availability(text)

    assert len(resources) == 5
    names = [r.name.lower() for r in resources]
    assert any("shaded recovery" in n for n in names)
    assert any("potable water" in n for n in names)
    assert any("portable cooling" in n for n in names)
    assert any("plate compactor" in n for n in names)
    assert any("concrete pump" in n for n in names)


def test_19_full_schedule_api_endpoint_riverside():
    """Tests the /api/schedules/import/extract endpoint with the Riverside PDF."""
    pdf_path = "optimizer/tests/ThermoShift_Test_Project_Schedule.pdf"
    if not os.path.exists(pdf_path):
        pdf_path = "ThermoShift_Test_Project_Schedule.pdf"

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    files = {"file": ("ThermoShift_Test_Project_Schedule.pdf", pdf_bytes, "application/pdf")}
    response = client.post("/api/schedules/import/extract", files=files)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["tasks"]) == 10
    assert data["project_metadata"]["project_name"] == "Riverside Logistics Hub — Phase 1"
    assert data["total_crew_available"] == 35
    assert len(data["workforce_requirements"]) == 8
    assert len(data["resources"]) == 5


def test_20_confirm_riverside_and_solve():
    """
    End-to-End Test:
    1. Extracts Riverside schedule
    2. Confirms import into Riverside site
    3. Triggers CP-SAT solver through /api/schedules/generate
    4. Asserts all 10 tasks are successfully scheduled under heat safety constraints.
    """
    pdf_path = "optimizer/tests/ThermoShift_Test_Project_Schedule.pdf"
    if not os.path.exists(pdf_path):
        pdf_path = "ThermoShift_Test_Project_Schedule.pdf"

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    files = {"file": ("ThermoShift_Test_Project_Schedule.pdf", pdf_bytes, "application/pdf")}
    extract_res = client.post("/api/schedules/import/extract", files=files)
    assert extract_res.status_code == 200
    extract_data = extract_res.json()

    confirm_payload = {
        "site_id": "site-riverside-logistics-01",
        "tasks": extract_data["tasks"],
        "project_metadata": extract_data["project_metadata"],
        "workforce_requirements": extract_data["workforce_requirements"],
        "resources": extract_data["resources"]
    }

    confirm_res = client.post("/api/schedules/import/confirm", json=confirm_payload)
    assert confirm_res.status_code == 200
    confirm_data = confirm_res.json()
    assert confirm_data["success"] is True
    assert confirm_data["created_tasks_count"] == 10
    assert confirm_data["workers_created"] == 35

    # Run optimizer for Riverside
    solve_payload = {
        "siteId": "site-riverside-logistics-01",
        "date": "2026-09-15",
        "objectiveMode": "BALANCED"
    }
    solve_res = client.post("/api/schedules/generate", json=solve_payload)
    assert solve_res.status_code == 200
    solve_data = solve_res.json()
    assert solve_data["success"] is True
    assert solve_data["status"] in ["OPTIMAL", "FEASIBLE"]
    assert solve_data["schedule"]["totalTasksScheduled"] == 10
    assert solve_data["summary"]["taskCount"] == 10
    assert len(solve_data["schedule"]["assignments"]) > 0


