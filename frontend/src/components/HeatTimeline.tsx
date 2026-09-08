import React from 'react';
import { TrendingUp, Flame } from 'lucide-react';
import { WeatherObservation, HeatRiskCategory } from '../types/schedule';

interface HeatTimelineProps {
  weatherRecords: WeatherObservation[];
}

const RISK_COLORS: Record<HeatRiskCategory, { bg: string; text: string; border: string; barColor: string }> = {
  LOW: { bg: 'bg-[#E8F1ED]', text: 'text-[#4D8A6A]', border: 'border-[#C4DCD0]', barColor: 'bg-[#4D8A6A]' },
  MODERATE: { bg: 'bg-[#FAF2E8]', text: 'text-[#D88A28]', border: 'border-[#F1D4B0]', barColor: 'bg-[#D88A28]' },
  HIGH: { bg: 'bg-[#FAF2E8]', text: 'text-[#D88A28]', border: 'border-[#F1D4B0]', barColor: 'bg-[#D88A28]' },
  VERY_HIGH: { bg: 'bg-[#FDF1F0]', text: 'text-[#C85C52]', border: 'border-[#F3C7C3]', barColor: 'bg-[#C85C52]' },
  EXTREME: { bg: 'bg-[#FDF1F0]', text: 'text-[#C85C52]', border: 'border-[#F3C7C3]', barColor: 'bg-[#C85C52]' }
};

export const HeatTimeline: React.FC<HeatTimelineProps> = ({ weatherRecords }) => {
  if (!weatherRecords || weatherRecords.length === 0) return null;

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#DCE3DF] shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded bg-[#E8F1ED] text-[#176B52] border border-[#C4DCD0]">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#17211D]">
              Thermal Stress Progression Curve
            </h4>
            <p className="text-xs text-[#68736E]">
              Discretized WBGT forecast utilized to sequence intensive tasks during cooler morning windows.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#68736E]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#4D8A6A]" /> Low
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#D88A28]" /> Moderate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#C85C52]" /> High / Extreme
          </span>
        </div>
      </div>

      {/* Timeline Steps */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {weatherRecords.map((record, index) => {
          let timeStr = `0${7 + index * 2}:00`;
          if (record.observation_time) {
            if (record.observation_time.includes(' ')) {
              timeStr = record.observation_time.split(' ')[1].slice(0, 5);
            } else if (record.observation_time.length >= 16) {
              timeStr = record.observation_time.slice(11, 16);
            }
          }

          const riskCat: HeatRiskCategory = record.risk_category || 'MODERATE';
          const style = RISK_COLORS[riskCat] || RISK_COLORS.MODERATE;
          const wbgt = Number(record.estimated_wbgt_c) || 28.0;
          const temp = Number(record.temperature_c) || 34.0;
          const rh = Number(record.relative_humidity_pct) || 60;

          return (
            <div
              key={index}
              className={`p-3.5 rounded-lg border flex flex-col justify-between space-y-2 transition-all ${style.bg} ${style.border}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#17211D] tracking-wide">{timeStr}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${style.text} ${style.border} bg-white`}>
                  {riskCat}
                </span>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-[#17211D] font-mono">{wbgt.toFixed(1)}°</span>
                  <span className="text-xs text-[#68736E] font-medium">WBGT</span>
                </div>
                <span className="text-[11px] text-[#68736E] block mt-0.5">
                  Temp: {temp.toFixed(1)}°C | RH: {rh.toFixed(0)}%
                </span>
              </div>

              {/* Progress bar indication */}
              <div className="w-full bg-white/70 rounded-full h-1.5 overflow-hidden border border-[#DCE3DF]">
                <div
                  className={`h-full ${style.barColor}`}
                  style={{ width: `${Math.min(100, Math.max(10, (wbgt / 38) * 100))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
