"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Definim Iconița aici, sigur funcționează
const customIcon = new L.Icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

interface MapInnerProps {
    position: [number, number] | null;
    setPosition: (pos: [number, number]) => void;
}

// Componenta care ascultă click-urile
// O separăm ca să fim siguri că primește contextul hărții
function ClickHandler({ setPosition }: { setPosition: (pos: [number, number]) => void }) {
    const map = useMapEvents({
        click(e) {
            console.log("📍 Click detectat la:", e.latlng); // Debug în consolă
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