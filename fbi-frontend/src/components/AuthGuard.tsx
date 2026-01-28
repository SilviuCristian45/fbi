"use client";

import * as signalR from "@microsoft/signalr";
import { Toaster, toast } from "react-hot-toast";
import { usePathname, useRouter } from "next/navigation";
import { SignalRProvider, useSignalR } from "../context/SignalRContext";
import { useEffect, useState, useRef } from "react";

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
                        const audio = new Audio('/sounds/alarm.mp3');
                        audio.play().catch(() => {});
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
            conn.off("ReceiveUrgentAlert");
            // Optional: conn.stop() daca vrei sa inchizi cand iesi din AuthGuard,
            // dar de obicei vrem sa ramana activa in aplicatie.
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

    // Definim paginile publice
    const isPublicPage = pathname.startsWith("/auth") || pathname === "/";

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
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-xl font-semibold text-gray-600">Se verifică autentificarea...</div>
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
                <Toaster />
                {children}
            </SignalRManager>
        </SignalRProvider>
    );
}