import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Bell, MapPin } from "lucide-react"

interface Alert {
  id: string
  shipmentExportId: string
  eventType: "entered_buffer" | "crossed_boundary" | "re_entered" | "confirmed_exit"
  occurredAt: Date | string
  notes: string | null
  shipmentReference: string | null
  productDescription: string
  geofenceName: string | null
  customerName: string | null
}

interface RecentAlertsProps {
  alerts: Alert[]
}

// Relative time formatting helper
function getRelativeTime(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput
  const now = new Date()
  const diffInMs = now.getTime() - date.getTime()
  const diffInMins = Math.floor(diffInMs / 60000)
  const diffInHours = Math.floor(diffInMins / 60)
  const diffInDays = Math.floor(diffInHours / 24)

  if (diffInMins < 1) return "Just now"
  if (diffInMins < 60) return `${diffInMins}m ago`
  if (diffInHours < 24) return `${diffInHours}h ago`
  if (diffInDays === 1) return "Yesterday"
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function RecentAlerts({ alerts }: RecentAlertsProps) {
  const getEventBadge = (type: string) => {
    switch (type) {
      case "entered_buffer":
        return <Badge variant="warning">Buffer Entered</Badge>
      case "crossed_boundary":
        return <Badge variant="destructive">Boundary Crossed</Badge>
      case "re_entered":
        return <Badge variant="destructive">Re-entered</Badge>
      case "confirmed_exit":
        return <Badge variant="success">Confirmed Exit</Badge>
      default:
        return <Badge variant="outline">{type}</Badge>
    }
  }

  const getStatusBadge = (type: string) => {
    switch (type) {
      case "confirmed_exit":
        return <Badge variant="success">Cleared</Badge>
      case "crossed_boundary":
      case "re_entered":
        return <Badge variant="destructive">Alerting</Badge>
      case "entered_buffer":
        return <Badge variant="info">In Transit</Badge>
      default:
        return <Badge variant="outline">Logged</Badge>
    }
  }

  return (
    <Card className="col-span-1 border-border/80 bg-linear-to-b from-card to-muted/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-xl flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500 animate-pulse" />
            Recent Border Alerts
          </CardTitle>
          <CardDescription>
            Last 10 export border geofence events
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <MapPin className="h-8 w-8 stroke-1 mb-2 opacity-50" />
              <p className="text-sm">No border events recorded yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Shipment</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Event Type</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id} className="group">
                    <TableCell className="font-medium max-w-[200px] truncate">
                      <div className="flex flex-col">
                        <span className="text-foreground font-medium truncate">
                          {alert.productDescription || "Unnamed Product"}
                        </span>
                        {alert.shipmentReference && (
                          <span className="text-xs text-muted-foreground font-mono">
                            Ref: {alert.shipmentReference}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm font-medium">
                      {alert.customerName || "System Guest"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {getEventBadge(alert.eventType)}
                        {alert.geofenceName && (
                          <span className="text-[11px] text-muted-foreground/80 font-mono hidden md:inline">
                            @{alert.geofenceName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(alert.eventType)}</TableCell>
                    <TableCell className="text-right text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {getRelativeTime(alert.occurredAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
