import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function DocsPage() {
  return (
    <AppShell>
      <div className="flex min-h-[600px] items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-16 w-16 text-gray-400 mb-6" strokeWidth={1.5} />
            <h1 className="text-h2 text-black mb-3">Documentation</h1>
            <p className="text-body text-gray-600 max-w-md">
              Comprehensive API documentation and integration guides are coming soon.
            </p>
            <p className="text-body-sm text-gray-500 mt-4">
              For immediate support, contact{" "}
              <a href="mailto:support@claidex.com" className="text-[#6ABF36] hover:underline font-medium">
                support@claidex.com
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
