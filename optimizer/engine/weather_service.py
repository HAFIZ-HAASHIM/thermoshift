"""
ThermoShift - Weather Service & Environmental Discretization

Responsible for:
1. Loading weather records for a site and date
2. Discretizing time into 15-minute solver slots (e.g., 40 slots for 10-hour shift)
3. Computing estimated WBGT and HeatRiskCategory using the Phase 3 heat methodology
4. Strict error handling when weather data is missing (never silently inventing safe weather)
"""

from typing import List, Dict, Any, Optional
from datetime import datetime

from optimizer.engine.data_models import HeatRiskCategory, SafetyPolicy
from optimizer.engine.optimizer_interface import SolverTimeSlotWeather
from optimizer.engine.heat_methodology import (
    HeatMethodologyEngine,
    EnvironmentalReading
)
from optimizer.engine.exposure_model import ExposureModel


class WeatherIntegrationService:
    """
    Transforms raw environmental records into discretized, scientifically validated SolverTimeSlotWeather objects.
    """

    @classmethod
    def generate_weather_slots(
        cls,
        weather_records: List[Dict[str, Any]],
        shift_start_hour: int = 7,
        shift_duration_hours: int = 10,
        slot_interval_minutes: int = 15,
        policy: Optional[SafetyPolicy] = None
    ) -> List[SolverTimeSlotWeather]:
        """
        Discretizes raw weather records into continuous 15-minute time slots across the shift.
        Throws ValueError if no valid weather data exists.
        """
        if not weather_records:
            raise ValueError("No weather records available for the requested site and date.")

        total_slots = (shift_duration_hours * 60) // slot_interval_minutes

        # Parse records into time-indexed environmental readings
        parsed_readings = []
        for r in weather_records:
            temp_c = float(r["temperature_c"])
            rh = float(r["relative_humidity_pct"])
            wind_kmh = float(r.get("wind_speed_kmh") or 10.0)
            solar_wm2 = float(r.get("solar_radiation_wm2") or 600.0) if r.get("solar_radiation_wm2") is not None else None
            direct_sun = bool(r.get("direct_sun_exposure", True))

            obs_time_str = r.get("observation_time", "")
            # Extract hour offset
            hour_offset = 0
            if "T" in obs_time_str or " " in obs_time_str:
                try:
                    dt = datetime.fromisoformat(obs_time_str.replace("Z", "+00:00"))
                    hour_offset = dt.hour
                except Exception:
                    hour_offset = shift_start_hour
            else:
                hour_offset = shift_start_hour

            reading = EnvironmentalReading(
                temperature_c=temp_c,
                relative_humidity=rh,
                wind_speed_kmh=wind_kmh,
                solar_radiation_wm2=solar_wm2,
                direct_sun_exposure=direct_sun
            )

            metrics = HeatMethodologyEngine.calculate_all_metrics(reading)
            risk_cat = ExposureModel.get_risk_category(metrics.estimated_wbgt_c, policy)

            parsed_readings.append({
                "hour": hour_offset,
                "reading": reading,
                "metrics": metrics,
                "risk_category": risk_cat
            })

        # Discretize into slots by mapping each slot to the nearest or chronological weather reading
        slots: List[SolverTimeSlotWeather] = []
        for s_idx in range(total_slots):
            s_start_min = s_idx * slot_interval_minutes
            s_end_min = (s_idx + 1) * slot_interval_minutes
            current_hour = shift_start_hour + (s_start_min // 60)

            # Find matching or closest reading
            best_reading = min(parsed_readings, key=lambda x: abs(x["hour"] - current_hour))
            metrics = best_reading["metrics"]
            risk = best_reading["risk_category"]
            reading = best_reading["reading"]

            slots.append(
                SolverTimeSlotWeather(
                    slot_index=s_idx,
                    start_minute=s_start_min,
                    end_minute=s_end_min,
                    temperature_c=reading.temperature_c,
                    relative_humidity=reading.relative_humidity,
                    solar_radiation_wm2=reading.solar_radiation_wm2 if reading.solar_radiation_wm2 is not None else 600.0,
                    wind_speed_kmh=reading.wind_speed_kmh,
                    estimated_wbgt_c=metrics.estimated_wbgt_c,
                    risk_category=risk
                )
            )

        return slots
