import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Key } from "lucide-react";

export default function ApiKeysPage() {
  return (
    <AppShell>
      <div className="flex min-h-[600px] items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex flex-col items-center py-16 px-8 text-center">
            {/* Icon */}
            <div className="mb-8">
              <Key className="h-20 w-20 text-gray-300" strokeWidth={1.5} />
            </div>

            {/* Title */}
            <h1 className="text-h2 text-black mb-4">API Access</h1>

            {/* Description */}
            <p className="text-body text-gray-600 max-w-md mb-8">
              Programmatic access to Claidex healthcare provider risk
              intelligence data is coming soon.
            </p>

            {/* Feature List */}
            <div className="w-full max-w-md mb-8 text-left">
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 h-1.5 w-1.5 bg-black flex-shrink-0" />
                  <span className="text-body-sm text-gray-700">
                    RESTful API endpoints for all provider and entity data
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 h-1.5 w-1.5 bg-black flex-shrink-0" />
                  <span className="text-body-sm text-gray-700">
                    GraphQL interface for flexible queries
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 h-1.5 w-1.5 bg-black flex-shrink-0" />
                  <span className="text-body-sm text-gray-700">
                    Webhook notifications for risk events
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1.5 h-1.5 w-1.5 bg-black flex-shrink-0" />
                  <span className="text-body-sm text-gray-700">
                    Rate limiting and usage analytics
                  </span>
                </li>
              </ul>
            </div>

            {/* CTA Section */}
            <div className="mb-6">
              <p className="text-body-sm text-gray-600 mb-2">
                Interested in API access?
              </p>
              <a
                href="mailto:support@claidex.com"
                className="text-body font-medium text-[#6ABF36] hover:underline transition-all"
              >
                support@claidex.com
              </a>
            </div>

            {/* Disabled Button */}
            <Button variant="secondary" size="md" disabled className="mt-4">
              <Key className="h-4 w-4" strokeWidth={1.5} />
              <span>Generate API Key</span>
            </Button>
            <p className="text-caption text-gray-500 mt-3">
              Key generation coming soon
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
