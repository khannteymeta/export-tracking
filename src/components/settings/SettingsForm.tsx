"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { 
  Loader2, 
  Send, 
  RefreshCw, 
  ShieldCheck,
  AlertCircle,
  Sliders,
  Bell,
  Gauge
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SettingsFormProps {
  initialSettings: Record<string, string>;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const router = useRouter();

  // Settings states
  const [botToken, setBotToken] = React.useState(initialSettings.DEFAULT_BOT_TOKEN || "");
  const [webhookUrl, setWebhookUrl] = React.useState(initialSettings.BOT_WEBHOOK_URL || "");
  const [maxRetries, setMaxRetries] = React.useState(initialSettings.MAX_RETRIES || "3");
  const [initialDelay, setInitialDelay] = React.useState(initialSettings.INITIAL_DELAY_MS || "1000");
  const [maxDelay, setMaxDelay] = React.useState(initialSettings.MAX_DELAY_MS || "60000");
  const [backoffMultiplier, setBackoffMultiplier] = React.useState(initialSettings.BACKOFF_MULTIPLIER || "2.0");
  const [webhookLimit, setWebhookLimit] = React.useState(initialSettings.WEBHOOK_EVENTS_PER_MIN || "1000");
  const [apiLimit, setApiLimit] = React.useState(initialSettings.API_CALLS_PER_MIN || "10000");
  const [messageLimit, setMessageLimit] = React.useState(initialSettings.MESSAGES_PER_MIN || "1000");
  const [debouncePings, setDebouncePings] = React.useState(initialSettings.EXPORT_EXIT_DEBOUNCE_PINGS || "3");
  const [signalLossHours, setSignalLossHours] = React.useState(initialSettings.EXPORT_SIGNAL_LOSS_HOURS || "6");
  const [opsChatIds, setOpsChatIds] = React.useState(initialSettings.EXPORT_OPS_CHAT_IDS || "");

  // Interactive statuses
  const [isSaving, setIsSaving] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);
  const [isTestingToken, setIsTestingToken] = React.useState(false);
  
  // Feedback alerts
  const [saveStatus, setSaveStatus] = React.useState<{ success: boolean; message: string } | null>(null);
  const [tokenTestResult, setTokenTestResult] = React.useState<{ success: boolean; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Reset states on external changes (e.g. page refreshes)
  React.useEffect(() => {
    setBotToken(initialSettings.DEFAULT_BOT_TOKEN || "");
    setWebhookUrl(initialSettings.BOT_WEBHOOK_URL || "");
    setMaxRetries(initialSettings.MAX_RETRIES || "3");
    setInitialDelay(initialSettings.INITIAL_DELAY_MS || "1000");
    setMaxDelay(initialSettings.MAX_DELAY_MS || "60000");
    setBackoffMultiplier(initialSettings.BACKOFF_MULTIPLIER || "2.0");
    setWebhookLimit(initialSettings.WEBHOOK_EVENTS_PER_MIN || "1000");
    setApiLimit(initialSettings.API_CALLS_PER_MIN || "10000");
    setMessageLimit(initialSettings.MESSAGES_PER_MIN || "1000");
    setDebouncePings(initialSettings.EXPORT_EXIT_DEBOUNCE_PINGS || "3");
    setSignalLossHours(initialSettings.EXPORT_SIGNAL_LOSS_HOURS || "6");
    setOpsChatIds(initialSettings.EXPORT_OPS_CHAT_IDS || "");
  }, [initialSettings]);

  // Test current bot token validity
  const testBotToken = async () => {
    if (botToken === "*****") {
      setTokenTestResult({
        success: false,
        message: "Cannot test masked token. Please paste a new token to test.",
      });
      return;
    }

    if (!botToken.trim()) {
      setTokenTestResult({
        success: false,
        message: "Please enter a bot token before testing.",
      });
      return;
    }

    setIsTestingToken(true);
    setTokenTestResult(null);

    try {
      const response = await fetch("/api/settings/bot-token/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: botToken.trim() }),
      });

      const result = await response.json();
      if (response.ok && result.success && result.data?.valid) {
        setTokenTestResult({
          success: true,
          message: "🟢 Token is VALID! Connection to Telegram API established successfully.",
        });
      } else {
        setTokenTestResult({
          success: false,
          message: "🔴 Token is INVALID. Please verify token string and permissions.",
        });
      }
    } catch {
      setTokenTestResult({
        success: false,
        message: "🔴 Connection error. Failed to test token.",
      });
    } finally {
      setIsTestingToken(false);
    }
  };

  // Submit all settings updates
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus(null);
    setFieldErrors({});

    // Compare with initial values to determine what changed
    const pendingUpdates: Record<string, string> = {};

    if (botToken !== initialSettings.DEFAULT_BOT_TOKEN && botToken !== "*****") {
      pendingUpdates.DEFAULT_BOT_TOKEN = botToken;
    }
    if (webhookUrl !== (initialSettings.BOT_WEBHOOK_URL || "")) {
      pendingUpdates.BOT_WEBHOOK_URL = webhookUrl;
    }
    if (maxRetries !== initialSettings.MAX_RETRIES) {
      pendingUpdates.MAX_RETRIES = maxRetries;
    }
    if (initialDelay !== initialSettings.INITIAL_DELAY_MS) {
      pendingUpdates.INITIAL_DELAY_MS = initialDelay;
    }
    if (maxDelay !== initialSettings.MAX_DELAY_MS) {
      pendingUpdates.MAX_DELAY_MS = maxDelay;
    }
    if (backoffMultiplier !== initialSettings.BACKOFF_MULTIPLIER) {
      pendingUpdates.BACKOFF_MULTIPLIER = backoffMultiplier;
    }
    if (webhookLimit !== initialSettings.WEBHOOK_EVENTS_PER_MIN) {
      pendingUpdates.WEBHOOK_EVENTS_PER_MIN = webhookLimit;
    }
    if (apiLimit !== initialSettings.API_CALLS_PER_MIN) {
      pendingUpdates.API_CALLS_PER_MIN = apiLimit;
    }
    if (messageLimit !== initialSettings.MESSAGES_PER_MIN) {
      pendingUpdates.MESSAGES_PER_MIN = messageLimit;
    }
    if (debouncePings !== initialSettings.EXPORT_EXIT_DEBOUNCE_PINGS) {
      pendingUpdates.EXPORT_EXIT_DEBOUNCE_PINGS = debouncePings;
    }
    if (signalLossHours !== initialSettings.EXPORT_SIGNAL_LOSS_HOURS) {
      pendingUpdates.EXPORT_SIGNAL_LOSS_HOURS = signalLossHours;
    }
    if (opsChatIds !== (initialSettings.EXPORT_OPS_CHAT_IDS || "")) {
      pendingUpdates.EXPORT_OPS_CHAT_IDS = opsChatIds;
    }

    const changedKeys = Object.keys(pendingUpdates);

    if (changedKeys.length === 0) {
      setSaveStatus({
        success: true,
        message: "No changes detected. Settings are already up to date.",
      });
      setIsSaving(false);
      return;
    }

    try {
      // Send sequential updates for simplicity and clear error handling
      const errorsMap: Record<string, string> = {};
      
      for (const key of changedKeys) {
        const response = await fetch(`/api/settings/${key}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: pendingUpdates[key] }),
        });

        if (!response.ok) {
          const result = await response.json();
          // Extract specific validation error if present
          if (response.status === 400 && result.error?.details?.[key]) {
            errorsMap[key] = result.error.details[key][0];
          } else {
            errorsMap[key] = result.error?.message || `Failed to update ${key}`;
          }
        }
      }

      if (Object.keys(errorsMap).length > 0) {
        setFieldErrors(errorsMap);
        throw new Error("Validation failed. Please correct the highlighted errors.");
      }

      setSaveStatus({
        success: true,
        message: "🎉 Settings saved and applied successfully!",
      });
      router.refresh();
    } catch (err: any) {
      setSaveStatus({
        success: false,
        message: err.message || "An unexpected error occurred while saving.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default settings values
  const handleReset = async () => {
    if (!window.confirm("Are you sure you want to reset all configurations to defaults? This will overwrite active bot tokens and webhook setups.")) {
      return;
    }

    setIsResetting(true);
    setSaveStatus(null);
    setTokenTestResult(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/settings/reset", {
        method: "POST",
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to reset settings");
      }

      setSaveStatus({
        success: true,
        message: "🔄 System configurations reset to defaults successfully.",
      });
      router.refresh();
    } catch (err: any) {
      setSaveStatus({
        success: false,
        message: err.message || "An error occurred during reset.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Save Feedback Alerts */}
      {saveStatus && (
        <div className={`rounded-xl border p-4 text-sm font-semibold flex items-center gap-2 ${
          saveStatus.success 
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
            : "bg-destructive/10 border-destructive/20 text-destructive"
        }`}>
          {saveStatus.success ? <ShieldCheck className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          {saveStatus.message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 1. Bot Settings Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 border-b border-border/40 pb-2 mb-2">
              <Send className="h-4 w-4 text-indigo-500" />
              Telegram Bot Integration
            </h3>

            {/* Token */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="bot-token" className="text-xs font-bold text-foreground">Bot API Token</label>
                <button
                  type="button"
                  onClick={testBotToken}
                  disabled={isTestingToken || !botToken}
                  className="text-[10px] font-bold text-primary hover:underline disabled:opacity-50 cursor-pointer"
                >
                  {isTestingToken ? "Testing..." : "Test Token Connection"}
                </button>
              </div>
              <input
                id="bot-token"
                type="text"
                placeholder="Paste token (e.g. 12345:ABC...)"
                value={botToken}
                onChange={(e) => {
                  setBotToken(e.target.value);
                  if (fieldErrors.DEFAULT_BOT_TOKEN) {
                    setFieldErrors(prev => {
                      const next = { ...prev };
                      delete next.DEFAULT_BOT_TOKEN;
                      return next;
                    });
                  }
                }}
                className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                  fieldErrors.DEFAULT_BOT_TOKEN ? "border-destructive focus:ring-destructive/20" : "border-border"
                }`}
              />
              {fieldErrors.DEFAULT_BOT_TOKEN && (
                <p className="text-[10px] text-destructive font-semibold">{fieldErrors.DEFAULT_BOT_TOKEN}</p>
              )}
              {tokenTestResult && (
                <p className={`text-[10px] font-semibold mt-1 p-1.5 rounded-md border ${
                  tokenTestResult.success 
                    ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                    : "bg-destructive/5 border-destructive/10 text-destructive"
                }`}>
                  {tokenTestResult.message}
                </p>
              )}
            </div>

            {/* Webhook URL */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="webhook-url" className="text-xs font-bold text-foreground">Bot Webhook URL</label>
              <input
                id="webhook-url"
                type="text"
                placeholder="https://yourportal.com/api/webhook/telegram"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                  fieldErrors.BOT_WEBHOOK_URL ? "border-destructive focus:ring-destructive/20" : "border-border"
                }`}
              />
              {fieldErrors.BOT_WEBHOOK_URL && (
                <p className="text-[10px] text-destructive font-semibold">{fieldErrors.BOT_WEBHOOK_URL}</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Set this to receive push event alerts directly from Telegram to your portal.
              </p>
            </div>
          </div>

          {/* 2. Retry Settings Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 border-b border-border/40 pb-2 mb-2">
              <Sliders className="h-4 w-4 text-emerald-500" />
              Exponential Backoff Retry Settings
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Max Retries */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="max-retries" className="text-xs font-bold text-foreground">Max Retries (1-10)</label>
                <input
                  id="max-retries"
                  type="number"
                  min="1"
                  max="10"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(e.target.value)}
                  className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                    fieldErrors.MAX_RETRIES ? "border-destructive focus:ring-destructive/20" : "border-border"
                  }`}
                />
                {fieldErrors.MAX_RETRIES && (
                  <p className="text-[10px] text-destructive font-semibold">{fieldErrors.MAX_RETRIES}</p>
                )}
              </div>

              {/* Backoff Multiplier */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="backoff-mult" className="text-xs font-bold text-foreground">Backoff Multiplier</label>
                <input
                  id="backoff-mult"
                  type="number"
                  step="0.1"
                  min="1.0"
                  value={backoffMultiplier}
                  onChange={(e) => setBackoffMultiplier(e.target.value)}
                  className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                    fieldErrors.BACKOFF_MULTIPLIER ? "border-destructive focus:ring-destructive/20" : "border-border"
                  }`}
                />
                {fieldErrors.BACKOFF_MULTIPLIER && (
                  <p className="text-[10px] text-destructive font-semibold">{fieldErrors.BACKOFF_MULTIPLIER}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Initial Delay */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="init-delay" className="text-xs font-bold text-foreground">Initial Delay (ms)</label>
                <input
                  id="init-delay"
                  type="number"
                  min="1"
                  value={initialDelay}
                  onChange={(e) => setInitialDelay(e.target.value)}
                  className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                    fieldErrors.INITIAL_DELAY_MS ? "border-destructive focus:ring-destructive/20" : "border-border"
                  }`}
                />
                {fieldErrors.INITIAL_DELAY_MS && (
                  <p className="text-[10px] text-destructive font-semibold">{fieldErrors.INITIAL_DELAY_MS}</p>
                )}
              </div>

              {/* Max Delay */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="max-delay" className="text-xs font-bold text-foreground">Max Delay (ms)</label>
                <input
                  id="max-delay"
                  type="number"
                  min="1"
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(e.target.value)}
                  className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                    fieldErrors.MAX_DELAY_MS ? "border-destructive focus:ring-destructive/20" : "border-border"
                  }`}
                />
                {fieldErrors.MAX_DELAY_MS && (
                  <p className="text-[10px] text-destructive font-semibold">{fieldErrors.MAX_DELAY_MS}</p>
                )}
              </div>
            </div>
          </div>

          {/* 3. Rate Limiting Settings Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 border-b border-border/40 pb-2 mb-2">
              <Gauge className="h-4 w-4 text-cyan-500" />
              Rate Limiting Configs (Events/Min)
            </h3>

            <div className="grid grid-cols-3 gap-4">
              {/* Webhook events limit */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="webhook-rate" className="text-xs font-bold text-foreground">Webhook Events</label>
                <input
                  id="webhook-rate"
                  type="number"
                  min="1"
                  value={webhookLimit}
                  onChange={(e) => setWebhookLimit(e.target.value)}
                  className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                    fieldErrors.WEBHOOK_EVENTS_PER_MIN ? "border-destructive focus:ring-destructive/20" : "border-border"
                  }`}
                />
                {fieldErrors.WEBHOOK_EVENTS_PER_MIN && (
                  <p className="text-[10px] text-destructive font-semibold">{fieldErrors.WEBHOOK_EVENTS_PER_MIN}</p>
                )}
              </div>

              {/* API calls limit */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="api-rate" className="text-xs font-bold text-foreground">API Requests</label>
                <input
                  id="api-rate"
                  type="number"
                  min="1"
                  value={apiLimit}
                  onChange={(e) => setApiLimit(e.target.value)}
                  className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                    fieldErrors.API_CALLS_PER_MIN ? "border-destructive focus:ring-destructive/20" : "border-border"
                  }`}
                />
                {fieldErrors.API_CALLS_PER_MIN && (
                  <p className="text-[10px] text-destructive font-semibold">{fieldErrors.API_CALLS_PER_MIN}</p>
                )}
              </div>

              {/* Messages limit */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="msg-rate" className="text-xs font-bold text-foreground">Telegram Msgs</label>
                <input
                  id="msg-rate"
                  type="number"
                  min="1"
                  value={messageLimit}
                  onChange={(e) => setMessageLimit(e.target.value)}
                  className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                    fieldErrors.MESSAGES_PER_MIN ? "border-destructive focus:ring-destructive/20" : "border-border"
                  }`}
                />
                {fieldErrors.MESSAGES_PER_MIN && (
                  <p className="text-[10px] text-destructive font-semibold">{fieldErrors.MESSAGES_PER_MIN}</p>
                )}
              </div>
            </div>
          </div>

          {/* 4. Export Tracking Tunables Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5 border-b border-border/40 pb-2 mb-2">
              <Bell className="h-4 w-4 text-amber-500" />
              Export Tracking Tunables
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Debounce Pings */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="debounce-pings" className="text-xs font-bold text-foreground">Debounce Pings</label>
                <input
                  id="debounce-pings"
                  type="number"
                  min="1"
                  value={debouncePings}
                  onChange={(e) => setDebouncePings(e.target.value)}
                  className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                    fieldErrors.EXPORT_EXIT_DEBOUNCE_PINGS ? "border-destructive focus:ring-destructive/20" : "border-border"
                  }`}
                />
                {fieldErrors.EXPORT_EXIT_DEBOUNCE_PINGS && (
                  <p className="text-[10px] text-destructive font-semibold">{fieldErrors.EXPORT_EXIT_DEBOUNCE_PINGS}</p>
                )}
              </div>

              {/* Signal Loss Hours */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="sig-loss" className="text-xs font-bold text-foreground">Signal Loss (Hours)</label>
                <input
                  id="sig-loss"
                  type="number"
                  min="1"
                  value={signalLossHours}
                  onChange={(e) => setSignalLossHours(e.target.value)}
                  className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                    fieldErrors.EXPORT_SIGNAL_LOSS_HOURS ? "border-destructive focus:ring-destructive/20" : "border-border"
                  }`}
                />
                {fieldErrors.EXPORT_SIGNAL_LOSS_HOURS && (
                  <p className="text-[10px] text-destructive font-semibold">{fieldErrors.EXPORT_SIGNAL_LOSS_HOURS}</p>
                )}
              </div>
            </div>

            {/* Ops Chat IDs */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ops-chats" className="text-xs font-bold text-foreground">Ops Notify Chat IDs</label>
              <input
                id="ops-chats"
                type="text"
                placeholder="Comma-separated IDs (e.g. -100123456, 987654)"
                value={opsChatIds}
                onChange={(e) => setOpsChatIds(e.target.value)}
                className={`h-9 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-hidden focus:border-ring focus:ring-2 focus:ring-ring/20 ${
                  fieldErrors.EXPORT_OPS_CHAT_IDS ? "border-destructive focus:ring-destructive/20" : "border-border"
                }`}
              />
              {fieldErrors.EXPORT_OPS_CHAT_IDS && (
                <p className="text-[10px] text-destructive font-semibold">{fieldErrors.EXPORT_OPS_CHAT_IDS}</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Target chat IDs to notify on border-crossing and exception pings.
              </p>
            </div>
          </div>

        </div>

        {/* Buttons Panel */}
        <div className="flex items-center justify-between pt-6 border-t border-border/40">
          <Button
            type="button"
            variant="destructive"
            className="font-semibold bg-red-600/10 text-red-600 border border-red-600/20 hover:bg-red-600/20 cursor-pointer"
            disabled={isResetting || isSaving}
            onClick={handleReset}
          >
            {isResetting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Resetting...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Reset to Defaults
              </>
            )}
          </Button>

          <Button
            type="submit"
            className="font-bold shadow-md bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isSaving || isResetting}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Saving Changes...
              </>
            ) : (
              <>
                <Sliders className="h-4 w-4 mr-1.5" />
                Save System Settings
              </>
            )}
          </Button>
        </div>

      </form>
    </div>
  );
}
