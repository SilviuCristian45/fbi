"use client";

import { useState, useEffect, DragEvent, useId } from "react";
import dynamic from "next/dynamic";
import { ImagePlus, Loader2, MapPin, Send, X } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Field, Textarea } from "./ui/Input";
import { Skeleton } from "./ui/Skeleton";
import { cn } from "../lib/cn";

const MapInner = dynamic(() => import("./MapInner"), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />
});

const ADDRESS_PREFIX = "Estimated address:";

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (lat: number, lng: number, details: string, fileUrl: File | null) => void | Promise<void>;
  personName: string;
}

export default function MapModal({ isOpen, onClose, onSubmit, personName }: MapModalProps) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [details, setDetails] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputId = useId();

  // State pentru efectul vizual la Drag & Drop
  const [isDragging, setIsDragging] = useState(false);

  // Reset la deschidere
  useEffect(() => {
    if (isOpen) {
        setPosition(null);
        setDetails("");
        setAddressLoading(false);
        setSelectedFile(null);
        setIsDragging(false);
        setSending(false);
    }
  }, [isOpen]);

  // Preview for the chosen photo (object URL released when it changes).
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  // Căutare adresă
  useEffect(() => {
    if (!position) return;
    const [lat, lng] = position;

    const fetchAddress = async () => {
        setAddressLoading(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();

            if (data && data.display_name) {
                const adresa = `${ADDRESS_PREFIX} ${data.display_name}\n\n`;
                setDetails(prev => adresa + (prev.includes(ADDRESS_PREFIX) ? prev.split("\n\n")[1] || "" : prev));
            }
        } catch (error) {
            console.error("Nu am putut găsi adresa:", error);
        } finally {
            setAddressLoading(false);
        }
    };

    const timeoutId = setTimeout(fetchAddress, 500);
    return () => clearTimeout(timeoutId);
  }, [position]);

  // --- DRAG AND DROP HANDLERS ---
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      // Validăm să fie doar imagine
      if (file.type.startsWith("image/")) {
        setSelectedFile(file);
      } else {
        alert("Please upload an image file (JPG, PNG, GIF).");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        // Validare suplimentară (deși input accept are image/*)
        if (file.type.startsWith("image/")) {
            setSelectedFile(file);
        }
    }
  };

  const handleSend = async () => {
    if (!position) return;
    setSending(true);
    try {
      await onSubmit(position[0], position[1], details, selectedFile);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={<>Report a sighting{personName && <span className="block text-base font-semibold text-muted">{personName}</span>}</>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={!position} loading={sending}>
            {!sending && <Send className="size-4" aria-hidden="true" />}
            Send report
          </Button>
        </>
      }
    >
        {/* Map Body */}
        <div className="relative h-72 w-full border-b border-border bg-subtle sm:h-80">
            <MapInner position={position} setPosition={setPosition} />
            {!position && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-[400] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg shadow-pop">
                    <MapPin className="size-4" aria-hidden="true" /> Tap the map where you saw them
                </div>
            )}
        </div>

        {/* Zona de Detalii */}
        <div className="grid gap-5 p-5">
            <p className="text-sm text-muted" aria-live="polite">
                {position
                  ? <>Location set: <span className="font-mono text-fg">{position[0].toFixed(5)}, {position[1].toFixed(5)}</span>{addressLoading && <span className="ml-2 inline-flex items-center gap-1"><Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" /> Looking up the address…</span>}</>
                  : "No location selected yet."}
            </p>

            <Field label="What did you see?" hint="When, where exactly, what they were wearing, direction of travel.">
                <Textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="E.g. I saw him leaving a shop on the corner, around 6 pm…"
                />
            </Field>

            {/* ZONA DE UPLOAD DRAG & DROP (DOAR IMAGINI) */}
            <div className="grid gap-1.5">
              <span className="text-sm font-semibold">Photo (optional)</span>
              <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "relative rounded-lg border-2 border-dashed transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-focus",
                    isDragging ? "border-primary bg-primary-soft" : "border-border hover:bg-subtle",
                  )}
              >
                  <input
                      id={fileInputId}
                      type="file"
                      className="sr-only"
                      accept="image/*" // Restricție doar imagini
                      onChange={handleFileSelect}
                  />
                  <label htmlFor={fileInputId} className="flex cursor-pointer items-center gap-4 p-4">
                      {selectedFile && previewUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                            <img src={previewUrl} alt="" className="size-16 shrink-0 rounded-md object-cover" />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{selectedFile.name}</span>
                              <span className="text-sm text-muted">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · click to replace</span>
                            </span>
                          </>
                      ) : (
                          <>
                            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-subtle text-muted">
                              <ImagePlus className="size-6" aria-hidden="true" />
                            </span>
                            <span>
                              <span className="block font-semibold">{isDragging ? "Drop the photo here" : "Drag a photo here or choose a file"}</span>
                              <span className="text-sm text-muted">JPG, PNG or GIF. It is compared automatically with the wanted list.</span>
                            </span>
                          </>
                      )}
                  </label>

                  {/* Buton ștergere peste zonă */}
                  {selectedFile && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedFile(null); }}
                        className="absolute right-2 top-2 grid size-8 place-items-center rounded-md text-muted hover:bg-alert-soft hover:text-alert"
                        aria-label="Remove photo"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                  )}
              </div>
            </div>
        </div>
    </Modal>
  );
}
