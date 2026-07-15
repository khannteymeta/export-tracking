"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ConfirmExportDialogProps {
  shipmentId: string;
}

export function ConfirmExportDialog({ shipmentId }: ConfirmExportDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      setError("Notes are required for confirmation.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/shipment-exports/${shipmentId}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: notes.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to confirm shipment export");
      }

      setOpen(false);
      setNotes("");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 h-8 gap-1.5 px-2.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-md cursor-pointer">
        <CheckCircle2 className="h-4 w-4" />
        Confirm Export
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              Confirm Shipment Export
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to confirm this shipment export? This action will set the status to "export_confirmed" and trigger billing settlement hooks.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <label htmlFor="notes" className="text-sm font-semibold text-foreground">
              Confirmation Notes <span className="text-destructive">*</span>
            </label>
            <textarea
              id="notes"
              placeholder="Provide export details (e.g., exit clearance documents, customs check results, vessel departure)..."
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (error) setError(null);
              }}
              rows={4}
              required
              className="w-full min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 resize-y"
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => {
                setOpen(false);
                setNotes("");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isSubmitting || !notes.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming...
                </>
              ) : (
                "Confirm Export"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
