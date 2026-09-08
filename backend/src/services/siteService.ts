/**
 * ThermoShift Backend - Supabase Site & Workforce Service
 */

import { supabase } from '../config/supabase';

export class SiteService {
  public async getSite(siteId: string) {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .maybeSingle();

    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return data;
  }

  public async getWorkers(siteId: string) {
    const { data: workers, error: workerErr } = await supabase
      .from('workers')
      .select('*')
      .eq('site_id', siteId)
      .eq('is_active', true);

    if (workerErr) throw new Error(`Failed to load workers: ${workerErr.message}`);
    if (!workers || workers.length === 0) return [];

    const workerIds = workers.map(w => w.id);
    const { data: skills, error: skillErr } = await supabase
      .from('worker_skills')
      .select('worker_id, skill_id')
      .in('worker_id', workerIds);

    if (skillErr) throw new Error(`Failed to load worker skills: ${skillErr.message}`);

    const skillsMap: Record<string, string[]> = {};
    skills?.forEach(s => {
      if (!skillsMap[s.worker_id]) skillsMap[s.worker_id] = [];
      skillsMap[s.worker_id].push(s.skill_id);
    });

    return workers.map(w => ({
      worker_id: w.id,
      name: w.name,
      skills: skillsMap[w.id] || [],
      is_acclimatized: w.is_acclimatized ?? true,
      vulnerability_rating: w.vulnerability_rating || 'LOW',
      max_continuous_work_cap_minutes: null,
      shift_start_minute: 0,
      shift_end_minute: 600
    }));
  }

  public async getTasks(siteId: string) {
    const { data: tasks, error: taskErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('site_id', siteId);

    if (taskErr) throw new Error(`Failed to load tasks: ${taskErr.message}`);
    if (!tasks || tasks.length === 0) return [];

    const taskIds = tasks.map(t => t.id);

    const { data: reqSkills } = await supabase
      .from('task_required_skills')
      .select('task_id, skill_id')
      .in('task_id', taskIds);

    const { data: deps } = await supabase
      .from('task_dependencies')
      .select('task_id, depends_on_task_id')
      .in('task_id', taskIds);

    const skillsMap: Record<string, string[]> = {};
    reqSkills?.forEach(s => {
      if (!skillsMap[s.task_id]) skillsMap[s.task_id] = [];
      skillsMap[s.task_id].push(s.skill_id);
    });

    const depsMap: Record<string, string[]> = {};
    deps?.forEach(d => {
      if (!depsMap[d.task_id]) depsMap[d.task_id] = [];
      depsMap[d.task_id].push(d.depends_on_task_id);
    });

    return tasks.map(t => {
      const earliestMin = this.timeToMinutes(t.earliest_start_time || '07:00:00');
      const deadlineMin = this.timeToMinutes(t.deadline_time || '17:00:00');

      return {
        task_id: t.id,
        title: t.title,
        zone_id: t.zone_name || 'Ground Sector',
        required_skills: skillsMap[t.id] || [],
        min_workers: t.min_workers || 1,
        max_workers: t.max_workers || 4,
        duration_minutes: t.estimated_duration_minutes || 60,
        intensity: t.physical_intensity || 'MEDIUM',
        dependencies: depsMap[t.id] || [],
        earliest_start_minute: Math.max(0, earliestMin),
        deadline_minute: Math.min(600, deadlineMin || 600),
        is_sun_exposed: t.is_sun_exposed ?? true
      };
    });
  }

  public async getResources(siteId: string) {
    const { data: resources, error } = await supabase
      .from('resources')
      .select('*')
      .eq('site_id', siteId)
      .eq('is_available', true);

    if (error) throw new Error(`Failed to load resources: ${error.message}`);
    return (resources || []).map(r => ({
      resource_id: r.id,
      name: r.name,
      resource_type: r.resource_type,
      capacity: r.capacity || 1,
      zone_id: r.zone_name || 'Ground Sector'
    }));
  }

  public async getWeatherRecords(siteId: string, dateStr: string) {
    const { data: weather, error } = await supabase
      .from('weather_records')
      .select('*')
      .eq('site_id', siteId)
      .order('observation_time', { ascending: true });

    if (error) throw new Error(`Failed to load weather: ${error.message}`);
    return weather || [];
  }

  public async persistSchedule(siteId: string, dateStr: string, mode: string, solverOutput: any) {
    const { data: sched, error: schedErr } = await supabase
      .from('schedules')
      .insert({
        site_id: siteId,
        schedule_date: dateStr,
        version: 1,
        optimization_mode: mode,
        status: solverOutput.status === 'OPTIMAL' || solverOutput.status === 'FEASIBLE' ? 'PUBLISHED' : 'DRAFT',
        time_slot_interval_minutes: 15,
        total_workers_assigned: new Set(solverOutput.assignments.filter((a: any) => a.assignment_type === 'WORK').map((a: any) => a.worker_id)).size,
        total_tasks_completed: solverOutput.total_tasks_scheduled,
        total_rest_minutes: solverOutput.total_rest_minutes,
        solver_status: solverOutput.status,
        solver_solve_time_ms: Math.round(solverOutput.solve_time_seconds * 1000)
      })
      .select('id')
      .single();

    if (schedErr || !sched) return null;
    return sched.id;
  }

  private timeToMinutes(timeStr: string): number {
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10) || 7;
    const m = parseInt(parts[1], 10) || 0;
    const totalMinutes = h * 60 + m;
    return Math.max(0, totalMinutes - (7 * 60)); // Relative to 07:00 start
  }
}
