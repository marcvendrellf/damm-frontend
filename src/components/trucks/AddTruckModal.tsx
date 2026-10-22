"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTruck } from "@/lib/api/catalog";

const formSchema = z.object({
  plate: z.string().min(1, "Required"),
  capacity_pallets: z.coerce.number().int().min(1).max(20),
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddTruckModal({ open, onOpenChange }: Props) {
  const router = useRouter();
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { plate: "", capacity_pallets: 6 },
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await createTruck(data);
      onOpenChange(false);
      form.reset({ plate: "", capacity_pallets: 6 });
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not create truck");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset({ plate: "", capacity_pallets: 6 });
      setErrorMsg(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add truck</DialogTitle>
          <DialogDescription>
            Capacity drives the truck type label (3 → van, 6 → 6pal, 8 → 8pal).
          </DialogDescription>
        </DialogHeader>

        <form
          id="add-truck-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-4 py-2"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="plate">Plate</Label>
            <Input
              id="plate"
              placeholder="e.g. MAG-6P-07"
              {...form.register("plate")}
            />
            {form.formState.errors.plate && (
              <p className="text-[12px] text-destructive">
                {form.formState.errors.plate.message}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="capacity_pallets">Capacity (pallets)</Label>
            <Input
              id="capacity_pallets"
              type="number"
              min={1}
              max={20}
              {...form.register("capacity_pallets")}
            />
            {form.formState.errors.capacity_pallets && (
              <p className="text-[12px] text-destructive">
                {form.formState.errors.capacity_pallets.message}
              </p>
            )}
          </div>

          {errorMsg && (
            <p className="text-[12px] text-destructive">{errorMsg}</p>
          )}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="add-truck-form" disabled={submitting}>
            {submitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
