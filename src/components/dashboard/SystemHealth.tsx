import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Server, Database, MessageSquare, AlertCircle, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface SystemHealthProps {
  health: {
    redis: "ok" | "error"
    db: "ok" | "error"
    telegram: "ok" | "error"
  }
}

export function SystemHealth({ health }: SystemHealthProps) {
  const getStatusConfig = (status: "ok" | "error") => {
    if (status === "ok") {
      return {
        label: "Operational",
        badgeVariant: "success" as const,
        dotColor: "bg-emerald-500",
        ringColor: "ring-emerald-500/30",
        textColor: "text-emerald-600 dark:text-emerald-400",
      }
    }
    return {
      label: "Offline",
      badgeVariant: "destructive" as const,
      dotColor: "bg-destructive",
      ringColor: "ring-destructive/30",
      textColor: "text-destructive",
    }
  }

  const services = [
    {
      name: "Database Cluster",
      description: "Drizzle ORM & Database Storage",
      status: health.db,
      icon: <Database className="h-5 w-5 text-indigo-500" />,
    },
    {
      name: "Redis cache & queue",
      description: "BullMQ connection & caching server",
      status: health.redis,
      icon: <Server className="h-5 w-5 text-blue-500" />,
    },
    {
      name: "Telegram bot connection",
      description: "Grammy Bot API message dispatch",
      status: health.telegram,
      icon: <MessageSquare className="h-5 w-5 text-sky-500" />,
    },
  ]

  const totalServices = services.length
  const operationalServices = services.filter((s) => s.status === "ok").length
  const isHealthy = operationalServices === totalServices
  const isDegraded = operationalServices > 0 && operationalServices < totalServices

  return (
    <Card className="border-border/80 bg-linear-to-b from-card to-muted/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold tracking-tight">System Infrastructure</CardTitle>
          {isHealthy ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle className="h-3 w-3 shrink-0" />
              All Systems Online
            </Badge>
          ) : isDegraded ? (
            <Badge variant="warning" className="gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Degraded Performance
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Outage Detected
            </Badge>
          )}
        </div>
        <CardDescription>
          Live diagnostics and service connection checks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {services.map((service, index) => {
            const config = getStatusConfig(service.status)
            return (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-background/80 transition-colors"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                    {service.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {service.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {service.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <Badge variant={config.badgeVariant} className="text-[10px] uppercase font-bold tracking-wide">
                    {config.label}
                  </Badge>
                  <div className="relative flex h-3.5 w-3.5 items-center justify-center">
                    <span
                      className={cn(
                        "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                        config.dotColor
                      )}
                    />
                    <span
                      className={cn(
                        "relative inline-flex h-2 w-2 rounded-full",
                        config.dotColor
                      )}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
