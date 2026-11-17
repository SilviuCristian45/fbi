"use client";

import { useRef } from "react";
import { cn } from "@/src/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

// Shared ids so a tab and its panel reference each other (aria-controls / aria-labelledby).
const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

interface TabsProps {
  /** Same value must be passed to the matching TabPanel components (e.g. from useId()). */
  idPrefix: string;
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}

// WAI-ARIA tabs: roving tabindex, arrow keys / Home / End move between tabs.
export function Tabs({ idPrefix, tabs, value, onChange, label, className }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (index: number) => {
    const i = (index + tabs.length) % tabs.length;
    onChange(tabs[i].id);
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") focusTab(index + 1);
    else if (e.key === "ArrowLeft") focusTab(index - 1);
    else if (e.key === "Home") focusTab(0);
    else if (e.key === "End") focusTab(tabs.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-6 overflow-x-auto border-b border-border", className)}>
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={tabId(idPrefix, tab.id)}
            aria-selected={selected}
            aria-controls={panelId(idPrefix, tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-3 py-3 font-semibold transition-colors",
              selected ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-fg">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idPrefix,
  id,
  active,
  className,
  children,
}: {
  idPrefix: string;
  id: string;
  active: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={panelId(idPrefix, id)}
      aria-labelledby={tabId(idPrefix, id)}
      tabIndex={0}
      className={cn("focus-visible:outline-offset-4", className)}
    >
      {children}
    </div>
  );
}
