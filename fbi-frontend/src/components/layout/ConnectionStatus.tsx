"use client";

import { useCallback, useSyncExternalStore } from "react";
import { HubConnectionState } from "@microsoft/signalr";
import { useSignalR } from "@/src/context/SignalRContext";
import { cn } from "@/src/lib/cn";

type Status = "live" | "connecting" | "offline";

const labels: Record<Status, string> = {
  live: "Live alerts on",
  connecting: "Connecting…",
  offline: "Live alerts off",
};

// Small header indicator for the SignalR connection exposed by SignalRContext.
export function ConnectionStatus({ compact = false }: { compact?: boolean }) {
  const { connection } = useSignalR();

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!connection) return () => {};
      let active = true;
      const notify = () => active && onChange();
      // HubConnection has no "off" for these callbacks; `active` turns stale ones into no-ops.
      connection.onreconnecting(notify);
      connection.onreconnected(notify);
      connection.onclose(notify);
      // The initial start() has no callback of its own.
      const timer = window.setInterval(notify, 3000);
      return () => {
        active = false;
        window.clearInterval(timer);
      };
    },
    [connection],
  );

  const state = useSyncExternalStore(subscribe, () => connection?.state ?? null, () => null);
  const status: Status =
    state === HubConnectionState.Connected ? "live" : state === HubConnectionState.Disconnected ? "offline" : "connecting";

  return (
    <span role="status" title={labels[status]} className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-muted">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          status === "live" && "bg-ok",
          status === "connecting" && "bg-pending motion-safe:animate-pulse",
          status === "offline" && "bg-alert",
        )}
      />
      <span className={cn(compact && "sr-only")}>{labels[status]}</span>
    </span>
  );
}
