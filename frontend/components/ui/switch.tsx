"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, label, disabled, ...props }, ref) => {
    const isControlled = checked !== undefined;
    const [internalChecked, setInternalChecked] = React.useState(false);
    const value = isControlled ? checked : internalChecked;

    const handleClick = () => {
      if (disabled) return;
      const next = !value;
      if (!isControlled) setInternalChecked(next);
      onCheckedChange?.(next);
    };

    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          ref={ref}
          disabled={disabled}
          onClick={handleClick}
          className={cn(
            "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-sm border-2 border-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ABF36] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            value ? "bg-[#6ABF36]" : "bg-white",
            className
          )}
          {...props}
        >
          <span
            className={cn(
              "pointer-events-none block h-5 w-5 border border-black bg-white transition-transform",
              value ? "translate-x-5" : "translate-x-0.5"
            )}
          />
        </button>
        {label && (
          <label className="text-sm font-medium text-black cursor-pointer" onClick={handleClick}>
            {label}
          </label>
        )}
      </div>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
