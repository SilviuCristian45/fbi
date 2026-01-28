"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import * as signalR from "@microsoft/signalr";

interface SignalRContextType {
  connection: signalR.HubConnection | null;
  setConnection: (conn: signalR.HubConnection | null) => void;
}

const SignalRContext = createContext<SignalRContextType | undefined>(undefined);

export const SignalRProvider = ({ children }: { children: ReactNode }) => {
  const [connection, setConnection] = useState<signalR.HubConnection | null>(null);

  return (
    <SignalRContext.Provider value={{ connection, setConnection }}>
      {children}
    </SignalRContext.Provider>
  );
};

// Hook custom pentru a folosi contextul mai ușor
export const useSignalR = () => {
  const context = useContext(SignalRContext);
  if (!context) {
    throw new Error("useSignalR must be used within a SignalRProvider");
  }
  return context;
};