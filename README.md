# ThermoShift

> Heat-aware workforce scheduling and decision support for outdoor worksites.

ThermoShift is a supervisor-facing decision-support application that generates feasible, heat-safe work and rest schedules for outdoor operations under extreme heat stress conditions.

---

## The Problem

Site supervisors facing severe ambient heat must balance multiple competing constraints:
- **Heat Exposure & Thermal Strain**: Rising WBGT temperatures mandate scheduled recovery intervals to prevent heat-related illness.
- **Workforce Availability & Trade Qualifications**: Specific tasks require certified trade skills (welding, electrical, carpentry, masonry).
- **Physical Intensity & Sun Exposure**: Heavy manual tasks in direct sunlight accelerate heat accumulation compared to shaded light utility work.
- **Limited Recovery Infrastructure**: On-site shade structures and cooling trailers have finite physical occupant capacities.
- **Operational Deadlines & Task Precedence**: Dependent tasks must finish on time without bypassing safety requirements.

---

## The Solution

ThermoShift transforms these complex environmental and operational variables into an actionable, transparent work-rest schedule. By formulating scheduling as a Constraint Programming problem solved with **Google OR-Tools CP-SAT**, ThermoShift balances project timelines against heat safety guidelines.

```
Heat + Workers + Skills + Tasks + Resources + Deadlines
                        ↓
                   ThermoShift
                        ↓
          WHO → WHAT → WHEN → WHERE → REST
```

---

## Key Features

- **Live Weather & WBGT Calculation**: Hourly weather forecasts from Open-Meteo converted into outdoor Wet-Bulb Globe Temperature (WBGT) using the Stull empirical wet-bulb equation and ISO 7243 / Liljegren methodology.
- **Heat-Aware CP-SAT Optimization**: Mathematical solver enforcing non-negotiable recovery breaks, team size requirements, trade qualifications, and cumulative shade capacities across 15-minute time slots.
- **Configurable Optimization Modes**:
  - `BALANCED`: Optimizes schedule duration while maximizing recovery quality and respecting trade assignments.
  - `FASTEST`: Prioritizes earliest task completion within strict safety boundaries.
  - `SAFEST`: Prioritizes maximal recovery margins and paces heavy work during cooler morning hours.
- **What-If Scenario Simulation**: In-memory simulation engine for testing ambient temperature surges, unexpected worker absences, shade capacity drops, or earlier deadlines without mutating production database records.
- **Deterministic Decision Intelligence**: Structured Fact → Reason → Impact explanations detailing exactly why tasks were sequenced at specific times.
- **Persistent Relational Operations**: Direct Supabase PostgreSQL integration for multi-site workforce rosters, tasks, and recovery assets.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   React + Vite Frontend                  │
│  (Operational Dashboard, Timeline, What-If, Roster CRUD) │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│               Backend & Orchestration Layer              │
│       (FastAPI @ :8000  /  Node.js Express @ :5000)      │
└──────────────┬─────────────────────────────┬─────────────┘
               │                             │
               ▼                             ▼
┌──────────────────────────────┐ ┌─────────────────────────┐
│     Supabase PostgreSQL      │ │   Python Optimizer Core │
│ (Sites, Workers, Tasks, etc) │ │   (Google OR-Tools)     │
└──────────────────────────────┘ └─────────────────────────┘
```

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **Backend API**: Node.js, Express, TypeScript / Python FastAPI
- **Database**: Supabase PostgreSQL (RLS policies, relational schema)
- **Optimizer**: Python, Google OR-Tools CP-SAT solver
- **Environmental Data**: Open-Meteo API (live hourly temperature, relative humidity, wind speed, solar irradiance)

---

## Safety Positioning & Scope

> **Important Notice**: ThermoShift is a decision-support and workflow optimization tool. It references occupational heat-safety guidance (such as OSHA, NIOSH, and the India Ministry of Labour & Employment heat frameworks) to generate operational schedules.
>
> ThermoShift **does not provide medical advice, physiological diagnosis, official certification, regulatory compliance guarantees, or a guarantee of worker safety**. Real-world environmental conditions, individual health status, and supervisor judgment must always govern site operations.

---

## Data Taxonomy

- **Live Data**: Real-time hourly weather forecasts retrieved dynamically via Open-Meteo for the site's geographic coordinates.
- **User-Provided Data**: Worksite profiles, worker rosters, trade skills, daily tasks, precedence constraints, and physical recovery resources stored in Supabase.
- **Development / Reference Data**: `supabase/seed.sql` provides an offline reference dataset for development and automated testing. Normal application runtime does not depend on seed records.

---

## Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+
- Supabase project (or local instance)

### 1. Repository Setup & Environment Configuration
```bash
# Clone the repository
git clone https://github.com/HAFIZ-HAASHIM/thermoshift.git
cd thermoshift

# Configure environment files
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
cp optimizer/.env.example optimizer/.env
```

### 2. Python Optimizer & Backend API
```bash
# Set up Python virtual environment
python -m venv optimizer/venv

# Activate virtual environment
# Windows:
.\optimizer\venv\Scripts\activate
# macOS/Linux:
source optimizer/venv/bin/activate

# Install dependencies
pip install -r optimizer/requirements.txt

# Run automated tests (111 tests)
pytest

# Start the FastAPI scheduling service
uvicorn optimizer.engine.api:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend Web Application
```bash
cd frontend
npm install
npm run dev
```

The application will be available at `http://localhost:5173`.

---

## License

This project is licensed under the MIT License.
