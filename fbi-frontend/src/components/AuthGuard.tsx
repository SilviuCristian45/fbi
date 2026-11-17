"use client";

import * as signalR from "@microsoft/signalr";
import { toast } from "react-hot-toast";
import { AppToaster } from "./ui/Toast";
import { usePathname, useRouter } from "next/navigation";
import { SignalRProvider, useSignalR } from "../context/SignalRContext";
import { useEffect, useState, useRef } from "react";
import { playAlertTone } from "../lib/alert-sound";

// --- HELPER TOKEN ---
function getStoredToken() {
    if (typeof window !== "undefined") {
        return localStorage.getItem("token") || localStorage.getItem("accessToken");
    }
    return null;
}

// --- COMPONENTA INTERNĂ (MANAGER) - Rămâne neschimbată, e OK ---
interface SignalRManagerProps {
    children: React.ReactNode;
    token: string | null;
}

function SignalRManager({ children, token }: SignalRManagerProps) {
    const { setConnection } = useSignalR();
    const connectionRef = useRef<signalR.HubConnection | null>(null);

    useEffect(() => {
        if (!token) return;

        if (!connectionRef.current) {
            connectionRef.current = new signalR.HubConnectionBuilder()
                .withUrl(process.env.NEXT_PUBLIC_WEBSOCKETS_URL ?? "http://localhost:7002/hubs/surveillance", {
                    accessTokenFactory: () => token,
                    skipNegotiation: true,
                    transport: signalR.HttpTransportType.WebSockets
                })
                .withAutomaticReconnect()
                .build();
        }

        const conn = connectionRef.current;

        const startSocket = async () => {
            if (conn.state === signalR.HubConnectionState.Disconnected) {
                try {
                    await conn.start();
                    console.log("🟢 SignalR Connected (Stable)");
                    
                    conn.off("ReceiveUrgentAlert");
                    conn.on("ReceiveUrgentAlert", (msg) => {
                        playAlertTone();
                        toast.error(`ALERTĂ CRITICĂ: ${msg}`, { duration: 10000 });
                    });

					conn.off("ReceiveActivity");
					conn.on("ReceiveActivity", (msg) => {
						console.log("Activitate primită:", msg);
						toast.error(`ALERTĂ CRITICĂ: ${msg}`, { duration: 10000 });
					});

                    setConnection(conn);
                } catch (err) {
                    console.error("SignalR Start Error:", err);
                }
            } else if (conn.state === signalR.HubConnectionState.Connected) {
                setConnection(conn);
            }
        };

        startSocket();

        return () => {
            // The manager stays mounted on every protected page, so this only runs on logout
            // (navigation to /auth) or token change: close the socket so a later login
            // does not leave a second live connection behind.
            conn.off("ReceiveUrgentAlert");
            conn.off("ReceiveActivity");
            conn.stop().catch(() => {});
            connectionRef.current = null;
            setConnection(null);
        };
    }, [token]);

    return <>{children}</>;
}

// --- COMPONENTA PRINCIPALĂ (AUTH GUARD) ---
export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    
    // 1. isLoading true la început pentru a preveni "flash of content" sau erori de hidratare
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [token, setToken] = useState<string | null>(null);

    // Definim paginile publice. "/" is protected too, so 10 km alerts (ReceiveActivity) also arrive on the main page.
    const isPublicPage = pathname.startsWith("/auth");

    useEffect(() => {
        // 2. Verificarea se face o singură dată, la mount
        const checkAuth = () => {
            // Dacă e pagină publică, nu ne pasă de token, terminăm încărcarea
            if (isPublicPage) {
                setIsLoading(false);
                return;
            }

            const storedToken = getStoredToken();

            if (!storedToken) {
                // Nu e logat -> Redirect și rămânem pe loading până se schimbă pagina
                router.push("/auth/login");
            } else {
                // E logat -> Setăm datele
                setToken(storedToken);
                setIsAuthenticated(true);
                setIsLoading(false);
            }
        };

        checkAuth();
    }, [pathname, router, isPublicPage]);

    // 3. LOGICA DE RANDARE (CRITICĂ PENTRU A EVITA EROAREA)

    // A. Dacă suntem pe o pagină publică, randăm direct copiii (fără SignalR)
    if (isPublicPage) {
        return <>{children}</>;
    }

    // B. Dacă încă verificăm token-ul, afișăm un Loading Screen (sau nimic)
    // Asta previne eroarea "Client-side exception"
    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center" role="status">
                <div className="flex items-center gap-3 text-muted">
                    <span className="size-5 rounded-full border-2 border-border border-t-primary motion-safe:animate-spin" aria-hidden="true" />
                    Checking your session…
                </div>
            </div>
        );
    }

    // C. Dacă nu e autentificat (și nu e public), teoretic useEffect a făcut deja redirect,
    // dar returnăm null ca siguranță.
    if (!isAuthenticated) {
        return null;
    }

    // D. Dacă e autentificat, randăm aplicația CU SignalR
    return (
        <SignalRProvider>
            <SignalRManager token={token}>
                <AppToaster />
                {children}
            </SignalRManager>
        </SignalRProvider>
    );
}