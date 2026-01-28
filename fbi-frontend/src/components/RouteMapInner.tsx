"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

// Iconiță simplă pentru punctele intermediare
const dotIcon = new L.DivIcon({
    className: "bg-blue-600 border-2 border-white rounded-full w-4 h-4 shadow-md",
    iconSize: [12, 12],
    iconAnchor: [6, 6], 
});

// Iconiță specială pentru ULTIMA locație (Startul traseului vizual)
const activeIcon = new L.Icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

interface RouteMapInnerProps {
    locations: { lat: number; lng: number; details: string; timestamp: string }[];
}

export default function RouteMapInner({ locations }: RouteMapInnerProps) {
    if (locations.length === 0) return <div className="p-10 text-center">Nu există puncte de traseu.</div>;

    // Calculăm centrul hărții (primul punct sau media)
    const center: [number, number] = [locations[0].lat, locations[0].lng];

    // Extragem doar coordonatele pentru Polyline
    const polylinePositions = locations.map(loc => [loc.lat, loc.lng] as [number, number]);

    return (
        <MapContainer 
            center={center} 
            zoom={13} 
            scrollWheelZoom={true} 
            style={{ height: "100%", width: "100%" }}
        >
            <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Linia Roșie care unește punctele */}
            <Polyline 
                positions={polylinePositions} 
                pathOptions={{ color: 'red', weight: 4, opacity: 0.7, dashArray: '10, 10' }} 
            />

            {/* Markere pentru fiecare punct */}
            {locations.map((loc, idx) => (
                <Marker 
                    key={idx} 
                    position={[loc.lat, loc.lng]} 
                    icon={idx === 0 ? activeIcon : dotIcon} // Primul din listă (cel mai recent) e mare
                >
                    <Popup>
                        <div className="text-sm">
                            <strong>{new Date(loc.timestamp).toLocaleString()}</strong>
                            <p className="m-0 mt-1">{loc.details}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
}