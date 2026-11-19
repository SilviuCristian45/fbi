// Shared mock data and helpers for the static direction previews (not app code).
// All people below are fictional sample data.

(function () {
  const params = new URLSearchParams(location.search);
  if (params.get("theme")) document.documentElement.dataset.theme = params.get("theme");
})();

window.MOCK = {
  people: [
    { id: 1042, name: "Daniel R. Mercer", subject: "Criminal Enterprise", reward: "$100,000", status: "suspect", sightings: 6, tone: 0 },
    { id: 1043, name: "Unknown Subject — Riverside", subject: "Violent Crime", reward: "$20,000", status: "pending", sightings: 3, tone: 1 },
    { id: 1044, name: "Elena V. Sorensen", subject: "Cyber", reward: "", status: "completed", sightings: 1, tone: 2 },
    { id: 1045, name: "Marcus T. Hale", subject: "Fraud", reward: "$50,000", status: "completed", sightings: 0, tone: 3 },
    { id: 1046, name: "Ana-Maria Kessler", subject: "Kidnapping", reward: "$25,000", status: "pending", sightings: 2, tone: 4 },
    { id: 1047, name: "Victor L. Osei", subject: "Terrorism", reward: "$5,000,000", status: "completed", sightings: 0, tone: 5 },
    { id: 1048, name: "Unknown Subject — Bank Robbery", subject: "Violent Crime", reward: "$10,000", status: "suspect", sightings: 4, tone: 6 },
    { id: 1049, name: "Ruth J. Calloway", subject: "Fraud", reward: "", status: "completed", sightings: 1, tone: 7 },
  ],
  feed: [
    { time: "14:32", who: "agent.ionescu", what: "Sighting reported", person: "Daniel R. Mercer", place: "Bucharest, Sector 2", status: "suspect", conf: 87.4 },
    { time: "14:05", who: "m.popa", what: "Sighting reported", person: "Unknown Subject — Riverside", place: "Cluj-Napoca", status: "pending" },
    { time: "13:51", who: "AI worker", what: "Analysis finished", person: "Elena V. Sorensen", place: "Iași", status: "completed" },
    { time: "12:18", who: "d.stan", what: "Sighting reported", person: "Unknown Subject — Bank Robbery", place: "Brașov", status: "suspect", conf: 81.2 },
    { time: "11:02", who: "AI worker", what: "Analysis finished", person: "Ruth J. Calloway", place: "Timișoara", status: "completed" },
  ],
  sightings: [
    [44.4396, 26.1157], [44.4268, 26.1025], [44.4479, 26.0866], [44.4101, 26.1308], [44.4612, 26.1480], [44.4325, 26.0583],
  ],
  points: [
    { ll: [44.4396, 26.1157], status: "suspect" }, [46.7712, 23.6236, "pending"], [47.1585, 27.6014, "completed"],
    [45.6427, 25.5887, "suspect"], [45.7489, 21.2087, "completed"], [44.3302, 23.7949, "pending"],
  ].map((p) => (Array.isArray(p) ? { ll: [p[0], p[1]], status: p[2] } : p)),
  activity: [3, 5, 2, 8, 6, 11, 7],
  days: ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"],
};

// Neutral placeholder portrait: head-and-shoulders silhouette on a flat tone.
window.portrait = function (tone = 0, opts = {}) {
  const dark = document.documentElement.dataset.theme === "dark";
  const bgs = opts.bgs || (dark ? ["#3A3833", "#333A42", "#3B3540", "#363D33", "#403830", "#30383E", "#3A352E", "#353A42"] : null) || ["#D9D4CA", "#CFD6DD", "#D8D2D9", "#D3D9CF", "#DDD5CC", "#CCD3D8", "#D6D0C6", "#D2D6DC"];
  const fg = opts.fg || (dark ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.28)");
  const bg = bgs[tone % bgs.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400' preserveAspectRatio='xMidYMid slice'><rect width='300' height='400' fill='${bg}'/><circle cx='150' cy='150' r='62' fill='${fg}'/><path d='M40 400c0-80 50-130 110-130s110 50 110 130z' fill='${fg}'/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
};

window.initials = (name) => name.replace(/—.*/, "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("");

// Leaflet map with a tile style and custom divIcon markers.
window.makeMap = function (el, { tiles, center = [45.9, 24.9], zoom = 6, markerHtml, points = MOCK.points, route = false, interactive = true }) {
  const map = L.map(el, { zoomControl: interactive, attributionControl: true, scrollWheelZoom: false, dragging: interactive });
  L.tileLayer(tiles.url, { attribution: tiles.attribution, subdomains: "abc", maxZoom: 19 }).addTo(map);
  const latlngs = [];
  points.forEach((p, i) => {
    latlngs.push(p.ll);
    L.marker(p.ll, { icon: L.divIcon({ className: "", html: markerHtml(p, i), iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map);
  });
  if (route) L.polyline(latlngs, route).addTo(map);
  if (route) map.fitBounds(latlngs, { padding: [30, 30] }); else map.setView(center, zoom);
  return map;
};

// One provider (OSM, already used by the app); each direction styles the tile pane with CSS filters.
const OSM = { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors" };
window.TILES = { positron: OSM, darkMatter: OSM, voyager: OSM };
window.isDark = () => document.documentElement.dataset.theme === "dark";
