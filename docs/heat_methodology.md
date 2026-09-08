# ThermoShift: Heat-Risk Methodology & Exposure Model

## 1. Environmental Measurement / Model

ThermoShift uses deterministic, peer-reviewed meteorological formulations to estimate worksite ambient heat conditions:

### Psychrometric Wet-Bulb Formulation ($T_w$)
- **Reference:** Stull, R. (2011). *Wet-Bulb Temperature from Relative Humidity and Air Temperature.* Journal of Applied Meteorology and Climatology, 50(11), 2267–2269.
- **Formulation:** Computes thermodynamic wet-bulb temperature ($T_w$) as a function of ambient dry-bulb temperature ($T_a$) and relative humidity ($RH$) at standard sea-level pressure.
- **Published Empirical Validity Domain:**
  - Air temperature: $-20.0^\circ\text{C} \le T_a \le 50.0^\circ\text{C}$
  - Relative humidity: $5.0\% \le RH \le 99.0\%$
  - Atmospheric pressure: Standard sea-level ($\approx 101.325\text{ kPa}$)
- **Domain Enforcement:** The engine strictly enforces these bounds. Inputs outside $[-20^\circ\text{C}, 50^\circ\text{C}]$ or $[5\%, 99\%]$ are rejected (`ValueError` or `OUT_OF_PUBLISHED_DOMAIN` calculation quality flag) to prevent unvalidated numerical extrapolation.

### Wet-Bulb Globe Temperature (WBGT) Framework
- **Reference Standard:** ISO 7243:2017 (*Hot environments — Estimation of heat stress on working man, based on WBGT-index*) and meteorological estimation literature (Liljegren et al., 2008).
- **Distinction between Framework and Meteorological Estimation:**
  - **ISO 7243 Framework Definition:**
    $$\text{WBGT}_{\text{outdoor}} = 0.7 T_{\text{nwb}} + 0.2 T_g + 0.1 T_a$$
    $$\text{WBGT}_{\text{shaded/indoor}} = 0.7 T_w + 0.3 T_a$$
    where $T_{\text{nwb}}$ is the natural wet-bulb temperature, $T_g$ is the 150 mm black globe temperature, and $T_a$ is the ambient dry-bulb temperature.
  - **Meteorological Estimation Approach:** When physical black globe and natural wet-bulb sensors are absent, $T_g$ elevation above ambient is estimated from solar irradiance ($S$ in $\text{W/m}^2$) and convective wind dissipation ($v$ in $\text{m/s}$).

### NOAA National Weather Service (NWS) Heat Index
- **Reference:** Rothfusz, L. P. (1990) polynomial regression with Steadman baseline adjustments.

---

## 2. Occupational Safety Policy

ThermoShift establishes a strict architectural separation between **Authoritative Occupational Safety Constraints** (hard boundaries) and **Engineering Optimization Objectives** (scheduling heuristics). Safety constraints must always be satisfied first.

```
+-----------------------------------------------------------------------------------+
|               TIER 1: AUTHORITATIVE OCCUPATIONAL SAFETY CONSTRAINTS               |
|               (Hard Boundaries: Must be satisfied before optimization)            |
|                                                                                   |
|  1. Work/Rest Duration Limits (OSHA/NIOSH Risk Bands)                             |
|  2. Acclimatization Policy (NIOSH 2016 Progressive Exposure Caps)                 |
|  3. Administrative Supervisor Precautions (Vulnerability Work Caps)               |
|  4. Mandatory Shade/Cooling Rest Intervals and Hydration Quotas                   |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|               TIER 2: ENGINEERING OPTIMIZATION OBJECTIVES                         |
|               (Prototype Heuristic: Minimizes cost & hot-work duration)           |
|                                                                                   |
|  1. Minimize cumulative hot-work scheduling during peak heat hours               |
|  2. Balance physical task intensities across available workforce                  |
|  3. Prioritize trade dependencies and project milestone deadlines                 |
+-----------------------------------------------------------------------------------+
```

### Acclimatization Policy
- **Authoritative Source:** NIOSH (2016) *Criteria for a Recommended Standard: Occupational Exposure to Heat and Hot Environments* (DHHS/NIOSH Pub No. 2016-106).
- **Policy Structure:**
  - New/unacclimatized workers are subjected to strict continuous exposure duration caps (e.g., maximum 30 minutes continuous work) and increased rest cycle proportions (e.g., $1.5\times$ rest multiplier).
  - NIOSH progressive schedule: Day 1: maximum 20% exposure, Day 2: 40%, Day 3: 60%, Day 4: 80%, Day 5+: 100%.
  - Acclimatization is NOT represented as a physiological body temperature multiplier.

### Operational Vulnerability Classification
- The `HeatVulnerabilityLevel` field (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) represents an **administrative supervisor classification** enabling proactive worksite safety limits (such as setting a lower maximum continuous work duration cap or requiring extended recovery rest).
- It is NOT a clinical medical diagnosis or physiological factor.

### Work/Rest and Recovery Rules
- Recovery is modeled through policy-defined rest periods in designated shade shelters or air-conditioned cooling stations.
- Continuous work duration exceeding the policy-defined threshold for a given WBGT risk band is flagged as a safety violation.

---

## 3. Engineering Optimization Model

The optimization engine (OR-Tools CP-SAT) uses a heuristic objective function to balance schedules:
- **Decision Variables:** `Assignment(worker, task_or_rest, zone, time_slot)`.
- **Hard Constraints (Tier 1):**
  - Worker work duration in slot $t$ $\le$ Policy maximum continuous work limit.
  - Mandatory rest minutes in shade/cooling trailer enforced per hour.
  - Task skill requirements, task precedence dependencies, and resource capacity limits (e.g., cooling station capacity).
- **Objective Function (Tier 2):** Minimizes total weighted heuristic exposure penalties (scheduling heavy tasks during cooler hours), minimizes deadline delays, and maximizes workforce utilization.

---

## 4. Engineering Assumptions

The following parameters are classified strictly as **ENGINEERING ASSUMPTIONS / PROTOTYPE PARAMETERS** for solver objective weighting and prototyping:

| Parameter | Prototype Value | Classification | Usage in ThermoShift |
|---|---|---|---|
| **Light Workload Weight** | $1.0$ | Engineering Assumption | Solver objective weighting for inspection/light tasks |
| **Medium Workload Weight** | $1.6$ | Engineering Assumption | Solver objective weighting for carpentry/masonry |
| **Heavy Workload Weight** | $2.4$ | Engineering Assumption | Solver objective weighting for concrete/rebar/roofing |
| **Extreme Workload Weight** | $3.2$ | Engineering Assumption | Solver objective weighting for continuous welding in heavy PPE |
| **Ambient Shade Rest Weight** | $-1.4$ | Engineering Assumption | Relative objective credit for scheduled shade rest |
| **Cooled Shelter Rest Weight** | $-2.2$ | Engineering Assumption | Relative objective credit for scheduled AC trailer rest |

> [!IMPORTANT]
> **Explicit Boundary:** These weights are non-dimensional heuristic parameters used strictly to guide the mathematical optimization solver toward preferable schedules. They do **NOT** represent physiological metabolic rates, calories, core temperature changes, or medical strain metrics.

---

## 5. Known Limitations

1. **Stull Empirical Domain:** Stull (2011) psychrometric wet-bulb formulation is valid only within $-20^\circ\text{C} \le T_a \le 50^\circ\text{C}$ and $5\% \le RH \le 99\%$ at sea-level pressure. It does not account for high-altitude barometric pressure variations.
2. **Radiation Modeling:** Direct solar globe temperature calculations represent open-field approximations. Complex microclimates (e.g., urban street canyons, reflective metal decking, enclosed boiler rooms) require localized physical sensor readings.
3. **Clothing & PPE Adjustments:** Standard WBGT thresholds apply to standard work clothing (long-sleeved shirt and pants). Vapor-barrier or chemical protective clothing (Level A/B/C hazmat) requires authoritative Clothing Adjustment Factors (CAF per ACGIH) added directly to WBGT.

---

## 6. Data Insufficiency Behavior

The system strictly enforces data integrity:
- **Outdoor Direct-Sun WBGT:** Requires measured or forecasted ambient dry-bulb temperature ($T_a$), relative humidity ($RH$), and global solar irradiance ($S$, $\text{W/m}^2$).
- **Missing Solar Irradiance:** If solar irradiance is unmeasured/unavailable for an outdoor direct-sun zone, the engine **DOES NOT fabricate arbitrary solar values**.
- **Explicit Quality State:** The system returns `CalculationQuality.INSUFFICIENT_DATA`, sets `estimated_wbgt_c = None`, logs quality notes, and applies conservative baseline safety precautions.
- **Shaded/Indoor Zones:** Shaded/indoor WBGT ($0.7 T_w + 0.3 T_a$) only requires $T_a$ and $RH$ and evaluates to `CalculationQuality.VALID`.

---

## 7. Non-Medical Disclaimer

> [!CAUTION]
> **LEGAL & OCCUPATIONAL HEALTH DISCLAIMER:**
> 
> ThermoShift is an engineering decision-support and workforce scheduling optimization tool. All outputs, risk bands, and recommendations are generated mathematically based on user-provided environmental inputs and published occupational guidelines (such as OSHA and NIOSH).
> 
> **ThermoShift DOES NOT:**
> - Measure, monitor, or predict individual internal core body temperature, cardiovascular strain, or vital signs.
> - Provide clinical medical diagnoses, health status clearances, or medical advice.
> - Guarantee prevention of heat-related illness or medical emergencies.
> 
> Real-time occupational safety remains the sole responsibility of certified on-site safety personnel, industrial hygienists, and licensed healthcare professionals.
