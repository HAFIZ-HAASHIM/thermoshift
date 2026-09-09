"""
ThermoShift - PDF Schedule Import & Structured Extraction Engine (Python)
Phase 5A: Auditable PDF document parsing, Gemini AI structured extraction,
modular 2D table extraction, dependency DAG cycle detection, and Supabase persistence.
"""

import os
import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field
import io

logger = logging.getLogger("thermoshift.importer")

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


class ExtractedTaskCandidate(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    estimated_duration_minutes: Optional[int] = Field(default=None, ge=0)
    min_workers: Optional[int] = Field(default=None, ge=0)
    max_workers: Optional[int] = Field(default=None, ge=0)
    physical_intensity: str = Field(default="MEDIUM")
    required_skills: List[str] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    earliest_start_time: Optional[str] = Field(default=None)
    deadline_time: Optional[str] = Field(default=None)
    zone_name: Optional[str] = Field(default="Sector 1")
    is_sun_exposed: bool = Field(default=True)
    priority: str = Field(default="MEDIUM")
    source_reference: Optional[str] = None
    confidence: float = Field(default=0.95, ge=0.0, le=1.0)
    needs_review: bool = Field(default=False)
    review_reasons: List[str] = Field(default_factory=list)


class ProjectMetadata(BaseModel):
    project_name: Optional[str] = None
    project_id: Optional[str] = None
    site_name: Optional[str] = None
    schedule_version: Optional[str] = None
    planned_start: Optional[str] = None
    planned_finish: Optional[str] = None
    planned_start_date: Optional[str] = None
    planned_finish_date: Optional[str] = None
    working_window: Optional[str] = None
    working_window_start: Optional[str] = "07:00:00"
    working_window_end: Optional[str] = "17:00:00"
    prepared_by: Optional[str] = None
    source_filename: Optional[str] = None


class ExtractedWorkforceGroup(BaseModel):
    group_name: str
    skill_id: str
    headcount: int
    notes: Optional[str] = None


class ExtractedResourceItem(BaseModel):
    name: str
    resource_type: str
    capacity: int
    notes: Optional[str] = None



class FullScheduleExtractionResult(BaseModel):
    filename: str
    page_count: int
    raw_text_length: int
    metadata: ProjectMetadata
    workforce: List[ExtractedWorkforceGroup]
    total_available_crew: int
    resources: List[ExtractedResourceItem]
    tasks: List[ExtractedTaskCandidate]
    warnings: List[str]
    unsupported_elements: List[str] = Field(default_factory=list)


class DocumentLine(BaseModel):
    line: str
    page_number: int
    line_index: int


class ExtractedTableRow(BaseModel):
    page_number: int
    line_index: int
    raw_line: str
    cells: List[str]
    id: Optional[str] = None
    title: Optional[str] = None
    zone: Optional[str] = None
    duration: Optional[str] = None
    workers: Optional[str] = None
    skills: Optional[str] = None
    dependencies: Optional[str] = None
    deadline: Optional[str] = None


class ExtractedTable(BaseModel):
    section_title: str
    page_number: int
    headers: List[str]
    col_positions: Dict[str, int]
    rows: List[ExtractedTableRow]


class DocumentSection(BaseModel):
    title: str
    is_activity_section: bool
    page_number: int
    lines: List[DocumentLine]
    tables: List[ExtractedTable] = Field(default_factory=list)


class ScheduleImportEngine:
    """Server-side PDF extractor and AI structuring service with 2D table parser."""

    @classmethod
    def extract_project_metadata(cls, document_text: str, filename: str = "schedule.pdf") -> ProjectMetadata:
        """Extracts formal project header metadata from Section 0."""
        meta = ProjectMetadata(source_filename=filename)
        m_proj = re.search(r"Project\s*:\s*([^|\n\r]+)", document_text, re.IGNORECASE)
        if m_proj:
            raw_pname = re.sub(r"\s*\|\s*.*$", "", m_proj.group(1)).strip()
            meta.project_name = re.sub(r"\s*[-–—]\s*", " — ", raw_pname)

        m_id = re.search(r"Project\s*ID\s*:\s*([^|\n\r]+)", document_text, re.IGNORECASE)
        if m_id:
            meta.project_id = re.sub(r"\s*\|\s*.*$", "", m_id.group(1)).strip()

        m_site = re.search(r"Site\s*:\s*([^|\n\r]+)", document_text, re.IGNORECASE)
        if m_site:
            raw_sname = re.sub(r"\s*\|\s*.*$", "", m_site.group(1)).strip()
            meta.site_name = re.sub(r"\s*[-–—]\s*", " — ", raw_sname)


        m_ver = re.search(r"Schedule\s*Version\s*:\s*([^|\n\r]+)", document_text, re.IGNORECASE)
        if m_ver:
            meta.schedule_version = re.sub(r"\s*\|\s*.*$", "", m_ver.group(1)).strip()

        m_start = re.search(r"Planned\s*Start\s*:\s*([^|\n\r]+)", document_text, re.IGNORECASE)
        if m_start:
            val = re.sub(r"\s*\|\s*.*$", "", m_start.group(1)).strip()
            meta.planned_start = val
            meta.planned_start_date = val

        m_fin = re.search(r"Planned\s*Finish\s*:\s*([^|\n\r]+)", document_text, re.IGNORECASE)
        if m_fin:
            val = re.sub(r"\s*\|\s*.*$", "", m_fin.group(1)).strip()
            meta.planned_finish = val
            meta.planned_finish_date = val

        m_win = re.search(r"Working\s*Window\s*:\s*([^\n\r|]+)", document_text, re.IGNORECASE)
        if m_win:
            win_str = m_win.group(1).strip()
            meta.working_window = re.sub(r"\s*[-–—]\s*", "–", win_str)
            sub_win = re.search(r"([0-9]{1,2}:[0-9]{2})\s*[-–—]\s*([0-9]{1,2}:[0-9]{2})", win_str)
            if sub_win:
                meta.working_window_start = f"{sub_win.group(1)}:00" if len(sub_win.group(1)) == 5 else f"0{sub_win.group(1)}:00"
                meta.working_window_end = f"{sub_win.group(2)}:00" if len(sub_win.group(2)) == 5 else f"0{sub_win.group(2)}:00"


        m_prep = re.search(r"Prepared\s*By\s*:\s*([^|\n\r]+)", document_text, re.IGNORECASE)
        if m_prep:
            meta.prepared_by = re.sub(r"\s*\|\s*.*$", "", m_prep.group(1)).strip()

        return meta

    @classmethod
    def extract_workforce_requirements(cls, document_text: str) -> Tuple[List[ExtractedWorkforceGroup], int]:
        """Extracts available workforce groups and headcounts from Section 2."""
        groups: List[ExtractedWorkforceGroup] = []
        wf_block = document_text
        wf_match = re.search(
            r"(?:SECTION\s*\d+:?\s*)?Workforce\s*Requirements[\s\S]*?(?=(?:SECTION\s*\d+:?|Resource\s*Availability|Scheduling\s*Notes|$))",
            document_text,
            re.IGNORECASE
        )
        if wf_match:
            wf_block = wf_match.group(0)

        for line in wf_block.splitlines():
            m = re.match(r"^\s*[-*•]?\s*([A-Za-z\s]+?)\s*:\s*(\d+)\s*(?:workers?\s*available|available)?\s*(?:\((.*?)\))?", line)
            if m:
                name = m.group(1).strip()
                if name.lower() not in [
                    "section", "workforce requirements", "resource availability",
                    "scheduling notes", "activity schedule", "planned start", "planned finish"
                ]:
                    count = int(m.group(2))
                    notes = (m.group(3) or "").strip()
                    sk_id = re.sub(r"[^A-Z0-9_]", "", re.sub(r"[\s-]+", "_", name.upper()))
                    groups.append(
                        ExtractedWorkforceGroup(
                            group_name=name,
                            skill_id=sk_id or "GENERAL_LABOR",
                            headcount=count,
                            notes=notes
                        )
                    )
        total_crew = sum(g.headcount for g in groups)
        return groups, total_crew

    @classmethod
    def extract_resource_availability(cls, document_text: str) -> List[ExtractedResourceItem]:
        """Extracts physical resource availability and capacities from Section 3."""
        resources: List[ExtractedResourceItem] = []
        res_block = document_text
        res_match = re.search(
            r"(?:SECTION\s*\d+:?\s*)?Resource\s*Availability[\s\S]*?(?=(?:SECTION\s*\d+:?|Scheduling\s*Notes|$))",
            document_text,
            re.IGNORECASE
        )
        if res_match:
            res_block = res_match.group(0)

        for line in res_block.splitlines():
            m = re.match(r"^\s*[-*•]?\s*([A-Za-z\s]+?)\s*:\s*capacity\s*(\d+)", line, re.IGNORECASE) or re.match(
                r"^\s*[-*•]?\s*([A-Za-z\s]+?)\s*[-:]\s*(\d+)\s*units?", line, re.IGNORECASE
            )
            if m:
                name = m.group(1).strip()
                cap = int(m.group(2))
                rtype = "SHADE_STRUCTURE"
                if "water" in name.lower():
                    rtype = "WATER_STATION"
                elif "cool" in name.lower():
                    rtype = "COOLING_TENT"
                elif "fan" in name.lower() or "mist" in name.lower():
                    rtype = "MISTING_FAN"
                resources.append(
                    ExtractedResourceItem(
                        name=name,
                        resource_type=rtype,
                        capacity=cap,
                        notes=f"{cap} unit{'s' if cap > 1 else ''}"
                    )
                )
        return resources

    @classmethod
    def extract_full_schedule(
        cls,
        pdf_bytes: bytes,
        filename: str,
        available_skills: Optional[List[Dict[str, Any]]] = None
    ) -> FullScheduleExtractionResult:
        """Complete structured PDF extraction returning metadata, workforce, resources, and tasks."""
        text, page_count, warnings = cls.extract_text_from_pdf(pdf_bytes, filename)
        tasks, extraction_warnings = cls.extract_candidates(text, filename, available_skills)
        metadata = cls.extract_project_metadata(text, filename)
        workforce, total_crew = cls.extract_workforce_requirements(text)
        resources = cls.extract_resource_availability(text)

        all_warnings = warnings + extraction_warnings

        return FullScheduleExtractionResult(
            filename=filename,
            page_count=page_count,
            raw_text_length=len(text),
            metadata=metadata,
            workforce=workforce,
            total_available_crew=total_crew,
            resources=resources,
            tasks=tasks,
            warnings=all_warnings,
            unsupported_elements=[]
        )

    @staticmethod
    def extract_text_from_pdf(pdf_bytes: bytes, filename: str) -> Tuple[str, int, List[str]]:
        """Extracts text, page count, and warnings from raw PDF bytes."""
        if not pdf_bytes or len(pdf_bytes) < 20:
            raise ValueError(f"Invalid PDF: '{filename}' contains insufficient data or is empty.")

        if not pdf_bytes.startswith(b"%PDF-"):
            raise ValueError(f"Invalid format: '{filename}' is not a valid PDF document (missing %PDF- header).")

        warnings = []
        if PdfReader is None:
            text = pdf_bytes.decode("latin-1", errors="ignore")
            cleaned_lines = []
            for match in re.finditer(r"\(([^\)]*)\)\s*Tj", text):
                clean_text = match.group(1).replace(r"\(", "(").replace(r"\)", ")")
                if clean_text.strip():
                    cleaned_lines.append(clean_text)
            if cleaned_lines:
                text = "\n".join(cleaned_lines)
            return text, 1, ["pypdf library not loaded; using binary fallback parser."]

        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            page_count = len(reader.pages)
            extracted_pages = []

            for idx, page in enumerate(reader.pages):
                p_text = page.extract_text() or ""
                extracted_pages.append(p_text)

            full_text = "\n".join(extracted_pages).strip()
            if len(re.sub(r"\s+", "", full_text)) < 15:
                warnings.append(
                    "Document contains little or no extractable digital text. If this is a scanned or image-only PDF, please upload a digital text-based export."
                )

            logger.info(f"Extracted {page_count} pages, {len(full_text)} chars from '{filename}'")
            return full_text, page_count, warnings
        except Exception as e:
            raise ValueError(f"Failed to parse PDF '{filename}': {str(e)}")

    @classmethod
    def extract_candidates(
        cls,
        document_text: str,
        filename: str,
        available_skills: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[List[ExtractedTaskCandidate], List[str]]:
        """Extracts candidate tasks using Gemini API if key is set, or deterministic parser."""
        warnings: List[str] = []
        candidates: List[ExtractedTaskCandidate] = []

        sections = cls._segment_document(document_text)
        all_tables: List[ExtractedTable] = []
        for s in sections:
            all_tables.extend(s.tables)

        logger.info(f"[STAGE: EXTRACTION_START] Processing '{filename}' ({len(sections)} sections, {len(all_tables)} tables).")

        # 1. Primary Path: Deterministic 2D and Vertical Table Parser
        candidates = cls._extract_deterministic(sections, all_tables, filename, available_skills)
        logger.info(f"[STAGE: DETERMINISTIC_PARSER] Extracted {len(candidates)} raw candidates.")

        # 2. Secondary Fallback: Gemini AI if deterministic found 0
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not candidates and api_key:
            try:
                logger.info(f"[STAGE: AI_FALLBACK] Calling Gemini API for unstructured layout...")
                candidates = cls._extract_with_gemini(document_text, filename, available_skills, api_key, all_tables)
                logger.info(f"[STAGE: AI_COMPLETED] Gemini returned {len(candidates)} raw candidates.")
            except Exception as e:
                logger.warning(f"Gemini extraction notice ({str(e)}).")
                warnings.append(f"AI online extraction notice: {str(e)}.")

        # Validate DAG & Normalize
        logger.info(f"[STAGE: NORMALIZATION_START] Validating {len(candidates)} candidates...")
        validated_candidates = cls.validate_and_normalize(candidates, available_skills, warnings)
        tot_min = sum(c.estimated_duration_minutes or 0 for c in validated_candidates)
        tot_wrk = sum(c.min_workers or 0 for c in validated_candidates)
        logger.info(f"[STAGE: EXTRACTION_COMPLETE] Final tasks: {len(validated_candidates)} ({tot_min}m / {tot_min/60:.1f}h, {tot_wrk} worker demand).")
        return validated_candidates, warnings

    @classmethod
    def _extract_with_gemini(
        cls,
        document_text: str,
        filename: str,
        available_skills: Optional[List[Dict[str, Any]]],
        api_key: str,
        tables: List[ExtractedTable]
    ) -> List[ExtractedTaskCandidate]:
        import requests
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        skills_str = ", ".join([s.get("id", "") for s in (available_skills or [])]) or (
            "SITE_OPERATIONS, EXCAVATION, PIPE_INSTALLATION, EARTHWORKS, REBAR_WORK, "
            "CONCRETE_WORK, ELECTRICAL, INSPECTION, MASONRY, CARPENTRY, WELDING, "
            "ROOFING, PLUMBING, HEAVY_MACHINERY, SAFETY_INSPECTION, GENERAL_LABOR"
        )

        tables_summary = ""
        if tables:
            t_blocks = []
            for idx, t in enumerate(tables):
                h_str = " | ".join(t.headers)
                r_strs = "\n".join([f"Row: {' | '.join(r.cells)}" for r in t.rows])
                t_blocks.append(f"Table {idx+1} (Section: {t.section_title}, Page {t.page_number}):\nHeaders: {h_str}\n{r_strs}")
            tables_summary = "\n\nDETECTED SCHEDULE TABLES:\n" + "\n\n".join(t_blocks)

        prompt = f"""You are a strict, auditable construction schedule data extraction engine.
Your sole job is to extract genuine work activities/tasks from the project schedule document.

CRITICAL EXTRACTION RULES:
1. ONLY extract activities from the Activity Schedule table / schedule rows.
2. SECTION HEADINGS ARE NOT ACTIVITIES. Never output "Activity Schedule", "Workforce Requirements", "Resource Availability", "Scheduling Notes", "Header / Overview", or similar section titles as activities.
3. SKILL NAMES & WORKFORCE ROLES ARE NOT ACTIVITIES. Never output standalone skill categories ("Excavation", "Pipe Installation", "Rebar Work", "Concrete Work", "Electrical", "Inspection") as tasks.
4. RESOURCE DEFINITIONS ARE NOT ACTIVITIES. Equipment items like "Concrete pump", "Portable cooling unit" are not activities.
5. NUMERIC TOKENS OR IDs ALONE ARE NOT ACTIVITIES. Never output standalone numbers (e.g. "0", "1", "2") or bare IDs (e.g. "A-101") as task titles.
6. THE ROW IS THE PRIMARY UNIT OF EXTRACTION. Keep all attributes (ID, Title, Zone, Duration, Workers, Skills, Dependencies, Deadline) from the same table row together.
7. ZERO FAKE DEFAULTS: If a value is missing from the row, return null for estimated_duration_minutes, min_workers, or deadline_time. Never invent default values.
8. For estimated_duration_minutes: integer minutes (e.g. "120 min" -> 120, "2.5 hrs" -> 150).
9. For min_workers: exact integer worker count from the row.
10. For required_skills: array of trade codes (e.g. ["CONCRETE_WORK"] from catalog: [{skills_str}]).
11. For dependencies: array of predecessor IDs (e.g. ["A-101"]). If predecessor is "-" or "—" or none, provide [].
12. For deadline_time: exact deadline string from document (e.g. "15 Sep 12:00"). If absent, return null.
13. For source_reference: string citing filename, page, and verbatim row snippet.

Filename: {filename}
{tables_summary}

Full Document Text:
{document_text[:35000]}
"""
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "tasks": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "id": {"type": "STRING"},
                                    "title": {"type": "STRING"},
                                    "description": {"type": "STRING", "nullable": True},
                                    "estimated_duration_minutes": {"type": "INTEGER", "nullable": True},
                                    "min_workers": {"type": "INTEGER", "nullable": True},
                                    "max_workers": {"type": "INTEGER", "nullable": True},
                                    "physical_intensity": {"type": "STRING", "enum": ["LIGHT", "MEDIUM", "HEAVY", "EXTREME"]},
                                    "required_skills": {"type": "ARRAY", "items": {"type": "STRING"}},
                                    "dependencies": {"type": "ARRAY", "items": {"type": "STRING"}},
                                    "earliest_start_time": {"type": "STRING", "nullable": True},
                                    "deadline_time": {"type": "STRING", "nullable": True},
                                    "zone_name": {"type": "STRING", "nullable": True},
                                    "is_sun_exposed": {"type": "BOOLEAN"},
                                    "priority": {"type": "STRING", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
                                    "source_reference": {"type": "STRING"}
                                },
                                "required": ["id", "title", "physical_intensity", "required_skills", "dependencies", "is_sun_exposed", "priority"]
                            }
                        }
                    },
                    "required": ["tasks"]
                },
                "temperature": 0.1
            }
        }
        resp = requests.post(url, json=payload, timeout=30)
        if not resp.ok:
            raise RuntimeError(f"Gemini API returned status {resp.status_code}: {resp.text}")

        data = resp.json()
        raw_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        parsed = json.loads(raw_text)
        task_list = parsed if isinstance(parsed, list) else parsed.get("tasks", [])
        return [ExtractedTaskCandidate(**t) for t in task_list]

    @classmethod
    def _extract_deterministic(
        cls,
        sections: List[DocumentSection],
        all_tables: List[ExtractedTable],
        filename: str,
        available_skills: Optional[List[Dict[str, Any]]]
    ) -> List[ExtractedTaskCandidate]:
        candidates: List[ExtractedTaskCandidate] = []

        # 1. First priority: Parse rows directly from detected tables in Activity sections
        for section in sections:
            if not section.is_activity_section:
                continue

            for table in section.tables:
                fallback_idx = 1
                for row in table.rows:
                    cand = cls._convert_table_row_to_candidate(row, filename, available_skills, fallback_idx)
                    if cand:
                        candidates.append(cand)
                        fallback_idx += 1

        # 3. Fallback: Parse structured activity lines (e.g. "1. Formwork & Framing - Duration: 120 mins...")
        if not candidates:
            for section in sections:
                if not section.is_activity_section and len(sections) > 1 and not cls._is_activity_section_title(section.title):
                    continue
                fallback_idx = 1
                for doc_line in section.lines:
                    cand = cls._convert_structured_line_to_candidate(doc_line, filename, available_skills, fallback_idx)
                    if cand:
                        candidates.append(cand)
                        fallback_idx += 1

        return candidates

    @classmethod
    def _convert_structured_line_to_candidate(
        cls,
        doc_line: DocumentLine,
        filename: str,
        available_skills: Optional[List[Dict[str, Any]]],
        fallback_idx: int
    ) -> Optional[ExtractedTaskCandidate]:
        raw_line = doc_line.line.strip()
        if not raw_line or len(raw_line) < 5 or cls.is_invalid_activity_title(raw_line):
            return None

        has_dur = bool(re.search(r"\b(?:duration\s*:\s*)?(\d+(?:\.\d+)?)\s*(?:mins?|minutes?|hrs?|hours?)\b", raw_line, re.IGNORECASE))
        has_work = bool(re.search(r"\b(\d+)\s*(?:workers?|crew|headcount)\b", raw_line, re.IGNORECASE))
        is_numbered = bool(re.match(r"^(?:(?:\d+[\.\)]|[A-Z]+-\d+:?|[-•*])\s+)", raw_line))

        if not ((is_numbered and (has_dur or has_work)) or (has_dur and has_work and "-" in raw_line)):
            return None

        # Extract ID if present
        id_match = re.match(r"^(?:(\d+)[\.\)]|([A-Z]+-\d+):?)\s*(.+)$", raw_line, re.IGNORECASE)
        clean_id = id_match.group(2) if id_match and id_match.group(2) else f"A-{100 + fallback_idx}"
        rest_line = id_match.group(3) if id_match else raw_line

        parts = [p.strip() for p in re.split(r"\s+-\s+|\s*\|\s*", rest_line) if p.strip()]
        if not parts:
            return None

        raw_title = parts[0]
        raw_title = re.sub(r"^(?:(?:\d+[\.\)]|[A-Z]+-\d+:?|[-•*])\s+)+", "", raw_title).strip()
        if not raw_title or cls.is_invalid_activity_title(raw_title):
            return None

        # Parse duration
        duration_minutes = None
        dur_match = re.search(r"(?:duration\s*:\s*)?(\d+(?:\.\d+)?)\s*(mins?|minutes?|hrs?|hours?)?", raw_line, re.IGNORECASE)
        if dur_match:
            val = float(dur_match.group(1))
            unit = (dur_match.group(2) or "min").lower()
            if "hr" in unit or "hour" in unit:
                duration_minutes = int(round(val * 60))
            elif val > 0:
                duration_minutes = int(round(val))

        # Parse workers
        min_workers = None
        work_match = re.search(r"(\d+)\s*workers?", raw_line, re.IGNORECASE) or re.search(r"crew(?:\s*size)?\s*:\s*(\d+)", raw_line, re.IGNORECASE)
        if work_match:
            min_workers = int(work_match.group(1))

        # Parse zone
        zone_name = "Sector 1"
        zone_match = re.search(r"zone\s*:\s*([A-Za-z0-9\s]+?)(?:\s*-\s*|$)", raw_line, re.IGNORECASE)
        if zone_match:
            zone_name = zone_match.group(1).strip()

        # Parse predecessor
        dependencies = []
        pred_match = re.search(r"(?:predecessor|depends\s*on|prereq)\s*:\s*([A-Za-z0-9\s,-]+?)(?:\s*-\s*|$)", raw_line, re.IGNORECASE)
        if pred_match:
            deps_str = pred_match.group(1).strip()
            if deps_str and deps_str not in ["-", "—", "None", "none"]:
                dependencies = [d.strip() for d in re.split(r"[,;]+", deps_str) if d.strip() and d.strip() not in ["-", "—"]]

        # Parse skills
        skills = []
        for sk_id in ["CARPENTRY", "MASONRY", "CONCRETE_WORK", "REBAR_WORK", "EXCAVATION", "PIPE_INSTALLATION", "ELECTRICAL", "WELDING", "ROOFING", "PLUMBING", "SAFETY_INSPECTION", "SITE_OPERATIONS"]:
            if re.search(r"\b" + sk_id.replace("_", r"[\s_-]*") + r"\b", raw_line, re.IGNORECASE):
                skills.append(sk_id)
        if not skills:
            skills = cls._infer_skills_from_title(raw_title)

        reasons = []
        if duration_minutes is None:
            reasons.append("Duration not specified in document.")
        if min_workers is None:
            reasons.append("Worker count requirement not specified.")

        snippet = raw_line[:120].replace('"', "'")
        return ExtractedTaskCandidate(
            id=clean_id,
            title=raw_title,
            description=None,
            estimated_duration_minutes=duration_minutes,
            min_workers=min_workers,
            max_workers=(min_workers + 2) if min_workers else None,
            physical_intensity=cls._infer_intensity(raw_title),
            required_skills=skills or ["GENERAL_LABOR"],
            dependencies=dependencies,
            earliest_start_time=None,
            deadline_time=None,
            zone_name=zone_name,
            is_sun_exposed=not bool(re.search(r"indoor|basement|covered|interior", f"{raw_title} {zone_name}", re.IGNORECASE)),
            priority="MEDIUM",
            source_reference=f"{filename} · Page {doc_line.page_number}: \"{snippet}\"",
            confidence=0.9,
            needs_review=bool(reasons),
            review_reasons=reasons
        )

    @classmethod
    def _segment_document(cls, document_text: str) -> List[DocumentSection]:
        sections: List[DocumentSection] = []
        current_section = DocumentSection(
            title="Header / Overview",
            is_activity_section=False,
            page_number=1,
            lines=[],
            tables=[]
        )

        lines = document_text.split("\n")
        for idx, raw_line in enumerate(lines):
            trimmed = raw_line.strip()
            if not trimmed:
                continue

            is_divider = bool(re.match(r"^[-=_]{3,}$", trimmed))
            is_explicit_heading = bool(re.match(
                r"^(?:(?:\d+[\.\)]|\bSECTION\s*\d+:?|#+)\s*)?(ACTIVITY\s*SCHEDULE|PROJECT\s*ACTIVITIES|WORKFORCE\s*REQUIREMENTS|LABOR\s*AVAILABILITY|RESOURCE\s*AVAILABILITY|EQUIPMENT\s*AVAILABILITY|SCHEDULING\s*NOTES|SAFETY\s*(?:GUIDELINES?|NOTES)|PROJECT\s*TASKS|TASKS?|MILESTONES?|WBS|CONSTRUCTION\s*SCHEDULE)",
                trimmed,
                re.IGNORECASE
            ))

            if is_explicit_heading and not is_divider:
                if current_section.lines:
                    current_section.tables = cls._extract_tables_from_lines(current_section.lines, current_section.title)
                    sections.append(current_section)

                is_act = cls._is_activity_section_title(trimmed)
                current_section = DocumentSection(
                    title=trimmed,
                    is_activity_section=is_act,
                    page_number=1,
                    lines=[],
                    tables=[]
                )
                continue

            current_section.lines.append(DocumentLine(line=raw_line, page_number=1, line_index=idx))

        if current_section.lines:
            current_section.tables = cls._extract_tables_from_lines(current_section.lines, current_section.title)
            sections.append(current_section)

        if len(sections) == 1 and not sections[0].is_activity_section:
            sections[0].is_activity_section = True

        return sections

    @staticmethod
    def _is_activity_section_title(title: str) -> bool:
        lower = title.lower()
        if re.search(r"workforce|labor availability|workers available|resource availability|equipment|cooling|hydration|scheduling notes|safety notes|safety guideline|general notes|legend|personnel", lower):
            return False
        if re.search(r"activity|activities|schedule|tasks|milestone|work breakdown|wbs|phase|construction", lower):
            return True
        return False

    @staticmethod
    def is_invalid_activity_title(title: str) -> bool:
        trimmed = title.strip()
        if not trimmed or len(trimmed) < 3:
            return True

        # Reject purely numeric tokens (e.g. "0", "1", "2", "120", "2026")
        if re.match(r"^\d+$", trimmed):
            return True

        # Reject pure ID strings as titles (e.g. "A-101", "A-10", "T-1")
        if re.match(r"^[A-Z]+-\d+$", trimmed, re.IGNORECASE):
            return True

        # Reject if string contains no alphabetical letters
        if not re.search(r"[A-Za-z]", trimmed):
            return True

        # Reject section headings
        lower = trimmed.lower()
        if re.match(r"^(?:(?:\d+[\.\)]|\bsection\s*\d+:?|#+)\s*)?(activity\s*schedule|workforce\s*requirements|resource\s*availability|scheduling\s*notes|project\s*activities|safety\s*guidelines?|equipment\s*availability|labor\s*availability|header\s*/\s*overview)$", lower):
            return True

        # Reject workforce qualification descriptions (from Section 2)
        if re.match(r"^(trained\s+for|certified\s+for|experience\s+in|licensed\s+electricians|qualified\s+site)\b", lower):
            return True

        # Reject generic table/section metadata labels
        if re.match(r"^(table\s*\d+|section\s*\d+|overview|legend|personnel|resource\s*notes)$", lower):
            return True

        return False

    @classmethod
    def _extract_tables_from_lines(
        cls,
        lines: List[DocumentLine],
        section_title: str
    ) -> List[ExtractedTable]:
        tables: List[ExtractedTable] = []
        header_idx = -1
        col_positions: Dict[str, int] = {}
        headers: List[str] = []
        delimiter = "|"
        col_ranges = []

        for i, item in enumerate(lines):
            l = item.line.strip()
            has_id = bool(re.search(r"\b(id|task\s*id|act\s*id|wbs|code|item|no\.?)\b", l, re.IGNORECASE))
            has_act = bool(re.search(r"\b(activity|task|task\s*name|activity\s*name|description|work\s*description|title)\b", l, re.IGNORECASE))
            has_dur = bool(re.search(r"\b(duration|dur|time|hours?|mins?)\b", l, re.IGNORECASE))
            has_workers = bool(re.search(r"\b(min\s*workers?|workers?|crew|labor|headcount)\b", l, re.IGNORECASE))
            has_skills = bool(re.search(r"\b(required\s*skills?|skills?|trade|craft)\b", l, re.IGNORECASE))
            has_pred = bool(re.search(r"\b(predecessor|predecessors|pred|dependencies|depends\s*on|prereq)\b", l, re.IGNORECASE))
            has_deadline = bool(re.search(r"\b(deadline|due\s*date|target\s*end|finish\s*date)\b", l, re.IGNORECASE))

            matches = sum([has_id, has_act, has_dur, has_workers, has_skills, has_pred, has_deadline])
            if matches >= 2:
                header_idx = i
                raw_header = lines[i].line

                if "|" in raw_header:
                    delimiter = "|"
                    headers = [p.strip() for p in raw_header.split("|")]
                    col_positions = cls._map_header_columns(headers)
                elif "\t" in raw_header:
                    delimiter = "\t"
                    headers = [p.strip() for p in raw_header.split("\t")]
                    col_positions = cls._map_header_columns(headers)
                else:
                    space_headers = [p.strip() for p in re.split(r"\s{2,}", raw_header) if p.strip()]
                    if len(space_headers) >= 3:
                        delimiter = "space"
                        headers = space_headers
                        col_positions = cls._map_header_columns(headers)
                        col_ranges = cls._compute_column_ranges(raw_header, headers, col_positions)
                    else:
                        header_idx = -1
                        break
                break

        if header_idx != -1:
            rows: List[ExtractedTableRow] = []
            current_row: Optional[ExtractedTableRow] = None

            for i in range(header_idx + 1, len(lines)):
                item = lines[i]
                line_str = item.line.strip()

                if re.match(r"^[-=_|\s]+$", line_str):
                    continue

                if re.match(r"^(?:\d+[\.\)]|\bSECTION\s*\d+:?|#+)\s*[A-Za-z]", line_str) and "|" not in line_str and "\t" not in line_str:
                    break

                line_clean = re.sub(r"\s*(?:SECTION\s*\d+:?|#+.*)$", "", line_str, flags=re.IGNORECASE).strip()

                cells: List[str] = []
                if delimiter == "|" and "|" in line_clean:
                    cells = [re.sub(r"\s*(?:SECTION\s*\d+:?|#+.*)$", "", c, flags=re.IGNORECASE).strip() for c in line_clean.split("|")]
                elif delimiter == "\t" and "\t" in line_clean:
                    cells = [re.sub(r"\s*(?:SECTION\s*\d+:?|#+.*)$", "", c, flags=re.IGNORECASE).strip() for c in line_clean.split("\t")]
                elif delimiter == "space" and col_ranges:
                    cells = [
                        re.sub(r"\s*(?:SECTION\s*\d+:?|#+.*)$", "", item.line[min(r["start"], len(item.line)):min(r["end"], len(item.line))], flags=re.IGNORECASE).strip()
                        for r in col_ranges
                    ]
                elif "|" in line_clean:
                    cells = [re.sub(r"\s*(?:SECTION\s*\d+:?|#+.*)$", "", c, flags=re.IGNORECASE).strip() for c in line_clean.split("|")]
                else:
                    cells = [re.sub(r"\s*(?:SECTION\s*\d+:?|#+.*)$", "", c, flags=re.IGNORECASE).strip() for c in re.split(r"\s{2,}", line_clean) if c.strip()]

                def get_col(key: str) -> Optional[str]:
                    if key in col_positions and col_positions[key] < len(cells):
                        val = re.sub(r"\s*(?:SECTION\s*\d+:?|#+.*)$", "", cells[col_positions[key]], flags=re.IGNORECASE).strip()
                        return val if val and val != "-" and val != "—" else None
                    return None

                raw_id = get_col("id") or (cells[0] if len(cells) > 0 else None)
                raw_title = get_col("title") or (cells[1] if len(cells) > 1 else None)

                is_new_row = bool(raw_id and re.match(r"^[A-Z0-9_-]+$", raw_id) and raw_title and len(raw_title) >= 2)

                if is_new_row:
                    if current_row:
                        rows.append(current_row)

                    current_row = ExtractedTableRow(
                        page_number=item.page_number,
                        line_index=item.line_index,
                        raw_line=item.line,
                        cells=cells,
                        id=raw_id,
                        title=raw_title,
                        zone=get_col("zone") or (cells[2] if len(cells) > 2 else None),
                        duration=get_col("duration") or (cells[3] if len(cells) > 3 else None),
                        workers=get_col("workers") or (cells[4] if len(cells) > 4 else None),
                        skills=get_col("skills") or (cells[5] if len(cells) > 5 else None),
                        dependencies=get_col("dependencies") or (cells[6] if len(cells) > 6 else None),
                        deadline=get_col("deadline") or (cells[7] if len(cells) > 7 else None)
                    )
                elif current_row and line_str:
                    if raw_title:
                        current_row.title = f"{current_row.title} {raw_title}".strip()
                    elif len(cells) > 0 and len(cells[0]) > 1:
                        current_row.title = f"{current_row.title} {cells[0]}".strip()
                    current_row.raw_line = f"{current_row.raw_line} {item.line}"

            if current_row:
                rows.append(current_row)

            if rows:
                tables.append(ExtractedTable(
                    section_title=section_title,
                    page_number=lines[header_idx].page_number if lines else 1,
                    headers=headers,
                    col_positions=col_positions,
                    rows=rows
                ))
        else:
            vert_table = cls._extract_vertical_token_table(lines, section_title)
            if vert_table and vert_table.rows:
                tables.append(vert_table)

        return tables

    @classmethod
    def _extract_vertical_token_table(
        cls,
        lines: List[DocumentLine],
        section_title: str
    ) -> Optional[ExtractedTable]:
        raw_tokens = [l.line.strip() for l in lines if l.line.strip()]
        header_keywords = {"id", "activity", "zone", "duration", "min workers", "workers", "required skills", "skills", "predecessor", "predecessors", "deadline", "due date"}

        non_header_lines = [l for l in lines if l.line.strip().lower() not in header_keywords and not re.match(r"^[-=_]{3,}$", l.line.strip())]

        norm_items: List[DocumentLine] = []
        i = 0
        while i < len(non_header_lines):
            cur = non_header_lines[i]
            cur_text = cur.line.strip()
            if (
                re.match(r"^[A-Z]+-\d+$", cur_text, re.IGNORECASE)
                and i + 1 < len(non_header_lines)
                and re.match(r"^\d+$", non_header_lines[i + 1].line.strip())
                and len(non_header_lines[i + 1].line.strip()) <= 2
            ):
                combined = f"{cur_text}{non_header_lines[i + 1].line.strip()}"
                norm_items.append(DocumentLine(line=combined, page_number=cur.page_number, line_index=cur.line_index))
                i += 2
            else:
                norm_items.append(cur)
                i += 1

        rows: List[ExtractedTableRow] = []
        k = 0
        while k < len(norm_items):
            item = norm_items[k]
            id_match = re.match(r"^([A-Z]+-\d{3,})$", item.line.strip(), re.IGNORECASE)
            if id_match:
                task_id = id_match.group(1)
                k += 1

                dur_idx = -1
                for j in range(k, min(k + 10, len(norm_items))):
                    if re.search(r"\b\d+\s*(?:mins?|minutes?|hrs?|hours?)\b", norm_items[j].line.strip(), re.IGNORECASE):
                        dur_idx = j
                        break

                if dur_idx != -1:
                    pre_dur_tokens = [it.line.strip() for it in norm_items[k:dur_idx]]
                    raw_title = f"Task {task_id}"
                    zone: Optional[str] = None
                    if len(pre_dur_tokens) >= 2:
                        zone = pre_dur_tokens[-1]
                        raw_title = " ".join(pre_dur_tokens[:-1])
                    elif len(pre_dur_tokens) == 1:
                        raw_title = pre_dur_tokens[0]

                    dur_str = norm_items[dur_idx].line.strip()
                    workers_str: Optional[str] = None
                    skills_str: Optional[str] = None
                    deps_str: Optional[str] = None
                    deadline_str: Optional[str] = None

                    ptr = dur_idx + 1
                    if ptr < len(norm_items) and re.match(r"^\d+$", norm_items[ptr].line.strip()):
                        workers_str = norm_items[ptr].line.strip()
                        ptr += 1

                    if ptr < len(norm_items) and not re.match(r"^[A-Z]+-\d{3,}$", norm_items[ptr].line.strip(), re.IGNORECASE) and not re.search(r"\b(?:Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|\d{1,2}:\d{2})\b", norm_items[ptr].line.strip(), re.IGNORECASE):
                        skills_str = norm_items[ptr].line.strip()
                        ptr += 1

                    if ptr < len(norm_items):
                        tok = norm_items[ptr].line.strip()
                        if tok in ["-", "—", ""]:
                            ptr += 1
                        elif re.match(r"^[A-Z]+-\d{3,}$", tok, re.IGNORECASE):
                            if tok != task_id:
                                deps_str = tok
                            ptr += 1

                    if ptr < len(norm_items) and re.search(r"\b(?:Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|\d{1,2}:\d{2})\b", norm_items[ptr].line.strip(), re.IGNORECASE):
                        deadline_str = norm_items[ptr].line.strip()
                        ptr += 1

                    rows.append(ExtractedTableRow(
                        page_number=item.page_number,
                        line_index=item.line_index,
                        raw_line=f"{task_id} | {raw_title} | {zone or ''} | {dur_str} | {workers_str or ''} | {skills_str or ''} | {deps_str or ''} | {deadline_str or ''}",
                        cells=[task_id, raw_title, zone or "", dur_str, workers_str or "", skills_str or "", deps_str or "", deadline_str or ""],
                        id=task_id,
                        title=raw_title,
                        zone=zone,
                        duration=dur_str,
                        workers=workers_str,
                        skills=skills_str,
                        dependencies=deps_str,
                        deadline=deadline_str
                    ))
                    k = ptr
                    continue
            k += 1

        if rows:
            return ExtractedTable(
                section_title=section_title,
                page_number=lines[0].page_number if lines else 1,
                headers=["ID", "Activity", "Zone", "Duration", "Min Workers", "Required Skills", "Predecessor", "Deadline"],
                col_positions={"id": 0, "title": 1, "zone": 2, "duration": 3, "workers": 4, "skills": 5, "dependencies": 6, "deadline": 7},
                rows=rows
            )
        return None

    @staticmethod
    def _map_header_columns(headers: List[str]) -> Dict[str, int]:
        col_positions = {}
        for c_idx, part in enumerate(headers):
            p_low = part.lower()
            if re.match(r"^(id|task\s*id|act\s*id|wbs|code|item|no\.?)$", p_low): col_positions["id"] = c_idx
            elif re.match(r"^(activity|task|task\s*name|activity\s*name|description|work\s*description|title)$", p_low): col_positions["title"] = c_idx
            elif re.match(r"^(zone|location|area|sector|grid)$", p_low): col_positions["zone"] = c_idx
            elif re.match(r"^(duration|dur|time|est\.?\s*duration|hours?|mins?)$", p_low): col_positions["duration"] = c_idx
            elif re.match(r"^(min\s*workers?|workers?|crew|labor|headcount)$", p_low): col_positions["workers"] = c_idx
            elif re.match(r"^(required\s*skills?|skills?|trade|craft|specialty)$", p_low): col_positions["skills"] = c_idx
            elif re.match(r"^(predecessor|predecessors|pred|dependencies|depends\s*on|prereq)$", p_low): col_positions["dependencies"] = c_idx
            elif re.match(r"^(deadline|due\s*date|target\s*end|finish\s*date|late\s*finish)$", p_low): col_positions["deadline"] = c_idx
        return col_positions

    @staticmethod
    def _compute_column_ranges(header_line: str, headers: List[str], col_positions: Dict[str, int]) -> List[Dict[str, Any]]:
        ranges = []
        keys = list(col_positions.keys())
        for idx, h in enumerate(headers):
            start = header_line.find(h)
            if start == -1:
                continue
            next_h = headers[idx + 1] if idx + 1 < len(headers) else None
            end = header_line.find(next_h, start + len(h)) if next_h else len(header_line)
            key = next((k for k, pos in col_positions.items() if pos == idx), f"col_{idx}")
            ranges.append({"key": key, "start": start, "end": end})
        return ranges

    @classmethod
    def _convert_table_row_to_candidate(
        cls,
        row: ExtractedTableRow,
        filename: str,
        available_skills: Optional[List[Dict[str, Any]]],
        fallback_idx: int
    ) -> Optional[ExtractedTaskCandidate]:
        raw_title = (row.title or "").strip()
        raw_title = re.sub(r"\s*(?:SECTION\s*\d+:?|#+.*)$", "", raw_title, flags=re.IGNORECASE).strip()
        if not raw_title or len(raw_title) < 3 or cls.is_invalid_activity_title(raw_title):
            return None

        raw_id = (row.id or "").strip()
        clean_id = raw_id if raw_id and raw_id != "-" and raw_id != "—" else f"A-{100 + fallback_idx}"

        raw_zone = (row.zone or "").strip()
        zone_name = raw_zone if raw_zone and raw_zone != "-" and raw_zone != "—" else "Sector 1"

        duration_minutes: Optional[int] = None
        raw_dur = (row.duration or "").strip()
        if raw_dur and raw_dur != "-" and raw_dur != "—":
            min_m = re.search(r"(\d+)\s*(?:mins?|minutes?)?", raw_dur, re.IGNORECASE)
            hr_m = re.search(r"(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)", raw_dur, re.IGNORECASE)
            day_m = re.search(r"(\d+(?:\.\d+)?)\s*(?:days?)", raw_dur, re.IGNORECASE)
            if hr_m: duration_minutes = round(float(hr_m.group(1)) * 60)
            elif day_m: duration_minutes = round(float(day_m.group(1)) * 480)
            elif min_m: duration_minutes = int(min_m.group(1))

        min_workers: Optional[int] = None
        raw_w = (row.workers or "").strip()
        if raw_w and raw_w != "-" and raw_w != "—":
            w_m = re.search(r"(\d+)", raw_w)
            if w_m: min_workers = int(w_m.group(1))

        raw_skills = (row.skills or "").strip()
        required_skills = cls._normalize_skill_string(raw_skills)

        raw_pred = (row.dependencies or "").strip()
        dependencies: List[str] = []
        if raw_pred and raw_pred != "-" and raw_pred != "—" and not re.match(r"^(none|n/a|nil)$", raw_pred, re.IGNORECASE):
            dependencies = [p.strip() for p in re.split(r"[,;&/]+", raw_pred) if p.strip()]

        raw_deadline = (row.deadline or "").strip()
        raw_deadline = re.sub(r"\s*(?:SECTION\s*\d+:?|#+.*)$", "", raw_deadline, flags=re.IGNORECASE).strip()
        deadline_time: Optional[str] = None
        if raw_deadline and raw_deadline != "-" and raw_deadline != "—" and not re.match(r"^(none|n/a|nil)$", raw_deadline, re.IGNORECASE):
            deadline_time = raw_deadline

        snippet = row.raw_line[:120] + ("..." if len(row.raw_line) > 120 else "")
        reasons = []
        if duration_minutes is None:
            reasons.append("Duration not specified in document.")
        if min_workers is None:
            reasons.append("Worker count requirement not specified.")

        return ExtractedTaskCandidate(
            id=clean_id,
            title=raw_title,
            description=None,
            estimated_duration_minutes=duration_minutes,
            min_workers=min_workers,
            max_workers=min_workers + 2 if min_workers else None,
            physical_intensity=cls._infer_intensity(f"{raw_title} {raw_skills}"),
            required_skills=required_skills,
            dependencies=dependencies,
            earliest_start_time=None,
            deadline_time=deadline_time,
            zone_name=zone_name,
            is_sun_exposed=not bool(re.search(r"indoor|basement|covered|interior", f"{raw_title} {zone_name}", re.IGNORECASE)),
            priority="MEDIUM",
            source_reference=f"{filename} · Page {row.page_number}: \"{snippet}\"",
            confidence=0.95,
            needs_review=bool(reasons),
            review_reasons=reasons
        )

    @classmethod
    def _normalize_skill_string(cls, raw_skills: str) -> List[str]:
        if not raw_skills or raw_skills == "-" or raw_skills == "—" or re.match(r"^(none|n/a)$", raw_skills, re.IGNORECASE):
            return ["GENERAL_LABOR"]

        tokens = [s.strip() for s in re.split(r"[,;&/]+", raw_skills) if s.strip()]
        result = []
        for tok in tokens:
            norm = re.sub(r"[^A-Z0-9_]", "", re.sub(r"[\s-]+", "_", tok.upper()))
            if norm:
                result.append(norm)
        return list(dict.fromkeys(result)) if result else ["GENERAL_LABOR"]

    @staticmethod
    def _infer_intensity(text: str) -> str:
        if re.search(r"concrete|pour|manual excavat|trench|heavy steel|demolition|compaction", text, re.IGNORECASE):
            return "HEAVY"
        if re.search(r"inspection|supervision|testing|survey|audit|gate setup", text, re.IGNORECASE):
            return "LIGHT"
        return "MEDIUM"

    @classmethod
    def validate_and_normalize(
        cls,
        candidates: List[ExtractedTaskCandidate],
        available_skills: Optional[List[Dict[str, Any]]],
        warnings: List[str]
    ) -> List[ExtractedTaskCandidate]:
        valid_skills = set([s.get("id", "").upper() for s in (available_skills or []) if s.get("id")])
        validated: List[ExtractedTaskCandidate] = []
        seen_titles = set()

        for idx, cand in enumerate(candidates):
            t_title = cand.title.strip()
            if cls.is_invalid_activity_title(t_title):
                continue

            # Check if candidate is just a bare trade/skill name without duration/workers
            lower_t = t_title.lower()
            if re.match(r"^(excavation|pipe\s*installation|rebar\s*work|concrete\s*work|electrical|inspection|site\s*operations|masonry|carpentry|welding|roofing|plumbing)$", lower_t):
                if cand.estimated_duration_minutes is None and cand.min_workers is None:
                    continue

            reasons = list(cand.review_reasons)
            if t_title.lower() in seen_titles:
                reasons.append(f"Duplicate task title '{t_title}'. Consider differentiating.")
            seen_titles.add(t_title.lower())

            # Durations: Preserve None without fake defaults
            dur = cand.estimated_duration_minutes
            if dur is None or dur <= 0:
                dur = None
                if not any("Duration" in r for r in reasons):
                    reasons.append("Duration not specified in document.")
            elif dur > 600:
                reasons.append("Duration exceeds standard 10-hour shift limit.")

            # Workers: Preserve None without fake defaults
            min_w = cand.min_workers
            if min_w is None or min_w <= 0:
                min_w = None
                if not any("Worker count" in r for r in reasons):
                    reasons.append("Worker count requirement not specified.")
            max_w = cand.max_workers or (min_w + 2 if min_w else None)

            # Skills
            norm_skills = []
            for sk in cand.required_skills:
                sk_up = re.sub(r"[\s-]+", "_", sk.strip().upper())
                norm_skills.append(sk_up or "GENERAL_LABOR")
            if not norm_skills:
                norm_skills.append("GENERAL_LABOR")

            # Check self-dependency
            clean_deps = []
            for d in cand.dependencies:
                if d == cand.id or d.lower() == cand.title.lower():
                    reasons.append("Self-dependency removed.")
                else:
                    clean_deps.append(d)

            cand.title = t_title
            cand.estimated_duration_minutes = dur
            cand.min_workers = min_w
            cand.max_workers = max_w
            cand.required_skills = list(dict.fromkeys(norm_skills))
            cand.dependencies = clean_deps
            cand.needs_review = bool(reasons) or cand.needs_review
            cand.review_reasons = reasons
            validated.append(cand)

        # Topological cycle check
        cls._detect_cycles(validated, warnings)
        return validated

    @classmethod
    def _detect_cycles(cls, tasks: List[ExtractedTaskCandidate], warnings: List[str]):
        task_map = {t.id: t for t in tasks}
        for t in tasks:
            task_map[t.title.lower()] = t

        adj: Dict[str, List[str]] = {t.id: [] for t in tasks}
        for t in tasks:
            clean_deps = []
            for dep in t.dependencies:
                if dep == t.id or dep.lower() == t.title.lower():
                    t.needs_review = True
                    t.review_reasons.append("Self-dependency detected and removed.")
                    continue
                clean_deps.append(dep)
                target = task_map.get(dep) or task_map.get(dep.lower())
                if target and target.id in adj:
                    adj[target.id].append(t.id)
            t.dependencies = clean_deps

        visited: Dict[str, int] = {t.id: 0 for t in tasks}  # 0=unvisited, 1=visiting, 2=visited

        def dfs(curr_id: str, path: List[str]) -> bool:
            visited[curr_id] = 1
            path.append(curr_id)
            for neighbor in adj.get(curr_id, []):
                if visited.get(neighbor) == 1:
                    cycle = path + [neighbor]
                    cycle_str = " -> ".join([task_map.get(i, ExtractedTaskCandidate(id=i, title=i)).title for i in cycle])
                    warnings.append(f"Circular dependency detected: {cycle_str}")
                    for cid in cycle:
                        if cid in task_map:
                            task_map[cid].needs_review = True
                            task_map[cid].review_reasons.append(f"Part of circular dependency loop: {cycle_str}")
                    return True
                if visited.get(neighbor) == 0:
                    if dfs(neighbor, path):
                        return True
            path.pop()
            visited[curr_id] = 2
            return False

        for t in tasks:
            if visited[t.id] == 0:
                dfs(t.id, [])
