"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconCalendar } from "@tabler/icons-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { useChatSurfaceState } from "@/components/chat/ChatSurfaceProvider";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlannerChatContext } from "@/lib/chat/types";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShinyText } from "@/components/ui/shiny-text";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { WanderingEyes } from "@/components/ui/wandering-eyes";
import { cn } from "@/lib/utils";

import { RouteReviewPanel } from "./RouteReviewPanel";
import {
  generateSuggestedRoutesFromBackend,
  persistAllSuggestedRoutes,
  persistSuggestedRoute,
} from "@/lib/api/optimize";
import { listAvailableDates } from "@/lib/api/orders";
import {
  generateSuggestedRoutes,
  type SuggestedRoute,
} from "./suggested-routes-mock";

const formSchema = z.object({
  date: z.string().min(1, "Required"),
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  centerId: string;
};

const isoToDate = (iso: string): Date | undefined => {
  if (!iso) return undefined;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const dateToIso = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const formatDate = (iso: string): string => {
  const d = isoToDate(iso);
  return d
    ? d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Pick a date";
};

type Phase = "form" | "loading" | "review";

export function AddRouteModal({ open, onOpenChange, centerId }: Props) {
  const router = useRouter();
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { date: "" },
  });

  const [phase, setPhase] = React.useState<Phase>("form");
  const [suggestions, setSuggestions] = React.useState<SuggestedRoute[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveErrorMsg, setSaveErrorMsg] = React.useState<string | null>(null);
  const [availableDates, setAvailableDates] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [loadingDates, setLoadingDates] = React.useState(false);

  // Fetch the set of dates that have undelivered orders, so the picker can
  // grey out anything the optimizer would just return empty for.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingDates(true);
    listAvailableDates()
      .then((dates) => {
        if (cancelled) return;
        setAvailableDates(new Set(dates));
        // Default the picker to the earliest available date if user hasn't
        // chosen one yet for this open cycle.
        const current = form.getValues("date");
        if (!current && dates.length > 0) {
          form.setValue("date", dates[0]!);
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[AddRouteModal] could not load available dates:", err);
      })
      .finally(() => {
        if (!cancelled) setLoadingDates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, form]);

  const { setContext } = useChatSurfaceState();
  React.useEffect(() => {
    if (!open || phase !== "review") return;
    const active = suggestions.find((s) => s.transport_id === activeId);
    if (!active) return;
    const previous: PlannerChatContext = {
      surface: "add_route_review",
      centerId,
      selected: { kind: "suggested_route", transportId: active.transport_id },
      suggestion: active,
      siblingSuggestions: suggestions
        .filter((s) => s.transport_id !== active.transport_id)
        .map((s) => ({
          transport_id: s.transport_id,
          route_code: s.route_code,
          total_stops: s.total_stops,
        })),
    };
    setContext(previous);
    return () => setContext(null);
  }, [open, phase, suggestions, activeId, centerId, setContext]);

  const reset = React.useCallback(() => {
    form.reset({ date: "" });
    setPhase("form");
    setSuggestions([]);
    setActiveId(null);
    setErrorMsg(null);
    setSaving(false);
    setSaveErrorMsg(null);
  }, [form]);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleGenerate = form.handleSubmit(async (data) => {
    setPhase("loading");
    setErrorMsg(null);
    try {
      const routes = await generateSuggestedRoutesFromBackend({
        date: data.date,
        warehouseId: centerId,
      });
      // Backend may return zero routes if there's no demand for the date or
      // the call yields nothing — fall back to the mock so the UI renders.
      const final = routes.length > 0 ? routes : generateSuggestedRoutes(data.date);
      setSuggestions(final);
      setActiveId(final[0]?.transport_id ?? null);
      setPhase("review");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[AddRouteModal] optimizer call failed:", err);
      setErrorMsg(
        err instanceof Error ? err.message : "Optimizer call failed",
      );
      const fallback = generateSuggestedRoutes(data.date);
      setSuggestions(fallback);
      setActiveId(fallback[0]?.transport_id ?? null);
      setPhase("review");
    }
  });

  const handleClose = () => {
    handleOpenChange(false);
  };

  // Persist the currently active suggestion via /api/v1/optimize/persist.
  // After success, refresh the parent so the new transport appears in the
  // center's route list, then close the modal.
  const handleSaveActive = async () => {
    const active = suggestions.find((s) => s.transport_id === activeId);
    if (!active) return;
    setSaving(true);
    setSaveErrorMsg(null);
    try {
      await persistSuggestedRoute(active, centerId);
      router.refresh();
      handleOpenChange(false);
    } catch (err) {
      setSaveErrorMsg(
        err instanceof Error ? err.message : "Could not save route",
      );
    } finally {
      setSaving(false);
    }
  };

  // Persist every suggestion in the current plan in parallel. Reports any
  // partial failures inline; on full success closes the modal and refreshes.
  const handleSaveAll = async () => {
    if (suggestions.length === 0) return;
    setSaving(true);
    setSaveErrorMsg(null);
    try {
      const { failed } = await persistAllSuggestedRoutes(suggestions, centerId);
      router.refresh();
      if (failed.length > 0) {
        setSaveErrorMsg(
          `Saved ${suggestions.length - failed.length}/${suggestions.length}; ${failed.length} failed.`,
        );
      } else {
        handleOpenChange(false);
      }
    } catch (err) {
      setSaveErrorMsg(
        err instanceof Error ? err.message : "Could not save routes",
      );
    } finally {
      setSaving(false);
    }
  };

  const active = suggestions.find((s) => s.transport_id === activeId) ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden p-0",
          // Smooth size transition between phases — width + min-height tween
          // on a cubic-bezier so the form → review jump is not abrupt.
          "transition-[max-width,min-height] duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          phase === "review"
            ? "min-h-[620px] sm:max-w-[1200px]"
            : "min-h-[360px] sm:max-w-[600px]",
        )}
      >
        {phase === "form" ? (
          <FormPhase
            form={form}
            onSubmit={handleGenerate}
            onCancel={() => handleOpenChange(false)}
            availableDates={availableDates}
            loadingDates={loadingDates}
          />
        ) : null}

        {phase === "loading" ? <LoadingPhase /> : null}

        {phase === "review" && active ? (
          <ReviewPhase
            suggestions={suggestions}
            active={active}
            activeId={activeId}
            onSelect={setActiveId}
            onClose={handleClose}
            onSave={handleSaveActive}
            onSaveAll={handleSaveAll}
            saving={saving}
            errorMsg={errorMsg}
            saveErrorMsg={saveErrorMsg}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FormPhase({
  form,
  onSubmit,
  onCancel,
  availableDates,
  loadingDates,
}: {
  form: ReturnType<typeof useForm<FormData>>;
  onSubmit: (e: React.BaseSyntheticEvent) => void;
  onCancel: () => void;
  availableDates: Set<string>;
  loadingDates: boolean;
}) {
  const hasDates = availableDates.size > 0;
  const isDateDisabled = React.useCallback(
    (d: Date) => !availableDates.has(dateToIso(d)),
    [availableDates],
  );

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <DialogTitle className="text-xl">Add route</DialogTitle>
        <DialogDescription className="max-w-sm">
          Pick a date to generate suggestions. Only days with pending orders
          are selectable.
        </DialogDescription>
      </div>

      <div className="grid w-full max-w-[260px] gap-1.5">
        <Label htmlFor="date" className="text-center">
          Date
        </Label>
        <Controller
          control={form.control}
          name="date"
          render={({ field }) => (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    id="date"
                    type="button"
                    variant="outline"
                    disabled={loadingDates || !hasDates}
                    className="w-full justify-start border-transparent bg-accent font-normal text-foreground hover:bg-accent/80 dark:border-transparent dark:bg-accent dark:hover:bg-accent/80"
                  />
                }
              >
                <IconCalendar className="mr-2 size-4 opacity-60" />
                {loadingDates
                  ? "Loading dates..."
                  : !hasDates
                    ? "No dates available"
                    : formatDate(field.value)}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={isoToDate(field.value)}
                  // Open on the picked day; today's month has no orders.
                  defaultMonth={isoToDate(field.value)}
                  onSelect={(d) => {
                    if (d) field.onChange(dateToIso(d));
                  }}
                  disabled={isDateDisabled}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          )}
        />
        {form.formState.errors.date ? (
          <p className="text-center text-[12px] text-destructive">
            {form.formState.errors.date.message}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <button
          type="submit"
          disabled={loadingDates || !hasDates}
          className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-white px-3 text-[12px] font-medium text-[#111111] ring-1 ring-foreground/10 transition-colors hover:bg-white/90 disabled:opacity-50"
          title="Generate routes"
          data-tour="generate"
        >
          <ShinyText
            className="font-medium"
            color="#111111"
            shineColor="#9ca3af"
            speed={5}
            spread={120}
            text="✨ Generate Routes"
          />
        </button>
      </div>
    </form>
  );
}

function LoadingPhase() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10">
      <DialogTitle className="sr-only">Add route</DialogTitle>
      <DialogDescription className="sr-only">
        Generating route suggestions
      </DialogDescription>
      <WanderingEyes
        className="text-foreground"
        style={{ width: 120, height: 120 / (9 / 4) }}
      />
      <TextShimmer className="text-sm" duration={1.6}>
        Optimizing the day...
      </TextShimmer>
    </div>
  );
}

function ReviewPhase({
  suggestions,
  active,
  activeId,
  onSelect,
  onClose,
  onSave,
  onSaveAll,
  saving,
  errorMsg,
  saveErrorMsg,
}: {
  suggestions: SuggestedRoute[];
  active: SuggestedRoute;
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onSave: () => void;
  onSaveAll: () => void;
  saving: boolean;
  errorMsg: string | null;
  saveErrorMsg: string | null;
}) {
  return (
    <div className="grid grid-cols-[270px_1fr]">
      <aside className="m-2 flex flex-col overflow-hidden rounded-xl border bg-canvas/60">
        <div className="px-4 py-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Day plan
          </div>
          <div className="text-sm font-medium">
            {suggestions.length} truck{suggestions.length === 1 ? "" : "s"}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {suggestions.map((s) => {
            const isActive = s.transport_id === activeId;
            return (
              <li key={s.transport_id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.transport_id)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left transition-colors",
                    isActive
                      ? "border-ring bg-accent"
                      : "border-transparent hover:bg-muted",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-[13px] font-medium">
                      {s.route_code}
                    </div>
                    <div className="text-[11px] tabular-nums text-muted-foreground">
                      {s.total_stops} stops
                    </div>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {s.driver_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.truck_code} · {s.truck_type}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-col">
        <div className="flex flex-col gap-1 px-4 py-3">
          <DialogTitle>Suggested routes — {active.route_code}</DialogTitle>
          <DialogDescription className="sr-only">
            Review the suggested routes generated by the optimizer.
          </DialogDescription>
          {errorMsg ? (
            <p className="text-[12px] text-destructive">
              Optimizer error — showing fallback. ({errorMsg})
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span>
              <span className="text-muted-foreground/70">Driver:</span>{" "}
              <span className="text-foreground">{active.driver_name}</span>
            </span>
            <span>
              <span className="text-muted-foreground/70">Truck:</span>{" "}
              <span className="text-foreground">{active.truck_code}</span>
              <span> · {active.truck_type}</span>
            </span>
            <span>
              <span className="text-muted-foreground/70">Date:</span>{" "}
              <span className="text-foreground tabular-nums">
                {active.date}
              </span>
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          <RouteReviewPanel route={active} />
        </div>

        <div className="mt-auto flex items-center justify-end gap-3 border-t bg-muted/50 p-4">
          {saveErrorMsg ? (
            <span className="mr-auto text-[12px] text-destructive">
              {saveErrorMsg}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save selected"}
          </Button>
          <Button
            type="button"
            onClick={onSaveAll}
            disabled={saving || suggestions.length === 0}
            data-tour="save-all"
          >
            {saving
              ? "Saving..."
              : `Save all (${suggestions.length})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
