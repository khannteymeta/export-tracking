import { 
  MapPin, 
  ShieldAlert, 
  RefreshCw, 
  ShieldCheck, 
  Cpu, 
  User, 
  Clock, 
  Globe 
} from "lucide-react";

interface BorderEvent {
  id: string;
  shipmentExportId: string;
  geofenceId: string;
  eventType: "entered_buffer" | "crossed_boundary" | "re_entered" | "confirmed_exit";
  lat: number;
  lng: number;
  occurredAt: Date | string;
  source: "gps" | "manual_admin";
  confirmedBy?: string | null;
  notes?: string | null;
  // Join extensions
  geofenceName?: string;
}

interface ExportTimelineProps {
  events: BorderEvent[];
}

export function ExportTimeline({ events }: ExportTimelineProps) {
  const getEventConfig = (type: string) => {
    switch (type) {
      case "entered_buffer":
        return {
          icon: MapPin,
          colorClass: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
          title: "Entered Buffer Zone",
          desc: "Shipment entered the exit-zone buffer or border buffer.",
        };
      case "crossed_boundary":
        return {
          icon: ShieldAlert,
          colorClass: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
          title: "Crossed Country Boundary",
          desc: "Shipment exited the origin country border polygon.",
        };
      case "re_entered":
        return {
          icon: RefreshCw,
          colorClass: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
          title: "Re-entered Country Border",
          desc: "Tracker re-entered the country boundary after a prior exit.",
        };
      case "confirmed_exit":
        return {
          icon: ShieldCheck,
          colorClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
          title: "Confirmed Export Exit",
          desc: "Official exit confirmation established.",
        };
      default:
        return {
          icon: Globe,
          colorClass: "bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400",
          title: "Unknown Border Event",
          desc: "An unclassified tracking event was recorded.",
        };
    }
  };

  const formatDate = (dateInput: Date | string) => {
    const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="rounded-xl border border-border/80 bg-linear-to-b from-card to-muted/20 p-6 flex flex-col h-full">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Border Event Timeline
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Chronological record of geofence crossing triggers and manual overrides
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 max-h-[500px]">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Globe className="h-10 w-10 stroke-1 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">No border events recorded yet.</p>
            <p className="text-xs text-muted-foreground/75 mt-1 max-w-[200px]">
              Events will trigger automatically when the tracker enters exit geofences or crosses boundaries.
            </p>
          </div>
        ) : (
          <div className="relative border-l border-border/60 ml-4 pl-6 space-y-8 pb-4">
            {events.map((event) => {
              const { icon: Icon, colorClass, title, desc } = getEventConfig(event.eventType);
              const isGps = event.source === "gps";

              return (
                <div key={event.id} className="relative group">
                  {/* Timeline node icon */}
                  <span className={`absolute -left-[37px] top-0 flex h-6 w-6 items-center justify-center rounded-full border shadow-2xs ${colorClass}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>

                  <div className="flex flex-col space-y-1.5">
                    {/* Header: Title + Source Badge */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <h4 className="text-sm font-bold text-foreground leading-none">
                        {title}
                      </h4>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${
                        isGps 
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" 
                          : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                      }`}>
                        {isGps ? (
                          <>
                            <Cpu className="h-2.5 w-2.5" />
                            GPS
                          </>
                        ) : (
                          <>
                            <User className="h-2.5 w-2.5" />
                            Manual Admin
                          </>
                        )}
                      </span>
                    </div>

                    {/* Timestamp */}
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {formatDate(event.occurredAt)}
                    </p>

                    {/* Event Description */}
                    <p className="text-xs text-muted-foreground/90 leading-normal">
                      {event.notes || desc} {event.geofenceName && `(Geofence: ${event.geofenceName})`}
                    </p>

                    {/* GPS Coordinates or Confirmed By Metadata */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground/80 font-mono">
                      <span>Lat: {event.lat.toFixed(5)}</span>
                      <span>Lng: {event.lng.toFixed(5)}</span>
                      {!isGps && event.confirmedBy && (
                        <span className="text-purple-600 dark:text-purple-400">
                          Actor ID: {event.confirmedBy}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
