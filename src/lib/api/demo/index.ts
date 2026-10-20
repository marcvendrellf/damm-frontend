// Demo mode answers the backend calls from static files in public/demo-data,
// captured from the real backend: the catalog, the seeded transports, and one
// optimizer run per selectable date with the transports it saves. Routes the
// user saves or deletes are kept in a cookie, so server pages see them too.

type TransportSummary = { transport_id: string };
type PersistedRoute = {
  summary: TransportSummary;
  detail: { transport_id: string; stops: unknown[]; driver_id?: string | null };
};
type Plan = {
  preview: { routes: unknown[]; loads: unknown[] };
  persisted: Record<string, PersistedRoute>;
};
type DemoState = { saved: string[]; deleted: string[] };

const STATE_COOKIE = "smarttruck_demo";
// The real solver takes about 25 s; the demo keeps a short pause so the
// loading state still shows.
const OPTIMIZE_DELAY_MS = 4000;

const READ_ONLY_MESSAGE =
  "This is a demo with fixed data, so changes to the catalog aren't saved.";

const fileCache = new Map<string, Promise<unknown>>();

function readFile<T>(name: string): Promise<T> {
  // Names carry ids from the URL; keep them inside the data folder.
  if (name.includes("..")) {
    return Promise.reject(new Error("Backend request failed: 404 Not Found"));
  }
  let file = fileCache.get(name);
  if (!file) {
    file = loadFile(name);
    file.catch(() => fileCache.delete(name));
    fileCache.set(name, file);
  }
  return file as Promise<T>;
}

async function loadFile(name: string): Promise<unknown> {
  if (typeof window === "undefined") {
    const { readDemoFile } = await import("./server");
    return readDemoFile(name);
  }
  const response = await fetch(`/demo-data/${name}`);
  if (!response.ok) {
    throw new Error(
      `Backend request failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

async function readState(): Promise<DemoState> {
  let raw: string | undefined;
  if (typeof window === "undefined") {
    const { readDemoCookie } = await import("./server");
    raw = await readDemoCookie(STATE_COOKIE);
  } else {
    raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${STATE_COOKIE}=`))
      ?.slice(STATE_COOKIE.length + 1);
  }
  try {
    const state = JSON.parse(decodeURIComponent(raw ?? ""));
    return { saved: state.saved ?? [], deleted: state.deleted ?? [] };
  } catch {
    return { saved: [], deleted: [] };
  }
}

function writeState(state: DemoState) {
  const value = encodeURIComponent(JSON.stringify(state));
  document.cookie = `${STATE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}

function readPlan(date: string): Promise<Plan | null> {
  return readFile<Plan>(`plans/${date}.json`).catch(() => null);
}

// Saved route ids look like "opt-2026-01-30-1", so the date finds the plan.
async function readSavedRoute(id: string): Promise<PersistedRoute | null> {
  const plan = await readPlan(id.slice(4, 14));
  if (!plan) return null;
  return (
    Object.values(plan.persisted).find(
      (route) => route.detail.transport_id === id,
    ) ?? null
  );
}

async function listTransports(): Promise<TransportSummary[]> {
  const [state, seeded] = await Promise.all([
    readState(),
    readFile<TransportSummary[]>("transports.json"),
  ]);
  const saved = await Promise.all(state.saved.map(readSavedRoute));
  return [
    ...seeded,
    ...saved.flatMap((route) => (route ? [route.summary] : [])),
  ].filter((t) => !state.deleted.includes(t.transport_id));
}

async function getTransport(id: string): Promise<unknown> {
  if (id.startsWith("opt-")) {
    const route = await readSavedRoute(id);
    if (!route) throw new Error("Backend request failed: 404 Not Found");
    return route.detail;
  }
  return readFile(`transport/${id}.json`);
}

async function optimizePreview(body: { date?: string }): Promise<unknown> {
  const [plan] = await Promise.all([
    readPlan(body.date ?? ""),
    new Promise((resolve) => setTimeout(resolve, OPTIMIZE_DELAY_MS)),
  ]);
  return {
    result: {
      job_id: "demo",
      status: "completed",
      routes: [],
      loads: [],
      ...plan?.preview,
    },
  };
}

async function persistRoute(body: {
  route: { transport_id: string; date: string };
}): Promise<unknown> {
  const plan = await readPlan(body.route.date);
  const route = plan?.persisted[body.route.transport_id];
  if (!route) throw new Error("Backend request failed: 404 Not Found");
  const id = route.detail.transport_id;
  const state = await readState();
  writeState({
    saved: [...state.saved.filter((s) => s !== id), id],
    deleted: state.deleted.filter((d) => d !== id),
  });
  return {
    status: "ok",
    transport_id: id,
    stops_inserted: route.detail.stops.length,
    resolved_driver_id: route.detail.driver_id ?? null,
    resolved_truck_id: null,
    resolved_route_id: null,
  };
}

async function deleteTransport(id: string): Promise<unknown> {
  const state = await readState();
  writeState(
    state.saved.includes(id)
      ? { ...state, saved: state.saved.filter((s) => s !== id) }
      : { ...state, deleted: [...state.deleted, id] },
  );
  return {};
}

async function findWarehouse(id: string): Promise<unknown> {
  const warehouses = await readFile<{ id: string }[]>("warehouses.json");
  const warehouse = warehouses.find((w) => w.id === id);
  if (!warehouse) throw new Error("Backend request failed: 404 Not Found");
  return warehouse;
}

const LIST_FILES: Record<string, string> = {
  "/api/v1/db/warehouses": "warehouses.json",
  "/api/v1/db/customers": "customers.json",
  "/api/v1/db/trucks": "trucks.json",
  "/api/v1/db/drivers": "drivers.json",
  "/api/v1/db/orders": "orders.json",
  "/api/v1/data/drivers": "driver-zones.json",
  "/api/v1/catalog/materials": "materials.json",
  "/api/v1/catalog/material-types": "material-types.json",
};

export async function demoFetch(
  path: string,
  method = "GET",
  body?: BodyInit,
): Promise<unknown> {
  const { pathname } = new URL(path, "http://demo");
  const json = typeof body === "string" ? JSON.parse(body) : undefined;
  const id = pathname.split("/").pop() ?? "";

  if (method === "GET") {
    const file = LIST_FILES[pathname];
    if (file) return readFile(file);
    if (pathname === "/api/v1/data/transports") return listTransports();
    if (pathname.startsWith("/api/v1/data/transport/")) return getTransport(id);
    if (pathname.startsWith("/api/v1/db/warehouses/")) return findWarehouse(id);
    // The route preview page only reads the truck, to find the depot.
    if (pathname.startsWith("/api/v1/db/transports/")) {
      return { id, truck_id: null };
    }
  }
  if (method === "POST" && pathname === "/api/v1/optimize/full/preview") {
    return optimizePreview(json);
  }
  if (method === "POST" && pathname === "/api/v1/optimize/persist") {
    return persistRoute(json);
  }
  if (method === "DELETE" && pathname.startsWith("/api/v1/db/transports/")) {
    return deleteTransport(id);
  }
  throw new Error(READ_ONLY_MESSAGE);
}
