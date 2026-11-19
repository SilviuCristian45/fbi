import L from "leaflet";

export type PinTone = "primary" | "alert" | "pending" | "muted";

// Teardrop pin drawn in CSS (.map-pin in globals.css): no marker images, no CDN.
// The rotated square's sharp corner ends ~27px below the top, so that is the anchor.
export function pinIcon(tone: PinTone = "primary") {
  return L.divIcon({
    className: "",
    html: `<span class="map-pin" data-tone="${tone}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 27],
    popupAnchor: [0, -26],
  });
}

// Small dot for intermediate route points.
export const dotIcon = L.divIcon({
  className: "",
  html: '<span class="map-dot"></span>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  popupAnchor: [0, -8],
});
