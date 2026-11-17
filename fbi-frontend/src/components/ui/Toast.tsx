"use client";

import { Toaster, toast, type Toast } from "react-hot-toast";
import { BellRing, X } from "lucide-react";
import { cn } from "@/src/lib/cn";

// The app-wide toaster, themed with the design tokens. Toast calls (toast.error/success) stay unchanged.
export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      containerStyle={{ top: 76 }}
      toastOptions={{
        className: "!rounded-md !border !border-border !bg-surface !text-fg !shadow-pop !text-sm !font-medium",
        error: { iconTheme: { primary: "var(--alert)", secondary: "var(--alert-fg)" } },
        success: { iconTheme: { primary: "var(--ok)", secondary: "var(--surface)" } },
      }}
    />
  );
}

interface AlertToastProps {
  t: Toast;
  title: string;
  children: React.ReactNode;
}

// Prominent live-alert toast (new sighting, nearby report). Use with toast.custom((t) => <AlertToast t={t} …/>).
export function AlertToast({ t, title, children }: AlertToastProps) {
  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-border border-l-4 border-l-alert bg-surface text-fg shadow-pop",
        "transition-all duration-200",
        t.visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
      )}
    >
      <div className="flex flex-1 gap-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-alert-soft text-alert">
          <BellRing className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <div className="mt-0.5 text-sm text-muted">{children}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => toast.dismiss(t.id)}
        aria-label="Dismiss"
        className="grid w-11 place-items-center border-l border-border text-muted hover:bg-subtle hover:text-fg"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
