"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe, useUpdateProfile } from "@/hooks/use-api";
import { Check } from "lucide-react";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "UTC",
];
const LOCALES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
];
const LANDING_OPTIONS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "providers", label: "Providers" },
  { value: "watchlists", label: "Watchlists" },
];
const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

export default function SettingsProfilePage() {
  const { data: me, isLoading, error } = useMe();
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [timezone, setTimezone] = useState("");
  const [locale, setLocale] = useState("en-US");
  const [defaultLanding, setDefaultLanding] = useState("dashboard");
  const [tableDensity, setTableDensity] = useState("comfortable");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [prefsSaved, setPrefsSaved] = useState(false);

  useEffect(() => {
    if (!me) return;
    setName(me.name ?? "");
    setPosition(me.position ?? "");
    setTimezone(me.timezone ?? "America/Chicago");
    setLocale(me.locale ?? "en-US");
    const prefs = me.preferences as Record<string, unknown> | undefined;
    setDefaultLanding((prefs?.default_landing as string) ?? "dashboard");
    setTableDensity((prefs?.table_density as string) ?? "comfortable");
    setReducedMotion((prefs?.reduced_motion as boolean) ?? false);
  }, [me]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSaved(false);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setProfileError("Name is required.");
      return;
    }
    try {
      await updateProfile.mutateAsync({
        name: trimmedName,
        position: position.trim() || undefined,
        timezone: timezone || undefined,
        locale: locale || undefined,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to save profile.");
    }
  };

  const handleSavePrefs = async () => {
    setPrefsSaved(false);
    try {
      await updateProfile.mutateAsync({
        preferences: {
          default_landing: defaultLanding,
          table_density: tableDensity,
          reduced_motion: reducedMotion,
        },
      });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 3000);
    } catch {
      // silent or toast
    }
  };

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800 text-body-sm">
        Failed to load profile. Ensure the API is running and NEXT_PUBLIC_DEV_USER_ID is set to a valid user UUID (e.g. seed user).
      </div>
    );
  }

  const roleLabel = me?.organization_role
    ? `${me.organization_role.charAt(0).toUpperCase() + me.organization_role.slice(1)}${me.organization ? ` | ${me.organization.name}` : ""}`
    : "—";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-h1 text-black">Profile</h1>
        <p className="text-body-sm text-gray-600 mt-1">
          Manage your account and interface preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile information</CardTitle>
          <CardDescription>Update your name, position, and regional settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Skeleton className="h-4 w-4 rounded" /> Loading profile…
            </div>
          )}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <Input
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading}
            />
            <Input label="Email" value={me?.email ?? ""} readOnly className="bg-gray-50" disabled={isLoading} />
            <div>
              <label className="text-sm font-medium text-black tracking-wide">Role</label>
              <p className="mt-1.5 text-body-sm text-gray-700">{roleLabel}</p>
            </div>
            <Input
              label="Position / Title"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. Medicaid Integrity Analyst"
            />
            {me?.organization && (
              <div>
                <label className="text-sm font-medium text-black tracking-wide">Organization</label>
                <p className="mt-1.5 text-body-sm text-gray-700">{me.organization.name}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </Select>
              <Select
                label="Locale / Region"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              >
                {LOCALES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </Select>
            </div>
            {profileError && (
              <p className="text-xs text-red-600 font-medium">{profileError}</p>
            )}
            {profileSaved && (
              <p className="flex items-center gap-2 text-sm text-[#6ABF36] font-medium">
                <Check className="h-4 w-4" /> Profile updated
              </p>
            )}
            <Button type="submit" loading={updateProfile.isPending} disabled={isLoading}>
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interface preferences</CardTitle>
          <CardDescription>Default landing page, table density, and motion.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-black tracking-wide">Default landing page</label>
            <Select
              value={defaultLanding}
              onChange={(e) => setDefaultLanding(e.target.value)}
              className="mt-1.5"
              disabled={isLoading}
            >
              {LANDING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-black tracking-wide">Table density</label>
            <Select
              value={tableDensity}
              onChange={(e) => setTableDensity(e.target.value)}
              className="mt-1.5"
              disabled={isLoading}
            >
              {DENSITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <Switch
            checked={reducedMotion}
            onCheckedChange={setReducedMotion}
            label="Use reduced motion"
          />
          {prefsSaved && (
            <p className="flex items-center gap-2 text-sm text-[#6ABF36] font-medium">
              <Check className="h-4 w-4" /> Preferences saved
            </p>
          )}
          <Button onClick={handleSavePrefs} loading={updateProfile.isPending} disabled={isLoading}>
            Save preferences
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
