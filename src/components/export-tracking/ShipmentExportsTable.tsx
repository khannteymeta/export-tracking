"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { 
  Plane, 
  Ship, 
  Truck, 
  Globe, 
  ArrowRight, 
  Search, 
  X, 
  Calendar,
  Layers
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ExportStatusBadge } from "./ExportStatusBadge";

interface Shipment {
  id: string;
  productCategory: string;
  productDescription: string;
  quantity: number | null;
  weightKg: string | null;
  shipmentReference: string | null;
  containerNumber: string | null;
  destinationCountry: string;
  shippingMethod: string;
  status: string;
  createdAt: Date | string;
  expectedExportDate: Date | string | null;
  customerId: string;
  // Included from join
  customerName?: string;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface ShipmentExportsTableProps {
  shipments: Shipment[];
  customers: CustomerOption[];
  countries: string[];
}

export function ShipmentExportsTable({ shipments, customers, countries }: ShipmentExportsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Retrieve current active filters from URL
  const activeStatus = searchParams.get("status") || "";
  const activeCustomer = searchParams.get("customerId") || "";
  const activeCountry = searchParams.get("destinationCountry") || "";
  const activeCategory = searchParams.get("productCategory") || "";

  // Update query params to re-fetch on server-side
  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1"); // Reset pagination
    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push("?");
  };

  const hasActiveFilters = activeStatus || activeCustomer || activeCountry || activeCategory;

  const getMethodIcon = (method: string) => {
    switch (method) {
      case "air_freight":
        return <Plane className="h-4 w-4 text-sky-500" />;
      case "sea_freight":
        return <Ship className="h-4 w-4 text-blue-500" />;
      case "land_border":
      case "courier":
        return <Truck className="h-4 w-4 text-emerald-500" />;
      default:
        return <Globe className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getMethodLabel = (method: string) => {
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
    <div className="space-y-6">
      {/* 1. Filter Panel */}
      <div className="rounded-xl border border-border/80 bg-linear-to-b from-card to-muted/20 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            Filter Shipments
          </h4>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="xs"
              onClick={clearFilters}
              className="text-muted-foreground hover:text-foreground hover:bg-muted text-xs cursor-pointer"
            >
              <X className="h-3 w-3 mr-1" />
              Reset Filters
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {/* Status Filter */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="status-filter" className="text-xs font-semibold text-muted-foreground">Status</label>
            <select
              id="status-filter"
              value={activeStatus}
              onChange={(e) => updateFilter("status", e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="pending_export">Pending Export</option>
              <option value="in_transit">In Transit</option>
              <option value="approaching_exit">Approaching Exit</option>
              <option value="exited_pending_confirmation">Exited (Pending confirmation)</option>
              <option value="export_confirmed">Export Confirmed</option>
              <option value="exception">Exception</option>
            </select>
          </div>

          {/* Customer Filter */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="customer-filter" className="text-xs font-semibold text-muted-foreground">Customer</label>
            <select
              id="customer-filter"
              value={activeCustomer}
              onChange={(e) => updateFilter("customerId", e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 cursor-pointer"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Country Filter */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="country-filter" className="text-xs font-semibold text-muted-foreground">Destination Country</label>
            <select
              id="country-filter"
              value={activeCountry}
              onChange={(e) => updateFilter("destinationCountry", e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 cursor-pointer"
            >
              <option value="">All Countries</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>

          {/* Product Category Filter */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category-filter" className="text-xs font-semibold text-muted-foreground">Category</label>
            <select
              id="category-filter"
              value={activeCategory}
              onChange={(e) => updateFilter("productCategory", e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 cursor-pointer"
            >
              <option value="">All Categories</option>
              <option value="electronics">Electronics</option>
              <option value="textiles">Textiles</option>
              <option value="machinery">Machinery</option>
              <option value="agriculture">Agriculture</option>
              <option value="general">General</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Table Component */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-bold text-foreground">Product / Reference</TableHead>
              <TableHead className="font-bold text-foreground">Customer</TableHead>
              <TableHead className="font-bold text-foreground">Destination</TableHead>
              <TableHead className="font-bold text-foreground">Shipping Method</TableHead>
              <TableHead className="font-bold text-foreground">Status</TableHead>
              <TableHead className="font-bold text-foreground">Created</TableHead>
              <TableHead className="font-bold text-foreground">Expected Export Date</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center text-muted-foreground text-sm font-medium">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Layers className="h-8 w-8 stroke-1 text-muted-foreground/60" />
                    <span>No matching shipment exports found.</span>
                    {hasActiveFilters && (
                      <Button variant="link" onClick={clearFilters} className="text-xs">
                        Clear filters to see all shipments
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              shipments.map((shipment) => (
                <TableRow
                  key={shipment.id}
                  onClick={() => router.push(`/export-tracking/${shipment.id}`)}
                  className="cursor-pointer hover:bg-muted/40 transition-colors group/row"
                >
                  {/* Product / Ref */}
                  <TableCell className="font-semibold text-foreground max-w-[200px]">
                    <div className="truncate" title={shipment.productDescription}>
                      {shipment.productDescription}
                    </div>
                    {shipment.shipmentReference && (
                      <span className="text-[11px] text-muted-foreground block font-mono font-medium">
                        Ref: {shipment.shipmentReference}
                      </span>
                    )}
                  </TableCell>

                  {/* Customer */}
                  <TableCell className="text-muted-foreground/90 font-medium">
                    {shipment.customerName || "—"}
                  </TableCell>

                  {/* Destination */}
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{shipment.destinationCountry}</span>
                    </div>
                  </TableCell>

                  {/* Shipping Method */}
                  <TableCell className="text-muted-foreground font-medium capitalize text-xs">
                    <div className="flex items-center gap-1.5">
                      {getMethodIcon(shipment.shippingMethod)}
                      <span>{getMethodLabel(shipment.shippingMethod)}</span>
                    </div>
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell>
                    <ExportStatusBadge status={shipment.status} />
                  </TableCell>

                  {/* Created Date */}
                  <TableCell className="text-muted-foreground/90 text-xs font-medium">
                    {formatDate(shipment.createdAt)}
                  </TableCell>

                  {/* Expected Export Date */}
                  <TableCell className="text-muted-foreground/90 text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{formatDate(shipment.expectedExportDate)}</span>
                    </div>
                  </TableCell>

                  {/* Chevron Right indicator */}
                  <TableCell className="pr-4">
                    <ArrowRight className="h-4 w-4 text-muted-foreground/0 group-hover/row:text-muted-foreground/80 group-hover/row:translate-x-0.5 transition-all duration-200" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
