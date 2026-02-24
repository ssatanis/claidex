"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/use-api";
import { formatRelativeTime } from "@/lib/utils";
import { Key, Plus, Copy, Check } from "lucide-react";

export default function SettingsApiIntegrationsPage() {
  const { data: keys, isLoading, error } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newKeyName.trim();
    if (!name) return;
    try {
      const result = await createKey.mutateAsync(name);
      setCreatedKey(result.key);
      setNewKeyName("");
    } catch {
      // error
    }
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    setCreatedKey(null);
    setNewKeyName("");
  };

  const copyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    try {
      await revokeKey.mutateAsync(revokeTarget.id);
      setRevokeTarget(null);
    } catch {
      // error
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-h1 text-black">API & Integrations</h1>
        <p className="text-body-sm text-gray-600 mt-1">
          API keys and integrations for programmatic access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" /> API keys
          </CardTitle>
          <CardDescription>
            Create and revoke keys for API access. Keys are shown only once at creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create new key
            </Button>
            <Link href="/api-keys" className="text-sm font-medium text-[#6ABF36] hover:underline">
              Manage keys
            </Link>
          </div>
          {isLoading && <Skeleton className="h-24 w-full" />}
          {error && (
            <p className="text-body-sm text-red-600">Failed to load API keys. Ensure the api_keys table exists.</p>
          )}
          {!isLoading && !error && keys && keys.length > 0 && (
            <div className="border border-black overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="font-mono text-body-sm">{k.key_prefix}…</TableCell>
                      <TableCell className="text-gray-600">
                        {k.last_used_at ? formatRelativeTime(k.last_used_at) : "Never"}
                      </TableCell>
                      <TableCell className="text-gray-600">{formatRelativeTime(k.created_at)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setRevokeTarget({ id: k.id, name: k.name })}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!isLoading && !error && keys && keys.length === 0 && (
            <p className="text-body-sm text-gray-500">No API keys yet. Create one to get started.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connect Claidex to your TPRM, GRC, or SIEM tools.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-gray-600">
            Integrations with TPRM, GRC, and SIEM systems coming soon.
          </p>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => !open && handleCloseCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdKey ? "Key created" : "Create API key"}</DialogTitle>
            <DialogDescription>
              {createdKey
                ? "Copy your key now. It won’t be shown again."
                : "Give this key a name (e.g. Production, CI)."}
            </DialogDescription>
          </DialogHeader>
          {createdKey ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input readOnly value={createdKey} className="font-mono text-body-sm" />
                <Button variant="secondary" size="sm" onClick={copyKey}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <Input
                label="Key name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Production"
              />
            </form>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={handleCloseCreate}>
              {createdKey ? "Done" : "Cancel"}
            </Button>
            {!createdKey && (
              <Button onClick={handleCreate} loading={createKey.isPending}>
                Create key
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke key</DialogTitle>
            <DialogDescription>
              Revoke “{revokeTarget?.name}”? Any requests using this key will fail.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleRevokeConfirm} loading={revokeKey.isPending}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
