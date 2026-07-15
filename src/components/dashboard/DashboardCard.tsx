import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ArrowUpRight, ArrowDownRight } from "lucide-react"

interface DashboardCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  trend?: {
    value: number
    label: string
    isPositive: boolean
  }
}

export function DashboardCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
  ...props
}: DashboardCardProps) {
  return (
    <Card className={cn("overflow-hidden border-border/80 bg-linear-to-b from-card to-muted/20 hover:border-primary/30 transition-all duration-300", className)} {...props}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-sm font-medium text-muted-foreground tracking-tight">{title}</p>
          {icon && (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/5 text-primary/80 dark:bg-primary/10 dark:text-primary-foreground">
              {icon}
            </div>
          )}
        </div>
        <div className="flex items-baseline justify-between mt-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">{value}</h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          {trend && (
            <div
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold gap-0.5",
                trend.isPositive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              {trend.isPositive ? (
                <ArrowUpRight className="h-3 w-3 shrink-0" />
              ) : (
                <ArrowDownRight className="h-3 w-3 shrink-0" />
              )}
              <span>{trend.value}%</span>
              <span className="text-[10px] text-muted-foreground/80 font-normal ml-0.5">
                {trend.label}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
