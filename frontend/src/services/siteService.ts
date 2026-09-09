import { supabase } from './supabaseClient';
import {
  SiteRecord,
  WorkerRecord,
  TaskRecord,
  ResourceRecord,
  WeatherObservation
} from '../types/schedule';
import { fetchLiveWeatherForSite } from './weatherService';

export interface SiteDashboardData {
  site: SiteRecord | null;
  workers: WorkerRecord[];
  tasks: TaskRecord[];
  resources: ResourceRecord[];
  weatherRecords: WeatherObservation[];
  counts: {
    totalWorkers: number;
    totalTasks: number;
    totalResources: number;
  };
  isLive: boolean;
  weatherSource: 'LIVE_API' | 'DATABASE' | 'OFFLINE_REFERENCE' | 'UNAVAILABLE';
  statusLabel: 'LIVE DATABASE' | 'OFFLINE / DEMO FALLBACK MODE' | 'SITE CONFIGURED (EMPTY)';
  errorMessage?: string;
}

export const SEEDED_SITE_ID = 'a0000000-0000-0000-0000-000000000001';
export const SEEDED_DATE = new Date().toISOString().split('T')[0];

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const BACKEND_BASE_URL = 'http://127.0.0.1:5000';

/**
 * Lists all registered sites from backend and Supabase.
 */
export async function fetchSites(): Promise<SiteRecord[]> {
  const sitesMap = new Map<string, SiteRecord>();

  // 1. Try fetching from Backend API
  for (const baseUrl of [BACKEND_BASE_URL, API_BASE_URL]) {
    try {
      const res = await fetch(`${baseUrl}/api/sites`);
      if (res.ok) {
        const data = await res.json();
        if (data.sites && Array.isArray(data.sites)) {
          data.sites.forEach((s: any) => {
            sitesMap.set(s.id, {
              id: s.id,
              name: s.name,
              location_name: s.location_name || s.name,
              latitude: Number(s.latitude || 0),
              longitude: Number(s.longitude || 0),
              timezone: s.timezone || 'UTC',
              shift_start: s.shift_start || '07:00:00',
              shift_end: s.shift_end || '17:00:00',
              is_active: s.is_active ?? true
            });
          });
          break;
        }
      }
    } catch {
      // Continue to next or fallback
    }
  }

  // 2. Try fetching from Supabase
  try {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .order('name', { ascending: true });

    if (!error && data) {
      data.forEach((s: any) => {
        if (!sitesMap.has(s.id)) {
          sitesMap.set(s.id, s as SiteRecord);
        }
      });
    }
  } catch (err: any) {
    console.warn('Supabase site fetch fallback:', err);
  }

  // 3. Check localStorage for any cached custom sites
  try {
    const localSitesRaw = localStorage.getItem('thermoshift_custom_sites');
    if (localSitesRaw) {
      const parsed = JSON.parse(localSitesRaw);
      if (Array.isArray(parsed)) {
        parsed.forEach((s: SiteRecord) => {
          if (s.id && !sitesMap.has(s.id)) {
            sitesMap.set(s.id, s);
          }
        });
      }
    }
  } catch {}

  return Array.from(sitesMap.values());
}


/**
 * Creates a new worksite.
 */
export async function createSite(payload: {
  name: string;
  location_name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  shift_start?: string;
  shift_end?: string;
}): Promise<{ success: boolean; site?: SiteRecord; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('sites')
      .insert([
        {
          name: payload.name.trim(),
          location_name: payload.location_name.trim(),
          latitude: payload.latitude,
          longitude: payload.longitude,
          timezone: payload.timezone || 'UTC',
          shift_start: payload.shift_start || '07:00:00',
          shift_end: payload.shift_end || '17:00:00',
          is_active: true
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return { success: true, site: data as SiteRecord };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create site' };
  }
}

/**
 * Updates an existing worksite.
 */
export async function updateSite(
  siteId: string,
  payload: Partial<SiteRecord>
): Promise<{ success: boolean; site?: SiteRecord; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('sites')
      .update({
        ...payload,
        updated_at: new Date().toISOString()
      })
      .eq('id', siteId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, site: data as SiteRecord };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update site' };
  }
}

/**
 * Deletes a site.
 */
export async function deleteSite(siteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('sites').delete().eq('id', siteId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete site' };
  }
}

export async function fetchFullSiteData(siteId: string): Promise<SiteDashboardData> {
  // 1. Try fetching full site data from Backend API (covers dynamic & imported projects like Riverside)
  for (const baseUrl of [BACKEND_BASE_URL, API_BASE_URL]) {
    try {
      const res = await fetch(`${baseUrl}/api/sites/${siteId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.site) {
          const activeSite = data.site as SiteRecord;
          const workers = (data.workers || []) as WorkerRecord[];
          const tasks = (data.tasks || []) as TaskRecord[];
          const resources = (data.resources || []) as ResourceRecord[];
          let weatherRecords = (data.weatherRecords || data.weather || []) as WeatherObservation[];
          let weatherSource: 'LIVE_API' | 'DATABASE' | 'OFFLINE_REFERENCE' | 'UNAVAILABLE' = weatherRecords.length > 0 ? 'DATABASE' : 'UNAVAILABLE';

          if (weatherRecords.length === 0 && activeSite.latitude && activeSite.longitude) {
            const today = new Date().toISOString().split('T')[0];
            const liveRes = await fetchLiveWeatherForSite(
              activeSite.id,
              Number(activeSite.latitude),
              Number(activeSite.longitude),
              today,
              activeSite.timezone
            );
            if (liveRes.success && liveRes.records.length > 0) {
              weatherRecords = liveRes.records;
              weatherSource = liveRes.source;
            }
          }

          return {
            site: activeSite,
            workers,
            tasks,
            resources,
            weatherRecords,
            counts: {
              totalWorkers: workers.length,
              totalTasks: tasks.length,
              totalResources: resources.length
            },
            isLive: true,
            weatherSource,
            statusLabel: 'LIVE DATABASE'
          };
        }
      }
    } catch {
      // Continue to next or fallback to Supabase
    }
  }

  // 2. Fallback to querying Supabase directly
  try {
    const { data: siteData, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .limit(1);

    if (siteError) throw siteError;

    if (!siteData || siteData.length === 0) {
      // If site does not exist, return a clean empty structure
      return {
        site: null,
        workers: [],
        tasks: [],
        resources: [],
        weatherRecords: [],
        counts: { totalWorkers: 0, totalTasks: 0, totalResources: 0 },
        isLive: true,
        weatherSource: 'UNAVAILABLE',
        statusLabel: 'SITE CONFIGURED (EMPTY)',
        errorMessage: 'Site not found.'
      };
    }

    const activeSite = siteData[0] as SiteRecord;


    // Fetch all related entities in parallel
    const [workersRes, skillsRes, tasksRes, taskSkillsRes, taskDepsRes, resourcesRes, weatherRes] = await Promise.all([
      supabase.from('workers').select('*').eq('site_id', activeSite.id),
      supabase.from('worker_skills').select('worker_id, skill_id'),
      supabase.from('tasks').select('*').eq('site_id', activeSite.id),
      supabase.from('task_required_skills').select('task_id, skill_id, min_skill_count'),
      supabase.from('task_dependencies').select('task_id, depends_on_task_id'),
      supabase.from('resources').select('*').eq('site_id', activeSite.id),
      supabase.from('weather_records').select('*').eq('site_id', activeSite.id).order('observation_time', { ascending: true })
    ]);

    // Map skills to workers
    const skillsByWorker: Record<string, string[]> = {};
    (skillsRes.data || []).forEach((row: any) => {
      if (!skillsByWorker[row.worker_id]) skillsByWorker[row.worker_id] = [];
      skillsByWorker[row.worker_id].push(row.skill_id);
    });

    const workers: WorkerRecord[] = (workersRes.data || []).map((w: any) => ({
      id: w.id,
      employee_code: w.employee_code || '',
      name: w.name || `Worker ${w.employee_code}`,
      role: w.role || 'Field Operator',
      is_active: w.is_active ?? true,
      is_acclimatized: w.is_acclimatized ?? true,
      vulnerability_rating: w.vulnerability_rating || 'LOW',
      past_heat_incidents: w.past_heat_incidents || 0,
      skills: skillsByWorker[w.id] || []
    }));

    // Map required skills and dependencies to tasks
    const reqSkillsByTask: Record<string, { skill_id: string; min_skill_count: number }[]> = {};
    (taskSkillsRes.data || []).forEach((row: any) => {
      if (!reqSkillsByTask[row.task_id]) reqSkillsByTask[row.task_id] = [];
      reqSkillsByTask[row.task_id].push({
        skill_id: row.skill_id,
        min_skill_count: row.min_skill_count || 1
      });
    });

    const depsByTask: Record<string, string[]> = {};
    (taskDepsRes.data || []).forEach((row: any) => {
      if (!depsByTask[row.task_id]) depsByTask[row.task_id] = [];
      depsByTask[row.task_id].push(row.depends_on_task_id);
    });

    const tasks: TaskRecord[] = (tasksRes.data || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      zone_name: t.zone_name,
      min_workers: t.min_workers || 1,
      max_workers: t.max_workers || 4,
      estimated_duration_minutes: t.estimated_duration_minutes || 60,
      physical_intensity: t.physical_intensity || 'MEDIUM',
      is_sun_exposed: t.is_sun_exposed ?? true,
      earliest_start_time: t.earliest_start_time || '07:00:00',
      deadline_time: t.deadline_time || '17:00:00',
      priority: t.priority || 'MEDIUM',
      status: t.status || 'PENDING',
      required_skills: reqSkillsByTask[t.id] || [],
      dependencies: depsByTask[t.id] || []
    }));

    const resources: ResourceRecord[] = (resourcesRes.data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      resource_type: r.resource_type,
      zone_name: r.zone_name,
      capacity: r.capacity || 1,
      is_available: r.is_available ?? true,
      notes: r.notes
    }));

    let weatherRecords: WeatherObservation[] = (weatherRes.data || []).map((w: any) => ({
      id: w.id,
      observation_time: w.observation_time,
      temperature_c: Number(w.temperature_c),
      relative_humidity_pct: Number(w.relative_humidity_pct),
      wind_speed_kmh: Number(w.wind_speed_kmh || 10),
      solar_radiation_wm2: Number(w.solar_radiation_wm2 || 600),
      direct_sun_exposure: w.direct_sun_exposure ?? true,
      estimated_wbgt_c: Number(w.estimated_wbgt_c || 28.5),
      risk_category: w.risk_category || 'MODERATE'
    }));

    let weatherSource: 'LIVE_API' | 'DATABASE' | 'OFFLINE_REFERENCE' | 'UNAVAILABLE' = 'DATABASE';

    // If weather records are empty or site coordinates are present, try live Open-Meteo lookup
    if (weatherRecords.length === 0 && activeSite.latitude && activeSite.longitude) {
      const today = new Date().toISOString().split('T')[0];
      const liveRes = await fetchLiveWeatherForSite(
        activeSite.id,
        Number(activeSite.latitude),
        Number(activeSite.longitude),
        today,
        activeSite.timezone
      );
      if (liveRes.success && liveRes.records.length > 0) {
        weatherRecords = liveRes.records;
        weatherSource = liveRes.source;
      } else {
        weatherSource = 'UNAVAILABLE';
      }
    } else if (weatherRecords.length === 0) {
      weatherSource = 'UNAVAILABLE';
    }

    return {
      site: activeSite,
      workers,
      tasks,
      resources,
      weatherRecords,
      counts: {
        totalWorkers: workers.length,
        totalTasks: tasks.length,
        totalResources: resources.length
      },
      isLive: true,
      weatherSource,
      statusLabel: 'LIVE DATABASE'
    };
  } catch (err: any) {
    console.error('Failed to fetch site data:', err);
    return {
      site: null,
      workers: [],
      tasks: [],
      resources: [],
      weatherRecords: [],
      counts: { totalWorkers: 0, totalTasks: 0, totalResources: 0 },
      isLive: false,
      weatherSource: 'UNAVAILABLE',
      statusLabel: 'OFFLINE / DEMO FALLBACK MODE',
      errorMessage: err?.message || 'Database connection error'
    };
  }
}

// =====================================================================
// WORKFORCE CRUD OPERATIONS
// =====================================================================

export async function createWorker(
  siteId: string,
  payload: {
    name: string;
    employee_code?: string;
    role: string;
    skills: string[];
    is_acclimatized?: boolean;
    vulnerability_rating?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }
): Promise<{ success: boolean; worker?: WorkerRecord; error?: string }> {
  try {
    const empCode = payload.employee_code?.trim() || `EMP-${Date.now().toString().slice(-4)}`;
    const { data: worker, error: workerErr } = await supabase
      .from('workers')
      .insert([
        {
          site_id: siteId,
          name: payload.name.trim(),
          employee_code: empCode,
          role: payload.role.trim() || 'Field Operator',
          is_active: true,
          is_acclimatized: payload.is_acclimatized ?? true,
          vulnerability_rating: payload.vulnerability_rating || 'LOW',
          past_heat_incidents: 0
        }
      ])
      .select()
      .single();

    if (workerErr) throw workerErr;

    // Insert worker skills if provided
    if (payload.skills && payload.skills.length > 0) {
      const skillRows = payload.skills.map((skillId) => ({
        worker_id: worker.id,
        skill_id: skillId
      }));
      await supabase.from('worker_skills').insert(skillRows);
    }

    return {
      success: true,
      worker: {
        ...worker,
        skills: payload.skills || []
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create worker' };
  }
}

export async function updateWorker(
  workerId: string,
  payload: Partial<WorkerRecord> & { skills?: string[] }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { skills, ...workerFields } = payload;
    if (Object.keys(workerFields).length > 0) {
      const { error } = await supabase
        .from('workers')
        .update({
          ...workerFields,
          updated_at: new Date().toISOString()
        })
        .eq('id', workerId);
      if (error) throw error;
    }

    if (skills !== undefined) {
      await supabase.from('worker_skills').delete().eq('worker_id', workerId);
      if (skills.length > 0) {
        const skillRows = skills.map((skillId) => ({
          worker_id: workerId,
          skill_id: skillId
        }));
        await supabase.from('worker_skills').insert(skillRows);
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update worker' };
  }
}

export async function deleteWorker(workerId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('workers').delete().eq('id', workerId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete worker' };
  }
}

export async function toggleWorkerAvailability(
  workerId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('workers')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', workerId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to toggle worker availability' };
  }
}

// =====================================================================
// TASK CRUD OPERATIONS
// =====================================================================

export async function createTask(
  siteId: string,
  payload: {
    title: string;
    description?: string;
    zone_name: string;
    estimated_duration_minutes: number;
    physical_intensity: 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'EXTREME';
    is_sun_exposed: boolean;
    min_workers: number;
    max_workers: number;
    earliest_start_time?: string;
    deadline_time?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    required_skills?: { skill_id: string; min_skill_count: number }[];
    dependencies?: string[];
  }
): Promise<{ success: boolean; task?: TaskRecord; error?: string }> {
  try {
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .insert([
        {
          site_id: siteId,
          title: payload.title.trim(),
          description: payload.description?.trim() || null,
          zone_name: payload.zone_name.trim() || 'General Sector',
          estimated_duration_minutes: payload.estimated_duration_minutes,
          physical_intensity: payload.physical_intensity,
          is_sun_exposed: payload.is_sun_exposed,
          min_workers: payload.min_workers,
          max_workers: Math.max(payload.min_workers, payload.max_workers),
          earliest_start_time: payload.earliest_start_time || '07:00:00',
          deadline_time: payload.deadline_time || '17:00:00',
          priority: payload.priority || 'MEDIUM',
          status: 'PENDING'
        }
      ])
      .select()
      .single();

    if (taskErr) throw taskErr;

    // Insert required skills
    if (payload.required_skills && payload.required_skills.length > 0) {
      const skillRows = payload.required_skills.map((s) => ({
        task_id: task.id,
        skill_id: s.skill_id,
        min_skill_count: s.min_skill_count || 1
      }));
      await supabase.from('task_required_skills').insert(skillRows);
    }

    // Insert dependencies
    if (payload.dependencies && payload.dependencies.length > 0) {
      const depRows = payload.dependencies.map((depId) => ({
        task_id: task.id,
        depends_on_task_id: depId
      }));
      await supabase.from('task_dependencies').insert(depRows);
    }

    return {
      success: true,
      task: {
        ...task,
        required_skills: payload.required_skills || [],
        dependencies: payload.dependencies || []
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create task' };
  }
}

export async function updateTask(
  taskId: string,
  payload: Partial<TaskRecord>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { required_skills, dependencies, ...taskFields } = payload;
    if (Object.keys(taskFields).length > 0) {
      const { error } = await supabase
        .from('tasks')
        .update({
          ...taskFields,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);
      if (error) throw error;
    }

    if (required_skills !== undefined) {
      await supabase.from('task_required_skills').delete().eq('task_id', taskId);
      if (required_skills.length > 0) {
        const skillRows = required_skills.map((s) => ({
          task_id: taskId,
          skill_id: s.skill_id,
          min_skill_count: s.min_skill_count || 1
        }));
        await supabase.from('task_required_skills').insert(skillRows);
      }
    }

    if (dependencies !== undefined) {
      await supabase.from('task_dependencies').delete().eq('task_id', taskId);
      if (dependencies.length > 0) {
        const depRows = dependencies.map((depId) => ({
          task_id: taskId,
          depends_on_task_id: depId
        }));
        await supabase.from('task_dependencies').insert(depRows);
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update task' };
  }
}

export async function deleteTask(taskId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete task' };
  }
}

// =====================================================================
// RESOURCE CRUD OPERATIONS
// =====================================================================

export async function createResource(
  siteId: string,
  payload: {
    name: string;
    resource_type: string;
    zone_name: string;
    capacity: number;
    notes?: string;
  }
): Promise<{ success: boolean; resource?: ResourceRecord; error?: string }> {
  try {
    const { data: resource, error } = await supabase
      .from('resources')
      .insert([
        {
          site_id: siteId,
          name: payload.name.trim(),
          resource_type: payload.resource_type,
          zone_name: payload.zone_name.trim() || 'Ground Sector',
          capacity: Math.max(1, payload.capacity),
          is_available: true,
          notes: payload.notes?.trim() || null
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return { success: true, resource: resource as ResourceRecord };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create resource' };
  }
}

export async function updateResource(
  resourceId: string,
  payload: Partial<ResourceRecord>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('resources')
      .update({
        ...payload,
        updated_at: new Date().toISOString()
      })
      .eq('id', resourceId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update resource' };
  }
}

export async function deleteResource(resourceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('resources').delete().eq('id', resourceId);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete resource' };
  }
}

// =====================================================================
// SKILLS TAXONOMY
// =====================================================================

export const STANDARD_SKILLS = [
  { id: 'MASONRY', name: 'Masonry & Concrete', category: 'CIVIL' },
  { id: 'WELDING', name: 'Structural Welding', category: 'METALWORK' },
  { id: 'CARPENTRY', name: 'Formwork & Framing', category: 'STRUCTURAL' },
  { id: 'ELECTRICAL', name: 'Electrical Systems', category: 'UTILITY' },
  { id: 'ROOFING', name: 'Roofing & Waterproofing', category: 'ENCLOSURE' },
  { id: 'PLUMBING', name: 'Plumbing & Pipefitting', category: 'UTILITY' },
  { id: 'HEAVY_MACHINERY', name: 'Equipment Operation', category: 'PLANT' },
  { id: 'GENERAL_LABOR', name: 'General Site Labor', category: 'GENERAL' },
  { id: 'SAFETY_INSPECTION', name: 'Safety & Quality', category: 'OVERSIGHT' }
];

export async function fetchSkills(): Promise<{ id: string; name: string; category: string }[]> {
  try {
    const { data } = await supabase.from('skills').select('*').order('name', { ascending: true });
    if (data && data.length > 0) return data;
  } catch {
    // Fallback to standard skills taxonomy
  }
  return STANDARD_SKILLS;
}
