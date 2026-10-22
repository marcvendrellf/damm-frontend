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
import { createWarehouse } from "@/lib/api/warehouses";

const formSchema = z.object({
  name: z.string().min(1, "Required"),
  city: z.string().min(1, "Required"),
  address: z.string().optional(),
  postal_code: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddCenterModal({ open, onOpenChange }: Props) {
  const router = useRouter();
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", city: "", address: "", postal_code: "" },
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await createWarehouse(data);
      onOpenChange(false);
      form.reset();
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not create center");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset();
      setErrorMsg(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add center</DialogTitle>
          <DialogDescription>
            Register a new distribution center (warehouse).
          </DialogDescription>
        </DialogHeader>

        <form
          id="add-center-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-4 py-2"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g. Magatzem Mollet"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="text-[12px] text-destructive">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              placeholder="e.g. Mollet del Vallès"
              {...form.register("city")}
            />
            {form.formState.errors.city ? (
              <p className="text-[12px] text-destructive">
                {form.formState.errors.city.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="postal_code">Postal code</Label>
            <Input
              id="postal_code"
              placeholder="e.g. 08100"
              {...form.register("postal_code")}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="Street and number"
              {...form.register("address")}
            />
          </div>

          {errorMsg ? (
            <p className="text-[12px] text-destructive">{errorMsg}</p>
          ) : null}
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
          <Button type="submit" form="add-center-form" disabled={submitting}>
            {submitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
