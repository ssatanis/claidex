"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useSecurityLog, useRevokeSessions } from "@/hooks/use-api";
import { formatRelativeTime } from "@/lib/utils";
import { Shield, LogOut } from "lucide-react";

export default function SettingsSecurityPage() {
  const { data: log, isLoading, error } = useSecurityLog();
  const revokeSessions = useRevokeSessions();
  const [revokeSuccess, setRevokeSuccess] = useState(false);

  const handleRevoke = async () => {
    setRevokeSuccess(false);
    try {
      await revokeSessions.mutateAsync();
      setRevokeSuccess(true);
      setTimeout(() => setRevokeSuccess(false), 4000);
    } catch {
      // error state
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-h1 text-black">Security</h1>
        <p className="text-body-sm text-gray-600 mt-1">
          Authentication, sessions, and security activity.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Authentication
          </CardTitle>
          <CardDescription>
            Sign-in is managed by your identity provider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-gray-700">
            Password management and sign-in methods are handled by your organization’s identity provider. Use your provider’s security or account page to change your password or manage sign-in options.
          </p>
          <p className="text-caption text-gray-500 mt-2">
            Multi-factor authentication (MFA) coming soon.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions & activity</CardTitle>
          <CardDescription>
            Recent security events and sign-in activity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {revokeSuccess && (
            <p className="text-sm text-[#6ABF36] font-medium">
              Other sessions have been revoked.
            </p>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRevoke}
            disabled={revokeSessions.isPending}
          >
            <LogOut className="h-4 w-4" />
            Sign out of other sessions
          </Button>
          {isLoading && <Skeleton className="h-48 w-full" />}
          {error && (
            <p className="text-body-sm text-red-600">
              Failed to load security log.
            </p>
          )}
          {!isLoading && !error && log && log.length > 0 && (
            <div className="border border-black overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Client</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-body-sm">
                        {formatRelativeTime(entry.created_at)}
                      </TableCell>
                      <TableCell className="text-body-sm font-medium">
                        {entry.action.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-body-sm text-gray-600">
                        {entry.ip_address ?? "—"}
                      </TableCell>
                      <TableCell className="text-body-sm text-gray-600 max-w-xs truncate">
                        {entry.user_agent ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!isLoading && !error && log && log.length === 0 && (
            <p className="text-body-sm text-gray-500">No security events yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Multi-factor authentication</CardTitle>
          <CardDescription>Add an extra layer of security.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-gray-600">
            Multi-factor authentication (MFA) is not available yet. We’ll add support for authenticator apps and backup codes in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
