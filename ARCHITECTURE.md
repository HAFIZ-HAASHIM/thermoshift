# 🌡️ ThermoShift Architecture & Decision Intelligence

ThermoShift is an intelligent, heat-aware workforce scheduling and decision intelligence platform designed to protect industrial and outdoor field personnel from extreme thermal strain while optimizing labor productivity.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Environmental Telemetry                  │
│       (IoT Weather Stations · WBGT Sensors · Forecast APIs) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Thermal Index Engine                      │
│        (Wet Bulb Globe Temp · Heat Index · Strain Rate)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Workforce Shift Optimizer                   │
│      (Linear Programming · Rest Interval Scheduler · AI)    │
└───────┬──────────────────────┬──────────────────────┬───────┘
        │                      │                      │
        ▼                      ▼                      ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ Dynamic Rest │       │ Shift Swapping│      │ Critical Heat│
│ Allocator    │       │ Recommendation│      │ Safety Alerts│
└───────┬──────┘       └───────┬──────┘       └───────┬──────┘
        │                      │                      │
        ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Operations Dashboard UI                   │
│            (Next.js · Tailwind CSS · Supabase DB)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔬 Scientific & Algorithmic Foundations

1. **Wet Bulb Globe Temperature (WBGT) Calculation:** Computes ISO 7243 compliance based on dry bulb temp, humidity, wind velocity, and solar radiation.
2. **Work-Rest Cycle Generator:** Generates automated pacing schedules (e.g. 45 min work / 15 min rest at WBGT 30°C).
3. **Productivity Optimization:** Balances crew rotation schedules to prevent project delays while enforcing strict occupational health thresholds.
