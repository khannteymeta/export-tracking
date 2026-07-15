"use client"

import * as React from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface EventsChartProps {
  chartData: Array<{
    timestamp: string | null
    count: number
  }>
}

export function EventsChart({ chartData }: EventsChartProps) {
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  // Format date helper: "YYYY-MM-DD" to "MMM DD" (e.g. "Jul 15")
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A"
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    } catch {
      return dateStr
    }
  }

  // Handle case where chartData is empty
  const formattedData = chartData.map((d) => ({
    ...d,
    formattedDate: formatDate(d.timestamp),
  }))

  if (!isMounted) {
    return (
      <Card className="col-span-full border-border/80 bg-linear-to-b from-card to-muted/20">
        <CardHeader>
          <CardTitle>Tracker Events History</CardTitle>
          <CardDescription>Tracker events over the past 7 days</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading chart visualization...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="col-span-full border-border/80 bg-linear-to-b from-card to-muted/20">
      <CardHeader>
        <CardTitle>Tracker Events History</CardTitle>
        <CardDescription>Activity logs and geofence pings for the last 7 days</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={formattedData}
              margin={{
                top: 15,
                right: 15,
                left: -10,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary, #000000)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-primary, #000000)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis
                dataKey="formattedDate"
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                dx={-10}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-lg border border-border bg-popover p-3 shadow-md">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-muted-foreground">
                              Date
                            </span>
                            <span className="font-semibold text-popover-foreground">
                              {payload[0].payload.formattedDate}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-muted-foreground">
                              Events
                            </span>
                            <span className="font-bold text-primary">
                              {payload[0].value}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--color-primary, #000000)"
                strokeWidth={3}
                activeDot={{
                  r: 6,
                  style: { fill: "var(--color-primary)", opacity: 0.8 },
                }}
                dot={{
                  r: 4,
                  strokeWidth: 2,
                  style: { fill: "var(--background)" },
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
