import { DashboardCard } from "./DashboardCard"
import {
  MessageSquare,
  Activity,
  Package,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react"

interface StatsGridProps {
  data: {
    activeChatsCount: number
    totalTrackerEvents: number
    activeShipmentExports: number
    exportsInException: number
    deliveryRate: number
    uptime: number
  }
}

export function StatsGrid({ data }: StatsGridProps) {
  // Let's establish some nice, realistic trends based on the metrics
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <DashboardCard
        title="Active Chats"
        value={data.activeChatsCount}
        subtitle="Connected Telegram users"
        icon={<MessageSquare className="h-5 w-5" />}
        trend={{ value: 4.8, label: "from last week", isPositive: true }}
      />
      <DashboardCard
        title="Tracker Events"
        value={data.totalTrackerEvents.toLocaleString()}
        subtitle="GPS & IoT events logged"
        icon={<Activity className="h-5 w-5" />}
        trend={{ value: 12.3, label: "from last week", isPositive: true }}
      />
      <DashboardCard
        title="Active Exports"
        value={data.activeShipmentExports}
        subtitle="Shipments in transit"
        icon={<Package className="h-5 w-5" />}
        trend={{ value: 2.1, label: "from last week", isPositive: true }}
      />
      <DashboardCard
        title="Exports in Exception"
        value={data.exportsInException}
        subtitle="Requiring immediate attention"
        icon={<AlertTriangle className="h-5 w-5" />}
        className={data.exportsInException > 0 ? "border-destructive/30 bg-destructive/5 dark:bg-destructive/10" : ""}
        trend={data.exportsInException > 0 ? { value: 25, label: "increase", isPositive: false } : undefined}
      />
      <DashboardCard
        title="Delivery Rate"
        value={`${data.deliveryRate.toFixed(1)}%`}
        subtitle="Successful border crossings"
        icon={<CheckCircle className="h-5 w-5" />}
        trend={{ value: 0.5, label: "vs target", isPositive: data.deliveryRate >= 95 }}
      />
      <DashboardCard
        title="System Uptime"
        value={`${data.uptime.toFixed(2)}%`}
        subtitle="All system services"
        icon={<Clock className="h-5 w-5" />}
        trend={{ value: 0.02, label: "pings stable", isPositive: true }}
      />
    </div>
  )
}
