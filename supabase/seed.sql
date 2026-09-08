-- =====================================================================
-- ThermoShift Database Seed Data (Reference / Offline Demo Dataset)
-- Note: The normal application workflow does NOT depend on seed.sql.
-- Users configure worksites directly through the UI. This file serves
-- as a reference dataset and offline testing fixture.
-- Scenario: Apex High-Rise Commercial Construction Site (Phoenix, AZ)
-- =====================================================================

-- 1. Insert Reference Skills
INSERT INTO skills (id, name, category, description) VALUES
('CARPENTRY', 'Structural Carpentry & Framing', 'CONSTRUCTION', 'Formwork, framing, scaffolding, and wooden structural elements'),
('ELECTRICAL', 'Commercial Electrical & Conduit', 'ELECTRICAL', 'Conduit routing, high/low voltage cabling, and panel wiring'),
('MASONRY', 'Concrete & Masonry', 'CIVIL', 'Rebar tying, concrete pouring, block laying, and finishing'),
('HEAVY_MACHINERY', 'Heavy Equipment Operation', 'MACHINERY', 'Crane, excavator, forklift, and skid-steer operation'),
('GENERAL_LABOR', 'General Site Labor', 'LABOR', 'Material transport, site prep, manual excavation, and support'),
('WELDING', 'Structural Welding & Fitting', 'METALWORK', 'Arc/MIG/TIG structural welding, torch cutting, and fitting'),
('ROOFING', 'Commercial Roofing & Waterproofing', 'ROOFING', 'Membrane installation, flashing, torch-down waterproofing'),
('PLUMBING', 'Piping & Drainage Systems', 'MECHANICAL', 'Pipe installation, pressure testing, and drainage layout'),
('SAFETY_INSPECTION', 'Site Safety & Quality Control', 'SAFETY', 'Safety protocol review, hazard identification, and quality audit')
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Demo Site (Fixed UUID for reliable demo access)
INSERT INTO sites (id, name, location_name, latitude, longitude, timezone, shift_start, shift_end, is_active) VALUES
('a0000000-0000-0000-0000-000000000001', 'Apex Commercial Tower - Phase 2', 'Phoenix, AZ (Sector 4B)', 33.448376, -112.074036, 'America/Phoenix', '07:00:00', '17:00:00', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Exactly 22 Workers
INSERT INTO workers (id, site_id, employee_code, name, role, is_active, is_acclimatized, vulnerability_rating, past_heat_incidents) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'EMP-01', 'Carlos Ramirez', 'Lead Mason', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'EMP-02', 'Marcus Vance', 'Structural Welder', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'EMP-03', 'David Kim', 'Master Carpenter', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'EMP-04', 'Elena Rostova', 'Journeyman Electrician', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'EMP-05', 'James Thornton', 'Lead Roofer', true, true, 'MEDIUM', 1),
('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'EMP-06', 'Javier Ortiz', 'Concrete Specialist', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'EMP-07', 'Tariq Al-Mansoor', 'Certified Welder', true, false, 'HIGH', 0),
('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'EMP-08', 'Brian O’Connor', 'Framing Carpenter', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'EMP-09', 'Mateo Morales', 'General Laborer', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'EMP-10', 'Samuel Washington', 'Senior Electrician', true, true, 'MEDIUM', 0),
('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'EMP-11', 'Liam Gallagher', 'Roofer / Waterproofer', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'EMP-12', 'Kenji Takahashi', 'Equipment Operator', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'EMP-13', 'Diego Alvarez', 'Mason & Rebar Tech', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000001', 'EMP-14', 'Aaron Chen', 'Safety Inspector & QC', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000001', 'EMP-15', 'Noah Miller', 'Formwork Carpenter', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000001', 'EMP-16', 'Zackary Taylor', 'General Laborer', true, false, 'HIGH', 0),
('b0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000001', 'EMP-17', 'Gabriel Santos', 'Welder Apprentice', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000001', 'EMP-18', 'Hassan Bakari', 'Commercial Plumber', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000001', 'EMP-19', 'Anthony Russo', 'General Laborer', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001', 'EMP-20', 'William Scott', 'Heavy Equipment Operator', true, true, 'MEDIUM', 0),
('b0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001', 'EMP-21', 'Rodrigo Silva', 'Concrete Finisher', true, true, 'LOW', 0),
('b0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000001', 'EMP-22', 'Tyler Brooks', 'General Laborer', true, true, 'LOW', 0)
ON CONFLICT (id) DO NOTHING;

-- 4. Insert Worker Skill Associations
INSERT INTO worker_skills (worker_id, skill_id, proficiency_level) VALUES
('b0000000-0000-0000-0000-000000000001', 'MASONRY', 'EXPERT'),
('b0000000-0000-0000-0000-000000000001', 'GENERAL_LABOR', 'MASTER'),
('b0000000-0000-0000-0000-000000000002', 'WELDING', 'EXPERT'),
('b0000000-0000-0000-0000-000000000002', 'SAFETY_INSPECTION', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000003', 'CARPENTRY', 'MASTER'),
('b0000000-0000-0000-0000-000000000003', 'GENERAL_LABOR', 'EXPERT'),
('b0000000-0000-0000-0000-000000000004', 'ELECTRICAL', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000005', 'ROOFING', 'EXPERT'),
('b0000000-0000-0000-0000-000000000005', 'GENERAL_LABOR', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000006', 'MASONRY', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000006', 'GENERAL_LABOR', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000007', 'WELDING', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000008', 'CARPENTRY', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000009', 'GENERAL_LABOR', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000010', 'ELECTRICAL', 'EXPERT'),
('b0000000-0000-0000-0000-000000000011', 'ROOFING', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000012', 'HEAVY_MACHINERY', 'EXPERT'),
('b0000000-0000-0000-0000-000000000013', 'MASONRY', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000014', 'SAFETY_INSPECTION', 'EXPERT'),
('b0000000-0000-0000-0000-000000000014', 'ELECTRICAL', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000015', 'CARPENTRY', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000016', 'GENERAL_LABOR', 'APPRENTICE'),
('b0000000-0000-0000-0000-000000000017', 'WELDING', 'APPRENTICE'),
('b0000000-0000-0000-0000-000000000018', 'PLUMBING', 'EXPERT'),
('b0000000-0000-0000-0000-000000000019', 'GENERAL_LABOR', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000020', 'HEAVY_MACHINERY', 'MASTER'),
('b0000000-0000-0000-0000-000000000021', 'MASONRY', 'JOURNEYMAN'),
('b0000000-0000-0000-0000-000000000022', 'GENERAL_LABOR', 'JOURNEYMAN')
ON CONFLICT (worker_id, skill_id) DO NOTHING;

-- 5. Insert Exactly 5 Construction Tasks
INSERT INTO tasks (id, site_id, title, description, zone_name, min_workers, max_workers, estimated_duration_minutes, physical_intensity, is_sun_exposed, earliest_start_time, deadline_time, priority, status) VALUES
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Foundation Footing & Rebar Tying', 'Tie steel rebar grids and prepare forms for ground-level foundation slab', 'Foundation Pit A', 3, 5, 180, 'HEAVY', true, '07:00:00', '13:00:00', 'CRITICAL', 'PENDING'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Structural Steel Column Welding', 'High-heat arc welding on primary structural load columns', 'Tower Grid B', 2, 4, 120, 'EXTREME', true, '08:00:00', '14:00:00', 'HIGH', 'PENDING'),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Perimeter Formwork & Decking', 'Erect and secure perimeter wood formwork and safety rails on elevated deck', 'Level 2 Perimeter', 3, 5, 150, 'MEDIUM', true, '07:30:00', '15:00:00', 'MEDIUM', 'PENDING'),
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Main Electrical Conduit Run', 'Pull and clamp commercial electrical conduit through shaded interior utility corridors', 'Basement Vault', 2, 3, 90, 'LIGHT', false, '08:00:00', '16:00:00', 'LOW', 'PENDING'),
('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Roof Membrane & Flashing Sealing', 'Roll waterproof membrane and seal metal flashing on rooftop surface', 'Rooftop Deck North', 3, 4, 120, 'HEAVY', true, '09:00:00', '16:30:00', 'HIGH', 'PENDING')
ON CONFLICT (id) DO NOTHING;

-- Task Skill Requirements
INSERT INTO task_required_skills (task_id, skill_id, min_skill_count) VALUES
('c0000000-0000-0000-0000-000000000001', 'MASONRY', 2),
('c0000000-0000-0000-0000-000000000001', 'GENERAL_LABOR', 1),
('c0000000-0000-0000-0000-000000000002', 'WELDING', 2),
('c0000000-0000-0000-0000-000000000003', 'CARPENTRY', 2),
('c0000000-0000-0000-0000-000000000003', 'GENERAL_LABOR', 1),
('c0000000-0000-0000-0000-000000000004', 'ELECTRICAL', 2),
('c0000000-0000-0000-0000-000000000005', 'ROOFING', 2),
('c0000000-0000-0000-0000-000000000005', 'GENERAL_LABOR', 1)
ON CONFLICT (task_id, skill_id) DO NOTHING;

-- 6. Insert Task Dependencies
-- Task 2 (Welding) depends on Task 1 (Foundation)
-- Task 3 (Formwork) depends on Task 1 (Foundation)
-- Task 5 (Roofing) depends on Task 3 (Formwork)
INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, lag_minutes) VALUES
('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'FINISH_TO_START', 0),
('c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'FINISH_TO_START', 0),
('c0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', 'FINISH_TO_START', 0)
ON CONFLICT (task_id, depends_on_task_id) DO NOTHING;

-- 7. Insert Limited Site Resources
INSERT INTO resources (id, site_id, name, resource_type, zone_name, capacity, is_available, notes) VALUES
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'East Misting Shade Canopy', 'SHADE_STRUCTURE', 'Ground Sector East', 8, true, 'Industrial 10x20 pop-up with high-pressure mist nozzles'),
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'West Shaded Rest Pavilion', 'SHADE_STRUCTURE', 'Ground Sector West', 6, true, 'Covered timber framed rest area with airflow fans'),
('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Hydration Station Alpha', 'WATER_STATION', 'Central Hub', 4, true, '4-tap insulated cold water dispenser and electrolyte station'),
('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Hydration Station Beta', 'WATER_STATION', 'Level 2 Tower Base', 4, true, '4-tap cold water station near elevator hoist'),
('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'AC Cooling Trailer', 'COOLING_TENT', 'Site Entry', 5, true, 'Air-conditioned triage & cool-down trailer (22°C)')
ON CONFLICT (id) DO NOTHING;

-- 8. Insert Environmental Weather Forecast / Observation Records
INSERT INTO weather_records (site_id, observation_time, temperature_c, relative_humidity_pct, wind_speed_kmh, solar_radiation_wm2, direct_sun_exposure, source, raw_data) VALUES
('a0000000-0000-0000-0000-000000000001', '2026-07-15 07:00:00+00', 27.5, 58.0, 8.5, 320.0, true, 'DEMO_SEED', '{"note": "Early morning moderate heat"}'::jsonb),
('a0000000-0000-0000-0000-000000000001', '2026-07-15 09:00:00+00', 31.0, 52.0, 9.0, 650.0, true, 'DEMO_SEED', '{"note": "Rising sun, high solar load"}'::jsonb),
('a0000000-0000-0000-0000-000000000001', '2026-07-15 11:00:00+00', 34.5, 46.0, 7.5, 880.0, true, 'DEMO_SEED', '{"note": "Peak mid-day thermal stress"}'::jsonb),
('a0000000-0000-0000-0000-000000000001', '2026-07-15 13:00:00+00', 37.0, 42.0, 6.0, 940.0, true, 'DEMO_SEED', '{"note": "High heat index peak"}'::jsonb),
('a0000000-0000-0000-0000-000000000001', '2026-07-15 15:00:00+00', 36.2, 40.0, 10.0, 780.0, true, 'DEMO_SEED', '{"note": "Afternoon sustained heat"}'::jsonb);
