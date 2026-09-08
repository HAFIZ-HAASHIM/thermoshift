-- =====================================================================
-- ThermoShift Database Migration: Full CRUD Policies for Operational MVP
-- Migration Version: 20260907000000
-- Description: Enables INSERT, UPDATE, DELETE policies for sites,
--              workforce, skills, tasks, dependencies, resources,
--              and weather records for active site operational data.
-- =====================================================================

-- 1. Sites CRUD Policies
CREATE POLICY "Allow insert sites" ON sites
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update sites" ON sites
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete sites" ON sites
    FOR DELETE USING (true);

-- 2. Skills CRUD Policies
CREATE POLICY "Allow insert skills" ON skills
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update skills" ON skills
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete skills" ON skills
    FOR DELETE USING (true);

-- 3. Workers CRUD Policies
CREATE POLICY "Allow insert workers" ON workers
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update workers" ON workers
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete workers" ON workers
    FOR DELETE USING (true);

-- 4. Worker Skills CRUD Policies
CREATE POLICY "Allow insert worker_skills" ON worker_skills
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update worker_skills" ON worker_skills
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete worker_skills" ON worker_skills
    FOR DELETE USING (true);

-- 5. Tasks CRUD Policies
CREATE POLICY "Allow insert tasks" ON tasks
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update tasks" ON tasks
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete tasks" ON tasks
    FOR DELETE USING (true);

-- 6. Task Required Skills CRUD Policies
CREATE POLICY "Allow insert task_required_skills" ON task_required_skills
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update task_required_skills" ON task_required_skills
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete task_required_skills" ON task_required_skills
    FOR DELETE USING (true);

-- 7. Task Dependencies CRUD Policies
CREATE POLICY "Allow insert task_dependencies" ON task_dependencies
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update task_dependencies" ON task_dependencies
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete task_dependencies" ON task_dependencies
    FOR DELETE USING (true);

-- 8. Resources CRUD Policies
CREATE POLICY "Allow insert resources" ON resources
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update resources" ON resources
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete resources" ON resources
    FOR DELETE USING (true);

-- 9. Weather Records CRUD Policies
CREATE POLICY "Allow insert weather_records" ON weather_records
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update weather_records" ON weather_records
    FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete weather_records" ON weather_records
    FOR DELETE USING (true);
