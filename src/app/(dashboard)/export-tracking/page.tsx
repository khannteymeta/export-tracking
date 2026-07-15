import { headers } from "next/headers";
import Link from "next/link";
import { PlusCircle, Layers } from "lucide-react";
import { db } from "@/lib/db";
import { customers, shipmentExports } from "@/db/schema";
import { auth } from "@/lib/auth";
import { ExportTrackingService } from "@/server/services/exportTrackingService";
import { ShipmentExportsTable } from "@/components/export-tracking/ShipmentExportsTable";
import { Button } from "@/components/ui/button";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    customerId?: string;
    destinationCountry?: string;
    productCategory?: string;
  }>;
}

export default async function ExportTrackingPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const reqHeaders = await headers();
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });

  const currentUser = session?.user as any;

  // 1. Fetch filtered shipments via Service Layer (enforces viewer permissions)
  const shipments = await ExportTrackingService.listShipmentExports(
    {
      status: resolvedSearchParams.status || undefined,
      customerId: resolvedSearchParams.customerId || undefined,
      destinationCountry: resolvedSearchParams.destinationCountry || undefined,
      productCategory: resolvedSearchParams.productCategory || undefined,
    },
    { page: 1, limit: 100 },
    currentUser
  );

  // 2. Fetch customers for filter selector
  const customersList = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.isActive, true))
    .catch(() => 
      // fallback in case of strict query issues
      db.select({ id: customers.id, name: customers.name }).from(customers)
    );

  const customerMap = new Map(customersList.map((c) => [c.id, c.name]));

  // 3. Fetch unique countries with active shipments to fill country filter options
  const countriesResult = await db
    .selectDistinct({ destinationCountry: shipmentExports.destinationCountry })
    .from(shipmentExports);
  const countriesList = countriesResult
    .map((r) => r.destinationCountry)
    .filter(Boolean)
    .sort();

  // 4. Augment shipments with customer names for display
  const formattedShipments = shipments.map((s) => ({
    ...s,
    customerName: customerMap.get(s.customerId) || "Unknown Customer",
  }));

  // Helper check for role-based permissions to create new shipments (Manager+)
  const canCreate = currentUser?.role === "admin" || currentUser?.role === "manager";

  return (
    <div className="flex-1 space-y-8 p-8 pt-6 max-w-(screen-2xl) mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-5">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent flex items-center gap-2">
            <Layers className="h-8 w-8 text-primary" />
            Shipment Export Control
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            Monitor active GPS trackers, manage customs exit-zone geofences, and audit border exit confirmations.
          </p>
        </div>

        {canCreate && (
          <Link href="/export-tracking/new" passHref>
            <Button className="font-semibold shadow-md gap-1.5 self-start sm:self-auto">
              <PlusCircle className="h-4 w-4" />
              New Shipment Export
            </Button>
          </Link>
        )}
      </div>

      {/* Shipment Control Table & Filter Interface */}
      <ShipmentExportsTable 
        shipments={formattedShipments} 
        customers={customersList}
        countries={countriesList}
      />
    </div>
  );
}

// Inline Drizzle helper to avoid import scoping issues
import { eq } from "drizzle-orm";
