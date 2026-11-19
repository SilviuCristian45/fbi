// Renders a light and a dark panel with swatches, type specimen and components.
// Each direction's system.html defines window.SYSTEM = { tokens: [...], fonts: [...], components: "<html>" }.
(function () {
  const S = window.SYSTEM;
  const root = document.getElementById("system");
  root.innerHTML = ["light", "dark"].map((t) => `
    <section class="theme-${t} sys-panel">
      <div class="sys-label">${t === "light" ? "Light" : "Dark"}</div>
      <div class="sys-swatches">${S.tokens.map((n) => `<div class="sys-sw"><i style="background:var(--${n})"></i><b>--${n}</b><code data-var="${n}"></code></div>`).join("")}</div>
      <div class="sys-type">${S.fonts.map((f) => `<div><div class="sys-meta">${f.label}</div><div style="${f.style}">${f.sample}</div></div>`).join("")}</div>
      <div class="sys-comp">${S.components}</div>
    </section>`).join("");
  root.querySelectorAll(".sys-panel").forEach((panel) => {
    const cs = getComputedStyle(panel);
    panel.querySelectorAll("code[data-var]").forEach((c) => (c.textContent = cs.getPropertyValue("--" + c.dataset.var).trim()));
  });
})();
