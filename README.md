<div align="center">

# 🌡️ ThermoShift
### *Intelligent Heat-Aware Workforce Scheduling & Decision Intelligence*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![OR-Tools](https://img.shields.io/badge/Google_OR--Tools-CP--SAT-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/optimization)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Tests](https://img.shields.io/badge/Tests-111%20Passed-success?style=for-the-badge&logo=pytest&logoColor=white)](optimizer/tests)

<p align="center">
  <b>A supervisor-facing decision-support system that generates mathematically optimal, heat-safe work-and-rest schedules for outdoor industrial sites under extreme thermal stress.</b>
</p>

[Key Features](#-key-features) • [Architecture](#-system-architecture) • [Optimization Engine](#-mathematical-optimization-engine) • [Quick Start](#-quick-start-guide) • [Safety Framework](#-occupational-safety-framework)

---

</div>

## 📌 Executive Summary

High-temperature outdoor worksites (construction, oil & gas, mining, utilities, and infrastructure) face an escalating operational challenge: **ambient heat waves degrade physical performance and risk severe heat illness**, yet project milestones remain non-negotiable.

Traditional manual shift scheduling fails when temperatures spike unpredictably. **ThermoShift** solves this by formulating site operations into a **Constraint Programming (CP-SAT)** model that dynamically synchronizes:

1. **Environmental Heat Physics**: Real-time hourly Wet-Bulb Globe Temperature (WBGT) computed via ambient temperature, relative humidity, wind speed, and solar irradiance.
2. **Physiological Work-Rest Boundaries**: Dynamic break requirements scaled by metabolic workload intensity (light, moderate, heavy, severe) and sun exposure.
3. **Trade Certification Matrix**: Multi-trade worker assignments (welding, electrical, heavy equipment, carpentry, masonry).
4. **Physical Site Resource Caps**: Hard capacity limits on air-conditioned recovery trailers, hydration stations, and shade structures.
5. **Project Milestone Precedence**: Task dependency graphs and strict target deadlines.

```
       ENVIRONMENT                  WORKFORCE                   RESOURCES
 ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
 │  Live Weather Feed   │    │  Certified Trades    │    │  Cooling Trailers    │
 │  WBGT Heat Stress    │    │  Acclimatization     │    │  Shade Structures    │
 │  Solar Irradiance    │    │  Shift Availabilities│    │  Hydration Points    │
 └──────────┬───────────┘    └──────────┬───────────┘    └──────────┬───────────┘
            │                           │                           │
            └───────────────────────────┼───────────────────────────┘
                                        ▼
                 ┌─────────────────────────────────────────────┐
                 │       ThermoShift CP-SAT Optimizer          │
                 │   (Google OR-Tools Mathematical Engine)     │
                 └──────────────────────┬──────────────────────┘
                                        ▼
                 ┌─────────────────────────────────────────────┐
                 │          EXACT OPERATIONAL DISPATCH         │
                 │   WHO  •  WHAT  •  WHEN  •  WHERE  •  REST  │
                 └─────────────────────────────────────────────┘
```

---

## ✨ Key Features

<table>
  <tr>
    <td width="50%">
      <h3>🌤️ Live Weather & WBGT Modeling</h3>
      <ul>
        <li>Direct integration with <b>Open-Meteo API</b> for live microclimate forecasting.</li>
        <li>Computes <b>Wet-Bulb Temperature ($T_w$)</b> via the <i>Stull Empirical Equation</i> and calculates outdoor WBGT using ISO 7243 / Liljegren principles.</li>
        <li>Solar radiation and wind-speed attenuation adjustments.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>⚡ OR-Tools CP-SAT Optimizer</h3>
      <ul>
        <li>15-minute slot resolution across full shift horizons.</li>
        <li>Hard mathematical guarantees: no worker exceeds safe heat limits.</li>
        <li><b>3 Strategic Solver Modes</b>:
          <ul>
            <li><code>BALANCED</code>: Optimum blend of progress & recovery.</li>
            <li><code>FASTEST</code>: Deadline-driven earliest delivery.</li>
            <li><code>SAFEST</code>: Maximum thermal safety margins.</li>
          </ul>
        </li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🧪 "What-If" Counterfactual Engine</h3>
      <ul>
        <li>Test real-time operational contingencies in memory:
          <ul>
            <li>🌡️ Sudden temperature surge (+2°C to +8°C).</li>
            <li>👷 Worker absenteeism / unexpected sick leave.</li>
            <li>⛺ Cooling trailer power loss / shade capacity drop.</li>
            <li>⏱️ Accelerated milestone deadlines.</li>
          </ul>
        </li>
        <li>Side-by-side delta visualization without database mutations.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>🧠 Deterministic Decision Intelligence</h3>
      <ul>
        <li>Every schedule assignment includes an explainability trace:
          <code>Fact → Reason → Impact</code>.</li>
        <li>Supervisors receive clear justifications for why high-intensity tasks were shifted to morning hours or why specific recovery breaks were enforced.</li>
        <li>Zero black-box decisions.</li>
      </ul>
    </td>
  </tr>
</table>

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    subgraph Client["Frontend Layer (React 18 + Vite + Tailwind CSS)"]
        UI[Operational Dashboard & Timeline]
        WhatIf[What-If Scenario Simulator]
        Roster[Roster & Resource Management]
    end

    subgraph Service["Backend Services Layer"]
        FastAPI["FastAPI Orchestrator (:8000)"]
        Express["Node.js Express API (:5000)"]
    end

    subgraph Engine["Optimizer & Compute Core (Python 3.10+)"]
        Weather["Weather Ingestion & WBGT Engine"]
        CPSAT["Google OR-Tools CP-SAT Solver"]
        Explainer["Decision Intelligence Generator"]
    end

    subgraph Data["Persistence & External Services"]
        Supabase[("Supabase PostgreSQL\n(RLS, Sites, Workforce, Tasks)")]
        OpenMeteo["Open-Meteo Weather API"]
    end

    UI -->|REST / JSON| FastAPI
    WhatIf -->|Simulate Request| FastAPI
    Roster -->|CRUD| Supabase
    FastAPI -->|Fetch Weather| OpenMeteo
    FastAPI -->|Invoke Model| CPSAT
    Weather --> CPSAT
    CPSAT --> Explainer
    FastAPI -->|Persist Schedule| Supabase
```

---

## 🧮 Mathematical Optimization Engine

ThermoShift formulates shift assignment as a discrete **Constraint Satisfaction & Optimization Problem (COP)**:

$$\min \quad w_1 \cdot \text{Makespan} + w_2 \cdot \sum \text{HeatPenalties} + w_3 \cdot \sum \text{ResourceOverhead}$$

### Core Constraints Formulated in CP-SAT

1. **Trade Qualification Invariant**:
   $$\forall t \in \text{Tasks}, \forall w \in \text{AssignedWorkers}(t): \quad \text{RequiredSkill}(t) \subseteq \text{Skills}(w)$$

2. **Thermal Work-Rest Recovery Schedule**:
   $$\text{ContinuousWorkMinutes}(w, \text{interval}) \le \text{MaxSafeExposure}(\text{WBGT}(\text{interval}), \text{Intensity}(t))$$

3. **Cooling Infrastructure Bounds**:
   $$\forall \text{slot } s, \quad \sum_{w \in \text{RestingWorkers}(s)} 1 \le \sum_{r \in \text{RecoveryAssets}} \text{Capacity}(r)$$

4. **Task Precedence & Dependency Chain**:
   $$\text{StartSlot}(t_B) \ge \text{EndSlot}(t_A) \quad \forall (t_A \to t_B) \in \text{Dependencies}$$

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **npm**
- **Supabase Account** (or local PostgreSQL instance)

---

### 1. Clone & Setup Environment

```bash
# Clone the repository
git clone https://github.com/HAFIZ-HAASHIM/thermoshift.git
cd thermoshift

# Copy environment templates
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
cp optimizer/.env.example optimizer/.env
```

### 2. Configure Optimizer & Run Python Services

```bash
# Initialize Python virtual environment
python -m venv optimizer/venv

# Activate environment
# On Windows:
.\optimizer\venv\Scripts\activate
# On Linux/macOS:
source optimizer/venv/bin/activate

# Install dependencies
pip install -r optimizer/requirements.txt

# Run the complete test suite (111 unit & integration tests)
pytest

# Launch the FastAPI Optimizer Engine
uvicorn optimizer.engine.api:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Launch Frontend Dashboard

```bash
cd frontend
npm install
npm run dev
```

The web dashboard will be active at **`http://localhost:5173`**.

---

## 🧪 Comprehensive Verification Suite

The repository contains an exhaustive test suite covering all thermal calculations, mathematical optimization models, API endpoints, and failure recoveries.

```bash
# Execute test suite with verbose coverage
pytest -v
```

```text
============================= test session starts =============================
platform win32 -- Python 3.14.0, pytest-8.3.4, pluggy-1.5.0
collected 111 items

optimizer/tests/test_api.py ................................             [ 28%]
optimizer/tests/test_counterfactuals.py ...................              [ 45%]
optimizer/tests/test_explainer.py ................                       [ 60%]
optimizer/tests/test_model.py .........................                  [ 82%]
optimizer/tests/test_weather.py ....................                     [100%]

============================= 111 passed in 177.34s ============================
```

---

## 📂 Repository Structure

```text
thermoshift/
├── frontend/                  # React 18 + TypeScript + Vite Web Application
│   ├── src/
│   │   ├── components/        # Operational Timeline, Roster, What-If UI, Modals
│   │   ├── services/          # Supabase Client & Optimizer API Integrations
│   │   ├── types/             # Strict TypeScript Type Definitions
│   │   └── utils/             # WBGT Helpers & Formatters
├── backend/                   # Node.js Express REST Backend Layer
├── optimizer/                 # Core Python Optimization Engine
│   ├── engine/
│   │   ├── api.py             # FastAPI REST Microservice
│   │   ├── model.py           # Google OR-Tools CP-SAT Scheduling Formulation
│   │   ├── weather.py         # Open-Meteo & Stull/ISO-7243 WBGT Computation
│   │   ├── explainer.py       # Deterministic Decision Intelligence Engine
│   │   └── counterfactuals.py # What-If Simulation Engine
│   └── tests/                 # 111 Automated Unit & Integration Tests
├── supabase/                  # Database Schemas, RLS Policies & Migrations
│   ├── migrations/            # Relational PostgreSQL Table Definitions
│   └── seed.sql               # Reference Development Dataset
└── README.md                  # Project Documentation
```

---

## 🛡️ Occupational Safety Framework

> **⚠️ Regulatory & Clinical Disclaimer**:  
> ThermoShift is an **operational decision-support tool** designed to assist site supervisors in planning workflow breaks. It incorporates academic and occupational thermal safety models (including principles from **OSHA**, **NIOSH**, and the **ISO 7243** standard for hot environments).  
>  
> ThermoShift **does not** provide medical diagnosis, biometric monitoring, or a statutory guarantee of individual worker safety. Local labor regulations, real-time wet-bulb measurements, and supervisor safety oversight must always supersede algorithmic recommendations.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
