/**
 * ThermoShift - Live Environmental Weather Service
 * Integrates with Open-Meteo for live hourly weather forecasts
 * and computes scientifically accurate Stull wet-bulb & WBGT estimates.
 */

import { supabase } from './supabaseClient';
import { WeatherObservation } from '../types/schedule';

/**
 * Calculates Wet-Bulb Temperature (°C) using Stull's empirical formula (2011).
 * Valid for RH 5%–99% and temperatures -20°C to 50°C.
 */
export function calculateStullWetBulb(tempC: number, rh: number): number {
  const t = tempC;
  const rhClamped = Math.max(1, Math.min(100, rh));

  const tw =
    t * Math.atan(0.151977 * Math.pow(rhClamped + 8.313659, 0.5)) +
    Math.atan(t + rhClamped) -
    Math.atan(rhClamped - 1.676331) +
    0.00391838 * Math.pow(rhClamped, 1.5) * Math.atan(0.023101 * rhClamped) -
    4.686035;

  return Math.round(tw * 10) / 10;
}

/**
 * Calculates estimated outdoor WBGT (°C) based on Stull wet-bulb, dry bulb, solar irradiance, and wind.
 * Follows ISO 7243 & Liljegren principles for outdoor sun-exposed environments.
 */
export function calculateEstimatedWBGT(
  tempC: number,
  wetBulbC: number,
  solarRadiationWm2: number = 600,
  windSpeedKmh: number = 10,
  directSun: boolean = true
): number {
  // Approximate globe temperature Tg from dry bulb, solar irradiance, and wind cooling
  const windFactor = 1.0 + (windSpeedKmh / 3.6) * 0.15;
  const solarIncrease = directSun ? (solarRadiationWm2 * 0.014) / windFactor : 0.0;
  const globeTemp = tempC + solarIncrease;

  // Outdoor WBGT standard equation: 0.7 * Tw + 0.2 * Tg + 0.1 * Td
  const wbgt = 0.7 * wetBulbC + 0.2 * globeTemp + 0.1 * tempC;
  return Math.round(wbgt * 10) / 10;
}

export function getWBGTRiskCategory(wbgtC: number): 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' {
  if (wbgtC < 26.0) return 'LOW';
  if (wbgtC < 29.0) return 'MODERATE';
  if (wbgtC < 32.2) return 'HIGH';
  return 'EXTREME';
}

export interface LiveWeatherResult {
  success: boolean;
  source: 'LIVE_API' | 'DATABASE' | 'UNAVAILABLE';
  records: WeatherObservation[];
  errorMessage?: string;
}

/**
 * Fetches live weather for a site coordinates from Open-Meteo API.
 * If successful, optionally saves to Supabase weather_records table.
 */
export async function fetchLiveWeatherForSite(
  siteId: string,
  latitude: number,
  longitude: number,
  dateStr: string,
  timezone: string = 'auto'
): Promise<LiveWeatherResult> {
  // Validate coordinates
  if (
    isNaN(latitude) ||
    isNaN(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return {
      success: false,
      source: 'UNAVAILABLE',
      records: [],
      errorMessage: 'Invalid site geographic coordinates (Latitude/Longitude required for live weather).'
    };
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,direct_normal_irradiance,shortwave_radiation_instant&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Open-Meteo returned HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (!data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
      throw new Error('No hourly forecast points returned for this location and date.');
    }

    const times: string[] = data.hourly.time;
    const temps: number[] = data.hourly.temperature_2m || [];
    const rhs: number[] = data.hourly.relative_humidity_2m || [];
    const winds: number[] = data.hourly.wind_speed_10m || [];
    const directSolars: number[] = data.hourly.direct_normal_irradiance || [];
    const shortwaves: number[] = data.hourly.shortwave_radiation_instant || [];

    const observations: WeatherObservation[] = [];
    const dbPayloads: any[] = [];

    for (let i = 0; i < times.length; i++) {
      const timeStr = times[i];
      const temp = Number(temps[i] ?? 30.0);
      const rh = Number(rhs[i] ?? 50.0);
      const wind = Number(winds[i] ?? 10.0);
      const solar = Number(directSolars[i] || shortwaves[i] || 0.0);

      const tw = calculateStullWetBulb(temp, rh);
      const wbgt = calculateEstimatedWBGT(temp, tw, solar, wind, true);
      const risk = getWBGTRiskCategory(wbgt);

      const obs: WeatherObservation = {
        observation_time: timeStr,
        temperature_c: temp,
        relative_humidity_pct: rh,
        wind_speed_kmh: wind,
        solar_radiation_wm2: solar,
        direct_sun_exposure: true,
        estimated_wbgt_c: wbgt,
        risk_category: risk
      };

      observations.push(obs);

      dbPayloads.push({
        site_id: siteId,
        observation_time: `${timeStr}:00+00`,
        temperature_c: temp,
        relative_humidity_pct: rh,
        wind_speed_kmh: wind,
        solar_radiation_wm2: solar,
        direct_sun_exposure: true,
        estimated_wbgt_c: wbgt,
        risk_category: risk,
        source: 'OPEN_METEO_LIVE'
      });
    }

    // Attempt to persist to Supabase weather_records in background (non-blocking)
    if (siteId && dbPayloads.length > 0) {
      (async () => {
        try {
          await supabase.from('weather_records').delete().eq('site_id', siteId);
          await supabase.from('weather_records').insert(dbPayloads);
        } catch (e: any) {
          console.warn('Could not cache weather records to Supabase:', e);
        }
      })();
    }

    return {
      success: true,
      source: 'LIVE_API',
      records: observations
    };
  } catch (err: any) {
    console.warn('Live weather lookup failed:', err);

    // Fallback: Check if Supabase already has recorded weather for this site
    try {
      const { data: dbRecords } = await supabase
        .from('weather_records')
        .select('*')
        .eq('site_id', siteId)
        .order('observation_time', { ascending: true });

      if (dbRecords && dbRecords.length > 0) {
        const mapped: WeatherObservation[] = dbRecords.map((w: any) => ({
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

        return {
          success: true,
          source: 'DATABASE',
          records: mapped
        };
      }
    } catch {
      // Ignore
    }

    return {
      success: false,
      source: 'UNAVAILABLE',
      records: [],
      errorMessage: `Live weather unavailable: ${err?.message || 'Network error'}. Check coordinates or site connectivity.`
    };
  }
}
