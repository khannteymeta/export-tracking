import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  Globe, 
  Calendar, 
  Cpu, 
  Weight, 
  Package, 
  Tag
} from "lucide-react";
import { db } from "@/lib/db";
import { trackerEvents, customers, trackers } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { ExportTrackingService } from "@/server/services/exportTrackingService";
import { ExportGeofenceService } from "@/server/services/exportGeofenceService";
import { ExportStatusBadge } from "@/components/export-tracking/ExportStatusBadge";
import { ExportMap } from "@/components/export-tracking/ExportMap";
import { ExportTimeline } from "@/components/export-tracking/ExportTimeline";
import { ConfirmExportDialog } from "@/components/export-tracking/ConfirmExportDialog";
import { FlagExceptionDialog } from "@/components/export-tracking/FlagExceptionDialog";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ShipmentExportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const reqHeaders = await headers();
  
  // 1. Fetch current authenticated session
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });
  if (!session?.user) {
    redirect("/login");
  }
  const currentUser = session.user as any;

  // 2. Fetch shipment details
  let shipment;
  try {
    shipment = await ExportTrackingService.getShipmentExport(id);
  } catch {
    notFound();
  }

  // 3. Enforce Viewer user role permission checks
  // Viewers can only inspect shipments belonging to assigned customers or created by themselves
  if (currentUser.role !== "admin" && currentUser.role !== "manager") {
    let isAssigned = false;
    if (currentUser.permissions) {
      try {
        const perms = typeof currentUser.permissions === "string"
          ? JSON.parse(currentUser.permissions)
          : currentUser.permissions;
        if (Array.isArray(perms) && perms.includes(shipment.customerId)) {
          isAssigned = true;
        }
      } catch {
        if (typeof currentUser.permissions === "string") {
          isAssigned = currentUser.permissions.split(",").map((p: string) => p.trim()).includes(shipment.customerId);
        }
      }
    }

    const isCreator = shipment.createdBy === currentUser.id;
    if (!isAssigned && !isCreator) {
      redirect("/export-tracking");
    }
  }

  // 4. Run database requests in parallel for optimized loading speeds
  const [
    customerData,
    trackerData,
    latestPositionEvent,
    trailEvents,
    geofences,
    borderTimelineEvents,
  ] = await Promise.all([
    // Fetch customer details
    db.select({ name: customers.name }).from(customers).where(eq(customers.id, shipment.customerId)).limit(1).then((res) => res[0]),
    // Fetch tracker label
    db.select({ label: trackers.label, externalTrackerId: trackers.externalTrackerId }).from(trackers).where(eq(trackers.id, shipment.trackerId)).limit(1).then((res) => res[0]),
    // Fetch current position (latest recorded coordinate event)
    db.select().from(trackerEvents).where(eq(trackerEvents.trackerId, shipment.trackerId)).orderBy(desc(trackerEvents.recordedAt)).limit(1).then((res) => res[0]),
    // Fetch past positions (trail coordinates)
    db.select().from(trackerEvents).where(eq(trackerEvents.trackerId, shipment.trackerId)).orderBy(desc(trackerEvents.recordedAt)).limit(20),
    // Fetch geofences for destination country
    ExportGeofenceService.list({ countryCode: shipment.destinationCountry, isActive: true }),
    // Fetch chronological border timeline events
    ExportTrackingService.getTimeline(shipment.id),
  ]);

  // Construct map currentPosition fallback to originBaseline coordinates if no pings received
  const currentPosition = latestPositionEvent
    ? { lat: latestPositionEvent.lat, lng: latestPositionEvent.lng }
    : { lat: shipment.originLat, lng: shipment.originLng };

  const trail = trailEvents.map((event) => ({
    lat: event.lat,
    lng: event.lng,
    recordedAt: event.recordedAt,
  }));

  const canConfirm = currentUser.role === "admin" && shipment.status !== "export_confirmed";
  const canFlagException = (currentUser.role === "admin" || currentUser.role === "manager") && shipment.status !== "export_confirmed";

  const getShippingMethodLabel = (method: string) => {
    return method.replace(/_/g, " ");
  };

  const formatDate = (dateInput: Date | string | null) => {
    if (!dateInput) return "—";
    const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 max-w-(screen-2xl) mx-auto w-full">
      {/* 1. Detail Page Back Nav */}
      <div>
        <Link 
          href="/export-tracking" 
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to Shipment Control
        </Link>
      </div>

      {/* 2. Control Status Action Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border/40 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              {shipment.productDescription}
            </h1>
            <ExportStatusBadge status={shipment.status} />
          </div>
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <Tag className="h-3 w-3" />
            Shipment ID: <span className="font-mono text-[11px]">{shipment.id}</span>
          </p>
        </div>

        {/* Action Controls (Confirm / Exception modals) */}
        {shipment.status !== "export_confirmed" && (canConfirm || canFlagException) && (
          <div className="flex items-center gap-3 self-start lg:self-auto">
            {canFlagException && (
              <FlagExceptionDialog shipmentId={shipment.id} />
            )}
            {canConfirm && (
              <ConfirmExportDialog shipmentId={shipment.id} />
            )}
          </div>
        )}
      </div>

      {/* 3. Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Columns: Map & Info Card */}
        <div className="lg:col-span-2 space-y-6">
          {/* Map display */}
          <ExportMap 
            currentPosition={currentPosition} 
            trail={trail} 
            geofences={geofences} 
          />

          {/* Shipment Logistics Specifications Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
            <h3 className="text-md font-bold text-foreground mb-4 flex items-center gap-1.5 border-b border-border/40 pb-2">
              <Package className="h-4 w-4 text-indigo-500" />
              Logistics Specifications
            </h3>

            <div className="grid gap-x-6 gap-y-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              {/* Product Reference */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Reference Number</span>
                <span className="text-sm font-semibold text-foreground font-mono">{shipment.shipmentReference || "—"}</span>
              </div>

              {/* Customer */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Customer</span>
                <span className="text-sm font-semibold text-foreground">{customerData?.name || "—"}</span>
              </div>

              {/* Destination */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Destination Country</span>
                <span className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  {shipment.destinationCountry}
                </span>
              </div>

              {/* Shipping Method */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Shipping Method</span>
                <span className="text-sm font-semibold text-foreground capitalize">{getShippingMethodLabel(shipment.shippingMethod)}</span>
              </div>

              {/* Tracker Device */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">IoT Tracker</span>
                <div className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{trackerData?.label || "—"}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">({trackerData?.externalTrackerId})</span>
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Cargo Quantity</span>
                <span className="text-sm font-semibold text-foreground">{shipment.quantity ? `${shipment.quantity} units` : "—"}</span>
              </div>

              {/* Cargo Weight */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Cargo Weight</span>
                <span className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <Weight className="h-3.5 w-3.5 text-muted-foreground" />
                  {shipment.weightKg ? `${parseFloat(shipment.weightKg).toLocaleString()} kg` : "—"}
                </span>
              </div>

              {/* Container Number */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Container Number</span>
                <span className="text-sm font-semibold text-foreground font-mono">{shipment.containerNumber || "—"}</span>
              </div>

              {/* Expected Date */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Expected Date</span>
                <span className="text-sm font-semibold text-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDate(shipment.expectedExportDate)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Column */}
        <div className="lg:col-span-1">
          <ExportTimeline events={borderTimelineEvents} />
        </div>

      </div>
    </div>
  );
}
