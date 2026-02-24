"use client";

import * as React from "react";
import { useEvents } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Activity } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface ActivityFeedProps {
  open: boolean;
  onClose: () => void;
}

export function ActivityFeed({ open, onClose }: ActivityFeedProps) {
  const { data: events, isLoading } = useEvents({ limit: 30 });

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        aria-hidden
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-80 max-w-[90vw] bg-white border-l border-gray-200 shadow-xl",
          "flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-600" />
            <CardTitle className="text-base font-semibold">Live Feed</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !events || events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <Activity className="h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-500">No recent events</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <Card key={event.id} variant="default" className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <Badge
                        variant={event.severity as "critical" | "high" | "medium" | "low"}
                        size="sm"
                        className="shrink-0 capitalize"
                      >
                        {event.severity}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-black truncate">
                          {event.provider_name}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {event.event_type}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {formatRelativeTime(event.timestamp)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
