# Claidex Frontend

Premium healthcare provider risk intelligence platform built with Next.js 15, React 19, and Tailwind CSS v4.

## Features

### 🌟 Dual View Modes

1. **Provider Detail View (Light Mode)**
   - Clean, professional interface with Pearl White background
   - Searchable provider sidebar with live filtering
   - Interactive provider profile with tabs (Overview, Summary, Details, History)
   - Embedded map visualization showing provider locations
   - Risk scoring and compliance indicators
   - Case notes and review checklist

2. **Network Risk Cockpit (Dark Mode)**
   - Professional dark interface for risk analysis
   - Chat assistant for data queries
   - Real-time dashboards with multiple widgets
   - Interactive charts and network graphs

## Getting Started

1. **Copy env and point to the API** (required for dashboard/data):
   ```bash
   cp .env.local.example .env.local
   ```
   Edit `.env.local`: set `NEXT_PUBLIC_API_BASE_URL` to your API URL (e.g. `http://localhost:4002` when the API runs locally on port 4002).

2. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000)

**Backend:** Start the API from repo root so it can read `.env` (Neon/Neo4j):  
`cd api && npm run dev` — ensure repo root `.env` has `NEON_PROVIDERS_URL` (pooled URL from Neon Console) or `POSTGRES_URL`, and `NEO4J_*` set.
