"""
ThermoShift - Heat Methodology Test Suite
Validates:
1. Stull (2011) published empirical domain boundaries (-20°C to 50°C, 5% to 99% RH).
2. Stull out-of-domain rejection (explicit ValueError to prevent unvalidated extrapolation).
3. NOAA Heat Index calculations.
4. Handling of missing outdoor solar radiation (INSUFFICIENT_DATA calculation quality state).
5. Shaded vs unshaded WBGT distinction.
6. Deterministic repeatability.
"""
import pytest
from optimizer.engine.heat_methodology import (
    HeatMethodologyEngine,
    EnvironmentalReading,
    HeatMetrics,
    CalculationQuality
)


def test_stull_wet_bulb_psychrometric_benchmarks():
    """Validates Stull (2011) within published empirical domain."""
    # Benchmark 1: 30°C at 50% RH -> Stull Wet Bulb ~22.25°C
    tw1 = HeatMethodologyEngine.calculate_wet_bulb_stull(30.0, 50.0)
    assert 21.5 <= tw1 <= 23.0

    # Benchmark 2: 35°C at 60% RH -> Stull Wet Bulb ~28.15°C
    tw2 = HeatMethodologyEngine.calculate_wet_bulb_stull(35.0, 60.0)
    assert 27.5 <= tw2 <= 29.0

    # Benchmark 3: 20°C at 95% RH (within 99% published bound)
    tw3 = HeatMethodologyEngine.calculate_wet_bulb_stull(20.0, 95.0)
    assert 19.0 <= tw3 <= 20.0


def test_stull_published_domain_boundaries():
    """Verifies boundary values at the edges of published empirical domain [-20°C, 50°C], [5%, 99%]."""
    # Lower bounds
    tw_low = HeatMethodologyEngine.calculate_wet_bulb_stull(-20.0, 5.0)
    assert isinstance(tw_low, float)

    # Upper bounds
    tw_high = HeatMethodologyEngine.calculate_wet_bulb_stull(50.0, 99.0)
    assert isinstance(tw_high, float)


def test_stull_out_of_domain_rejection():
    """Explicitly rejects out-of-domain inputs to prevent scientifically unvalidated extrapolation."""
    # Temperature below -20°C
    with pytest.raises(ValueError, match="outside the published Stull"):
        HeatMethodologyEngine.calculate_wet_bulb_stull(-25.0, 50.0)

    # Temperature above 50°C
    with pytest.raises(ValueError, match="outside the published Stull"):
        HeatMethodologyEngine.calculate_wet_bulb_stull(52.0, 50.0)

    # Relative humidity below 5%
    with pytest.raises(ValueError, match="outside the published Stull"):
        HeatMethodologyEngine.calculate_wet_bulb_stull(30.0, 4.0)

    # Relative humidity above 99% (e.g. 100%)
    with pytest.raises(ValueError, match="outside the published Stull"):
        HeatMethodologyEngine.calculate_wet_bulb_stull(30.0, 100.0)


def test_noaa_heat_index_rothfusz_benchmarks():
    """Validates NOAA NWS Heat Index standard regression."""
    # Mild weather (75°F / ~24°C) -> Heat index equals air temp
    hi1 = HeatMethodologyEngine.calculate_heat_index_noaa(24.0, 50.0)
    assert 23.0 <= hi1 <= 25.5

    # Hot & humid (90°F / ~32.2°C at 70% RH) -> NOAA HI ~105°F / ~40.5°C
    hi2 = HeatMethodologyEngine.calculate_heat_index_noaa(32.2, 70.0)
    assert 38.0 <= hi2 <= 43.0


def test_outdoor_wbgt_sun_vs_shade_delta():
    """Direct radiant solar load increases WBGT above shaded environment."""
    t_c = 34.0
    rh = 50.0
    solar = 800.0
    wind = 10.0

    wbgt_sun = HeatMethodologyEngine.estimate_wbgt(t_c, rh, solar, wind, direct_sun=True)
    wbgt_shade = HeatMethodologyEngine.estimate_wbgt(t_c, rh, solar, wind, direct_sun=False)

    assert wbgt_sun > wbgt_shade
    assert 1.5 <= (wbgt_sun - wbgt_shade) <= 5.5


def test_missing_solar_radiation_insufficient_data_state():
    """Outdoor direct sun requires solar radiation; returns INSUFFICIENT_DATA without fabricating values."""
    reading_missing_solar = EnvironmentalReading(
        temperature_c=35.0,
        relative_humidity=50.0,
        solar_radiation_wm2=None,  # Missing
        direct_sun_exposure=True
    )
    result = HeatMethodologyEngine.calculate_all_metrics(reading_missing_solar)

    assert result.calculation_quality == CalculationQuality.INSUFFICIENT_DATA
    assert result.estimated_wbgt_c is None
    assert "cannot be estimated without measured/forecast solar irradiance" in result.quality_notes


def test_shaded_environment_does_not_require_solar_radiation():
    """Shaded / indoor WBGT depends only on Ta and Tw and can be computed without solar irradiance."""
    reading_shaded = EnvironmentalReading(
        temperature_c=35.0,
        relative_humidity=50.0,
        solar_radiation_wm2=None,
        direct_sun_exposure=False
    )
    result = HeatMethodologyEngine.calculate_all_metrics(reading_shaded)

    assert result.calculation_quality == CalculationQuality.VALID
    assert result.estimated_wbgt_c is not None


def test_out_of_published_domain_quality_flag():
    """When inputs exceed Stull published limits, flag calculation quality without crashing full report."""
    reading_hot = EnvironmentalReading(
        temperature_c=55.0,  # > 50°C Stull bound
        relative_humidity=30.0,
        solar_radiation_wm2=800.0,
        direct_sun_exposure=True
    )
    result = HeatMethodologyEngine.calculate_all_metrics(reading_hot)

    assert result.calculation_quality == CalculationQuality.OUT_OF_PUBLISHED_DOMAIN
    assert result.wet_bulb_c is None
    assert result.estimated_wbgt_c is None
    assert result.heat_index_c is not None  # NOAA HI is still computable


def test_deterministic_repeatability():
    """Calculations are completely deterministic and free of side effects."""
    reading = EnvironmentalReading(
        temperature_c=33.5,
        relative_humidity=55.0,
        solar_radiation_wm2=750.0,
        wind_speed_kmh=12.0,
        direct_sun_exposure=True
    )
    result1 = HeatMethodologyEngine.calculate_all_metrics(reading)
    result2 = HeatMethodologyEngine.calculate_all_metrics(reading)

    assert result1.wet_bulb_c == result2.wet_bulb_c
    assert result1.heat_index_c == result2.heat_index_c
    assert result1.estimated_wbgt_c == result2.estimated_wbgt_c
    assert result1.calculation_quality == result2.calculation_quality
