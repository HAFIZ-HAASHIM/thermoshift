-- =====================================================================
-- ThermoShift Database Migration: Initial Schema
-- Migration Version: 20260906000000
-- Description: Core relational schema for heat-aware workforce orchestration
-- =====================================================================

-- 0. Enable UUID Extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. Reference: Skills Taxonomy
-- =====================================================================
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'GENERAL',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 2. Table: Sites
-- =====================================================================
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location_name TEXT NOT NULL,
    latitude NUMERIC(9,6) NOT NULL,
    longitude NUMERIC(9,6) NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    shift_start TIME NOT NULL DEFAULT '07:00:00',
    shift_end TIME NOT NULL DEFAULT '17:00:00',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 3. Table: Workers
-- Note: Physiological and exposure fields stored purely as baseline data.
-- No safety formulas or thresholds hardcoded in the schema.
-- =====================================================================
CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    employee_code TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_acclimatized BOOLEAN NOT NULL DEFAULT true,
    vulnerability_rating TEXT NOT NULL DEFAULT 'LOW' CHECK (vulnerability_rating IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    past_heat_incidents INTEGER NOT NULL DEFAULT 0 CHECK (past_heat_incidents >= 0),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_site_worker_code UNIQUE (site_id, employee_code)
);

-- =====================================================================
-- 4. Table: Worker Skills (Many-to-Many Normalized)
-- =====================================================================
CREATE TABLE IF NOT EXISTS worker_skills (
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level TEXT NOT NULL DEFAULT 'JOURNEYMAN' CHECK (proficiency_level IN ('APPRENTICE', 'JOURNEYMAN', 'EXPERT', 'MASTER')),
    certified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (worker_id, skill_id)
);

-- =====================================================================
-- 5. Table: Tasks
-- =====================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    zone_name TEXT NOT NULL,
    min_workers INTEGER NOT NULL DEFAULT 1 CHECK (min_workers > 0),
    max_workers INTEGER NOT NULL DEFAULT 4 CHECK (max_workers >= min_workers),
    estimated_duration_minutes INTEGER NOT NULL CHECK (estimated_duration_minutes > 0),
    physical_intensity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (physical_intensity IN ('LIGHT', 'MEDIUM', 'HEAVY', 'EXTREME')),
    is_sun_exposed BOOLEAN NOT NULL DEFAULT true,
    earliest_start_time TIME NOT NULL DEFAULT '07:00:00',
    deadline_time TIME NOT NULL DEFAULT '17:00:00',
    priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalized Task Required Skills
CREATE TABLE IF NOT EXISTS task_required_skills (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    min_skill_count INTEGER NOT NULL DEFAULT 1 CHECK (min_skill_count > 0),
    PRIMARY KEY (task_id, skill_id)
);

-- =====================================================================
-- 6. Table: Task Dependencies
-- Direct Directed Acyclic Graph (DAG) pairs.
-- Cycles validation enforced at optimizer / application layer.
-- =====================================================================
CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL DEFAULT 'FINISH_TO_START' CHECK (dependency_type IN ('FINISH_TO_START', 'START_TO_START')),
    lag_minutes INTEGER NOT NULL DEFAULT 0 CHECK (lag_minutes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, depends_on_task_id),
    CONSTRAINT chk_no_self_dependency CHECK (task_id <> depends_on_task_id)
);

-- =====================================================================
-- 7. Table: Resources (Shade, Water, Cooling Capacity)
-- =====================================================================
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('SHADE_STRUCTURE', 'WATER_STATION', 'COOLING_TENT', 'MISTING_FAN', 'INDOOR_BREAKROOM')),
    zone_name TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 8. Table: Weather Records (Input environmental observations)
-- Note: Raw inputs only; WBGT indices calculated dynamically by heat engine.
-- =====================================================================
CREATE TABLE IF NOT EXISTS weather_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    observation_time TIMESTAMPTZ NOT NULL,
    temperature_c NUMERIC(4,2) NOT NULL,
    relative_humidity_pct NUMERIC(5,2) NOT NULL CHECK (relative_humidity_pct >= 0 AND relative_humidity_pct <= 100),
    wind_speed_kmh NUMERIC(5,2) NOT NULL DEFAULT 0.0 CHECK (wind_speed_kmh >= 0),
    solar_radiation_wm2 NUMERIC(6,2),
    direct_sun_exposure BOOLEAN NOT NULL DEFAULT true,
    source TEXT NOT NULL DEFAULT 'SENSOR' CHECK (source IN ('SENSOR', 'FORECAST', 'MANUAL_ENTRY', 'DEMO_SEED')),
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 9. Table: Simulation Runs (What-If Scenarios)
-- =====================================================================
CREATE TABLE IF NOT EXISTS simulation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    scenario_name TEXT NOT NULL,
    objective_mode TEXT NOT NULL DEFAULT 'BALANCED' CHECK (objective_mode IN ('SAFEST', 'BALANCED', 'FASTEST')),
    changed_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_summary JSONB,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 10. Table: Schedules (Generated Work Plans)
-- =====================================================================
CREATE TABLE IF NOT EXISTS schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    schedule_date DATE NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    optimization_mode TEXT NOT NULL DEFAULT 'BALANCED' CHECK (optimization_mode IN ('SAFEST', 'BALANCED', 'FASTEST', 'CUSTOM')),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ACTIVE', 'ARCHIVED')),
    time_slot_interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK (time_slot_interval_minutes > 0),
    total_workers_assigned INTEGER NOT NULL DEFAULT 0,
    total_tasks_completed INTEGER NOT NULL DEFAULT 0,
    total_rest_minutes INTEGER NOT NULL DEFAULT 0,
    solver_status TEXT NOT NULL DEFAULT 'FEASIBLE',
    solver_solve_time_ms NUMERIC(8,2),
    simulation_run_id UUID REFERENCES simulation_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key from simulation_runs to baseline schedule
ALTER TABLE simulation_runs
    ADD COLUMN IF NOT EXISTS baseline_schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL;

-- =====================================================================
-- 11. Table: Schedule Assignments
-- Represents: WHO -> DOES WHAT -> WHERE -> WHEN -> WHEN TO REST
-- =====================================================================
CREATE TABLE IF NOT EXISTS schedule_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    assignment_type TEXT NOT NULL CHECK (assignment_type IN ('WORK', 'REST_SHADE', 'HYDRATION_BREAK', 'STANDBY')),
    zone_name TEXT NOT NULL,
    start_minute INTEGER NOT NULL CHECK (start_minute >= 0),
    end_minute INTEGER NOT NULL CHECK (end_minute > start_minute),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    physical_intensity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (physical_intensity IN ('LIGHT', 'MEDIUM', 'HEAVY', 'EXTREME')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 12. Table: Compliance Logs (Auditable Event History)
-- =====================================================================
CREATE TABLE IF NOT EXISTS compliance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'HEAT_ALERT_TRIGGERED',
        'REST_CYCLE_ENFORCED',
        'SCHEDULE_GENERATED',
        'SCHEDULE_PUBLISHED',
        'SIMULATION_EXECUTED',
        'WORKER_ACCLIMATIZATION_UPDATED',
        'RESOURCE_CAPACITY_CHANGED'
    )),
    description TEXT NOT NULL,
    actor_role TEXT NOT NULL DEFAULT 'SYSTEM',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 13. Performance Indexes
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_workers_site_id ON workers(site_id);
CREATE INDEX IF NOT EXISTS idx_worker_skills_skill_id ON worker_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_tasks_site_id ON tasks(site_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_deps_parent ON task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_resources_site_id ON resources(site_id);
CREATE INDEX IF NOT EXISTS idx_weather_site_time ON weather_records(site_id, observation_time DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_site_date ON schedules(site_id, schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_schedule ON schedule_assignments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_worker ON schedule_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_simulation_runs_site ON simulation_runs(site_id);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_site_time ON compliance_logs(site_id, created_at DESC);

-- =====================================================================
-- 14. Row Level Security (RLS) Configuration
-- Enables site-level isolation foundation while allowing read/write operations
-- scoped to active sites for the hackathon MVP.
-- =====================================================================

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_required_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_logs ENABLE ROW LEVEL SECURITY;

-- Read policies: Public / Authenticated read access for active site entities
CREATE POLICY "Allow read skills to all" ON skills FOR SELECT USING (true);
CREATE POLICY "Allow read sites to all" ON sites FOR SELECT USING (is_active = true);
CREATE POLICY "Allow read workers for active sites" ON workers FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = workers.site_id AND sites.is_active = true)
);
CREATE POLICY "Allow read worker_skills for active workers" ON worker_skills FOR SELECT USING (
    EXISTS (SELECT 1 FROM workers WHERE workers.id = worker_skills.worker_id)
);
CREATE POLICY "Allow read tasks for active sites" ON tasks FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = tasks.site_id AND sites.is_active = true)
);
CREATE POLICY "Allow read task_required_skills" ON task_required_skills FOR SELECT USING (true);
CREATE POLICY "Allow read task_dependencies" ON task_dependencies FOR SELECT USING (true);
CREATE POLICY "Allow read resources for active sites" ON resources FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = resources.site_id AND sites.is_active = true)
);
CREATE POLICY "Allow read weather_records for active sites" ON weather_records FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = weather_records.site_id AND sites.is_active = true)
);
CREATE POLICY "Allow read schedules for active sites" ON schedules FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = schedules.site_id AND sites.is_active = true)
);
CREATE POLICY "Allow read schedule_assignments" ON schedule_assignments FOR SELECT USING (
    EXISTS (SELECT 1 FROM schedules WHERE schedules.id = schedule_assignments.schedule_id)
);
CREATE POLICY "Allow read simulation_runs for active sites" ON simulation_runs FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = simulation_runs.site_id AND sites.is_active = true)
);
CREATE POLICY "Allow read compliance_logs for active sites" ON compliance_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = compliance_logs.site_id AND sites.is_active = true)
);

-- Write policies: Restricted write policies (authenticated or service roles)
CREATE POLICY "Allow insert/update schedules for active sites" ON schedules FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = schedules.site_id AND sites.is_active = true)
);
CREATE POLICY "Allow insert schedule_assignments" ON schedule_assignments FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM schedules WHERE schedules.id = schedule_assignments.schedule_id)
);
CREATE POLICY "Allow insert simulation_runs" ON simulation_runs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = simulation_runs.site_id AND sites.is_active = true)
);
CREATE POLICY "Allow insert compliance_logs" ON compliance_logs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sites WHERE sites.id = compliance_logs.site_id AND sites.is_active = true)
);
