"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import type { WatchlistWithCount } from "@/types/watchlist";
import { cn } from "@/lib/utils";

interface WatchlistCardProps {
  watchlist: WatchlistWithCount;
  onEdit?: (w: WatchlistWithCount) => void;
  onDelete?: (w: WatchlistWithCount) => void;
}

export function WatchlistCard({ watchlist, onEdit, onDelete }: WatchlistCardProps) {
  const color = watchlist.color || "#6ABF36";
  const highRiskCount = 0; // Will be from metrics when we have it on list; for now list doesn't include it

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5"
      )}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <CardContent className="pl-6 pr-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/watchlists/${watchlist.id}`}
            className="min-w-0 flex-1 block"
          >
            <h3 className="text-h3 text-black font-semibold truncate">
              {watchlist.name}
            </h3>
            {watchlist.description ? (
              <p
                className="text-body-sm text-gray-600 mt-0.5 line-clamp-2"
                title={watchlist.description}
              >
                {watchlist.description}
              </p>
            ) : (
              <p className="text-body-sm text-gray-400 mt-0.5 italic">
                No description
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-body-sm text-gray-600">
                {watchlist.item_count} provider
                {watchlist.item_count !== 1 ? "s" : ""}
              </span>
              {highRiskCount > 0 && (
                <Badge variant="high" size="sm">
                  {highRiskCount} high-risk
                </Badge>
              )}
              <span className="text-caption text-gray-400">
                Updated {formatRelativeTime(watchlist.updated_at)}
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/watchlists/${watchlist.id}`}>
                <Eye className="h-4 w-4" />
                <span className="sr-only">View</span>
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(watchlist)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-700"
                    onClick={() => onDelete(watchlist)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
