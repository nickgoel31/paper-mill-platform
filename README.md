# PaperMill ERP — Production & Deckle Optimization System

A specialized, high-performance production ERP tailored for **Kraft Paper Mills** in India. Built with **Next.js 15 App Router**, **TypeScript**, **PostgreSQL / Prisma**, and a mathematical **Google OR-Tools** cutting-stock solver in **Python FastAPI**.

---

## 1. Domain & Business Rules

1. **Rule A (One GSM per run)**: Hard physical constraint. A paper machine produces a continuous web of one paper grade (GSM) at a time. Items of different GSM grades are never mixed in the same production run or cutting pattern.
2. **Rule B (Dynamic Machine Deckle)**: Paper machines are dynamic database records (e.g. Machine 1 with 196" max deckle, Machine 2 with 100" max deckle). Width limits and trim bounds are never hardcoded.
3. **Rule C (Tolerance Bands)**: Standard ±5.0% tolerance band allows the solver and operators to over/under-produce within safe commercial thresholds.
4. **Rule D (Trim Bounds)**: Trim waste is strictly bounded by machine physical constraints (e.g. `min_trim_inch: 0.5"`, `max_trim_inch: 6.0"`).
5. **Rule E (Multi-Client Dispatch Fan-Out)**: A single truck delivery carrying orders for multiple customers fans out exactly **one WhatsApp departure alert per distinct client**, aggregating all order numbers on that truck.

---

## 2. System Architecture

```
                                  ┌──────────────────────────┐
                                  │   Browser / Tablet UI    │
                                  │ Next.js 15 + Tailwind    │
                                  └────────────┬─────────────┘
                                               │
                                 Server Actions & API Routes
                                               │
                                               ▼
                                  ┌──────────────────────────┐
                                  │   Web App Server (/apps) │
                                  │ NextAuth + Prisma 6 + UI │
                                  └──────┬─────────────┬─────┘
                                         │             │
                    HTTP Optimization    │             │  PostgreSQL Queries
                        (Zod Client)     │             │  (Connection Pool)
                                         ▼             ▼
  ┌──────────────────────────┐            ┌──────────────────────────┐
  │  Deckle Solver Service   │            │   PostgreSQL 16 Engine   │
  │  FastAPI + OR-Tools      │            │   Prisma Database Model  │
  └──────────────────────────┘            └──────────────────────────┘
```

---

## 3. Environment Variables (.env)

```ini
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/papermill_erp?schema=public"

# NextAuth Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="papermill-super-secret-jwt-key-2026"

# Mathematical Deckle Solver Service
SOLVER_SERVICE_URL="http://localhost:8000"

# Mill Location & Intra-state GST Anchor
MILL_STATE="Rajasthan"

# WhatsApp Cloud API (Meta Graph API)
WHATSAPP_DRY_RUN="true"
WHATSAPP_PHONE_NUMBER_ID="1000123456789"
WHATSAPP_ACCESS_TOKEN="EAA..."
WHATSAPP_BUSINESS_ACCOUNT_ID="123456789"
WHATSAPP_API_VERSION="v21.0"
```

---

## 4. Quickstart & Docker Commands

### Step 1: Start PostgreSQL & Services
```bash
# Spin up PostgreSQL 16 container
docker-compose up -d postgres
```

### Step 2: Install Dependencies & Run Database Migrations
```bash
# Install NPM dependencies
npm install

# Generate Prisma Client & Push Schema
npx prisma db push
```

### Step 3: Run the 30-Order Demo Seed Script
```bash
# Seeds 5 users, 8 clients, 2 machines, 30 orders across 4 GSMs, and runs
npx tsx scripts/demo-seed.ts
```

### Step 4: Start Python Deckle Solver & Next.js Web App
```bash
# Terminal 1: Start Python Deckle Solver (FastAPI + Google OR-Tools)
cd apps/solver
uvicorn main:app --port 8000 --reload

# Terminal 2: Start Next.js 15 Web Application
npm --workspace=apps/web run dev
```

---

## 5. Seed Users & Role Credentials

All demo accounts use password: **`password123`**

| Role | Email | Permissions |
|---|---|---|
| **ADMIN** | `admin@papermill.local` | Full master access, manual audited stock adjustments, invoice cancellation, settings |
| **SALES** | `sales@papermill.local` | Sales orders create/edit, invoice viewing, master viewing |
| **PLANNER** | `planner@papermill.local` | Load planning, deckle solver, production runs, stock allocation |
| **OPERATOR** | `operator@papermill.local` | Floor tablet execution (`/operator`), steppers, scale numpad, scrap reconciliation |
| **DISPATCH** | `dispatch@papermill.local` | Loading sheets, gate passes, truck departures, WhatsApp notifications |

---

## 6. End-to-End Walkthrough Workflow

### 1. Sales Order Intake (`/orders`)
- Orders created with multiple line items (Reel Width in inches, Paper GSM, Weight in kg, Tolerance %).
- Automatic priority classification (`URGENT`, `NORMAL`, `STOCK`).

### 2. Load Planning (`/loads`)
- Groups confirmed customer orders into full truckload batches (e.g. 25 MT truck).
- Real-time truck utilization indicator (Red < 70%, Amber 70-90%, Green > 90%).

### 3. Mathematical Deckle Optimization (`/deckle`)
- Selects pending demand grouped by GSM grade (Rule A).
- OR-Tools solver finds the optimal cutting pattern combinations reducing machine trim loss to under 2%.
- Visual interactive `<PatternBar />` rendering 100% scaled machine deckle with manual blade override and live cost variance diffs.
- Hinglish AI Explanation layer (Claude Sonnet) explaining operational tradeoffs.

### 4. Factory Floor Tablet Execution (`/operator`)
- Minimal, distraction-free tablet interface with high contrast dark theme.
- Minimum 56px+ tap targets, tactile repetition steppers (`[ − ] [ 12 ] [ + ]`), and fullscreen scale touch numpad.
- Atomic run completion reconciles output weight, logs wastage classification (`Edge Trim`, `Paper Break`, `Reject`), and generates barcode stock reels (`BAY-M1-01`).

### 5. Stock & Wastage Tracking (`/stock` & `/wastage`)
- 4 Inventory summary KPIs (Total Available MT, Allocated MT, Distinct SKUs, Oldest Stock Age).
- Group-by toggle (Flat List, Grouped by GSM, Grouped by Width).
- Exact width & GSM stock allocation to confirmed customer orders.
- Interactive Recharts analytics (Daily trim % trend with 3% target line, Machine comparison, GSM comparison, Donut scrap breakdown, and Theoretical vs Actual solver gap comparison).

### 6. Vehicle Loading & Dispatch (`/dispatch`)
- Intelligent readiness indicators (Green "Ready", Amber "Partial / Short Ship", Grey "In Production").
- Printable A4 Loading Sheet with per-item loaded weight and running truck capacity gauge.
- Atomic confirm dispatch creates Gate Pass (`GP-YYMM-0001`), marks orders `DISPATCHED`, moves stock inventory, and enqueues WhatsApp departure alerts.

### 7. GST Tax Invoicing & Billing (`/invoices`)
- 1-Click invoice generation (1 invoice per client on multi-client trucks).
- Financial year sequential numbering: `INV-2526-0001`.
- Indian GST logic (Intra-state CGST 9% + SGST 9% vs Inter-state IGST 18%).
- Indian numbering system amount in words (Lakhs & Crores) and printable A4 Tax Invoice document.

### 8. WhatsApp Automation Engine (`/notifications`)
- Rate-limited queue processor with exponential backoff retries.
- Full dry-run simulation mode logging rendered messages and mock provider IDs.
- Rule E fan-out verification: Multi-order single messages per distinct client.

### 9. Executive Dashboard (`/dashboard`)
- Global period filter driving real-time KPI strips, trim trend lines, machine stacked bars, order lifecycle funnels, top clients, and actionable "Needs Attention" queues.
