"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DATA_USAGE_COPY, DELETION_COPY, SUPPORT_EMAIL } from "@/lib/settings-copy";
import { apiClient } from "@/lib/api-client";
import { Download } from "lucide-react";

export default function SettingsDataPrivacyPage() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const blob = await apiClient.exportMe();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "claidex-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-h1 text-black">Data & Privacy</h1>
        <p className="text-body-sm text-gray-600 mt-1">
          Data usage, exports, and account deletion.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data usage & logs</CardTitle>
          <CardDescription>
            What data Claidex processes and how it is used.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-body-sm text-gray-700 whitespace-pre-line space-y-2">
            {DATA_USAGE_COPY.split("\n\n").map((para, i) => (
              <p key={i}>{para.replace(/\*\*(.*?)\*\*/g, "$1")}</p>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
          <CardDescription>
            Download your profile, preferences, and watchlist summary as JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-body-sm text-gray-600">
            Large exports may take a few seconds. You will receive a single JSON file.
          </p>
          {exportError && (
            <p className="text-sm text-red-600 font-medium">{exportError}</p>
          )}
          <Button
            variant="secondary"
            onClick={handleExport}
            loading={exporting}
          >
            <Download className="h-4 w-4" />
            Export my account data (JSON)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account deletion</CardTitle>
          <CardDescription>
            Request removal of your account and associated data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-gray-700">{DELETION_COPY}</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-block mt-2 text-sm font-medium text-[#6ABF36] hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
