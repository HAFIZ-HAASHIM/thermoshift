import React from 'react';
import { Play, Loader2, Calendar, Users, Tent, ChevronDown, Thermometer, Shield } from 'lucide-react';
import { ObjectiveMode, SiteRecord, WeatherObservation } from '../types/schedule';

interface ControlsBarProps {
  site: SiteRecord | null;
  date: string;
  onDateChange: (date: string) => void;
  objectiveMode: ObjectiveMode;
  onObjectiveChange: (mode: ObjectiveMode) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  hasSchedule: boolean;
  currentWeather?: WeatherObservation | null;
  activeWorkerCount?: number;
  shadeCapacity?: number;
  onToggleTelemetryDetails?: () => void;
  showTelemetryDetails?: boolean;
}

const MODES: { id: ObjectiveMode; label: string; tag: string; description: string }[] = [
  { id: 'SAFEST', label: 'Safest', tag: 'Max Cushion', description: 'Minimizes thermal exposure and increases recovery cushions.' },
  { id: 'BALANCED', label: 'Balanced', tag: 'Recommended', description: 'Harmonizes safety compliance with shift productivity.' },
  { id: 'FASTEST', label: 'Fastest', tag: 'Throughput', description: 'Minimizes completion makespan while respecting hard safety limits.' }
];

export const ControlsBar: React.FC<ControlsBarProps> = ({
  site,
  date,
  onDateChange,
  objectiveMode,
  onObjectiveChange,
  onGenerate,
  isGenerating,
  hasSchedule,
  currentWeather,
  activeWorkerCount = 22,
  shadeCapacity = 2,
  onToggleTelemetryDetails,
  showTelemetryDetails
}) => {
  const currentWbgt = currentWeather?.estimated_wbgt_c != null ? currentWeather.estimated_wbgt_c.toFixed(1) : '28.5';
  const ambientTemp = currentWeather?.temperature_c != null ? currentWeather.temperature_c.toFixed(1) : '33.5';
  const humidity = currentWeather?.relative_humidity_pct != null ? currentWeather.relative_humidity_pct : 62;

  return (
    <div className="rounded-xl bg-white border border-[#E2E8F0] shadow-sm overflow-hidden">
      {/* 1. Heat Conditions Strip (What are today's heat conditions?) */}
      <div className="p-4 sm:p-4.5 border-b border-[#E2E8F0] bg-slate-50/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-[#172033] font-semibold">
            <Thermometer className="w-4 h-4 text-amber-500" />
            <span className="text-[11px] uppercase tracking-wider text-[#64748B]">1. Today's Heat Conditions</span>
          </div>

          <div className="h-4 w-px bg-[#E2E8F0] hidden sm:block" />

          {/* WBGT & Heat Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-[#172033] shadow-xs">
            <span className="text-[#64748B]">Peak WBGT:</span>
            <span className="font-bold font-mono text-[#172033]">{currentWbgt}°C</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
              Moderate Heat
            </span>
          </div>

          {/* Air & Humidity */}
          <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-[#64748B] shadow-xs">
            <span>Air: <strong className="text-[#172033] font-mono">{ambientTemp}°C</strong></span>
            <span className="text-[#CBD5E1]">•</span>
            <span>Humidity: <strong className="text-[#172033] font-mono">{humidity}%</strong></span>
          </div>

          {/* Shade & Crew */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-[#64748B] shadow-xs">
            <Tent className="w-3.5 h-3.5 text-[#64748B]" />
            <span>Shade: <strong className="text-[#172033] font-mono">{shadeCapacity}</strong></span>
            <span className="text-[#CBD5E1]">•</span>
            <Users className="w-3.5 h-3.5 text-[#64748B]" />
            <span>Crew: <strong className="text-[#172033] font-mono">{activeWorkerCount}</strong></span>
          </div>
        </div>

        {/* Date Selector & Expandable Curve */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-xs shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
            <label htmlFor="shift-date-input" className="text-[#64748B]">Shift:</label>
            <input
              id="shift-date-input"
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent text-[#172033] font-medium focus:outline-none text-xs cursor-pointer"
            />
          </div>

          {onToggleTelemetryDetails && (
            <button
              onClick={onToggleTelemetryDetails}
              className="text-xs text-[#64748B] hover:text-[#172033] flex items-center gap-1 font-medium transition-colors px-2 py-1.5 rounded hover:bg-slate-200/50"
            >
              <span>{showTelemetryDetails ? 'Hide Curve' : 'Thermal Curve'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTelemetryDetails ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Priority Selector & Plan Action */}
      <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Objective Mode Segmented Control */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-[#64748B] block">
            Optimization Priority
          </span>
          <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-[#E2E8F0]">
            {MODES.map((m) => {
              const isSelected = objectiveMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onObjectiveChange(m.id)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-white text-[#172033] shadow-xs border border-[#CBD5E1]'
                      : 'text-[#64748B] hover:text-[#172033]'
                  }`}
                  title={m.description}
                >
                  <span>{m.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-[#94A3B8]'
                  }`}>
                    {m.tag}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className={`px-5 py-2.5 rounded-lg font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm ${
              isGenerating
                ? 'bg-slate-100 text-[#94A3B8] cursor-not-allowed border border-[#E2E8F0]'
                : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white active:scale-[0.99]'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                <span>Solving Shift Plan...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{hasSchedule ? 'Regenerate Plan' : 'Generate Shift Plan'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
