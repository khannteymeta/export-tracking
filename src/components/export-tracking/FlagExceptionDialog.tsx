"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
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

interface FlagExceptionDialogProps {
  shipmentId: string;
}

type ExceptionReason = "signal_loss" | "delayed" | "customs_hold" | "other";

export function FlagExceptionDialog({ shipmentId }: FlagExceptionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<ExceptionReason>("signal_loss");
  const [details, setDetails] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (reason === "other" && !details.trim()) {
      setError("Please provide details since you chose 'Other' as the reason.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/shipment-exports/${shipmentId}/flag-exception`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason,
          details: details.trim() || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to flag exception");
      }

      setOpen(false);
      setDetails("");
      setReason("signal_loss");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 h-8 gap-1.5 px-2.5 font-semibold shadow-md bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40 cursor-pointer">
        <AlertTriangle className="h-4 w-4" />
        Flag Exception
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Flag Shipment Exception
            </DialogTitle>
            <DialogDescription>
              Mark this shipment export as an exception. This will set status to "exception" and send immediate alerts to administrators.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {/* Reason Select */}
            <div className="grid gap-1.5">
              <label htmlFor="reason" className="text-sm font-semibold text-foreground">
                Exception Reason
              </label>
              <select
                id="reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value as ExceptionReason);
                  setError(null);
                }}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 cursor-pointer"
              >
                <option value="signal_loss">Signal Loss (No ping updates)</option>
                <option value="delayed">Overdue (Delayed past expected date)</option>
                <option value="customs_hold">Held at Customs</option>
                <option value="other">Other (Details required)</option>
              </select>
            </div>

            {/* Details/Notes Textarea */}
            <div className="grid gap-1.5">
              <label htmlFor="details" className="text-sm font-semibold text-foreground">
                Description / Notes {reason === "other" && <span className="text-destructive">*</span>}
              </label>
              <textarea
                id="details"
                placeholder={
                  reason === "other"
                    ? "Provide details describing the exception reason..."
                    : "Add any additional context or observations (optional)..."
                }
                value={details}
                onChange={(e) => {
                  setDetails(e.target.value);
                  if (error) setError(null);
                }}
                rows={4}
                required={reason === "other"}
                className="w-full min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 resize-y"
              />
            </div>
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
                setDetails("");
                setReason("signal_loss");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting || (reason === "other" && !details.trim())}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Flagging...
                </>
              ) : (
                "Flag Exception"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
