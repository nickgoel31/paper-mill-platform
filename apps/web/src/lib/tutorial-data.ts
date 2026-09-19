export interface TutorialStep {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  roleRequired: string;
  route: string;
  overview: string;
  whyItMatters: string;
  keyConcepts: { term: string; explanation: string }[];
  setupSteps: { step: number; action: string; details: string; tip?: string }[];
  rulesAndGotchas: string[];
  samplePayloadOrInputs?: { label: string; value: string }[];
}

export const TUTORIAL_MODULES: TutorialStep[] = [
  {
    id: "system-settings",
    title: "1. System & Mill Configuration",
    subtitle: "Define Legal Entity, Tax Jurisdiction, Bank Details & Deckle Thresholds",
    badge: "ADMIN SETUP",
    roleRequired: "ADMIN",
    route: "/settings",
    overview:
      "The Settings module establishes the mill's tax jurisdiction, bank instructions printed on invoices, and optimization benchmarks. These constants anchor all GST calculations (Intra-State vs Inter-State) and deckle solver tolerances across the platform.",
    whyItMatters:
      "Indian GST laws mandate separate reporting for CGST+SGST (Intra-state) versus IGST (Inter-state). Setting your mill's home state (e.g. Rajasthan) ensures every subsequent invoice calculates taxes correctly automatically.",
    keyConcepts: [
      {
        term: "Mill Home State",
        explanation:
          "Anchors tax determination. If customer's GST state matches Mill State, CGST (9%) + SGST (9%) is levied. Otherwise, IGST (18%) is applied.",
      },
      {
        term: "Trim Target (%)",
        explanation:
          "Standard trim wastage benchmark (typically 3.0%). Deviations above this trigger amber/red warnings in executive dashboards.",
      },
      {
        term: "Bank Details (NEFT/RTGS)",
        explanation:
          "Bank Name, Account Number, and IFSC Code automatically formatted and printed on standard GST Tax Invoices.",
      },
    ],
    setupSteps: [
      {
        step: 1,
        action: "Navigate to Settings",
        details: "Go to '/settings' from the sidebar menu as ADMIN.",
      },
      {
        step: 2,
        action: "Fill Company & Legal Info",
        details:
          "Enter your registered Factory Name, Address, and 15-digit Indian GSTIN (e.g. 08AAAAH1234F1Z5).",
      },
      {
        step: 3,
        action: "Set Home State Anchor",
        details:
          "Select or type your manufacturing plant's state (e.g. 'Rajasthan', 'Gujarat', or 'Maharashtra').",
      },
      {
        step: 4,
        action: "Configure Banking & Deckle Goals",
        details:
          "Provide account details for RTGS payments and set target solver trim % (default: 3.0%). Save changes.",
        tip: "Changes immediately reflect across all newly generated tax invoices and loading passes.",
      },
    ],
    rulesAndGotchas: [
      "Only users with the ADMIN role can edit system settings.",
      "GSTIN format must strictly match standard 15-character alphanumeric format: 2 state digits + 10 PAN chars + 1 entity digit + 'Z' + 1 checksum.",
    ],
  },
  {
    id: "master-data",
    title: "2. Master Data Management",
    subtitle: "Clients, Dynamic Paper Machines, Transporters & Transport Fleet",
    badge: "FOUNDATION",
    roleRequired: "ADMIN / PLANNER / SALES",
    route: "/masters/clients",
    overview:
      "Master Data forms the single source of truth for the entire mill operations. You configure Customer Accounts (with GSTIN and WhatsApp contacts), Paper Machines (with deckle and trim bounds), Transporters, and Truck Fleets.",
    whyItMatters:
      "Dynamic machine configuration (Rule B) means deckle widths (e.g. 196\", 100\", 140\") and trim bounds are dynamic database rows — never hardcoded.",
    keyConcepts: [
      {
        term: "Rule B (Dynamic Machines)",
        explanation:
          "Every machine has physical limits: max deckle inch (e.g. 196.00\"), min deckle (60.00\"), min trim (0.50\"), and max trim (6.00\"), plus supported GSM ranges.",
      },
      {
        term: "Client WhatsApp Phone",
        explanation:
          "Standard Indian mobile number (e.g. +91 98250 11223 or 9825011223). The notification engine auto-normalizes numbers to E.164 (91XXXXXXXXXX).",
      },
      {
        term: "Truck Payload Capacity",
        explanation:
          "Gross weight capacity in kilograms (e.g. 25,000 kg for a 25 MT vehicle) used to calculate real-time load utilization.",
      },
    ],
    setupSteps: [
      {
        step: 1,
        action: "Create Client Masters (/masters/clients)",
        details:
          "Click 'Add Client'. Enter Company Name, Code, Address, State, GSTIN, and WhatsApp mobile number.",
      },
      {
        step: 2,
        action: "Configure Paper Machines (/masters/machines)",
        details:
          "Add your plant's machines (e.g. 'Machine 1' - Max Deckle: 196\", Min Trim: 0.5\", Max Trim: 6.0\", GSM: 80-300).",
      },
      {
        step: 3,
        action: "Add Transporters & Trucks (/masters/trucks)",
        details:
          "Add transport companies and register vehicle license plates (e.g. 'RJ-14-GA-9021', Capacity: 25,000 kg).",
        tip: "Assign default driver names and mobile numbers for automated gate pass generation.",
      },
    ],
    rulesAndGotchas: [
      "Client Code must be unique across the organization (e.g. KRP-001).",
      "Ensure machine GSM min/max bounds encompass all paper qualities your mill produces.",
    ],
  },
  {
    id: "sales-orders",
    title: "3. Sales Order Booking",
    subtitle: "Multi-Item Demand Intake, Custom Reel Widths, GSM & Tolerances",
    badge: "COMMERCIAL",
    roleRequired: "SALES / ADMIN",
    route: "/orders/new",
    overview:
      "Sales staff input customer purchase orders specifying exact reel width in inches, paper GSM quality, demanded kilograms, rate per kg, and commercial tolerance bands.",
    whyItMatters:
      "Accurate width and GSM entry directly feeds the mathematical deckle optimizer. The ±5% tolerance band provides solver slack to minimize edge scrap.",
    keyConcepts: [
      {
        term: "Reel Width (Inches)",
        explanation:
          "Target slit width for corrugators (e.g. 130\", 45\", 32\", 60\"). Measured in decimal inches.",
      },
      {
        term: "Rule C (Tolerance Bands)",
        explanation:
          "Default ±5.0% commercial tolerance allows slight over/under production without breaching client agreements.",
      },
      {
        term: "Order Priority",
        explanation:
          "URGENT (prioritized by solver), NORMAL (standard queue), STOCK (buffer replenishment inventory).",
      },
    ],
    setupSteps: [
      {
        step: 1,
        action: "Open Order Creator",
        details: "Go to '/orders/new' or click 'New Order' from the Order list.",
      },
      {
        step: 2,
        action: "Select Customer & Target Dates",
        details:
          "Pick customer from searchable dropdown. Set Order Date and Promised Delivery Date.",
      },
      {
        step: 3,
        action: "Add Order Line Items",
        details:
          "For each item, specify: Width (e.g. 130.00\"), GSM (e.g. 120), Quantity (e.g. 5,000 kg), Rate/kg (e.g. ₹38.50), and Tolerance % (default: 5%).",
      },
      {
        step: 4,
        action: "Submit & Confirm",
        details:
          "Save the order. Its status becomes CONFIRMED, immediately making its items available for Load Planning and Deckle Scheduling.",
        tip: "Amber table alerts highlight orders due within 3 days; red indicates overdue.",
      },
    ],
    rulesAndGotchas: [
      "Items with different GSMs can exist in the same sales order, but the deckle engine will separate them into different production runs.",
      "Delivery date cannot precede the order booking date.",
    ],
  },
  {
    id: "load-planning",
    title: "4. Load Planning & Truck Consolidation",
    subtitle: "Group Confirmed Orders into Full Truckload Batches (FTL)",
    badge: "LOGISTICS",
    roleRequired: "PLANNER / DISPATCH / ADMIN",
    route: "/loads/new",
    overview:
      "Load Planning groups multiple confirmed customer orders into a single transport vehicle batch. The interactive two-panel builder prevents manual overloading and tracks weight utilization.",
    whyItMatters:
      "Maximizing truck capacity utilization (target > 90%) reduces freight cost per kilogram. Grouping orders early gives dispatch visibility into upcoming shipments.",
    keyConcepts: [
      {
        term: "Capacity Utilization Gauge",
        explanation:
          "Live percentage calculation. Red (< 70%), Amber (70–90%), Green (> 90% optimal truck load).",
      },
      {
        term: "Multi-Client Delivery Batches",
        explanation:
          "A single truck can carry orders for 3 different clients along the same route.",
      },
    ],
    setupSteps: [
      {
        step: 1,
        action: "Launch Load Builder",
        details: "Navigate to '/loads/new'. Pick an assigned Transporter, Truck, and Planned Dispatch Date.",
      },
      {
        step: 2,
        action: "Select Unassigned Orders (Left Panel)",
        details:
          "Filter by Destination State/City or Delivery Date. Click '+' to add orders into the truck batch.",
      },
      {
        step: 3,
        action: "Review Utilization (Right Panel)",
        details:
          "Observe the live capacity bar (e.g. 23,500 kg / 25,000 kg = 94% Green).",
      },
      {
        step: 4,
        action: "Create Load Batch",
        details:
          "Click 'Save Load Batch'. A unique Batch ID (e.g. LB-2601-0001) is created in PLANNED status.",
      },
    ],
    rulesAndGotchas: [
      "Tablet-friendly tap controls allow floor planners to assemble batches without drag-and-drop friction.",
      "Overloading past 100% capacity triggers a high-weight caution warning.",
    ],
  },
  {
    id: "deckle-planning",
    title: "5. Mathematical Deckle Optimization",
    subtitle: "Column-Generation Cutting-Stock Solver, Visual Pattern Bar & AI Insights",
    badge: "MATHEMATICAL CORE",
    roleRequired: "PLANNER / ADMIN",
    route: "/deckle",
    overview:
      "The deckle planning workspace is the algorithmic heart of PaperMill ERP. It groups pending demand by GSM grade, calls the cutting-stock solver worker, generates cutting patterns, and renders full-width 100% scaled interactive visualization bars.",
    whyItMatters:
      "Cutting loss is a paper mill's single biggest direct cost. The optimizer drives edge trim loss down from industry typical 6–10% to under 2–3%, saving millions in annual fiber cost.",
    keyConcepts: [
      {
        term: "Rule A (One GSM Per Run)",
        explanation:
          "Hard physical paper mill constraint. A paper machine runs one GSM web at a time. Each selected GSM becomes its own distinct production run.",
      },
      {
        term: "Column-Generation LP Solver",
        explanation:
          "1D cutting-stock solver: a linear program picks how many metres to run of each knife pattern, and column generation finds the patterns that waste the least paper (trim and overproduction together), then trims down the number of knife setups.",
      },
      {
        term: "Interactive <PatternBar />",
        explanation:
          "Proportional colored visualizer displaying cut widths, knife positions, and edge trim with live blade override adjustments.",
      },
      {
        term: "Hinglish AI Explanation",
        explanation:
          "Plain-language operational breakdown explaining machine selection, trim tradeoffs, and knife setups.",
      },
    ],
    setupSteps: [
      {
        step: 1,
        action: "Select Pending Demand by GSM",
        details:
          "Open '/deckle'. Expand a GSM section (e.g. 'GSM 120 - 8 Items, 24,500 kg') and check the items to optimize.",
      },
      {
        step: 2,
        action: "Choose Optimization Goal",
        details:
          "Select objective: 'MIN_TRIM' (lowest scrap), 'MIN_PATTERNS' (fewer knife changes), or 'BALANCED'.",
      },
      {
        step: 3,
        action: "Click 'Run Deckle Optimization'",
        details:
          "The solver computes optimal patterns in seconds, displaying calculated trim % (e.g. 1.15%) and pattern counts.",
      },
      {
        step: 4,
        action: "Inspect & Release to Production Floor",
        details:
          "Review pattern cuts and AI explanation. Click 'Save & Release Production Run'. The run moves from PLANNED to RELEASED.",
        tip: "Released runs immediately show up on factory floor tablets.",
      },
    ],
    rulesAndGotchas: [
      "Never mix different GSM items into the same run. The UI strictly enforces GSM isolation.",
      "If demand exceeds one run, the solver schedules multiple optimal runs.",
    ],
  },
  {
    id: "floor-execution",
    title: "6. Factory Floor Tablet Execution",
    subtitle: "High-Contrast Touch UI, Tactile Steppers & Scale Reconciliation",
    badge: "OPERATOR / SHOP FLOOR",
    roleRequired: "OPERATOR / ADMIN",
    route: "/operator",
    overview:
      "Designed specifically for machine operators holding rugged Android/iPad tablets beside the rewinder and slitter. Features high-contrast dark theme, large 56px+ tap targets, repetition counters, and a touchscreen scale numpad.",
    whyItMatters:
      "Capturing real-time production output directly at the scales eliminates end-of-shift paperwork delays and immediately updates order fulfillment progress.",
    keyConcepts: [
      {
        term: "Tactile Stepper Counter",
        explanation:
          "Large [ − ] [ 12 ] [ + ] buttons allowing operators with safety gloves to record pattern roll repetitions seamlessly.",
      },
      {
        term: "Scale Touch Numpad",
        explanation:
          "Fullscreen digital keypad to punch in weighed reel scale kilograms directly at the rewinder.",
      },
      {
        term: "Scrap Classification",
        explanation:
          "Classifies lost fiber into Edge Trim, Slitter Adjustment Scrap, or Paper Break Rejects.",
      },
    ],
    setupSteps: [
      {
        step: 1,
        action: "Open Operator Portal (/operator)",
        details:
          "Log in as OPERATOR on a floor tablet. View the queue of RELEASED machine runs.",
      },
      {
        step: 2,
        action: "Start Production Run",
        details:
          "Tap 'Start Run'. Slitter knife blade settings appear with large millimeter/inch dimensions.",
      },
      {
        step: 3,
        action: "Log Repetitions & Weighed Reels",
        details:
          "Tap '+' as each master jumbo roll is slit. Use the on-screen numpad to log actual weight from scale.",
      },
      {
        step: 4,
        action: "Complete Run & Reconcile Scrap",
        details:
          "Enter total gross weight and log scrap. The run completes, instantly generating barcode inventory reels in the stock warehouse.",
      },
    ],
    rulesAndGotchas: [
      "Operator UI has no complicated dropdowns or tiny inputs — built entirely for touch operation.",
      "Completed runs automatically mark associated Sales Order items as PRODUCED.",
    ],
  },
  {
    id: "stock-and-wastage",
    title: "7. Stock Inventory & Wastage Analytics",
    subtitle: "Reel Tracking, Exact-Match Order Allocation & Fiber Loss Analysis",
    badge: "INVENTORY & QUALITY",
    roleRequired: "PLANNER / DISPATCH / ADMIN",
    route: "/stock",
    overview:
      "Tracks every manufactured paper reel in the warehouse (by Width, GSM, Weight, and Bay Location). Allows 1-click allocation to open customer orders and provides deep wastage analytics.",
    whyItMatters:
      "Allocating existing stock to urgent customer orders avoids redundant machine runs. Wastage analytics pinpoints machine-level fiber losses.",
    keyConcepts: [
      {
        term: "Stock Status Flow",
        explanation:
          "AVAILABLE (unassigned warehouse reel) ➔ ALLOCATED (reserved for specific customer order item) ➔ DISPATCHED (shipped).",
      },
      {
        term: "Exact-Match Allocation",
        explanation:
          "Matches reels where both Width and GSM match exactly. Atomic transaction increments OrderItem.producedKg.",
      },
      {
        term: "Theoretical vs Actual Variance",
        explanation:
          "Compares the solver-predicted trim scrap against operator weighed scrap logs.",
      },
    ],
    setupSteps: [
      {
        step: 1,
        action: "Inspect Inventory (/stock)",
        details:
          "View reels with Flat, By GSM, or By Width groupings. Check total available MT.",
      },
      {
        step: 2,
        action: "Allocate Reels to Demands",
        details:
          "Click 'Allocate Stock' on an available reel to assign it to matching open customer order lines.",
      },
      {
        step: 3,
        action: "Analyze Wastage (/wastage)",
        details:
          "Review 6 Recharts analytics: Daily Trim Trend with 3% target line, Machine comparisons, GSM breakdown, and Top 10 worst scrap runs.",
      },
    ],
    rulesAndGotchas: [
      "Manual stock quantity changes require a mandatory audit reason and are logged in AuditLog.",
      "Reel quantity is DB-constrained and can never become negative.",
    ],
  },
  {
    id: "dispatch-and-invoices",
    title: "8. Dispatch, Loading Sheet & GST Invoicing",
    subtitle: "Gate Pass, Printable A4 Loading Sheet, Indian GST Tax Invoicing",
    badge: "FULFILLMENT & BILLING",
    roleRequired: "DISPATCH / ADMIN / SALES",
    route: "/dispatch",
    overview:
      "Manages vehicle loading, gate pass generation, and 1-click GST tax invoicing. Verifies readiness (Ready / Partial / Short Ship) and enqueues automated customer notifications.",
    whyItMatters:
      "Automates compliant Indian GST tax invoices with HSN 4804, CGST/SGST/IGST breakdown, and Indian currency words in Lakhs and Crores.",
    keyConcepts: [
      {
        term: "Printable A4 Loading Sheet",
        explanation:
          "A4 dispatch document with client destinations, roll counts, weights, driver details, and signature lines.",
      },
      {
        term: "Rule E (Multi-Client Fan-Out)",
        explanation:
          "When a truck with multiple clients departs, the system generates exactly 1 WhatsApp message per distinct client, aggregating all their order numbers.",
      },
      {
        term: "FY Sequential Invoicing",
        explanation:
          "Financial year numbering format: INV-2526-0001 (resets every April 1st).",
      },
    ],
    setupSteps: [
      {
        step: 1,
        action: "Inspect Dispatch Queue (/dispatch)",
        details:
          "Review Load Batches. Green badge means 100% produced; Amber indicates partial/short load.",
      },
      {
        step: 2,
        action: "Print Loading Sheet (/dispatch/[id])",
        details:
          "Verify loaded reel weights against vehicle capacity. Print A4 loading manifest for the driver.",
      },
      {
        step: 3,
        action: "Click 'Confirm Truck Departure'",
        details:
          "Generates Gate Pass (e.g. GP-2601-0001), transitions orders to DISPATCHED, and queues WhatsApp departure messages.",
      },
      {
        step: 4,
        action: "Generate GST Tax Invoices (/invoices)",
        details:
          "Click 'Generate Invoices'. Automatically calculates CGST+SGST or IGST, creates PDF invoices, and generates Indian Lakhs/Crores wording.",
      },
    ],
    rulesAndGotchas: [
      "Short shipments are allowed with confirmation warning to accommodate mill operational realities.",
      "Invoices are immutable once issued; soft cancellation requires audit trail.",
    ],
  },
  {
    id: "whatsapp-notifications",
    title: "9. WhatsApp Automation Engine",
    subtitle: "Meta Graph API, Rate Limiting, Dry-Run Simulation & Customer Alerts",
    badge: "AUTOMATION",
    roleRequired: "ADMIN / DISPATCH",
    route: "/notifications",
    overview:
      "Automates real-time WhatsApp status notifications to customer purchasing managers on Order Confirmation, Truck Dispatch, and Delivery.",
    whyItMatters:
      "Drastically reduces inbound 'where is my paper roll?' phone calls from corrugators by delivering instant vehicle numbers, driver contacts, and roll weight manifests.",
    keyConcepts: [
      {
        term: "Dry Run Simulation Mode",
        explanation:
          "When WHATSAPP_DRY_RUN=true, messages are fully formatted and logged without calling Meta, ensuring safe development and testing.",
      },
      {
        term: "Indian Mobile Normalizer",
        explanation:
          "Converts '+91 98250 11223', '09825011223', or '9825011223' strictly to '919825011223'.",
      },
      {
        term: "Exponential Backoff Queue",
        explanation:
          "Retries transient network failures up to 3 times with 50ms rate-limited pacing.",
      },
    ],
    setupSteps: [
      {
        step: 1,
        action: "View Message Queue (/notifications)",
        details:
          "Monitor 4 KPIs: Sent Today, Queued, Failed, and Success Delivery Rate %.",
      },
      {
        step: 2,
        action: "Preview Rendered WhatsApp Bubbles",
        details:
          "Click the eye icon to view the exact customer WhatsApp message text with driver details and order numbers.",
      },
      {
        step: 3,
        action: "Trigger Queue Processing",
        details:
          "Click 'Process Queue Now' to immediately dispatch pending messages, or let the automated cron job process them in the background.",
      },
    ],
    rulesAndGotchas: [
      "Rule E grouping ensures a client with 3 orders on the truck receives ONE clean aggregated message.",
      "Invalid 8-digit or malformed phone numbers fail cleanly with clear error diagnostics.",
    ],
  },
  {
    id: "executive-dashboard",
    title: "10. Executive Analytics & Action Center",
    subtitle: "30-Day Trim Benchmark, Recharts Funnels & Live Bottleneck Queues",
    badge: "MANAGEMENT",
    roleRequired: "ALL ROLES",
    route: "/",
    overview:
      "The Executive Dashboard provides top management with a high-level operational pulse: 30-day average trim loss, production output by machine, order pipeline funnel, top clients, and actionable bottleneck queues.",
    whyItMatters:
      "Allows the Mill Managing Director and Production Head to spot fiber wastage spikes, overdue deliveries, and machine bottlenecks at a single glance.",
    keyConcepts: [
      {
        term: "Hero Trim Wastage Metric",
        explanation:
          "Aggregated 30-day trim % with color-coded status badges: Green (≤ 3.0%), Amber (3.1–6.0%), Red (> 6.0%).",
      },
      {
        term: "Action Queue: Needs Attention",
        explanation:
          "Consolidates overdue orders, high trim runs (> 6%), and failed WhatsApp notifications into a single click-to-resolve list.",
      },
      {
        term: "Today's Schedule",
        explanation:
          "Real-time list of active machine production runs and planned truck departures.",
      },
    ],
    setupSteps: [
      {
        step: 1,
        action: "View Mill Overview (/)",
        details:
          "Access the dashboard to review key KPIs: Open Demand MT, Due This Week, Produced (Month), and Invoiced Value.",
      },
      {
        step: 2,
        action: "Filter Time Horizon",
        details:
          "Toggle between Last 7 Days, Last 30 Days, or Last 90 Days to observe fiber savings trends.",
      },
      {
        step: 3,
        action: "Clear 'Needs Attention' Items",
        details:
          "Click 'Resolve' on overdue orders or 'Inspect' on high-trim runs to address plant bottlenecks directly.",
      },
    ],
    rulesAndGotchas: [
      "Role-aware metrics: Financial invoice numbers are visible to Admin and Sales, while floor operators view production metrics.",
    ],
  },
];
