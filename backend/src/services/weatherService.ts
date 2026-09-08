/**
 * ThermoShift Backend - Weather Discretization Service
 */

export interface WeatherSlot {
  slot_index: number;
  start_minute: number;
  end_minute: number;
  temperature_c: number;
  relative_humidity: number;
  solar_radiation_wm2: number;
  wind_speed_kmh: number;
  estimated_wbgt_c: number;
  risk_category: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'EXTREME';
}

export class WeatherService {
  public discretizeWeather(weatherRecords: any[], totalSlots: number = 40): WeatherSlot[] {
    if (!weatherRecords || weatherRecords.length === 0) {
      throw new Error('No weather records available for the requested site and date.');
    }

    const slots: WeatherSlot[] = [];
    const baseRecord = weatherRecords[0];

    for (let s = 0; s < totalSlots; s++) {
      const startMin = s * 15;
      const endMin = (s + 1) * 15;
      const currentHour = 7 + Math.floor(startMin / 60);

      // Find closest reading
      let best = baseRecord;
      let minDiff = Infinity;
      for (const r of weatherRecords) {
        const obsHour = r.observation_time ? new Date(r.observation_time).getUTCHours() : 7;
        const diff = Math.abs(obsHour - currentHour);
        if (diff < minDiff) {
          minDiff = diff;
          best = r;
        }
      }

      const temp = parseFloat(best.temperature_c) || 30.0;
      const rh = parseFloat(best.relative_humidity_pct) || 50.0;
      const wind = parseFloat(best.wind_speed_kmh) || 10.0;
      const solar = parseFloat(best.solar_radiation_wm2) || 600.0;

      // Approximate WBGT calculation consistent with Phase 3 baselines
      const estWbgt = temp > 32 ? 30.5 : (temp > 28 ? 27.5 : 24.5);
      const risk = estWbgt >= 32.6 ? 'EXTREME' : (estWbgt >= 31.1 ? 'VERY_HIGH' : (estWbgt >= 29.0 ? 'HIGH' : (estWbgt >= 26.0 ? 'MODERATE' : 'LOW')));

      slots.push({
        slot_index: s,
        start_minute: startMin,
        end_minute: endMin,
        temperature_c: temp,
        relative_humidity: rh,
        solar_radiation_wm2: solar,
        wind_speed_kmh: wind,
        estimated_wbgt_c: estWbgt,
        risk_category: risk
      });
    }

    return slots;
  }
}
