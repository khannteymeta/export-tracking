"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { 
  Loader2, 
  Cpu, 
  User, 
  Calendar, 
  Globe, 
  PackageCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrackerOption {
  id: string;
  label: string;
  externalTrackerId: string;
  customerId: string;
  customerName: string;
}

interface CreateShipmentFormProps {
  availableTrackers: TrackerOption[];
}

export function CreateShipmentForm({ availableTrackers }: CreateShipmentFormProps) {
  const router = useRouter();
  
  // Form state fields
  const [trackerId, setTrackerId] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [productCategory, setProductCategory] = React.useState("general");
  const [productDescription, setProductDescription] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [weightKg, setWeightKg] = React.useState("");
  const [shipmentReference, setShipmentReference] = React.useState("");
  const [containerNumber, setContainerNumber] = React.useState("");
  const [destinationCountry, setDestinationCountry] = React.useState("");
  const [shippingMethod, setShippingMethod] = React.useState("sea_freight");
  const [expectedExportDate, setExpectedExportDate] = React.useState("");

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = React.useState<string | null>(null);

  // Handle tracker selection change & auto-fill customer info
  const handleTrackerChange = (selectedTrackerId: string) => {
    setTrackerId(selectedTrackerId);
    const tracker = availableTrackers.find((t) => t.id === selectedTrackerId);
    if (tracker) {
      setCustomerId(tracker.customerId);
      setCustomerName(tracker.customerName);
    } else {
      setCustomerId("");
      setCustomerName("");
    }
    // Clear errors for these fields
    if (errors.trackerId) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.trackerId;
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});
    setGeneralError(null);

    // Prepare body payload, parsing values to types validated by createShipmentExportSchema
    const payload: Record<string, any> = {
      trackerId,
      customerId,
      productCategory,
      productDescription: productDescription.trim(),
      destinationCountry: destinationCountry.trim(),
      shippingMethod,
    };

    if (quantity) {
      payload.quantity = parseInt(quantity, 10);
    }
    if (weightKg) {
      payload.weightKg = parseFloat(weightKg);
    }
    if (shipmentReference.trim()) {
      payload.shipmentReference = shipmentReference.trim();
    }
    if (containerNumber.trim()) {
      payload.containerNumber = containerNumber.trim();
    }
    if (expectedExportDate) {
      payload.expectedExportDate = expectedExportDate;
    }

    try {
      const response = await fetch("/api/shipment-exports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 400 && result.error?.validation) {
          // Validation error dictionary
          setErrors(result.error.validation);
        } else {
          throw new Error(result.error?.message || "Failed to create shipment export");
        }
      } else {
        router.push("/export-tracking");
        router.refresh();
      }
    } catch (err: any) {
      setGeneralError(err.message || "An unexpected error occurred during submission.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {generalError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
          {generalError}
        </div>
      )}

      {/* Grid of form cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Panel 1: Tracker & Cargo Identification */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 border-b border-border/40 pb-2 mb-2">
            <Cpu className="h-4 w-4 text-indigo-500" />
            Device & Identity Specs
          </h3>

          {/* Tracker Dropdown Selection */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tracker-select" className="text-xs font-bold text-foreground">
              Select GPS Tracker Device <span className="text-destructive">*</span>
            </label>
            <select
              id="tracker-select"
              required
              value={trackerId}
              onChange={(e) => handleTrackerChange(e.target.value)}
              className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 cursor-pointer ${
                errors.trackerId ? "border-destructive focus:ring-destructive/20" : "border-border"
              }`}
            >
              <option value="">Select active tracker...</option>
              {availableTrackers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.externalTrackerId})
                </option>
              ))}
            </select>
            {errors.trackerId && (
              <p className="text-[11px] text-destructive font-semibold">{errors.trackerId[0]}</p>
            )}
            {availableTrackers.length === 0 && (
              <p className="text-[11px] text-amber-600 font-semibold mt-1">
                ⚠️ All trackers are currently assigned to active shipments. Create a tracker or settle an active export first.
              </p>
            )}
          </div>

          {/* Customer (Auto-filled on Tracker Change) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="customer-name" className="text-xs font-bold text-foreground">
              Customer / Shipper <span className="text-muted-foreground">(Auto-filled)</span>
            </label>
            <div className="relative">
              <input
                id="customer-name"
                type="text"
                readOnly
                placeholder="Select tracker to auto-fill customer..."
                value={customerName}
                className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 pl-8 py-1.5 text-sm text-muted-foreground outline-hidden cursor-not-allowed"
              />
              <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
            </div>
            {errors.customerId && (
              <p className="text-[11px] text-destructive font-semibold">{errors.customerId[0]}</p>
            )}
          </div>

          {/* Category Dropdown Selection */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category-select" className="text-xs font-bold text-foreground">
              Product Category <span className="text-destructive">*</span>
            </label>
            <select
              id="category-select"
              value={productCategory}
              onChange={(e) => setProductCategory(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 cursor-pointer"
            >
              <option value="general">General</option>
              <option value="electronics">Electronics</option>
              <option value="textiles">Textiles</option>
              <option value="machinery">Machinery</option>
              <option value="agriculture">Agriculture</option>
            </select>
            {errors.productCategory && (
              <p className="text-[11px] text-destructive font-semibold">{errors.productCategory[0]}</p>
            )}
          </div>

          {/* Product Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="product-desc" className="text-xs font-bold text-foreground">
              Product Description <span className="text-destructive">*</span>
            </label>
            <textarea
              id="product-desc"
              required
              rows={3}
              placeholder="Detailed description of goods (e.g. 500x OLED Panels, Model XR)..."
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              className={`w-full min-h-[70px] rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 resize-y ${
                errors.productDescription ? "border-destructive focus:ring-destructive/20" : "border-border"
              }`}
            />
            {errors.productDescription && (
              <p className="text-[11px] text-destructive font-semibold">{errors.productDescription[0]}</p>
            )}
          </div>
        </div>

        {/* Panel 2: Logistics & Shipping details */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 border-b border-border/40 pb-2 mb-2">
            <Globe className="h-4 w-4 text-emerald-500" />
            Logistics & Routing Details
          </h3>

          <div className="grid grid-cols-2 gap-4">
            {/* Cargo Quantity */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cargo-qty" className="text-xs font-bold text-foreground">Cargo Quantity</label>
              <input
                id="cargo-qty"
                type="number"
                min="1"
                placeholder="1000"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                  errors.quantity ? "border-destructive focus:ring-destructive/20" : "border-border"
                }`}
              />
              {errors.quantity && (
                <p className="text-[11px] text-destructive font-semibold">{errors.quantity[0]}</p>
              )}
            </div>

            {/* Cargo Weight */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cargo-weight" className="text-xs font-bold text-foreground">Cargo Weight (kg)</label>
              <input
                id="cargo-weight"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="450.50"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                  errors.weightKg ? "border-destructive focus:ring-destructive/20" : "border-border"
                }`}
              />
              {errors.weightKg && (
                <p className="text-[11px] text-destructive font-semibold">{errors.weightKg[0]}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Shipment Reference */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="shipment-ref" className="text-xs font-bold text-foreground">Shipment Reference</label>
              <input
                id="shipment-ref"
                type="text"
                placeholder="INV-2026-0042"
                value={shipmentReference}
                onChange={(e) => setShipmentReference(e.target.value)}
                className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                  errors.shipmentReference ? "border-destructive focus:ring-destructive/20" : "border-border"
                }`}
              />
              {errors.shipmentReference && (
                <p className="text-[11px] text-destructive font-semibold">{errors.shipmentReference[0]}</p>
              )}
            </div>

            {/* Container Number */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="container-num" className="text-xs font-bold text-foreground">Container Number</label>
              <input
                id="container-num"
                type="text"
                placeholder="MSCU1234567"
                value={containerNumber}
                onChange={(e) => setContainerNumber(e.target.value)}
                className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                  errors.containerNumber ? "border-destructive focus:ring-destructive/20" : "border-border"
                }`}
              />
              {errors.containerNumber && (
                <p className="text-[11px] text-destructive font-semibold">{errors.containerNumber[0]}</p>
              )}
            </div>
          </div>

          {/* Destination Country */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dest-country" className="text-xs font-bold text-foreground">
              Destination Country <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <input
                id="dest-country"
                type="text"
                required
                placeholder="US / SG / ID / DE..."
                value={destinationCountry}
                onChange={(e) => setDestinationCountry(e.target.value)}
                className={`w-full h-9 rounded-lg border bg-background px-3 pl-8 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                  errors.destinationCountry ? "border-destructive focus:ring-destructive/20" : "border-border"
                }`}
              />
              <Globe className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
            </div>
            {errors.destinationCountry && (
              <p className="text-[11px] text-destructive font-semibold">{errors.destinationCountry[0]}</p>
            )}
          </div>

          {/* Shipping Method Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="shipping-method" className="text-xs font-bold text-foreground">
              Shipping Method <span className="text-destructive">*</span>
            </label>
            <select
              id="shipping-method"
              value={shippingMethod}
              onChange={(e) => setShippingMethod(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 cursor-pointer"
            >
              <option value="sea_freight">Sea Freight (Port Exit)</option>
              <option value="air_freight">Air Freight (Airport Exit)</option>
              <option value="land_border">Land Border (Checkpoint Exit)</option>
              <option value="courier">Courier Service</option>
            </select>
            {errors.shippingMethod && (
              <p className="text-[11px] text-destructive font-semibold">{errors.shippingMethod[0]}</p>
            )}
          </div>

          {/* Expected Export Date */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="expected-export-date" className="text-xs font-bold text-foreground">Expected Export Date</label>
            <div className="relative">
              <input
                id="expected-export-date"
                type="date"
                value={expectedExportDate}
                onChange={(e) => setExpectedExportDate(e.target.value)}
                className={`w-full h-9 rounded-lg border bg-background px-3 pl-8 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                  errors.expectedExportDate ? "border-destructive focus:ring-destructive/20" : "border-border"
                }`}
              />
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
            </div>
            {errors.expectedExportDate && (
              <p className="text-[11px] text-destructive font-semibold">{errors.expectedExportDate[0]}</p>
            )}
          </div>
        </div>

      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => router.push("/export-tracking")}
        >
          Cancel
        </Button>
        
        <Button
          type="submit"
          className="font-bold gap-1.5 shadow-md bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={isSubmitting || !trackerId}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating Shipment...
            </>
          ) : (
            <>
              <PackageCheck className="h-4 w-4" />
              Register Shipment Export
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
