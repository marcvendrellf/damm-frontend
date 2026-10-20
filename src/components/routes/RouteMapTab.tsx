"use client";

import {
  IconClock,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconTruck,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DEMO_MODE } from "@/lib/api/client";
import {
  Map,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerTooltip,
  type MapRef,
} from "@/components/ui/map";
import { cn } from "@/lib/utils";

import type { Route } from "./columns";
import type { RouteStop } from "./types";

// Map view for a route. Mirrors the contract surface from
// wiki/contracts/data-models.md (`RouteResult.ordered_stops`,
// `route_geojson`) and damm-backend/models/domain.py:DeliveryStop. The
// polyline + per-leg durations come from public OSRM until the backend
// `/preview/route/{id}` endpoint lands.

// Default departure when the route has no scheduled start_time (older
// transports, anything that didn't go through /optimize/persist).
const DEFAULT_ROUTE_START_MIN = 9 * 60;
const FALLBACK_AVG_SPEED_KMH = 22;

function parseHHMMtoMin(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

type LegTiming = {
  durationMin: number; // travel time
  startCoordIdx: number;
  endCoordIdx: number;
};

type OsrmRoute = {
  coordinates: [number, number][];
  legs: LegTiming[];
  totalDistanceKm: number;
  totalDurationMin: number;
};

type RouteMapTabProps = {
  route: Route;
  stops: RouteStop[];
  depot: { lat: number; lng: number };
};

type Speed = 1 | 4 | 16;

export function RouteMapTab({ route, stops, depot }: RouteMapTabProps) {
  // Real scheduled start when the route was persisted via /optimize/persist
  // (no-overlap scheduling), 09:00 default otherwise. Drives the wall-clock
  // display + late detection.
  const routeStartMin =
    parseHHMMtoMin(route.start_time) ?? DEFAULT_ROUTE_START_MIN;

  const [osrm, setOsrm] = useState<OsrmRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [simMin, setSimMin] = useState(0); // simulated minutes since route start
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(4);

  const waypoints = useMemo(() => {
    const all: [number, number][] = [
      [depot.lng, depot.lat],
      ...stops.map((s) => [s.lng, s.lat] as [number, number]),
      [depot.lng, depot.lat], // return to depot
    ];
    return all;
  }, [depot, stops]);

  // Fetch OSRM route once per route id.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    async function run() {
      try {
        const result = await fetchOsrmRoute(waypoints, route.transport_id);
        if (!cancelled) setOsrm(result);
      } catch (err) {
        // OSRM down / rate-limited — fall back to straight-line legs so the
        // demo still draws something.
        // eslint-disable-next-line no-console
        console.warn("[RouteMapTab] OSRM fetch failed, using fallback:", err);
        if (!cancelled) setOsrm(buildStraightFallback(waypoints));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [waypoints, route.transport_id]);

  // Build the simulation timeline: travel and service phases keyed by
  // cumulative simulated minutes.
  const timeline = useMemo(
    () => (osrm ? buildTimeline(osrm, stops) : null),
    [osrm, stops],
  );

  // requestAnimationFrame loop advances simMin while playing.
  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !timeline) return;
    let raf = 0;
    const tick = (ts: number) => {
      const last = lastTickRef.current ?? ts;
      const dtSec = (ts - last) / 1000;
      lastTickRef.current = ts;
      setSimMin((prev) => {
        const next = prev + dtSec * (speed / 60) * 60; // sim minutes per real second
        if (next >= timeline.totalMin) {
          setPlaying(false);
          return timeline.totalMin;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lastTickRef.current = null;
    };
  }, [playing, speed, timeline]);

  const truckPos = useMemo(
    () => (timeline && osrm ? interpolatePosition(timeline, osrm, simMin) : null),
    [timeline, osrm, simMin],
  );

  const stopStatuses = useMemo(
    () =>
      timeline
        ? computeStopStatuses(timeline, stops, simMin, routeStartMin)
        : [],
    [timeline, stops, simMin, routeStartMin],
  );

  const center: [number, number] = useMemo(() => {
    const lats = [depot.lat, ...stops.map((s) => s.lat)];
    const lngs = [depot.lng, ...stops.map((s) => s.lng)];
    const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
    return [avgLng, avgLat];
  }, [depot, stops]);

  const handleReset = () => {
    setPlaying(false);
    setSimMin(0);
  };

  // MapLibre's canvas only sizes itself when the container is visible. When
  // the parent tab is initially hidden (or grows after mount), the canvas
  // stays at its old dimensions and renders only part of the viewport. A
  // ResizeObserver on the container plus map.resize() keeps it in sync.
  const mapRef = useRef<MapRef | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div
        ref={mapContainerRef}
        className="relative min-h-[360px] overflow-hidden rounded-lg border border-border bg-surface-2"
      >
        <Map
          ref={mapRef}
          loading={loading}
          center={center}
          zoom={11}
          minZoom={6}
          maxZoom={17}
        >
          {osrm && (
            <>
              <MapRoute
                id={`route-${route.transport_id}-full`}
                coordinates={osrm.coordinates}
                color="#5b6572"
                width={5}
                opacity={0.32}
                interactive={false}
              />
              <MapRoute
                id={`route-${route.transport_id}-progress`}
                coordinates={
                  truckPos
                    ? osrm.coordinates.slice(0, truckPos.coordIndex + 1)
                    : []
                }
                color="#3b82f6"
                width={5.5}
                opacity={0.95}
                interactive={false}
              />
            </>
          )}

          <MapMarker longitude={depot.lng} latitude={depot.lat}>
            <MarkerContent>
              <div className="grid size-5 place-items-center rounded-full border-2 border-white bg-emerald-500 shadow-md">
                <span className="size-1.5 rounded-full bg-white" />
              </div>
            </MarkerContent>
            <MarkerTooltip>Depot · {route.route_code}</MarkerTooltip>
          </MapMarker>

          {stops.map((stop, idx) => {
            const status = stopStatuses[idx];
            return (
              <MapMarker
                key={stop.stop_id}
                longitude={stop.lng}
                latitude={stop.lat}
              >
                <MarkerContent>
                  <div
                    className={cn(
                      "grid size-7 place-items-center rounded-full border-2 border-white text-[11px] font-semibold text-white shadow-md transition-colors",
                      status?.state === "delivered" && !status.late && "bg-emerald-500",
                      status?.state === "delivered" && status.late && "bg-amber-500",
                      status?.state === "at_stop" && "bg-blue-500",
                      (!status || status.state === "pending") && "bg-zinc-500",
                    )}
                  >
                    {stop.sequence}
                  </div>
                </MarkerContent>
                <MarkerTooltip>
                  <div className="space-y-0.5 text-[11px]">
                    <p className="font-medium">{stop.customer_name}</p>
                    <p className="text-background/70">
                      ETA {stop.estimated_arrival ?? "—"}
                    </p>
                    {stop.products.length > 0 && (
                      <p className="text-background/70">
                        {summarizeProducts(stop.products)}
                      </p>
                    )}
                  </div>
                </MarkerTooltip>
              </MapMarker>
            );
          })}

          {truckPos && (
            <MapMarker
              longitude={truckPos.coord[0]}
              latitude={truckPos.coord[1]}
            >
              <MarkerContent>
                <div className="grid size-9 place-items-center rounded-full bg-blue-600 shadow-lg ring-2 ring-white">
                  <IconTruck className="size-4 text-white" aria-hidden />
                </div>
              </MarkerContent>
              <MarkerTooltip>
                <div className="space-y-0.5 text-[11px]">
                  <p className="font-medium">{route.driver_name}</p>
                  <p className="text-background/70">
                    Sim time {fmtClock(routeStartMin + simMin)}
                  </p>
                </div>
              </MarkerTooltip>
            </MapMarker>
          )}
        </Map>

        <div className="pointer-events-none absolute left-3 top-3 z-10 flex">
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 shadow-2xl">
            <IconClock className="size-3.5 text-black/70" aria-hidden />
            <span className="text-[13px] font-medium tabular-nums text-black">
              {fmtClock(routeStartMin + simMin)}
            </span>
          </div>
        </div>

        <SimControls
          playing={playing}
          speed={speed}
          simMin={simMin}
          totalMin={timeline?.totalMin ?? 0}
          routeStartMin={routeStartMin}
          disabled={!timeline}
          onPlayPause={() => setPlaying((p) => !p)}
          onReset={handleReset}
          onSpeedChange={setSpeed}
        />
      </div>

      <ol
        className="flex min-h-0 flex-col gap-1.5 overflow-y-auto rounded-md border border-border bg-surface-2 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Stop list"
      >
        {stops.map((stop, idx) => (
          <StopRow
            key={stop.stop_id}
            stop={stop}
            status={stopStatuses[idx]}
          />
        ))}
      </ol>
    </div>
  );
}

// ─── UI subcomponents ──────────────────────────────────────────────────────

function StopRow({
  stop,
  status,
}: {
  stop: RouteStop;
  status: StopStatus | undefined;
}) {
  const state = status?.state ?? "pending";
  const [expanded, setExpanded] = useState(false);
  const hasProducts = stop.products.length > 0;
  return (
    <li
      className={cn(
        "rounded-md border border-border bg-surface-1 transition-colors",
        state === "at_stop" && "ring-1 ring-blue-500/60",
      )}
    >
      <button
        type="button"
        onClick={() => hasProducts && setExpanded((v) => !v)}
        disabled={!hasProducts}
        aria-expanded={hasProducts ? expanded : undefined}
        className={cn(
          "flex w-full items-start gap-2.5 px-2.5 py-2 text-left",
          hasProducts &&
            "cursor-pointer hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white",
            state === "delivered" && !status?.late && "bg-emerald-500",
            state === "delivered" && status?.late && "bg-amber-500",
            state === "at_stop" && "bg-blue-500",
            state === "pending" && "bg-zinc-500",
          )}
        >
          {stop.sequence}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">
            {stop.customer_name}
          </p>
          <div className="flex items-center justify-between gap-2 text-[11px] text-ink-subtle">
            <span className="truncate">{stop.address}</span>
            {stop.time_window && (
              <span className="shrink-0 tabular-nums">
                {stop.time_window.open}–{stop.time_window.close}
              </span>
            )}
          </div>
          {hasProducts && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-subtle">
              <span className="truncate">{summarizeProducts(stop.products)}</span>
              <span aria-hidden className="ml-auto shrink-0 text-ink-tertiary">
                {expanded ? "▴" : "▾"}
              </span>
            </div>
          )}
        </div>
      </button>
      {expanded && hasProducts && (
        <ul className="border-t border-border/60 px-2.5 py-2 flex flex-col gap-1">
          {stop.products.map((p, i) => (
            <li
              key={`${p.description}-${i}`}
              className="flex items-start gap-1.5 text-[12px] text-ink"
            >
              <span
                aria-hidden
                className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-subtle"
              />
              <span className="min-w-0 flex-1">{p.description}</span>
              <span className="shrink-0 tabular-nums text-ink-subtle">
                {p.quantity} {unitLabel(p.unit)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

const STOP_UNIT_LABEL: Record<string, string> = {
  CAJ: "cases",
  BRL: "barrels",
  UN: "units",
  PAK: "packs",
};

function unitLabel(unit: string): string {
  return STOP_UNIT_LABEL[unit] ?? unit.toLowerCase();
}

// One-line summary of a stop's products: collapses by unit so the marker
// tooltip and list preview read naturally ("4 cases · 1 barrel" rather than
// dumping each SKU). Sorted descending by quantity within each unit.
function summarizeProducts(
  products: { quantity: number; unit: string }[],
): string {
  if (products.length === 0) return "";
  // globalThis.Map because the file imports a `Map` component from
  // @/components/ui/map at module scope which shadows the built-in.
  const totals = new globalThis.Map<string, number>();
  for (const p of products) {
    totals.set(p.unit, (totals.get(p.unit) ?? 0) + p.quantity);
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([unit, qty]) => `${qty} ${unitLabel(unit)}`)
    .join(" · ");
}

function SimControls({
  playing,
  speed,
  simMin,
  totalMin,
  routeStartMin,
  disabled,
  onPlayPause,
  onReset,
  onSpeedChange,
}: {
  playing: boolean;
  speed: Speed;
  simMin: number;
  totalMin: number;
  routeStartMin: number;
  disabled: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  onSpeedChange: (s: Speed) => void;
}) {
  const pct = totalMin > 0 ? Math.min(100, (simMin / totalMin) * 100) : 0;
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center">
      <div className="pointer-events-auto flex w-full max-w-xl flex-col gap-2 rounded-lg border border-white/10 bg-zinc-900/85 p-2.5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onPlayPause}
            disabled={disabled}
            className="gap-1.5"
          >
            {playing ? (
              <IconPlayerPause className="size-4" />
            ) : (
              <IconPlayerPlay className="size-4" />
            )}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onReset}
            disabled={disabled}
            className="gap-1.5 border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <IconRefresh className="size-4" />
            Reset
          </Button>
          <div
            className="ml-auto inline-flex rounded-md border border-white/10 bg-white/5 p-0.5"
            role="group"
            aria-label="Simulation speed"
          >
            {([1, 4, 16] as Speed[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSpeedChange(s)}
                disabled={disabled}
                aria-pressed={speed === s}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors",
                  speed === s
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:text-white",
                )}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] tabular-nums text-white/70">
          <IconClock className="size-3.5" aria-hidden />
          <span>{fmtClock(routeStartMin + simMin)}</span>
          <div
            className="relative ml-1 h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-blue-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span>
            {Math.round(simMin)}/{Math.round(totalMin)} min
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── OSRM + timeline math ─────────────────────────────────────────────────

async function fetchOsrmResponse(
  waypoints: [number, number][],
  transportId: string,
) {
  // The demo ships the OSRM answers for the routes its planner can save.
  if (DEMO_MODE) {
    const saved = await fetch(`/demo-data/osrm/${transportId}.json`);
    if (saved.ok) return saved.json();
  }
  const coordsPath = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsPath}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  return res.json();
}

async function fetchOsrmRoute(
  waypoints: [number, number][],
  transportId: string,
): Promise<OsrmRoute> {
  const data = await fetchOsrmResponse(waypoints, transportId);
  const r = data?.routes?.[0];
  if (!r?.geometry?.coordinates || !r.legs) throw new Error("OSRM bad payload");

  const coordinates = r.geometry.coordinates as [number, number][];

  // OSRM returns one snapped waypoint per input lat/lng (start + each stop +
  // depot return). Each waypoint sits ON the polyline. Locating each
  // waypoint's nearest polyline index gives us the exact coord at which a
  // leg ends — far more accurate than the duration-proportional guess we
  // used before, which left the truck "stopping" at a random midpoint along
  // the route and then visibly passing through the customer marker after.
  const osrmWaypoints = (data?.waypoints ?? []) as Array<{
    location?: [number, number];
  }>;
  const waypointIndices = waypoints.map((wp, i) => {
    const snapped = osrmWaypoints[i]?.location ?? wp;
    return nearestCoordIndex(coordinates, snapped);
  });

  const rawLegs = r.legs as Array<{ duration: number; distance: number }>;
  const legs: LegTiming[] = rawLegs.map((leg, i) => ({
    durationMin: leg.duration / 60,
    startCoordIdx: waypointIndices[i] ?? 0,
    endCoordIdx: waypointIndices[i + 1] ?? coordinates.length - 1,
  }));

  return {
    coordinates,
    legs,
    totalDistanceKm: (r.distance ?? 0) / 1000,
    totalDurationMin: legs.reduce((a, b) => a + b.durationMin, 0),
  };
}

function nearestCoordIndex(
  coords: [number, number][],
  target: [number, number],
): number {
  // Squared euclidean distance in lng/lat space — the polyline is dense
  // enough that the curvature error doesn't matter for a "closest point"
  // search. Saves a sqrt per iteration over haversine.
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const dx = (coords[i]?.[0] ?? 0) - target[0];
    const dy = (coords[i]?.[1] ?? 0) - target[1];
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function buildStraightFallback(waypoints: [number, number][]): OsrmRoute {
  // Straight-line legs between waypoints with synthesized durations.
  const coordinates = waypoints.slice() as [number, number][];
  const legs: LegTiming[] = [];
  let totalDistanceKm = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const km = haversineKm(a[1], a[0], b[1], b[0]);
    totalDistanceKm += km;
    legs.push({
      durationMin: (km / FALLBACK_AVG_SPEED_KMH) * 60,
      startCoordIdx: i,
      endCoordIdx: i + 1,
    });
  }
  return {
    coordinates,
    legs,
    totalDistanceKm,
    totalDurationMin: legs.reduce((a, b) => a + b.durationMin, 0),
  };
}

type Phase =
  | { kind: "travel"; legIdx: number; startMin: number; endMin: number }
  | { kind: "service"; stopIdx: number; startMin: number; endMin: number };

type Timeline = {
  phases: Phase[];
  totalMin: number;
};

function buildTimeline(osrm: OsrmRoute, stops: RouteStop[]): Timeline {
  // One travel leg per (depot + stops + depot back). Service phase after each
  // stop's arrival leg, except after the final return-to-depot leg.
  const phases: Phase[] = [];
  let cursor = 0;
  osrm.legs.forEach((leg, i) => {
    phases.push({
      kind: "travel",
      legIdx: i,
      startMin: cursor,
      endMin: cursor + leg.durationMin,
    });
    cursor += leg.durationMin;
    // After leg `i` we're AT stop index `i` (the leg arrived there). The last
    // leg returns to depot — no service phase after it.
    const stopIdx = i;
    if (stopIdx < stops.length) {
      const svc = stops[stopIdx]!.service_time_min;
      phases.push({
        kind: "service",
        stopIdx,
        startMin: cursor,
        endMin: cursor + svc,
      });
      cursor += svc;
    }
  });
  return { phases, totalMin: cursor };
}

function interpolatePosition(
  timeline: Timeline,
  osrm: OsrmRoute,
  simMin: number,
): { coord: [number, number]; coordIndex: number } | null {
  if (osrm.coordinates.length === 0) return null;
  const t = Math.max(0, Math.min(simMin, timeline.totalMin));
  const phase = timeline.phases.find((p) => t >= p.startMin && t <= p.endMin);
  if (!phase) {
    const last = osrm.coordinates[osrm.coordinates.length - 1]!;
    return { coord: last, coordIndex: osrm.coordinates.length - 1 };
  }
  if (phase.kind === "service") {
    const leg = osrm.legs[phase.stopIdx]!;
    const c = osrm.coordinates[leg.endCoordIdx] ?? osrm.coordinates[0]!;
    return { coord: c, coordIndex: leg.endCoordIdx };
  }
  const leg = osrm.legs[phase.legIdx]!;
  const span = Math.max(1e-6, phase.endMin - phase.startMin);
  const frac = (t - phase.startMin) / span;
  const idx = Math.round(
    leg.startCoordIdx + frac * (leg.endCoordIdx - leg.startCoordIdx),
  );
  const safeIdx = Math.max(0, Math.min(osrm.coordinates.length - 1, idx));
  return { coord: osrm.coordinates[safeIdx]!, coordIndex: safeIdx };
}

type StopStatus = {
  state: "pending" | "at_stop" | "delivered";
  late: boolean;
  arrivedAtMin: number | null;
};

function computeStopStatuses(
  timeline: Timeline,
  stops: RouteStop[],
  simMin: number,
  routeStartMin: number,
): StopStatus[] {
  return stops.map((stop, idx) => {
    const arrival = timeline.phases.find(
      (p) => p.kind === "travel" && (p as Extract<Phase, { kind: "travel" }>).legIdx === idx,
    ) as Extract<Phase, { kind: "travel" }> | undefined;
    const service = timeline.phases.find(
      (p) =>
        p.kind === "service" &&
        (p as Extract<Phase, { kind: "service" }>).stopIdx === idx,
    ) as Extract<Phase, { kind: "service" }> | undefined;
    if (!arrival || !service) {
      return { state: "pending", late: false, arrivedAtMin: null };
    }
    const arrivedAtMin = arrival.endMin;
    let state: StopStatus["state"] = "pending";
    if (simMin >= service.endMin) state = "delivered";
    else if (simMin >= arrival.endMin) state = "at_stop";

    let late = false;
    if (state !== "pending" && stop.time_window) {
      const closeMin = toMinutes(stop.time_window.close);
      // Wall-clock arrival = route's scheduled start + sim minutes.
      if (routeStartMin + arrivedAtMin > closeMin) late = true;
    }

    return { state, late, arrivedAtMin };
  });
}

// ─── helpers ──────────────────────────────────────────────────────────────

function fmtClock(absMin: number): string {
  const total = Math.max(0, Math.round(absMin));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function haversineKm(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371;
  const dLa = ((la2 - la1) * Math.PI) / 180;
  const dLo = ((lo2 - lo1) * Math.PI) / 180;
  const a =
    Math.sin(dLa / 2) ** 2 +
    Math.cos((la1 * Math.PI) / 180) *
      Math.cos((la2 * Math.PI) / 180) *
      Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

