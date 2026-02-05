"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Navbar } from "@/src/components/Navbar";
import { authFetch, getUserLocation } from "@/src/lib/api-client"; // Presupunem că vom avea endpoint-ul

// Import dinamic pentru hartă (fix SSR)
const MapInner = dynamic(() => import("@/src/components/MapInner"), {
    ssr: false,
    loading: () => <div className="h-96 w-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center animate-pulse text-gray-500">Se încarcă harta... 🌍</div>
});

export default function MyLocationPage() {
    const [position, setPosition] = useState<[number, number] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect( () => {
        setLoading(true);
        try {
            console.log("Saving Home Location:", position);
            
            getUserLocation().then( data => {
                console.log('locatie user curent')
                console.log(data.data.latitude + ' ' + data.data.longitude)
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

    // Funcția care trimite datele la backend (o vom lega de endpoint-ul C# mai târziu)
    const handleSetHome = async () => {
        if (!position) return;
        setLoading(true);
        try {
            console.log("Saving Home Location:", position);
            
           // TODO: Aici vom apela API-ul când e gata backend-ul
            await authFetch("/Users", { 
               method: "POST", 
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ latitude: position[0], longitude: position[1] }) 
            });

            // Simulare succes
            await new Promise(r => setTimeout(r, 1000));
            alert(`Succes! Locația Home a fost setată la coordonatele:\nLat: ${position[0]}\nLng: ${position[1]}`);
            
        } catch (error) {
            console.error(error);
            alert("Eroare la salvarea locației.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                <Navbar />

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 transition-colors">
                    
                    {/* Titlu & Descriere */}
                    <div className="mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            📍 Setează "Home Base"
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">
                            Definește locația ta principală de operare. Sistemul te va notifica automat prin 
                            <span className="font-bold text-blue-600 dark:text-blue-400"> Geofencing Alert</span> dacă un suspect este raportat pe o rază de 
                            <span className="font-bold text-red-600 dark:text-red-400"> 10km</span> în jurul acestui punct.
                        </p>
                    </div>

                    {/* Harta */}
                    <div className="h-[500px] w-full bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 relative shadow-inner">
                         <MapInner position={position} setPosition={setPosition} />
                         
                         {!position && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] bg-blue-600/90 backdrop-blur text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg border border-blue-400 pointer-events-none animate-bounce">
                                👇 Dă click pe hartă pentru a seta casa!
                            </div>
                        )}
                    </div>

                    {/* Footer cu Buton */}
                    <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                            {position ? `Coordonate selectate: ${position[0].toFixed(5)}, ${position[1].toFixed(5)}` : "Nicio locație selectată"}
                        </div>

                        <button
                            onClick={handleSetHome}
                            disabled={!position || loading}
                            className={`
                                px-8 py-3 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2 text-white
                                ${!position || loading 
                                    ? "bg-gray-400 cursor-not-allowed opacity-50" 
                                    : "bg-green-600 hover:bg-green-700 hover:-translate-y-0.5 shadow-green-500/30"
                                }
                            `}
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Se salvează...
                                </>
                            ) : (
                                <>
                                    🏡 Salvează Locația Manual Home
                                </>
                            )}
                        </button>
                    </div>

                </div>
            </div>
        </main>
    );
}