<h1 align="center">SmartTruck · damm-frontend</h1>

<p align="center">
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-000?logo=nextdotjs&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind v4" src="https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white" />
  <img alt="MapLibre GL" src="https://img.shields.io/badge/MapLibre%20GL-396CB2?logo=maplibre&logoColor=white" />
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=white" />
</p>

**Damm's delivery-route planner.** Turns a fleet, a list of clients, and their delivery windows into optimized truck routes — driver, vehicle, stop order, pallet layout, and the full timeline for the day. Compares the optimizer's plan against the baseline so dispatchers can see what changes and why before sending a truck out.

_Built for the Damm × Interhack BCN hackathon._

---

## Stack

- **Next.js 15** App Router (Turbopack dev) on **React 19**
- **TypeScript**, **Tailwind CSS v4**, **base-ui** + shadcn primitives
- **MapLibre GL** for the planner map (zone clusters, arc layers, route lines)
- **react-hook-form** + **zod** at every form boundary
- **TanStack Table** for the data grids
- **motion** for the polish (shiny CTA, shimmer loaders, modal resize)
- **three.js** + **@react-three/fiber** for the truck pallet visualization

---

## Get it running

This frontend talks to the [damm-backend](https://github.com/josep-audenis/damm-backend) FastAPI server. **Start the backend first** (default `http://localhost:8000`).

```bash
pnpm install
pnpm dev         # http://localhost:3000 — Turbopack
pnpm typecheck
pnpm build
```

Override the backend URL with an env var if it lives elsewhere:

```bash
NEXT_PUBLIC_API_BASE_URL=http://10.0.0.5:8000 pnpm dev
```

Default is `http://localhost:8000`. See [`src/lib/api/client.ts`](src/lib/api/client.ts).

The planner assistant (see _Planner agent_ below) needs a Google Generative AI key in `.env`:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=<your key>
```

---

## Demo mode

```bash
NEXT_PUBLIC_DEMO_MODE=1 pnpm dev
```

Runs the app without the backend. Every backend call is answered from [`public/demo-data/`](public/demo-data/), captured from the backend's `seed.json`: the catalog, the 665 seeded transports, and one optimizer run for each of the 35 days with pending orders, with the routes it saves and their OSRM road geometry. Routes you save or delete are kept in a cookie. Catalog edits are turned off, and the planner assistant gives a fixed reply. See [`src/lib/api/demo/`](src/lib/api/demo/). First-time visitors get a short tour ([`DemoTour`](src/components/demo/DemoTour.tsx)) that points at the next thing to click, from Login to playing a route on the map; it ends at Play or Skip and is remembered in `localStorage`, and **Take the tour** in the header starts it again. The live demo at [smarttruck.marcvendrell.cat](https://smarttruck.marcvendrell.cat) runs this way.

To capture the data again, start seven backends from a fresh `seed.json` on ports 8101–8107 and one more on 8108, then:

```bash
python3 scripts/demo-data/capture_plans.py <plans-dir> '<json list of dates>'
python3 scripts/demo-data/build_fixtures.py <plans-dir> public/demo-data
python3 scripts/demo-data/capture_osrm.py public/demo-data
```

---

## Backend wiring

All reads and writes go through a thin Zod-validated client in [`src/lib/api/`](src/lib/api/):

| Module | Hits | Used for |
| --- | --- | --- |
| [`catalog.ts`](src/lib/api/catalog.ts) | `/api/v1/db/{customers,trucks,drivers}` | Catalog tables (`/clients`, `/trucks`, `/drivers`) |
| [`warehouses.ts`](src/lib/api/warehouses.ts) | `/api/v1/db/warehouses` (+ catalog POST/PATCH/DELETE) | Centers list + Add/Edit/Delete center modals |
| [`transports.ts`](src/lib/api/transports.ts) | `/api/v1/data/transports` and `/transport/{id}` | Routes table on a center, route detail in `RouteHero` |
| [`orders.ts`](src/lib/api/orders.ts) | `/api/v1/db/orders` | Derives the available-dates set for the date picker |
| [`optimize.ts`](src/lib/api/optimize.ts) | `/api/v1/optimize/full/preview` and `/persist` | Generates and saves suggested routes from `AddRouteModal` |

The optimizer runs in **preview mode** when the user clicks _Generate Routes_ — three parallel calls with different parameters give three suggestions in ~20s. _Save selected route_ then calls `/optimize/persist` to commit it as a real transport.

---

## Planner agent

A read-only chat assistant lives in the right-hand panel on every app surface. It's powered by **Gemini 2.5 Flash** via [`@ai-sdk/google`](https://www.npmjs.com/package/@ai-sdk/google), with streaming through Vercel's AI SDK.

What makes it useful is the **surface awareness**: every page publishes its visible state (which center, which route, which catalog, which selected row) into a chat context, and [`src/agents/visible-context.ts`](src/agents/visible-context.ts) turns that into a deterministic JSON snapshot that's injected into the system prompt for each request. The model only answers from what's actually on screen — no invented stops, no hallucinated drivers — and points users at the right UI control when they ask for an action it can't take.

| Piece | Path |
| --- | --- |
| System prompt + model config | [`src/agents/planner.ts`](src/agents/planner.ts) |
| Surface → JSON snapshot builder | [`src/agents/visible-context.ts`](src/agents/visible-context.ts) |
| Streaming endpoint | [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts) |
| UI shell (panel, bubbles, input) | [`src/components/chat/`](src/components/chat/) |

---

## What's in the box

```
src/
  app/                     Next App Router — (app) and (auth) groups
  components/
    auth/                  Login screen
    centers/               Warehouse list + detail; Add/Edit modals
    clients/               Customer table (lives off backend)
    drivers/  trucks/      Catalog tables (live off backend)
    routes/                Route table, hero, map view, AddRouteModal,
                           RouteReviewPanel (zone clusters), 3D truck viz
    shared/                DataTable, ConfirmDeleteDialog, generic patterns
    shell/                 App chrome (header, sidebar, layout)
    ui/                    base-ui wrappers, MapLibre primitives,
                           ShinyText / TextShimmer / WanderingEyes
  lib/
    api/                   Backend client (see Backend wiring table above)
    chat/                  Planner chat surface + visible-context builder
```
