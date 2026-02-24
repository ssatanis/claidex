"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
// Label: use native label with design system class
const Label = ({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn("text-sm font-medium text-black tracking-wide", className)}
    {...props}
  />
);
import { cn } from "@/lib/utils";
import { useCreateWatchlist } from "@/hooks/useWatchlists";
import type { CreateWatchlistInput } from "@/types/watchlist";

const COLOR_PRESETS = [
  { value: "#6ABF36", label: "Green" },
  { value: "#2563EB", label: "Blue" },
  { value: "#D97706", label: "Amber" },
  { value: "#DC2626", label: "Red" },
  { value: "#7C3AED", label: "Purple" },
  { value: "#64748B", label: "Gray" },
] as const;

const ICON_OPTIONS = [
  { value: "folder", label: "Folder" },
  { value: "shield", label: "Shield" },
  { value: "alert-triangle", label: "Alert" },
  { value: "star", label: "Star" },
  { value: "bookmark", label: "Bookmark" },
  { value: "flag", label: "Flag" },
] as const;

interface NewWatchlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (id: string, name: string) => void;
}

export function NewWatchlistModal({
  open,
  onOpenChange,
  onSuccess,
}: NewWatchlistModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6ABF36");
  const [icon, setIcon] = useState<CreateWatchlistInput["icon"]>("folder");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateWatchlist();

  const reset = useCallback(() => {
    setName("");
    setDescription("");
    setColor("#6ABF36");
    setIcon("folder");
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (trimmed.length > 100) {
      setError("Name must be at most 100 characters.");
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        name: trimmed,
        description: description.trim() || undefined,
        color: color || undefined,
        icon,
      });
      handleOpenChange(false);
      onSuccess?.(created.id, created.name);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to create watchlist. Please try again.";
      setError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Watchlist</DialogTitle>
          <DialogDescription>
            Create a collection to monitor providers and entities.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="watchlist-name">Name</Label>
            <Input
              id="watchlist-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q1 2026 Investigation – DME Suppliers"
              maxLength={100}
              autoFocus
              className="border-black"
            />
            <p className="text-caption text-gray-500">{name.length}/100</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="watchlist-description">Description (optional)</Label>
            <textarea
              id="watchlist-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose of this watchlist..."
              rows={3}
              className="w-full rounded-md border border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ABF36] focus:ring-offset-0"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-all",
                      color === c.value
                        ? "border-black scale-110"
                        : "border-gray-200 hover:border-gray-400"
                    )}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="watchlist-icon">Icon</Label>
              <Select
                id="watchlist-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value as CreateWatchlistInput["icon"])}
                className="border-black"
              >
                {ICON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="accent" loading={createMutation.isPending}>
              Create Watchlist
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
