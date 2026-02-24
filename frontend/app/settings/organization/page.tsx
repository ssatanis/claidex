"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
import {
  useOrganization,
  useOrganizationMembers,
  useUpdateOrganization,
  useUpdateMemberRole,
  useRemoveMember,
} from "@/hooks/use-api";
import { formatDate } from "@/lib/utils";
import { Check } from "lucide-react";

const ROLES: { value: "viewer" | "analyst" | "admin"; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "analyst", label: "Analyst" },
  { value: "admin", label: "Admin" },
];

export default function SettingsOrganizationPage() {
  const { data: orgData, isLoading: orgLoading, error: orgError } = useOrganization();
  const { data: members, isLoading: membersLoading } = useOrganizationMembers();
  const updateOrg = useUpdateOrganization();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const [orgSaved, setOrgSaved] = useState(false);
  const [orgErrorMsg, setOrgErrorMsg] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [industry, setIndustry] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");

  const isAdmin = orgData?.role === "admin";
  const organization = orgData?.organization ?? null;

  useEffect(() => {
    if (!organization) return;
    setName(organization.name);
    setSlug(organization.slug ?? "");
    setIndustry(organization.industry ?? "");
    setBillingEmail(organization.billing_email ?? "");
    setAddressLine1(organization.address_line1 ?? "");
    setCity(organization.city ?? "");
    setState(organization.state ?? "");
    setCountry(organization.country ?? "");
  }, [organization]);

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgErrorMsg(null);
    setOrgSaved(false);
    try {
      await updateOrg.mutateAsync({
        name: name.trim() || undefined,
        slug: slug.trim() || undefined,
        industry: industry.trim() || undefined,
        billing_email: billingEmail.trim() || undefined,
        address_line1: addressLine1.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        country: country.trim() || undefined,
      });
      setOrgSaved(true);
      setTimeout(() => setOrgSaved(false), 3000);
    } catch (err: unknown) {
      setOrgErrorMsg(err instanceof Error ? err.message : "Failed to save.");
    }
  };

  const handleRoleChange = (memberId: string, role: "viewer" | "analyst" | "admin") => {
    updateRole.mutate({ memberId, role });
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    try {
      await removeMember.mutateAsync(removeTarget.id);
      setRemoveTarget(null);
    } catch {
      // error
    }
  };

  if (orgLoading || !orgData) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (orgError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800 text-body-sm">
        Failed to load organization.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-h1 text-black">Organization & Teams</h1>
        <p className="text-body-sm text-gray-600 mt-1">
          Your organization profile and team members.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization profile</CardTitle>
          <CardDescription>
            {isAdmin
              ? "Update your organization details."
              : "Contact your organization admin to update these settings."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {organization ? (
            isAdmin ? (
              <form onSubmit={handleSaveOrg} className="space-y-4">
                <Input label="Organization name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="org-slug" />
                <Input label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Medicaid agency" />
                <Input label="Billing email" type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} />
                <Input label="Address line 1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
                  <Input label="State" value={state} onChange={(e) => setState(e.target.value)} />
                  <Input label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
                {orgErrorMsg && <p className="text-sm text-red-600">{orgErrorMsg}</p>}
                {orgSaved && (
                  <p className="flex items-center gap-2 text-sm text-[#6ABF36] font-medium">
                    <Check className="h-4 w-4" /> Saved
                  </p>
                )}
                <Button type="submit" loading={updateOrg.isPending}>Save</Button>
              </form>
            ) : (
              <div className="space-y-2 text-body-sm">
                <p><span className="font-medium text-gray-700">Name:</span> {organization.name}</p>
                {organization.slug && <p><span className="font-medium text-gray-700">Slug:</span> {organization.slug}</p>}
                {organization.industry && <p><span className="font-medium text-gray-700">Industry:</span> {organization.industry}</p>}
                {organization.billing_email && <p><span className="font-medium text-gray-700">Billing email:</span> {organization.billing_email}</p>}
                {(organization.address_line1 || organization.city) && (
                  <p><span className="font-medium text-gray-700">Address:</span>{" "}
                    [{[organization.address_line1, organization.city, organization.state, organization.country].filter(Boolean).join(", ")}]
                  </p>
                )}
              </div>
            )
          ) : (
            <p className="text-body-sm text-gray-600">You are not in an organization.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>
            {isAdmin ? "Manage roles and remove members." : "View-only. Only admins can change roles."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersLoading && <Skeleton className="h-32 w-full" />}
          {!membersLoading && members && members.length > 0 && (
            <div className="border border-black overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    {isAdmin && <TableHead className="w-24">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name ?? "—"}</TableCell>
                      <TableCell>{m.email}</TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Select
                            value={m.role ?? "viewer"}
                            onChange={(e) => handleRoleChange(m.id, e.target.value as "viewer" | "analyst" | "admin")}
                            className="w-32"
                          >
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </Select>
                        ) : (
                          m.role ?? "—"
                        )}
                      </TableCell>
                      <TableCell className="text-gray-600">{formatDate(m.joined_at)}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setRemoveTarget({ id: m.id, name: m.name ?? m.email })}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!membersLoading && members && members.length === 0 && (
            <p className="text-body-sm text-gray-500">No members.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Remove {removeTarget?.name} from the organization? They will lose access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleRemoveConfirm} loading={removeMember.isPending}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
