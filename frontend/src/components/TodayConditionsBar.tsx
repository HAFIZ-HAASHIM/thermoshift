import React from 'react';
import { ChevronDown, CloudSun, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { SiteRecord, WeatherObservation } from '../types/schedule';

interface TodayConditionsBarProps {
  site: SiteRecord | null;
  date: string;
  currentWeather?: WeatherObservation | null;
  weatherRecords?: WeatherObservation[];
  weatherSource?: 'LIVE_API' | 'DATABASE' | 'OFFLINE_REFERENCE' | 'UNAVAILABLE';
  onToggleThermalCurve?: () => void;
  showThermalCurve?: boolean;
}

export const TodayConditionsBar: React.FC<TodayConditionsBarProps> = ({
  currentWeather,
  weatherRecords = [],
  weatherSource = 'DATABASE',
  onToggleThermalCurve,
  showThermalCurve
}) => {
  const hasData = currentWeather != null || weatherRecords.length > 0;
  const activeReading = currentWeather || (weatherRecords.length > 0 ? weatherRecords[0] : null);

  // Peak metrics calculation
  let peakWbgt: number | null = null;
  let maxTemp: number | null = null;
  if (weatherRecords.length > 0) {
    const validWbgts = weatherRecords.map((w) => w.estimated_wbgt_c).filter((v): v is number => typeof v === 'number' && !isNaN(v));
    const validTemps = weatherRecords.map((w) => w.temperature_c).filter((v): v is number => typeof v === 'number' && !isNaN(v));
    peakWbgt = validWbgts.length > 0 ? Math.max(...validWbgts) : null;
    maxTemp = validTemps.length > 0 ? Math.max(...validTemps) : null;
  } else if (activeReading) {
    peakWbgt = typeof activeReading.estimated_wbgt_c === 'number' ? activeReading.estimated_wbgt_c : null;
    maxTemp = typeof activeReading.temperature_c === 'number' ? activeReading.temperature_c : null;
  }

  const wbgtDisplay = activeReading?.estimated_wbgt_c != null ? `${activeReading.estimated_wbgt_c.toFixed(1)}°C` : 'Not recorded';
  const tempDisplay = activeReading?.temperature_c != null ? `${activeReading.temperature_c.toFixed(1)}°C` : '—';
  const rhDisplay = activeReading?.relative_humidity_pct != null ? `${activeReading.relative_humidity_pct}%` : '—';
  const windDisplay = activeReading?.wind_speed_kmh != null ? `${activeReading.wind_speed_kmh} km/h` : '—';

  // Heat risk category based on peak WBGT
  let riskLabel = 'Conditions Normal';
  let riskStyle = { bg: '#F0F7F4', text: '#2F6B55', border: '#D0E1D9' };

  if (peakWbgt != null) {
    if (peakWbgt >= 32.2) {
      riskLabel = 'Extreme Heat · Compulsory Rest Mandated';
      riskStyle = { bg: '#FDF3F2', text: '#C95A4B', border: '#F1C3BE' };
    } else if (peakWbgt >= 29.0) {
      riskLabel = 'High Heat Pressure · Heat-Aware Sequencing';
      riskStyle = { bg: '#FEF8EE', text: '#D58A1F', border: '#FCE0B8' };
    } else if (peakWbgt >= 26.0) {
      riskLabel = 'Moderate Heat · Hydration Protocol Active';
      riskStyle = { bg: '#FEF8EE', text: '#D58A1F', border: '#FCE0B8' };
    } else {
      riskLabel = 'Low Heat Risk · Standard Operations';
      riskStyle = { bg: '#F0F7F4', text: '#2F6B55', border: '#D0E1D9' };
    }
  }

  const getSourceBadge = () => {
    switch (weatherSource) {
      case 'LIVE_API':
        return { label: 'Live Open-Meteo Weather', icon: <CheckCircle2 size={12} />, bg: '#E8EFEA', text: '#2F6B55', border: '#C4DCD0' };
      case 'DATABASE':
        return { label: 'Persisted Site Weather', icon: <CloudSun size={12} />, bg: '#F4F5F4', text: '#17211D', border: '#E3E7E2' };
      case 'OFFLINE_REFERENCE':
        return { label: 'Offline Reference Dataset', icon: <CloudSun size={12} />, bg: '#F4F5F4', text: '#66736D', border: '#E3E7E2' };
      default:
        return { label: 'Live Weather Unavailable', icon: <AlertTriangle size={12} />, bg: '#FEF8EE', text: '#D58A1F', border: '#FCE0B8' };
    }
  };

  const sourceInfo = getSourceBadge();

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #E3E7E2',
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        {/* Section 1: Conditions & WBGT */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#17211D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Site Environmental Conditions
          </span>

          <span style={{ color: '#E3E7E2' }}>|</span>

          {hasData ? (
            <>
              {/* WBGT */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  backgroundColor: '#F7F8F6',
                  border: '1px solid #E3E7E2',
                  borderRadius: '6px',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.8rem'
                }}
              >
                <span style={{ color: '#66736D', fontWeight: 500 }}>WBGT:</span>
                <strong style={{ color: '#17211D', fontFamily: 'monospace' }}>{wbgtDisplay}</strong>
                {peakWbgt != null && (
                  <span style={{ fontSize: '0.7rem', color: '#66736D' }}>(Peak {peakWbgt.toFixed(1)}°C)</span>
                )}
              </div>

              {/* Temp & Humidity */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: '#F7F8F6',
                  border: '1px solid #E3E7E2',
                  borderRadius: '6px',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.8rem',
                  color: '#66736D'
                }}
              >
                <span>
                  Air: <strong style={{ color: '#17211D', fontFamily: 'monospace' }}>{tempDisplay}</strong>
                </span>
                <span>•</span>
                <span>
                  RH: <strong style={{ color: '#17211D', fontFamily: 'monospace' }}>{rhDisplay}</strong>
                </span>
                <span>•</span>
                <span>
                  Wind: <strong style={{ color: '#17211D', fontFamily: 'monospace' }}>{windDisplay}</strong>
                </span>
              </div>

              {/* Heat Risk Label */}
              <div
                style={{
                  backgroundColor: riskStyle.bg,
                  color: riskStyle.text,
                  border: `1px solid ${riskStyle.border}`,
                  borderRadius: '6px',
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
              >
                {riskLabel}
              </div>
            </>
          ) : (
            <div
              style={{
                backgroundColor: '#FEF8EE',
                color: '#D58A1F',
                border: '1px solid #FCE0B8',
                borderRadius: '6px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              No weather observations recorded for this site
            </div>
          )}
        </div>

        {/* Section 2: Source Badge & Thermal Curve Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Source badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              backgroundColor: sourceInfo.bg,
              color: sourceInfo.text,
              border: `1px solid ${sourceInfo.border}`,
              borderRadius: '6px',
              padding: '0.3rem 0.6rem',
              fontSize: '0.75rem',
              fontWeight: 600
            }}
          >
            {sourceInfo.icon}
            <span>{sourceInfo.label}</span>
          </div>

          {/* Thermal Curve button */}
          {onToggleThermalCurve && weatherRecords.length > 0 && (
            <button
              onClick={onToggleThermalCurve}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E3E7E2',
                borderRadius: '6px',
                padding: '0.3rem 0.6rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#17211D',
                cursor: 'pointer'
              }}
            >
              <span>{showThermalCurve ? 'Hide Curve' : 'Thermal Curve'}</span>
              <ChevronDown size={13} style={{ transform: showThermalCurve ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
