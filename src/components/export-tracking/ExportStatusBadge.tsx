import { Badge } from "@/components/ui/badge";

export type ShipmentExportStatus =
  | "pending_export"
  | "in_transit"
  | "approaching_exit"
  | "exited_pending_confirmation"
  | "export_confirmed"
  | "exception";

interface ExportStatusBadgeProps {
  status: string;
  className?: string;
}

export function ExportStatusBadge({ status, className }: ExportStatusBadgeProps) {
  const getBadgeConfig = (statusKey: string) => {
    switch (statusKey) {
      case "pending_export":
        return {
          label: "Pending Export",
          variant: "outline" as const,
          customClass: "bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/30",
        };
      case "in_transit":
        return {
          label: "In Transit",
          variant: "info" as const,
          customClass: "",
        };
      case "approaching_exit":
        return {
          label: "Approaching Exit",
          variant: "warning" as const,
          customClass: "",
        };
      case "exited_pending_confirmation":
        return {
          label: "Exited - Pending Conf",
          variant: "warning" as const,
          customClass: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30",
        };
      case "export_confirmed":
        return {
          label: "Export Confirmed",
          variant: "success" as const,
          customClass: "",
        };
      case "exception":
        return {
          label: "Exception",
          variant: "destructive" as const,
          customClass: "",
        };
      default:
        return {
          label: statusKey.replace(/_/g, " "),
          variant: "default" as const,
          customClass: "",
        };
    }
  };

  const { label, variant, customClass } = getBadgeConfig(status);

  return (
    <Badge 
      variant={variant} 
      className={`font-semibold capitalize tracking-wide px-2.5 py-0.5 rounded-full text-xs shadow-2xs ${customClass} ${className || ""}`}
    >
      {label}
    </Badge>
  );
}
