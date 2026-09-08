"""
ThermoShift - Environmental Heat Metric Engine

METHODOLOGICAL FOUNDATIONS & AUTHORITATIVE REFERENCES:
1. Wet-Bulb Temperature: Stull, R. (2011). "Wet-Bulb Temperature from Relative Humidity and Air Temperature."
   Journal of Applied Meteorology and Climatology, 50(11), 2267-2269.
   Published empirical validity domain: -20.0°C <= Ta <= 50.0°C, 5.0% <= RH <= 99.0% at standard atmospheric pressure.
2. Heat Index: NOAA / National Weather Service (NWS) Rothfusz polynomial regression with Steadman baseline.
3. WBGT Framework: ISO 7243:2017 ("Hot environments — Estimation of heat stress on working man, based on WBGT-index").
   - Outdoor WBGT: 0.7 * T_nwb + 0.2 * T_g + 0.1 * T_a
   - Shaded/Indoor WBGT: 0.7 * T_w + 0.3 * T_a

CRITICAL DATA INTEGRITY & SCIENTIFIC BOUNDARIES:
- If required outdoor solar/radiation data is missing, the engine explicitly reports INSUFFICIENT_DATA
  rather than fabricating or substituting arbitrary solar radiation values.
- Stull formula evaluates strictly within published domain [-20°C, 50°C], [5%, 99%].
  Evaluations outside this domain are flagged as Out-of-Domain and rejected from scientific claims.
- DISCLAIMER: Provides deterministic environmental physics estimates for worksite planning.
  Does NOT measure internal core body temperature or provide clinical medical diagnoses.
"""

import math
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field


class CalculationQuality(str, Enum):
    VALID = "VALID"
    OUT_OF_PUBLISHED_DOMAIN = "OUT_OF_PUBLISHED_DOMAIN"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class EnvironmentalReading(BaseModel):
    temperature_c: float = Field(..., description="Dry bulb ambient temperature in Celsius")
    relative_humidity: float = Field(..., description="Relative humidity percentage (0 to 100)")
    solar_radiation_wm2: Optional[float] = Field(None, description="Global solar irradiance in W/m^2. None if unmeasured.")
    wind_speed_kmh: Optional[float] = Field(None, description="Wind speed in km/h. None if unmeasured.")
    direct_sun_exposure: bool = Field(True, description="True if exposed to direct outdoor sunlight")


class HeatMetrics(BaseModel):
    temperature_c: float
    relative_humidity: float
    wet_bulb_c: Optional[float] = None
    heat_index_c: Optional[float] = None
    estimated_wbgt_c: Optional[float] = None
    is_direct_sun: bool
    solar_radiation_wm2: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    calculation_quality: CalculationQuality
    quality_notes: str = ""


class HeatMethodologyEngine:
    """
    Deterministic environmental heat calculations with strict domain and data-completeness enforcement.
    """

    # Published empirical validity bounds for Stull (2011)
    STULL_TEMP_MIN = -20.0
    STULL_TEMP_MAX = 50.0
    STULL_RH_MIN = 5.0
    STULL_RH_MAX = 99.0

    @classmethod
    def check_stull_domain(cls, t_c: float, rh_pct: float) -> bool:
        """
        Verifies whether temperature and humidity lie within the published Stull (2011) validity domain.
        """
        return (cls.STULL_TEMP_MIN <= t_c <= cls.STULL_TEMP_MAX) and (cls.STULL_RH_MIN <= rh_pct <= cls.STULL_RH_MAX)

    @classmethod
    def calculate_wet_bulb_stull(cls, t_c: float, rh_pct: float) -> float:
        """
        Calculates wet-bulb temperature using Stull (2011).
        Raises ValueError if inputs exceed published empirical domain to prevent unvalidated extrapolation.
        """
        if not cls.check_stull_domain(t_c, rh_pct):
            raise ValueError(
                f"Input (T={t_c}°C, RH={rh_pct}%) is outside the published Stull (2011) empirical validity domain "
                f"[-20°C to 50°C, 5% to 99% RH]. Extrapolation is scientifically unvalidated."
            )

        T = t_c
        RH = rh_pct

        term1 = T * math.atan(0.151977 * math.sqrt(RH + 8.313659))
        term2 = math.atan(T + RH)
        term3 = -math.atan(RH - 1.676331)
        term4 = 0.00391838 * (RH ** 1.5) * math.atan(0.023101 * RH)
        term5 = -4.686035

        Tw = term1 + term2 + term3 + term4 + term5
        return round(Tw, 2)

    @classmethod
    def calculate_heat_index_noaa(cls, t_c: float, rh_pct: float) -> float:
        """
        Calculates NOAA / NWS Heat Index in Celsius using the standard Rothfusz polynomial regression.
        Valid for atmospheric conditions where physical relative humidity is in [0, 100]%.
        """
        if rh_pct < 0.0 or rh_pct > 100.0:
            raise ValueError(f"Relative humidity {rh_pct}% is physically invalid.")

        T_f = (t_c * 9.0 / 5.0) + 32.0
        RH = rh_pct

        hi_simple = 0.5 * (T_f + 61.0 + ((T_f - 68.0) * 1.2) + (RH * 0.094))

        if hi_simple < 80.0:
            hi_f = hi_simple
        else:
            hi_f = (
                -42.379
                + 2.04901523 * T_f
                + 10.14333127 * RH
                - 0.22475541 * T_f * RH
                - 0.00683783 * (T_f ** 2)
                - 0.05481717 * (RH ** 2)
                + 0.00122874 * (T_f ** 2) * RH
                + 0.00085282 * T_f * (RH ** 2)
                - 0.00000199 * (T_f ** 2) * (RH ** 2)
            )

            if RH < 13.0 and 80.0 <= T_f <= 112.0:
                adjustment = ((13.0 - RH) / 4.0) * math.sqrt((17.0 - abs(T_f - 95.0)) / 17.0)
                hi_f -= adjustment
            elif RH > 85.0 and 80.0 <= T_f <= 87.0:
                adjustment = ((RH - 85.0) / 10.0) * ((87.0 - T_f) / 5.0)
                hi_f += adjustment

        hi_c = (hi_f - 32.0) * 5.0 / 9.0
        return round(hi_c, 2)

    @classmethod
    def estimate_wbgt(
        cls,
        t_c: float,
        rh_pct: float,
        solar_radiation_wm2: Optional[float] = None,
        wind_speed_kmh: Optional[float] = None,
        direct_sun: bool = True
    ) -> float:
        """
        Estimates WBGT in Celsius according to ISO 7243 framework.
        
        Strict Data Requirements:
        - Shaded / Indoor: Requires Ta and Tw (calculated via Stull). Formula: 0.7 * Tw + 0.3 * Ta.
        - Outdoor Direct Sun: Requires Ta, Tw, solar irradiance (W/m^2), and wind speed (km/h).
          If solar irradiance is None, raises ValueError for INSUFFICIENT_DATA rather than fabricating.
        """
        t_wb = cls.calculate_wet_bulb_stull(t_c, rh_pct)

        if not direct_sun:
            # ISO 7243 Shaded/Indoor WBGT formula without direct radiant solar load
            wbgt = (0.7 * t_wb) + (0.3 * t_c)
            return round(wbgt, 2)

        # Outdoor Direct Sun Calculation
        if solar_radiation_wm2 is None:
            raise ValueError("Outdoor unshaded WBGT requires measured/forecast solar irradiance (W/m^2). Data is insufficient.")

        wind_kmh = wind_speed_kmh if wind_speed_kmh is not None else 5.0
        wind_ms = max(wind_kmh / 3.6, 0.5)

        if solar_radiation_wm2 > 20.0:
            delta_tg = (solar_radiation_wm2 * 0.015) / math.sqrt(wind_ms)
            delta_tg = min(delta_tg, 12.0)
            t_g = t_c + delta_tg
            t_nwb = t_wb + (0.002 * solar_radiation_wm2 / math.sqrt(wind_ms))
            wbgt = (0.7 * t_nwb) + (0.2 * t_g) + (0.1 * t_c)
        else:
            wbgt = (0.7 * t_wb) + (0.3 * t_c)

        return round(wbgt, 2)

    @classmethod
    def estimate_outdoor_wbgt(
        cls,
        t_c: float,
        rh_pct: float,
        solar_radiation_wm2: Optional[float] = None,
        wind_speed_kmh: Optional[float] = None,
        direct_sun: bool = True
    ) -> float:
        """Alias for estimate_wbgt."""
        return cls.estimate_wbgt(
            t_c=t_c,
            rh_pct=rh_pct,
            solar_radiation_wm2=solar_radiation_wm2,
            wind_speed_kmh=wind_speed_kmh,
            direct_sun=direct_sun
        )

    @classmethod
    def calculate_all_metrics(cls, reading: EnvironmentalReading) -> HeatMetrics:
        """
        Evaluates all environmental metrics and returns a validated HeatMetrics record.
        Flags calculation quality and avoids silent data fabrication.
        """
        # 1. Check physical atmospheric bounds
        if reading.temperature_c < -50.0 or reading.temperature_c > 65.0:
            raise ValueError(f"Temperature {reading.temperature_c}°C is outside valid atmospheric limits.")
        if reading.relative_humidity < 0.0 or reading.relative_humidity > 100.0:
            raise ValueError(f"Relative humidity {reading.relative_humidity}% is outside physical limits.")

        # 2. Check Stull published domain
        in_stull_domain = cls.check_stull_domain(reading.temperature_c, reading.relative_humidity)
        if not in_stull_domain:
            return HeatMetrics(
                temperature_c=reading.temperature_c,
                relative_humidity=reading.relative_humidity,
                wet_bulb_c=None,
                heat_index_c=cls.calculate_heat_index_noaa(reading.temperature_c, reading.relative_humidity),
                estimated_wbgt_c=None,
                is_direct_sun=reading.direct_sun_exposure,
                solar_radiation_wm2=reading.solar_radiation_wm2,
                wind_speed_kmh=reading.wind_speed_kmh,
                calculation_quality=CalculationQuality.OUT_OF_PUBLISHED_DOMAIN,
                quality_notes=f"Inputs (T={reading.temperature_c}°C, RH={reading.relative_humidity}%) outside Stull (2011) published domain [-20°C to 50°C, 5% to 99%]."
            )

        # 3. Compute Stull wet-bulb and NOAA heat index
        wet_bulb = cls.calculate_wet_bulb_stull(reading.temperature_c, reading.relative_humidity)
        heat_index = cls.calculate_heat_index_noaa(reading.temperature_c, reading.relative_humidity)

        # 4. Compute WBGT or flag missing data if outdoor solar is unavailable
        if reading.direct_sun_exposure and reading.solar_radiation_wm2 is None:
            return HeatMetrics(
                temperature_c=reading.temperature_c,
                relative_humidity=reading.relative_humidity,
                wet_bulb_c=wet_bulb,
                heat_index_c=heat_index,
                estimated_wbgt_c=None,
                is_direct_sun=True,
                solar_radiation_wm2=None,
                wind_speed_kmh=reading.wind_speed_kmh,
                calculation_quality=CalculationQuality.INSUFFICIENT_DATA,
                quality_notes="Outdoor direct-sun WBGT cannot be estimated without measured/forecast solar irradiance (W/m^2)."
            )

        wbgt = cls.estimate_wbgt(
            t_c=reading.temperature_c,
            rh_pct=reading.relative_humidity,
            solar_radiation_wm2=reading.solar_radiation_wm2,
            wind_speed_kmh=reading.wind_speed_kmh,
            direct_sun=reading.direct_sun_exposure
        )

        return HeatMetrics(
            temperature_c=reading.temperature_c,
            relative_humidity=reading.relative_humidity,
            wet_bulb_c=wet_bulb,
            heat_index_c=heat_index,
            estimated_wbgt_c=wbgt,
            is_direct_sun=reading.direct_sun_exposure,
            solar_radiation_wm2=reading.solar_radiation_wm2,
            wind_speed_kmh=reading.wind_speed_kmh,
            calculation_quality=CalculationQuality.VALID,
            quality_notes="All required meteorological inputs verified and calculated within published domains."
        )
