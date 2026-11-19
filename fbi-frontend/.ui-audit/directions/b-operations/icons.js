// Minimal stroke icons (lucide-style paths) and the rail / mobile tab bar for direction B.
const ICON = {
  overview: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  cases: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 11l2 2 4-4"/>',
  saved: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  location: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  reports: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const NAV = [["overview", "Overview"], ["cases", "Cases"], ["saved", "Saved"], ["location", "My location"], ["reports", "Reports"], ["stats", "Statistics"]];

function renderNav(current) {
  document.getElementById("rail").innerHTML = '<div class="logo">S</div>' +
    NAV.map(([k, l]) => `<a href="#" title="${l}" aria-label="${l}" ${k === current ? 'aria-current="page"' : ""}>${svg(k)}</a>`).join("");
  document.getElementById("tabbar").innerHTML =
    NAV.filter(([k]) => k !== "stats").map(([k, l]) => `<a href="#" ${k === current ? 'aria-current="page"' : ""}>${svg(k)}<span>${l.replace("My location", "Location")}</span></a>`).join("");
}
