"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "react-hot-toast";
import { Crosshair, Home, LocateFixed, MapPin } from "lucide-react";
import { authFetch, getUserLocation } from "@/src/lib/api-client";
import { PageContainer } from "@/src/components/layout/AppShell";
import { PageHeader } from "@/src/components/ui/PageHeader";
import { Card } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { Skeleton } from "@/src/components/ui/Skeleton";

// Import dinamic pentru hartă (fix SSR)
const MapInner = dynamic(() => import("@/src/components/MapInner"), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />
});

export default function MyLocationPage() {
    const [position, setPosition] = useState<[number, number] | null>(null);
    const [loading, setLoading] = useState(false);
    const [geoLoading, setGeoLoading] = useState(false); // Loading separat pentru butonul GPS

    useEffect( () => {
        setLoading(true);
        try {
            
            getUserLocation().then( data => {
                // data null = userul nu si-a salvat inca locatia
                if (!data.data) return;
                setPosition([data.data.latitude, data.data.longitude]);
            }).catch(err => {
                console.error(err);
            })
            
            
        } catch (error) {
            console.error(error);
            
        } finally {
            setLoading(false);
        }
    }, [])

    const handleGetGPS = () => {
        if (!navigator.geolocation) {
            toast.error("Your browser does not support geolocation.");
            return;
        }

        setGeoLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                setPosition([latitude, longitude]); // Actualizăm harta instant
                setGeoLoading(false);
                // alert("Locație GPS detectată! Acum poți apăsa 'Salvează'.");
            },
            (err) => {
                console.error(err);
                toast.error("Your location could not be read. Check the browser permissions.");
                setGeoLoading(false);
            },
            { enableHighAccuracy: true } // Cere precizie maximă
        );
    };

    // Funcția care trimite datele la backend
    const  handleSetHome = async () => {
        if (!position) return;
        setLoading(true);
        try {
            
            await authFetch("/Users", { 
               method: "POST", 
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ latitude: position[0], longitude: position[1] }) 
            });

            // Simulare succes
            await new Promise(r => setTimeout(r, 1000));
            toast.success(`Home location saved: ${position[0].toFixed(5)}, ${position[1].toFixed(5)}`);
            
        } catch (error) {
            console.error(error);
            toast.error("The location could not be saved. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageContainer>
            <PageHeader
                overline="Alerts"
                title="My location"
                description={<>Set your home location. You get a live alert when someone on the list is reported <strong className="text-fg">within 10 km</strong> of it.</>}
            />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* Harta */}
                <Card className="relative h-[420px] overflow-hidden sm:h-[520px]">
                    <MapInner position={position} setPosition={setPosition} />
                    {!position && (
                        <div className="pointer-events-none absolute left-1/2 top-3 z-[400] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg shadow-pop">
                            <MapPin className="size-4" aria-hidden="true" /> Tap the map to set your home
                        </div>
                    )}
                </Card>

                {/* Panou acțiuni */}
                <Card className="grid gap-5 p-5">
                    <div>
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Selected point</h2>
                        <p className="mt-1 font-mono text-sm" aria-live="polite">
                            {position ? `${position[0].toFixed(5)}, ${position[1].toFixed(5)}` : "No location selected"}
                        </p>
                    </div>

                    <div className="grid gap-3">
                        <Button
                            variant="secondary"
                            onClick={handleGetGPS}
                            disabled={geoLoading || loading}
                            loading={geoLoading}
                        >
                            {!geoLoading && <LocateFixed className="size-4" aria-hidden="true" />}
                            {geoLoading ? "Finding you…" : "Use my current location"}
                        </Button>

                        <Button
                            onClick={handleSetHome}
                            disabled={!position || loading}
                            loading={loading}
                        >
                            {!loading && <Home className="size-4" aria-hidden="true" />}
                            {loading ? "Saving…" : "Save as home"}
                        </Button>
                    </div>

                    <p className="flex gap-2 text-sm text-muted">
                        <Crosshair className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        You can also drag the map and tap a new point; save again to update it.
                    </p>
                </Card>
            </div>
        </PageContainer>
    );
}
