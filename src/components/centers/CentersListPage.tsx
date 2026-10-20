"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useChatSurface } from "@/components/chat/ChatSurfaceProvider";
import { ConfirmDeleteDialog } from "@/components/shared/ConfirmDeleteDialog";
import { DataTable } from "@/components/shared/DataTable";
import { RemoteDataState } from "@/components/shared/RemoteDataState";
import { PageLayout } from "@/components/shell/PageLayout";
import { useBreadcrumb } from "@/components/shell/breadcrumb";
import { deleteWarehouse, type Warehouse } from "@/lib/api/warehouses";

import { AddCenterModal } from "./AddCenterModal";
import { EditCenterModal } from "./EditCenterModal";
import { buildCenterColumns, type Center } from "./columns";

type CentersListPageProps = {
  initialCenters: Warehouse[];
  initialError?: string;
};

export function CentersListPage({
  initialCenters,
  initialError,
}: CentersListPageProps) {
  const router = useRouter();
  const { setCrumbs } = useBreadcrumb();

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Center | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Center | null>(null);

  useEffect(() => {
    setCrumbs([{ label: "Centers" }]);
    return () => setCrumbs([]);
  }, [setCrumbs]);

  useChatSurface(
    useMemo(
      () => ({ surface: "centers_list", centerId: null, selected: null }),
      [],
    ),
  );

  const columns = useMemo(
    () =>
      buildCenterColumns({
        onEdit: (c) => setEditTarget(c),
        onDelete: (c) => setDeleteTarget(c),
      }),
    [],
  );

  return (
    <PageLayout>
      <div
        className="px-6 md:px-10 pt-8 pb-10 flex flex-col gap-7"
        data-tour="centers"
      >
        <div>
          <h2 className="headline text-ink">Pick a center</h2>
          <p className="body-lg text-ink-muted mt-2">
            Start a new plan by choosing the distribution center you&apos;ll
            dispatch from.
          </p>
        </div>

        {initialError ? (
          <RemoteDataState
            title="Could not load centers"
            description={initialError}
          />
        ) : initialCenters.length === 0 ? (
          <RemoteDataState
            title="No centers found"
            description="The backend returned an empty warehouse list."
          />
        ) : (
          <DataTable
            data={initialCenters}
            columns={columns}
            getRowId={(row) => row.id}
            searchColumnId="name"
            searchPlaceholder="Search centers..."
            searchAriaLabel="Search centers"
            filterColumnId="city"
            filterLabel="Filter by city"
            filterMobileLabel="City"
            addButtonLabel="Add Center"
            onAdd={() => setAddOpen(true)}
            onRowClick={(c) => router.push(`/centers/${c.id}`)}
          />
        )}
      </div>

      <AddCenterModal open={addOpen} onOpenChange={setAddOpen} />
      <EditCenterModal
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        center={editTarget}
      />
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete center?"
        description={`This permanently deletes "${deleteTarget?.name ?? ""}" and any references that depend on it.`}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteWarehouse(deleteTarget.id);
          router.refresh();
        }}
      />
    </PageLayout>
  );
}
