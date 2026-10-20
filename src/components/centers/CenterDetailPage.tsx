"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconFilter, IconUpload } from "@tabler/icons-react";

import { useChatSurface } from "@/components/chat/ChatSurfaceProvider";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { DataTable } from "@/components/shared/DataTable";
import { PageLayout } from "@/components/shell/PageLayout";
import { useBreadcrumb } from "@/components/shell/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddRouteModal } from "@/components/routes/AddRouteModal";
import { buildRouteColumns, type Route } from "@/components/routes/columns";
import { RouteHero } from "@/components/routes/RouteHero";
import { deleteTransport } from "@/lib/api/transports";
import type { PlannerChatContext } from "@/lib/chat/types";

import { ImportOrdersModal } from "./ImportOrdersModal";
import type { Center } from "./columns";

type Props = {
  center: Center;
  routes: Route[];
};

type Filter = "planned" | "completed";

// Routes whose code contains "OPT-" come from the optimizer's persist
// endpoint. `includes` (not `startsWith`) covers a legacy quirk where some
// rows landed with a "Truck N · OPT-XX" prefix before that label was dropped.
const isPlanned = (r: Route) => r.route_code.includes("OPT-");

const FILTER_LABELS: Record<Filter, string> = {
  planned: "Planned",
  completed: "Completed",
};

export function CenterDetailPage({ center, routes }: Props) {
  const router = useRouter();
  const { setCrumbs } = useBreadcrumb();

  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [addRouteOpen, setAddRouteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Route | null>(null);
  const [filter, setFilter] = useState<Filter>("planned");

  useEffect(() => {
    setCrumbs([
      { label: "Centers", onClick: () => router.push("/") },
      { label: center.name, onClick: () => setSelectedRoute(null) },
      ...(selectedRoute ? [{ label: selectedRoute.route_code }] : []),
    ]);
    return () => setCrumbs([]);
  }, [center, selectedRoute, setCrumbs, router]);

  const chatContext = useMemo<PlannerChatContext>(
    () =>
      selectedRoute
        ? {
            surface: "route_overview",
            centerId: center.id,
            selected: { kind: "route", routeId: selectedRoute.transport_id },
          }
        : {
            surface: "center_routes_table",
            centerId: center.id,
            selected: null,
          },
    // addRouteOpen forces a fresh reference when the modal closes, so the
    // chat surface re-publishes after AddRouteModal resets it back to null.
    [center.id, selectedRoute, addRouteOpen],
  );
  useChatSurface(chatContext);

  const columns = useMemo(
    () =>
      buildRouteColumns({
        onDelete: (r) => setDeleteTarget(r),
      }),
    [],
  );

  // Filter + sort. Date desc puts the most recent dispatch on top so newly
  // saved optimizer plans land right where the user expects them.
  const displayedRoutes = useMemo(() => {
    const filtered =
      filter === "planned"
        ? routes.filter(isPlanned)
        : routes.filter((r) => !isPlanned(r));
    return [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  }, [routes, filter]);

  const counts = useMemo(() => {
    const planned = routes.filter(isPlanned).length;
    return { planned, completed: routes.length - planned };
  }, [routes]);

  return (
    <PageLayout>
      {selectedRoute ? (
        <div className="flex h-full min-h-0 flex-col px-6 md:px-10 pt-5 pb-5">
          <RouteHero route={selectedRoute} center={center} />
        </div>
      ) : (
        <div
          className="px-6 md:px-10 pt-8 pb-10 flex flex-col gap-7"
          data-tour="routes"
        >
          <div>
            <h2 className="headline text-ink">{center.name}</h2>
            <p className="body-lg text-ink-muted mt-2">
              Routes dispatched from this center. Generate a new optimized
              plan or import demo orders to test the planner.
            </p>
          </div>

          <DataTable
            data={displayedRoutes}
            columns={columns}
            getRowId={(row) => row.transport_id}
            searchColumnId="route_code"
            searchPlaceholder="Search routes..."
            searchAriaLabel="Search routes"
            addButtonLabel="Add Route"
            onAdd={() => setAddRouteOpen(true)}
            toolbarTrailing={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImportOpen(true)}
                >
                  <IconUpload />
                  <span className="hidden lg:inline">
                    Import demo orders
                  </span>
                </Button>
                <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="sm" />}
                >
                  <IconFilter />
                  <span className="hidden lg:inline">
                    {FILTER_LABELS[filter]}
                  </span>
                  <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {counts[filter]}
                  </span>
                  <IconChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuRadioGroup
                    value={filter}
                    onValueChange={(v) => setFilter(v as Filter)}
                  >
                    <DropdownMenuRadioItem value="planned">
                      <span className="flex-1">Planned</span>
                      <span className="ml-2 tabular-nums text-muted-foreground">
                        {counts.planned}
                      </span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="completed">
                      <span className="flex-1">Completed</span>
                      <span className="ml-2 tabular-nums text-muted-foreground">
                        {counts.completed}
                      </span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              </>
            }
            selectedRowId={null}
            onRowClick={(r) => setSelectedRoute(r)}
          />
        </div>
      )}

      <AddRouteModal
        open={addRouteOpen}
        onOpenChange={setAddRouteOpen}
        centerId={center.id}
      />

      <ImportOrdersModal
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete route?"
        description={`This permanently deletes the transport "${deleteTarget?.route_code ?? ""}" scheduled for ${deleteTarget?.date ?? ""}.`}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteTransport(deleteTarget.transport_id);
          router.refresh();
        }}
      />
    </PageLayout>
  );
}
