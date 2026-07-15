import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { auth } from "@/lib/auth";
import { SettingsService } from "@/server/services/settingsService";
import { SettingsForm } from "@/components/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const reqHeaders = await headers();

  // 1. Authenticate user session
  const session = await auth.api.getSession({
    headers: reqHeaders,
  });
  if (!session?.user) {
    redirect("/login");
  }

  const currentUser = session.user as any;

  // 2. Restrict page access to Administrator role only
  if (currentUser.role !== "admin") {
    redirect("/dashboard");
  }

  // 3. Fetch all system configuration settings
  const settings = await SettingsService.getAllSettings();

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 max-w-5xl mx-auto w-full">
      {/* Page Header */}
      <div className="border-b border-border/40 pb-5 space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl flex items-center gap-2">
          <Settings className="h-7 w-7 text-indigo-500 animate-[spin_8s_linear_infinite]" />
          System Settings & Configurations
        </h1>
        <p className="text-sm text-muted-foreground font-medium">
          Manage system configurations, Telegram notification integrations, rate limits, and custom export tracking debouncers.
        </p>
      </div>

      {/* Settings Form Wrapper */}
      <SettingsForm initialSettings={settings} />
    </div>
  );
}
