"use client";

import { jwtDecode } from "jwt-decode";
import { useSyncExternalStore } from "react";

interface CustomJwtPayload {
  realm_access?: { roles?: string[] | string };
}

export type AppRole = "ADMIN" | "USER";

// Role from the Keycloak token in localStorage: ADMIN if present, otherwise USER; null when logged out or invalid.
export function readRole(): AppRole | string | null {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const roles = jwtDecode<CustomJwtPayload>(token).realm_access?.roles || [];
    if (Array.isArray(roles)) return roles.includes("ADMIN") ? "ADMIN" : "USER";
    return roles || null;
  } catch (error) {
    console.error("Token invalid:", error);
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// Server snapshot is null, so pre-rendered HTML never shows role-specific UI.
export function useRole() {
  return useSyncExternalStore(subscribe, readRole, () => null);
}
