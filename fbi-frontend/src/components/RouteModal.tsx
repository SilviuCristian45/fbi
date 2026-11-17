"use client";

import dynamic from "next/dynamic";
import type { Sighting } from "./SightingsList";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Skeleton } from "./ui/Skeleton";

// Importăm dinamic harta pentru a evita erorile de server (Window is not defined)
const RouteMapInner = dynamic(() => import("./RouteMapInner"), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />
});

interface RouteModalProps {
    isOpen: boolean;
    onClose: () => void;
    locations: Sighting[];
    title: string;
}

// Esc, focus and backdrop handling come from Modal.
export default function RouteModal({ isOpen, onClose, locations, title }: RouteModalProps) {
    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            size="xl"
            fill
            title="Sighting route"
            description={`${title} · ${locations.length} ${locations.length === 1 ? "point" : "points"}, latest marked with a pin`}
            footer={<Button variant="secondary" onClick={onClose}>Close map</Button>}
        >
            <div className="relative min-h-80 flex-1 bg-subtle">
                <RouteMapInner locations={locations} />
            </div>
        </Modal>
    );
}
