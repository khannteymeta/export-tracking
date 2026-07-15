import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ShieldAlert, ArrowRight, Plane, Ship, Truck, Globe, Clock } from "lucide-react"

interface Shipment {
  id: string
  productDescription: string
  destinationCountry: string
  status: "pending_export" | "in_transit" | "approaching_exit" | "exited_pending_confirmation" | "export_confirmed" | "exception"
  updatedAt: Date | string
  shippingMethod?: "sea_freight" | "air_freight" | "land_border" | "courier"
}

interface ShipmentExportsWidgetProps {
  shipments: Shipment[]
}

function formatTimeInStatus(updatedAtInput: Date | string): string {
  const updatedAt = typeof updatedAtInput === "string" ? new Date(updatedAtInput) : updatedAtInput
  const now = new Date()
  const diffInMs = now.getTime() - updatedAt.getTime()
  
  if (diffInMs < 0) return "0m"
  
  const diffInMins = Math.floor(diffInMs / 60000)
  const diffInHours = Math.floor(diffInMins / 60)
  const diffInDays = Math.floor(diffInHours / 24)

  if (diffInMins < 60) return `${diffInMins}m`
  if (diffInHours < 24) return `${diffInHours}h`
  return `${diffInDays}d ${diffInHours % 24}h`
}

export function ShipmentExportsWidget({ shipments }: ShipmentExportsWidgetProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending_export":
        return <Badge variant="outline">Pending Export</Badge>
      case "in_transit":
        return <Badge variant="info">In Transit</Badge>
      case "approaching_exit":
        return <Badge variant="warning">Approaching Exit</Badge>
      case "exited_pending_confirmation":
        return <Badge variant="warning">Exited - Pending Conf</Badge>
      case "exception":
        return <Badge variant="destructive">Exception</Badge>
      case "export_confirmed":
        return <Badge variant="success">Confirmed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getMethodIcon = (method?: string) => {
    switch (method) {
      case "air_freight":
        return <Plane className="h-4 w-4 text-sky-500" />
      case "sea_freight":
        return <Ship className="h-4 w-4 text-blue-500" />
      case "land_border":
      case "courier":
        return <Truck className="h-4 w-4 text-emerald-500" />
      default:
        return <Globe className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <Card className="col-span-1 border-border/80 bg-linear-to-b from-card to-muted/20 flex flex-col justify-between">
      <div>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-indigo-500" />
              Exports Needing Attention
            </CardTitle>
            <CardDescription>
              Active and exception shipments currently monitored
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/60">
            {shipments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No active shipments needing attention.
              </div>
            ) : (
              shipments.map((shipment) => (
                <div
                  key={shipment.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start space-x-3 min-w-0 max-w-[65%]">
                    <div className="mt-1 flex-shrink-0">
                      {getMethodIcon(shipment.shippingMethod)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {shipment.productDescription}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                        <Globe className="h-3 w-3 shrink-0" />
                        <span>Destination: {shipment.destinationCountry}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end space-y-1.5 shrink-0">
                    {getStatusBadge(shipment.status)}
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>{formatTimeInStatus(shipment.updatedAt)} in status</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </div>

      <CardFooter className="border-t border-border/40 p-4">
        <Link href="/export-tracking" className="w-full" passHref>
          <Button variant="outline" className="w-full justify-between hover:border-primary/50 group/btn">
            View All Shipments
            <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
}
