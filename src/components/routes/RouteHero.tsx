"use client";

import { useEffect, useMemo, useState } from "react";
import { IconMap2, IconTruck } from "@tabler/icons-react";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { getTransport, type TransportDetail } from "@/lib/api/transports";
import type { Warehouse } from "@/lib/api/warehouses";

import type { Route } from "./columns";
import { RouteMapTab } from "./RouteMapTab";
import { RouteTruckTab } from "./RouteTruckTab";
import { adaptBackendLoadPlan } from "./backendLoadAdapter";
import { depotForCenter, transportStopsToRouteStops } from "./route-stops";

type RouteHeroProps = {
  route: Route;
  center?: Warehouse | null;
};

type TruckTypeKey = "van" | "6pal" | "8pal";

function normalizeTruckType(value: string | null | undefined): TruckTypeKey {
  if (value === "van" || value === "6pal" || value === "8pal") return value;
  return "8pal";
}

function capacityForType(type: TruckTypeKey): number {
  if (type === "van") return 3;
  if (type === "6pal") return 6;
  return 8;
}

export function RouteHero({ route, center }: RouteHeroProps) {
  const [detail, setDetail] = useState<TransportDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    getTransport(route.transport_id).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
  }, [route.transport_id]);

  const truckType = normalizeTruckType(
    detail?.truck_type ?? route.truck_type ?? null,
  );
  const capacity = capacityForType(truckType);
  // Backend always returns a load_plan when there are stops to pack — either
  // the optimizer's exact one (persisted) or one derived from the actual
  // stop products. Null means a transport with no stops at all.
  const visualization = useMemo(
    () => (detail?.load_plan ? adaptBackendLoadPlan(detail.load_plan) : null),
    [detail?.load_plan],
  );

  const stops = useMemo(
    () => (detail ? transportStopsToRouteStops(detail.stops) : []),
    [detail],
  );
  const depot = useMemo(() => depotForCenter(center), [center]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <h2 id="route-hero-title" className="headline text-ink truncate">
          {route.route_code}
        </h2>
        <KpiInline route={route} truckType={truckType} />
      </header>

      <Tabs
        defaultValue="truck"
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <TabsList aria-label="Route detail view" className="self-start">
          <TabsTab value="truck">
            <IconTruck aria-hidden />
            Truck
          </TabsTab>
          <TabsTab value="map" data-tour="map-tab">
            <IconMap2 aria-hidden />
            Map
          </TabsTab>
        </TabsList>

        <TabsPanel value="truck" className="flex min-h-0 flex-1 flex-col">
          {visualization ? (
            <RouteTruckTab
              visualization={visualization}
              capacityPallets={capacity}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-surface-2 p-10 text-center">
              <p className="max-w-sm text-[13px] text-ink-subtle">
                {detail
                  ? "No load data — this transport has no stops to pack."
                  : "Loading truck plan..."}
              </p>
            </div>
          )}
        </TabsPanel>

        <TabsPanel value="map" className="flex min-h-0 flex-1 flex-col">
          <RouteMapTab route={route} stops={stops} depot={depot} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}

function KpiInline({
  route,
  truckType,
}: {
  route: Route;
  truckType: TruckTypeKey;
}) {
  const kpis = [
    { label: "Driver", value: route.driver_name ?? "—" },
    { label: "Truck", value: truckType },
    { label: "Stops", value: String(route.stop_count) },
    { label: "Date", value: route.date },
  ];

  return (
    <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {kpis.map(({ label, value }, idx) => (
        <div key={label} className="flex items-baseline gap-1.5">
          {idx > 0 && (
            <span aria-hidden className="text-ink-tertiary">
              ·
            </span>
          )}
          <dt className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">
            {label}
          </dt>
          <dd className="text-[12px] font-medium tabular-nums text-ink">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

