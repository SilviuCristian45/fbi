"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import MapModal from "@/src/components/MapModal";
import { reportLocation, uploadFile } from "@/src/lib/api-client";

export interface SightingTarget {
  id: number;
  title: string;
}

// The "report a sighting" flow (map modal -> optional photo upload -> report-location),
// shared by every page that offers the action. Render `modal` once in the page.
export function useReportSighting() {
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<SightingTarget | null>(null);

  const open = (person: SightingTarget) => {
    setTarget(person);
    setIsOpen(true);
  };

  const handleSubmit = async (lat: number, lng: number, details: string, file: File | null) => {
    if (!target) return;

    try {
      const fileUrl = file ? await uploadFile(file) : null;
      await reportLocation(target.id, lat, lng, details, fileUrl);
      toast.success(fileUrl ? "Sighting reported. Thank you — the photo is being analysed." : "Sighting reported. Thank you.");
      setIsOpen(false);
      setTarget(null);
    } catch (error) {
      toast.error("The sighting could not be sent. Please try again.");
      console.error(error);
    }
  };

  const modal = (
    <MapModal isOpen={isOpen} onClose={() => setIsOpen(false)} onSubmit={handleSubmit} personName={target?.title || ""} />
  );

  return { open, modal };
}
