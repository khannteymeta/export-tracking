import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Layers } from "lucide-react";
import { db } from "@/lib/db";
import { trackers, customers, shipmentExports } from "@/db/schema";
import { eq, ne, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { CreateShipmentForm } from "@/components/export-tracking/CreateShipmentForm";

export default async function NewShipmentExportPage() {
  const reqHeaders = await headers();
  
  // 1. Fetch user session context
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });
  if (!session?.user) {
    redirect("/login");
  }

  const currentUser = session.user as any;

  // 2. Authorize only Manager+ roles to create shipment exports
  if (currentUser.role !== "admin" && currentUser.role !== "manager") {
    redirect("/export-tracking");
  }

  // 3. Query all tracker devices that do NOT have active shipments
  const activeShipmentExports = await db
    .select({ trackerId: shipmentExports.trackerId })
    .from(shipmentExports)
    .where(
      and(
        ne(shipmentExports.status, "export_confirmed"),
        ne(shipmentExports.status, "exception")
      )
    );

  const activeTrackerIds = activeShipmentExports.map((item) => item.trackerId);

  // Fetch trackers and join customer names
  const allTrackers = await db
    .select({
      id: trackers.id,
      label: trackers.label,
      externalTrackerId: trackers.externalTrackerId,
      customerId: trackers.customerId,
      customerName: customers.name,
    })
    .from(trackers)
    .innerJoin(customers, eq(trackers.customerId, customers.id));

  // Filter trackers that are not busy with active exports
  const availableTrackers = allTrackers.filter(
    (tracker) => !activeTrackerIds.includes(tracker.id)
  );

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 max-w-4xl mx-auto w-full">
      {/* Back Link */}
      <div>
        <Link 
          href="/export-tracking" 
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to Shipment Control
        </Link>
      </div>

      {/* Page Header */}
      <div className="border-b border-border/40 pb-5 space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl flex items-center gap-2">
          <Layers className="h-7 w-7 text-primary" />
          Register New Shipment Export
        </h1>
        <p className="text-sm text-muted-foreground font-medium">
          Assign an active IoT tracker, specify cargo information, and designate the destination customs boundary.
        </p>
      </div>

      {/* Creation Form */}
      <CreateShipmentForm availableTrackers={availableTrackers} />
    </div>
  );
}
