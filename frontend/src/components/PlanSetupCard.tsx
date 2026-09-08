import React from 'react';
import { Play, Loader2, Thermometer, ShieldCheck, Zap, Scale, Users, Layers, Tent, ArrowRight, TrendingUp } from 'lucide-react';
import { ObjectiveMode, SiteRecord, WeatherObservation } from '../types/schedule';

interface PlanSetupCardProps {
  site: SiteRecord | null;
  date: string;
  onDateChange: (date: string) => void;
  objectiveMode: ObjectiveMode;
  onObjectiveChange: (mode: ObjectiveMode) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  currentWeather?: WeatherObservation | null;
  weatherRecords?: WeatherObservation[];
  activeWorkerCount?: number;
  shadeCapacity?: number;
  taskCount?: number;
}

const MODES: {
  id: ObjectiveMode;
  title: string;
  subtitle: string;
  badge?: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    id: 'SAFEST',
    title: 'Safest',
    subtitle: 'More heat avoidance',
    icon: ShieldCheck
  },
  {
    id: 'BALANCED',
    title: 'Balanced',
    subtitle: 'Safety + productivity',
    badge: 'Recommended',
    icon: Scale
  },
  {
    id: 'FASTEST',
    title: 'Fastest',
    subtitle: 'Earlier completion',
    icon: Zap
  }
];

export const PlanSetupCard: React.FC<PlanSetupCardProps> = ({
  site,
  date,
  objectiveMode,
  onObjectiveChange,
  onGenerate,
  isGenerating,
  currentWeather,
  weatherRecords = [],
  activeWorkerCount = 22,
  shadeCapacity = 27,
  taskCount = 5
}) => {
  const wbgt = currentWeather?.estimated_wbgt_c != null ? currentWeather.estimated_wbgt_c.toFixed(1) : '31.4';
  const temp = currentWeather?.temperature_c != null ? currentWeather.temperature_c.toFixed(1) : '36.0';
  const humidity = currentWeather?.relative_humidity_pct != null ? currentWeather.relative_humidity_pct : 65;

  const wbgtNum = parseFloat(wbgt);
  let heatStatus = 'Moderate Heat';
  let heatStatusColor = 'bg-[#FAF2E8] text-[#D88A28] border-[#F1D4B0]';
  if (wbgtNum >= 31.0) {
    heatStatus = 'High Heat Risk · Heat-Aware Sequencing Mandated';
    heatStatusColor = 'bg-[#FAF2E8] text-[#D88A28] border-[#F1D4B0]';
  } else if (wbgtNum >= 32.2) {
    heatStatus = 'Extreme Risk · Strict Shade Rest Required';
    heatStatusColor = 'bg-[#FDF1F0] text-[#C85C52] border-[#F3C7C3]';
  } else if (wbgtNum < 28.0) {
    heatStatus = 'Low Risk · Standard Protocols';
    heatStatusColor = 'bg-[#E8F1ED] text-[#4D8A6A] border-[#C4DCD0]';
  }

  return (
    <div className="max-w-3xl mx-auto my-4 sm:my-8 space-y-6">
      {/* Main Mission Control Cockpit */}
      <div className="bg-white rounded-xl border border-[#DCE3DF] p-6 sm:p-8 space-y-6 shadow-xs">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#DCE3DF]">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#17211D] tracking-tight flex items-center gap-2">
              PLAN TODAY'S WORK
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0] font-semibold">
                MISSION READY
              </span>
            </h2>
            <p className="text-xs text-[#68736E] mt-0.5">
              Deterministic CP-SAT mathematical optimization for thermal safety & operational throughput.
            </p>
          </div>

          <div className="text-xs text-[#68736E] font-medium self-start sm:self-center">
            {site?.name || 'Apex Commercial Tower'} · <span className="font-mono text-[#17211D]">{date}</span>
          </div>
        </div>

        {/* 1. TODAY'S SITE CONDITIONS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#17211D] uppercase tracking-wider flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-[#D88A28]" />
              <span>1. Today's Site Conditions</span>
            </label>
            <span className="text-[11px] text-[#68736E]">Shift Period: 07:00 — 12:00</span>
          </div>

          <div className="p-4 rounded-xl bg-[#F4F6F5] border border-[#DCE3DF] space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-white border border-[#DCE3DF] shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-[#68736E] block tracking-wider">Peak WBGT</span>
                <span className="text-base sm:text-lg font-bold font-mono text-[#17211D]">{wbgt}°C</span>
                <span className="text-[9px] text-[#D88A28] font-semibold block mt-0.5">Threshold: 28.0°C</span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-[#DCE3DF] shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-[#68736E] block tracking-wider">Air Temp</span>
                <span className="text-base sm:text-lg font-bold font-mono text-[#17211D]">{temp}°C</span>
                <span className="text-[9px] text-[#68736E] block mt-0.5">Dry Bulb</span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-[#DCE3DF] shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-[#68736E] block tracking-wider">Humidity</span>
                <span className="text-base sm:text-lg font-bold font-mono text-[#17211D]">{humidity}%</span>
                <span className="text-[9px] text-[#68736E] block mt-0.5">Relative Vapor</span>
              </div>
            </div>

            <div className={`px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 ${heatStatusColor}`}>
              <Thermometer className="w-3.5 h-3.5 shrink-0" />
              <span>{heatStatus}</span>
            </div>
          </div>
        </div>

        {/* 2. OPERATIONAL RESOURCES & CREW */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-[#17211D] uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#176B52]" />
            <span>2. Operational Assets & Constraints</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-[#F4F6F5] border border-[#DCE3DF] flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-white text-[#176B52] border border-[#DCE3DF] shadow-2xs">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#68736E] tracking-wider block">Workforce</span>
                <div className="text-sm font-bold font-mono text-[#17211D]">
                  {activeWorkerCount} <span className="text-xs font-normal text-[#68736E]">Workers</span>
                </div>
                <span className="text-[10px] text-[#4D8A6A] font-medium">Trade-Certified</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F4F6F5] border border-[#DCE3DF] flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-white text-[#D88A28] border border-[#DCE3DF] shadow-2xs">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#68736E] tracking-wider block">Tasks</span>
                <div className="text-sm font-bold font-mono text-[#17211D]">
                  {taskCount} <span className="text-xs font-normal text-[#68736E]">Shift Deliverables</span>
                </div>
                <span className="text-[10px] text-[#68736E]">Precedence Rules</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F4F6F5] border border-[#DCE3DF] flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-white text-[#176B52] border border-[#DCE3DF] shadow-2xs">
                <Tent className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#68736E] tracking-wider block">Shade Capacity</span>
                <div className="text-sm font-bold font-mono text-[#17211D]">
                  {shadeCapacity} <span className="text-xs font-normal text-[#68736E]">Concurrent</span>
                </div>
                <span className="text-[10px] text-[#176B52] font-medium">Misting Stations</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. OPTIMIZATION PRIORITY */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-[#17211D] uppercase tracking-wider flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-[#176B52]" />
            <span>3. Optimization Priority</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {MODES.map((m) => {
              const isSelected = objectiveMode === m.id;
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onObjectiveChange(m.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all relative ${
                    isSelected
                      ? 'bg-[#E8F1ED] border-[#176B52] text-[#17211D] ring-1.5 ring-[#176B52] shadow-xs'
                      : 'bg-white hover:bg-[#F4F6F5] border-[#DCE3DF] text-[#68736E]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-[#176B52]' : 'text-[#68736E]'}`} />
                      <span className="text-xs font-bold text-[#17211D]">
                        {m.title}
                      </span>
                    </div>

                    {m.badge && (
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#176B52] text-white">
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#68736E]">
                    {m.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="pt-2">
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className={`w-full py-3.5 px-6 rounded-xl font-bold text-xs tracking-wider text-white uppercase flex items-center justify-center gap-2 transition-all shadow-sm ${
              isGenerating
                ? 'bg-[#68736E] cursor-not-allowed opacity-80'
                : 'bg-[#176B52] hover:bg-[#0E4D3B] active:scale-[0.99]'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Solving Shift Optimization Matrix...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>GENERATE WORK PLAN →</span>
              </>
            )}
          </button>
        </div>

        {/* Methodology note */}
        <div className="text-center text-xs text-[#8F9B96] pt-1">
          <span>OSHA / NIOSH Heat Stress Reference Standard</span>
          <span className="mx-2 text-[#DCE3DF]">·</span>
          <span>India MoLE Thermal Framework Reference</span>
        </div>
      </div>
    </div>
  );
};
