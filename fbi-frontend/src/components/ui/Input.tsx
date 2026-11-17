"use client";

import { cloneElement, forwardRef, isValidElement, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/lib/cn";

const control =
  "w-full rounded-md border-2 border-border bg-surface text-fg placeholder:text-muted " +
  "focus:border-strong focus:outline-none focus-visible:outline-3 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-alert";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, "h-11 px-3.5 text-base", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-28 px-3.5 py-2.5 text-base resize-y", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <select ref={ref} className={cn(control, "h-11 appearance-none pl-3.5 pr-10 text-base cursor-pointer")} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
    </span>
  );
});

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean;
  className?: string;
  /** A single Input, Textarea or Select; it receives id and aria-describedby. */
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}

// Label + control + hint/error, wired together with ids.
export function Field({ label, hint, error, hideLabel, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-sm font-semibold", hideLabel && "sr-only")}>
        {label}
      </label>
      {isValidElement(children) &&
        cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
