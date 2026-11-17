"use client";

import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { pinIcon } from "../lib/map-icons";
import "leaflet/dist/leaflet.css";

// Pin drawn in CSS, served with the app (no marker images from a CDN).
const customIcon = pinIcon("primary");

interface MapInnerProps {
    position: [number, number] | null;
    setPosition: (pos: [number, number]) => void;
}

// Componenta care ascultă click-urile
// O separăm ca să fim siguri că primește contextul hărții
function ClickHandler({ setPosition }: { setPosition: (pos: [number, number]) => void }) {
    useMapEvents({
        click(e) {
            setPosition([parseFloat(e.latlng.lat.toFixed(6)) ?? 45, parseFloat(e.latlng.lng.toFixed(6)) ?? 45]);
        },
    });
    return null;
}

export default function MapInner({ position, setPosition }: MapInnerProps) {
    return (
        <MapContainer 
            center={[46.0, 25.0]} 
            zoom={6} 
            scrollWheelZoom={true} 
            style={{ height: "100%", width: "100%" }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                // OSM cere Referer (altfel 403 "Access blocked"); suprascrie no-referrer din layout.tsx
                referrerPolicy="strict-origin-when-cross-origin"
            />
            
            {/* Aceasta componentă invizibilă ascultă click-urile */}
            <ClickHandler setPosition={setPosition} />

            {/* Dacă avem o poziție, arătăm marker-ul */}
            {position && (
                <Marker position={position} icon={customIcon} />
            )}
        </MapContainer>
    );
}