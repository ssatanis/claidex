import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Risk score to label/color mapping
export function getRiskLevel(score: number | null): {
  label: string;
  color: string;
  variant: "critical" | "high" | "medium" | "low" | "none";
} {
  if (score === null) {
    return {
      label: "Unknown",
      color: "text-gray-500",
      variant: "none",
    };
  }

  if (score >= 80) {
    return {
      label: "Critical",
      color: "text-red-600",
      variant: "critical",
    };
  }
  if (score >= 60) {
    return {
      label: "High",
      color: "text-orange-600",
      variant: "high",
    };
  }
  if (score >= 40) {
    return {
      label: "Medium",
      color: "text-amber-600",
      variant: "medium",
    };
  }
  if (score >= 20) {
    return {
      label: "Low",
      color: "text-accent",
      variant: "low",
    };
  }
  return {
    label: "None",
    color: "text-gray-500",
    variant: "none",
  };
}

// Currency formatting
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Number abbreviation (1.2M, 345K)
export function abbreviateNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toString();
}

// Date formatting
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

// Relative time formatting (e.g., "2 days ago")
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return formatDate(date);
}
