import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#6ABF36] focus:ring-offset-2",
  {
    variants: {
      variant: {
        critical: "border-red-600 bg-red-50 text-red-700",
        high: "border-orange-600 bg-orange-50 text-orange-700",
        medium: "border-amber-600 bg-amber-50 text-amber-700",
        low: "border-[#6ABF36] bg-green-50 text-green-700",
        none: "border-gray-400 bg-gray-50 text-gray-600",
        status: "border-black bg-white text-black",
        category: "border-gray-300 bg-gray-100 text-gray-700",
      },
      size: {
        sm: "px-2 py-0.5 text-xs tracking-wide",
        md: "px-2.5 py-1 text-sm tracking-wide",
      },
    },
    defaultVariants: {
      variant: "status",
      size: "sm",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  showDot?: boolean;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, showDot = false, children, ...props }, ref) => {
    const getDotColor = () => {
      switch (variant) {
        case "critical":
          return "bg-red-600";
        case "high":
          return "bg-orange-600";
        case "medium":
          return "bg-amber-600";
        case "low":
          return "bg-[#6ABF36]";
        case "none":
          return "bg-gray-400";
        default:
          return "bg-black";
      }
    };

    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      >
        {showDot && (
          <span
            className={cn("h-1.5 w-1.5 rounded-full", getDotColor())}
            aria-hidden="true"
          />
        )}
        {children}
      </div>
    );
  }
);

Badge.displayName = "Badge";

export { Badge, badgeVariants };
