"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useNotifications, useUpdateNotifications } from "@/hooks/use-api";
import type { MeNotificationPreferences } from "@/types/api";

const ME_QUERY_KEY = ["me"] as const;
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const DIGEST_OPTIONS: { value: "none" | "daily" | "weekly"; label: string }[] = [
  { value: "none", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];
const SEVERITY_OPTIONS: { value: "low" | "medium" | "high" | "critical"; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];
const PROGRAMS = ["Medicare", "Medicaid", "Commercial"];

export default function SettingsNotificationsPage() {
  const queryClient = useQueryClient();
  const { data: prefs, isLoading, error } = useNotifications();
  const updateNotifications = useUpdateNotifications();
  const [saved, setSaved] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [digestFrequency, setDigestFrequency] = useState<"none" | "daily" | "weekly">("weekly");
  const [severityMin, setSeverityMin] = useState<"low" | "medium" | "high" | "critical">("high");
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [programFilter, setProgramFilter] = useState<string[]>([]);

  useEffect(() => {
    if (!prefs) return;
    setEmailAlerts(prefs.email_alerts);
    setDigestFrequency(prefs.email_digest_frequency);
    setSeverityMin(prefs.event_severity_min);
    setWatchlistOnly(prefs.watchlist_only);
    setProgramFilter(prefs.program_filter ?? []);
  }, [prefs]);

  const persist = async (patch: Partial<MeNotificationPreferences>) => {
    setInlineError(null);
    setSaved(false);
    try {
      await updateNotifications.mutateAsync(patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setInlineError(err instanceof Error ? err.message : "Failed to save");
      queryClient.invalidateQueries({ queryKey: [...ME_QUERY_KEY, "notifications"] });
    }
  };

  const handleEmailAlertsChange = (checked: boolean) => {
    setEmailAlerts(checked);
    persist({ email_alerts: checked });
  };

  const handleDigestChange = (value: "none" | "daily" | "weekly") => {
    setDigestFrequency(value);
    persist({ email_digest_frequency: value });
  };

  const handleSeverityChange = (value: "low" | "medium" | "high" | "critical") => {
    setSeverityMin(value);
    persist({ event_severity_min: value });
  };

  const handleWatchlistOnlyChange = (checked: boolean) => {
    setWatchlistOnly(checked);
    persist({ watchlist_only: checked });
  };

  const toggleProgram = (program: string) => {
    const next = programFilter.includes(program)
      ? programFilter.filter((p) => p !== program)
      : [...programFilter, program];
    setProgramFilter(next);
    persist({ program_filter: next });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800 text-body-sm">
        Failed to load notification preferences.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-h1 text-black">Notifications</h1>
        <p className="text-body-sm text-gray-600 mt-1">
          Email alerts and digest preferences for risk events.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email alerts & digest</CardTitle>
          <CardDescription>
            Choose how and when you receive notifications. Changes save automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {inlineError && (
            <p className="text-sm text-red-600 font-medium">{inlineError}</p>
          )}
          {saved && (
            <p className="flex items-center gap-2 text-sm text-[#6ABF36] font-medium">
              <Check className="h-4 w-4" /> Saved
            </p>
          )}

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-black">Email alerts for new high-severity events</p>
              <p className="text-caption text-gray-600">Receive an email when events meet your severity threshold.</p>
            </div>
            <Switch checked={emailAlerts} onCheckedChange={handleEmailAlertsChange} />
          </div>

          <div>
            <label className="text-sm font-medium text-black tracking-wide">Digest frequency</label>
            <div className="flex gap-4 mt-2">
              {DIGEST_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="digest"
                    checked={digestFrequency === o.value}
                    onChange={() => handleDigestChange(o.value)}
                    className="border-black text-[#6ABF36] focus:ring-[#6ABF36]"
                  />
                  <span className="text-body-sm">{o.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-black tracking-wide">Minimum severity</label>
            <Select
              value={severityMin}
              onChange={(e) => handleSeverityChange(e.target.value as typeof severityMin)}
              className="mt-1.5 max-w-xs"
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <p className="text-caption text-gray-600 mt-1">Only events at or above this level trigger alerts.</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-black">Only for watchlisted providers</p>
              <p className="text-caption text-gray-600">Restrict alerts to providers on your watchlist.</p>
            </div>
            <Switch checked={watchlistOnly} onCheckedChange={handleWatchlistOnlyChange} />
          </div>

          <div>
            <label className="text-sm font-medium text-black tracking-wide">Programs to monitor</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {PROGRAMS.map((program) => (
                <button
                  key={program}
                  type="button"
                  onClick={() => toggleProgram(program)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium border transition-colors",
                    programFilter.includes(program)
                      ? "border-[#6ABF36] bg-[#6ABF36] text-white"
                      : "border-black bg-white text-black hover:bg-gray-50"
                  )}
                >
                  {program}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
