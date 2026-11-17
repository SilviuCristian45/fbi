"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { dotIcon, pinIcon } from "../lib/map-icons";
import { formatDateTime } from "../lib/format";

// Cel mai recent punct (primul din listă) e un pin; restul sunt puncte mici.
const activeIcon = pinIcon("alert");

interface RouteMapInnerProps {
    locations: { lat: number; lng: number; details: string; timestamp: string }[];
}

export default function RouteMapInner({ locations }: RouteMapInnerProps) {
    if (locations.length === 0) return <div className="p-10 text-center text-muted">No route points yet.</div>;

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
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                // OSM cere Referer (altfel 403 "Access blocked"); suprascrie no-referrer din layout.tsx
                referrerPolicy="strict-origin-when-cross-origin"
            />

            {/* Linia care unește punctele (culoarea vine din .route-line, din tokens) */}
            <Polyline
                positions={polylinePositions}
                pathOptions={{ className: "route-line", weight: 3, opacity: 0.85, dashArray: "8 8" }}
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
                            <strong>{formatDateTime(loc.timestamp)}</strong>
                            {idx === 0 && <span className="ml-1 text-muted">(latest)</span>}
                            <p className="m-0 mt-1">{loc.details}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
}
