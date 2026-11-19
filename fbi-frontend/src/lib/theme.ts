"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "theme";

// Runs in <head> before paint: saved choice, otherwise the OS preference (and keeps following it
// while the user has not picked a theme).
export const themeInitScript = `(function(){try{var k="${STORAGE_KEY}",d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");
function pick(){var s=null;try{s=localStorage.getItem(k)}catch(e){}return s==="light"||s==="dark"?s:(m.matches?"dark":"light")}
d.dataset.theme=pick();m.addEventListener("change",function(){d.dataset.theme=pick()});}catch(e){}})();`;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const read = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light") as Theme;

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => null);
  const setTheme = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this page only.
    }
  };
  return { theme, setTheme };
}
