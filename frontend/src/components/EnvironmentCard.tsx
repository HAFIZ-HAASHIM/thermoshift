import React from 'react';
import { Sun, Thermometer, Droplets, Wind, AlertTriangle, ShieldAlert } from 'lucide-react';
import { WeatherObservation, HeatRiskCategory } from '../types/schedule';

interface EnvironmentCardProps {
  weather: WeatherObservation | null;
  recordsCount: number;
}

const RISK_BADGES: Record<HeatRiskCategory, { label: string; bg: string; text: string; border: string; desc: string }> = {
  LOW: {
    label: 'LOW RISK',
    bg: 'bg-emerald-950/60',
    text: 'text-emerald-400',
    border: 'border-emerald-500/40',
    desc: 'WBGT < 26.0°C — Standard operations with continuous hydration reminders.'
  },
  MODERATE: {
    label: 'MODERATE RISK',
    bg: 'bg-amber-950/60',
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    desc: 'WBGT 26.0–28.9°C — Active shade monitoring and regular hydration checks.'
  },
  HIGH: {
    label: 'HIGH RISK',
    bg: 'bg-orange-950/60',
    text: 'text-orange-400',
    border: 'border-orange-500/40',
    desc: 'WBGT 29.0–31.0°C — Mandatory work/rest cycles and monitored recovery.'
  },
  VERY_HIGH: {
    label: 'VERY HIGH RISK',
    bg: 'bg-red-950/60',
    text: 'text-red-400',
    border: 'border-red-500/40',
    desc: 'WBGT 31.1–32.5°C — Heavy work restricted, 50/50 work/rest regimens enforced.'
  },
  EXTREME: {
    label: 'EXTREME DANGER',
    bg: 'bg-purple-950/70',
    text: 'text-purple-300',
    border: 'border-purple-500/50',
    desc: 'WBGT > 32.5°C — Continuous outdoor heavy work prohibited. Active cooling trailer mandatory.'
  }
};

export const EnvironmentCard: React.FC<EnvironmentCardProps> = ({ weather, recordsCount }) => {
  const currentRisk: HeatRiskCategory = weather?.risk_category || 'HIGH';
  const riskInfo = RISK_BADGES[currentRisk] || RISK_BADGES.HIGH;

  return (
    <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg flex flex-col justify-between space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-400 uppercase tracking-wider">
            <Sun className="w-3.5 h-3.5" />
            <span>Environmental Heat Stress</span>
          </div>
          <h3 className="text-lg font-bold text-white mt-0.5">Atmospheric Conditions</h3>
        </div>

        <div className={`px-2.5 py-1 rounded-lg border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${riskInfo.bg} ${riskInfo.text} ${riskInfo.border}`}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{weather ? riskInfo.label : 'UNAVAILABLE'}</span>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Estimated WBGT */}
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Est. WBGT</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl font-black text-amber-400">
              {weather?.estimated_wbgt_c !== undefined ? `${weather.estimated_wbgt_c.toFixed(1)}°` : 'N/A'}
            </span>
            <span className="text-xs text-slate-400">C</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium block mt-0.5">Stull / Liljegren</span>
        </div>

        {/* Ambient Temp */}
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Ambient Temp</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl font-black text-white">
              {weather?.temperature_c !== undefined ? `${weather.temperature_c.toFixed(1)}°` : 'N/A'}
            </span>
            <span className="text-xs text-slate-400">C</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium block mt-0.5">Dry Bulb</span>
        </div>

        {/* Humidity */}
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Relative Humidity</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl font-black text-cyan-400">
              {weather?.relative_humidity_pct !== undefined ? `${weather.relative_humidity_pct.toFixed(0)}` : 'N/A'}
            </span>
            <span className="text-xs text-slate-400">%</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium block mt-0.5">Psychrometric</span>
        </div>

        {/* Solar Radiation */}
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Solar Irradiance</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl font-black text-orange-400">
              {weather?.solar_radiation_wm2 !== undefined ? `${weather.solar_radiation_wm2.toFixed(0)}` : 'N/A'}
            </span>
            <span className="text-xs text-slate-400">W/m²</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium block mt-0.5">Direct Solar</span>
        </div>
      </div>

      {/* Risk Category Description */}
      <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold text-slate-200">{riskInfo.desc}</p>
          <p className="text-[10px] text-slate-400">
            {recordsCount} environmental observations loaded for active shift.
          </p>
        </div>
      </div>
    </div>
  );
};
