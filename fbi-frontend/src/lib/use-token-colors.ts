"use client";

import { useMemo } from "react";
import { useTheme } from "./theme";

const TOKENS = ["primary", "alert", "pending", "ok", "muted", "border", "fg", "surface", "subtle"] as const;
export type TokenColors = Record<(typeof TOKENS)[number], string>;

// Resolved token values for libraries that need literal colors (recharts SVG attributes).
// Recomputed when the theme changes.
export function useTokenColors(): TokenColors | null {
  const { theme } = useTheme();
  return useMemo(() => {
    if (theme === null) return null;
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(TOKENS.map((t) => [t, style.getPropertyValue(`--${t}`).trim()])) as TokenColors;
  }, [theme]);
}
