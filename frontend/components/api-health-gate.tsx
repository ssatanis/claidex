"use client";

import { useState, useEffect } from "react";
import { checkApiHealth, isApiBaseUrlConfigured } from "@/lib/api-client";

function ServiceUnavailableView({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-xl font-semibold text-gray-900">
          Service temporarily unavailable
        </h1>
        <p className="text-gray-600">{message}</p>
        <p className="text-sm text-gray-500">
          Please try again later or contact support if the problem persists.
        </p>
      </div>
    </div>
  );
}

function CheckingView() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-accent" />
        <p className="text-sm text-gray-600">Checking connection...</p>
      </div>
    </div>
  );
}

/** In dev we skip the health check and render children immediately. */
const isProd =
  typeof process !== "undefined" && process.env.NODE_ENV === "production";

/**
 * In production: verifies API base URL is set and /health returns 2xx before rendering children.
 * Shows a branded "Service temporarily unavailable" page otherwise.
 */
export function ApiHealthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "ok" | "unavailable">(
    !isProd ? "ok" : "checking"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isProd) return;

    if (!isApiBaseUrlConfigured()) {
      const msg = "API is not configured. Set NEXT_PUBLIC_API_BASE_URL to your API URL.";
      const id = setTimeout(() => {
        setMessage(msg);
        setStatus("unavailable");
      }, 0);
      return () => clearTimeout(id);
    }

    let cancelled = false;
    checkApiHealth().then(({ ok }) => {
      if (cancelled) return;
      if (ok) {
        setStatus("ok");
      } else {
        setMessage("The API is not responding. Please try again later.");
        setStatus("unavailable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isProd) {
    return <>{children}</>;
  }

  if (status === "checking") {
    return <CheckingView />;
  }
  if (status === "unavailable") {
    return <ServiceUnavailableView message={message} />;
  }
  return <>{children}</>;
}
