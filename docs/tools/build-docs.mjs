// Generates docs/html/ from the Markdown sources in docs/ (the Markdown is the
// source of truth; the HTML is gitignored and rebuilt by scripts/build-docs.sh).
//
//   docs/architecture.md  -> docs/html/architecture.html
//   docs/dev/*.md         -> docs/html/dev/*.html   (README.md -> index.html)
//   docs/prod/*.md        -> docs/html/prod/*.html
//   + docs/html/index.html and docs/html/assets/mermaid.min.js
//
// Each page is self-contained (inline CSS, images embedded as data URIs) except
// for Mermaid, which is loaded from the single local assets/mermaid.min.js.
// No CDN is used, so the pages work offline.

import { Marked } from "marked";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(TOOLS_DIR, "..");
const OUT_DIR = path.join(DOCS_DIR, "html");

// Navigation order (reading order); pages not listed here follow alphabetically
const ORDER = {
  dev: ["README.md", "local-setup.md", "environment.md", "keycloak.md", "migrations.md",
        "testing-face-recognition.md", "troubleshooting.md"],
  prod: ["README.md", "requirements.md", "dns-and-vps.md", "first-deploy.md", "ssl.md", "keycloak.md",
         "admin-consoles.md", "update-and-rollback.md", "backup-restore.md", "logging-monitoring.md",
         "security-checklist.md"],
};

const SECTIONS = [
  { key: "", title: "Overview", files: ["architecture.md"] },
  { key: "dev", title: "Development", files: listMarkdown("dev") },
  { key: "prod", title: "Production", files: listMarkdown("prod") },
];

function listMarkdown(dir) {
  const full = path.join(DOCS_DIR, dir);
  if (!fs.existsSync(full)) return [];
  const order = ORDER[dir] || [];
  const rank = (f) => (order.includes(f) ? order.indexOf(f) : order.length);
  const files = fs.readdirSync(full).filter((f) => f.endsWith(".md"));
  return files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((f) => `${dir}/${f}`);
}

const toPosix = (p) => p.split(path.sep).join("/");
const outName = (src) => src.replace(/(^|\/)README\.md$/, "$1index.md").replace(/\.md$/, ".html");
const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function slugify(text, used) {
  let base = text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s/g, "-") || "section"; // like GitHub: one hyphen per space
  let slug = base;
  for (let i = 1; used.has(slug); i++) slug = `${base}-${i}`;
  used.add(slug);
  return slug;
}

function plainText(tokens) {
  return (tokens || []).map((t) => (t.tokens ? plainText(t.tokens) : t.text ?? t.raw ?? "")).join("");
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml" };

// Read the first H1 of every page up front, for navigation titles
const allPages = SECTIONS.flatMap((s) => s.files);
const titles = Object.fromEntries(
  allPages.map((src) => {
    const md = fs.readFileSync(path.join(DOCS_DIR, src), "utf8");
    const m = md.match(/^#\s+(.+)$/m);
    return [src, m ? m[1].trim() : path.basename(src, ".md")];
  }),
);

function renderPage(src) {
  const srcDir = path.posix.dirname(src);
  const out = outName(src);
  const outDir = path.posix.dirname(out);
  const toc = [];
  const used = new Set();

  // Rewrite relative links: *.md -> *.html inside docs; other repo files are
  // re-relativized so they still resolve from docs/html/<section>/.
  const rewriteHref = (href) => {
    if (!href || /^([a-z]+:|#|\/)/i.test(href)) return href;
    const [target, hash] = href.split("#");
    const resolved = path.posix.normalize(path.posix.join(srcDir, target)); // relative to docs/
    let dest;
    if (resolved.endsWith(".md") && !resolved.startsWith("..")) {
      dest = path.posix.relative(outDir === "." ? "" : outDir, outName(resolved)) || path.posix.basename(outName(resolved));
    } else {
      // relative to docs/html/<outDir>
      dest = path.posix.relative(path.posix.join("html", outDir), resolved);
    }
    return hash !== undefined ? `${dest}#${hash}` : dest;
  };

  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const id = slugify(plainText(tokens), used);
        if (depth === 2 || depth === 3) toc.push({ depth, id, html: html.replace(/<a [^>]*>|<\/a>/g, "") });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${depth}>\n`;
      },
      code({ text, lang }) {
        if ((lang || "").trim() === "mermaid") return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
        return false;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const t = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${escapeHtml(rewriteHref(href))}"${t}>${text}</a>`;
      },
      image({ href, title, text }) {
        let src = href;
        if (href && !/^([a-z]+:|\/)/i.test(href)) {
          const file = path.join(DOCS_DIR, srcDir, href);
          const mime = MIME[path.extname(file).toLowerCase()];
          if (mime && fs.existsSync(file)) src = `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
        }
        const t = title ? ` title="${escapeHtml(title)}"` : "";
        return `<img src="${src}" alt="${escapeHtml(text)}"${t}>`;
      },
    },
  });

  const md = fs.readFileSync(path.join(DOCS_DIR, src), "utf8");
  const body = marked.parse(md);
  const depth = out.split("/").length - 1;
  const root = depth ? "../".repeat(depth) : "";

  const nav = SECTIONS.filter((s) => s.files.length)
    .map((s) => {
      const items = s.files
        .map((f) => {
          const href = root + outName(f);
          const cur = f === src ? ' class="current"' : "";
          return `<li><a href="${href}"${cur}>${escapeHtml(titles[f])}</a></li>`;
        })
        .join("");
      return `<div class="nav-section"><div class="nav-title">${s.title}</div><ul>${items}</ul></div>`;
    })
    .join("");
  const tocHtml = toc.length
    ? `<div class="nav-section"><div class="nav-title">On this page</div><ul class="toc">${toc
        .map((h) => `<li class="d${h.depth}"><a href="#${h.id}">${h.html}</a></li>`)
        .join("")}</ul></div>`
    : "";
  const hasMermaid = body.includes('class="mermaid"');

  return {
    out,
    html: pageShell({
      title: titles[src],
      body,
      sidebar: `<a class="home" href="${root}index.html">FBI Surveillance docs</a>${nav}${tocHtml}`,
      mermaidSrc: hasMermaid ? `${root}assets/mermaid.min.js` : null,
      source: `docs/${src}`,
    }),
  };
}

function pageShell({ title, body, sidebar, mermaidSrc, source }) {
  const mermaid = mermaidSrc
    ? `<script src="${mermaidSrc}"></script>
<script>
  mermaid.initialize({ startOnLoad: true, securityLevel: "strict",
    theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default" });
</script>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · FBI Surveillance docs</title>
<style>${CSS}</style>
</head>
<body>
<input type="checkbox" id="nav-toggle" hidden>
<label for="nav-toggle" class="nav-button">☰ Menu</label>
<nav class="sidebar">${sidebar}</nav>
<main>
<article>
${body}
</article>
<footer>Generated from <code>${escapeHtml(source)}</code> by <code>scripts/build-docs.sh</code>. Edit the Markdown, not this file.</footer>
</main>
${mermaid}
</body>
</html>
`;
}

const CSS = `
:root { --bg:#ffffff; --fg:#1f2328; --muted:#59636e; --border:#d1d9e0; --side:#f6f8fa; --link:#0969da; --code:#f6f8fa; --accent:#0969da; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#0d1117; --fg:#e6edf3; --muted:#9198a1; --border:#3d444d; --side:#151b23; --link:#4493f8; --code:#151b23; --accent:#4493f8; }
}
* { box-sizing: border-box; }
html { scroll-padding-top: 16px; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; display:flex; }
a { color:var(--link); text-decoration:none; } a:hover { text-decoration:underline; }
.sidebar { position:sticky; top:0; height:100vh; overflow-y:auto; width:280px; flex:none; background:var(--side); border-right:1px solid var(--border); padding:20px 16px; font-size:14px; }
.sidebar .home { display:block; font-weight:700; font-size:15px; color:var(--fg); margin-bottom:16px; }
.nav-section { margin-bottom:18px; }
.nav-title { text-transform:uppercase; font-size:11px; letter-spacing:.06em; color:var(--muted); font-weight:600; margin-bottom:6px; }
.sidebar ul { list-style:none; margin:0; padding:0; }
.sidebar li a { display:block; padding:3px 8px; border-radius:6px; color:var(--fg); }
.sidebar li a:hover { background:var(--border); text-decoration:none; }
.sidebar li a.current { background:var(--accent); color:#fff; }
.toc li.d3 a { padding-left:22px; color:var(--muted); }
main { flex:1; min-width:0; padding:32px 48px; }
article { max-width:900px; }
h1,h2,h3,h4 { line-height:1.25; margin:1.6em 0 .6em; position:relative; }
h1 { margin-top:0; font-size:2em; border-bottom:1px solid var(--border); padding-bottom:.3em; }
h2 { font-size:1.5em; border-bottom:1px solid var(--border); padding-bottom:.3em; }
.anchor { position:absolute; left:-1em; opacity:0; color:var(--muted); }
h1:hover .anchor,h2:hover .anchor,h3:hover .anchor,h4:hover .anchor { opacity:1; }
code { font:0.875em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:var(--code); padding:.15em .35em; border-radius:4px; }
pre { background:var(--code); border:1px solid var(--border); border-radius:6px; padding:14px 16px; overflow-x:auto; line-height:1.45; }
pre code { background:none; padding:0; font-size:13px; }
pre.mermaid { background:transparent; border:none; text-align:center; }
table { border-collapse:collapse; display:block; overflow-x:auto; margin:1em 0; }
th,td { border:1px solid var(--border); padding:6px 12px; text-align:left; vertical-align:top; }
th { background:var(--side); }
blockquote { margin:1em 0; padding:.2em 1em; border-left:4px solid var(--accent); color:var(--muted); background:var(--side); border-radius:0 6px 6px 0; }
img { max-width:100%; }
footer { margin-top:48px; padding-top:16px; border-top:1px solid var(--border); color:var(--muted); font-size:13px; max-width:900px; }
.nav-button { display:none; }
@media (max-width: 860px) {
  body { display:block; }
  .nav-button { display:block; position:sticky; top:0; z-index:2; background:var(--side); border-bottom:1px solid var(--border); padding:10px 16px; cursor:pointer; font-weight:600; }
  .sidebar { display:none; position:static; width:auto; height:auto; border-right:none; border-bottom:1px solid var(--border); }
  #nav-toggle:checked ~ .sidebar { display:block; }
  main { padding:20px 16px; }
  .anchor { display:none; }
}
`;

function indexPage() {
  const sections = SECTIONS.filter((s) => s.files.length)
    .map(
      (s) =>
        `<h2>${s.title}</h2><ul>${s.files
          .map((f) => `<li><a href="${outName(f)}">${escapeHtml(titles[f])}</a></li>`)
          .join("")}</ul>`,
    )
    .join("");
  const nav = SECTIONS.filter((s) => s.files.length)
    .map(
      (s) =>
        `<div class="nav-section"><div class="nav-title">${s.title}</div><ul>${s.files
          .map((f) => `<li><a href="${outName(f)}">${escapeHtml(titles[f])}</a></li>`)
          .join("")}</ul></div>`,
    )
    .join("");
  return pageShell({
    title: "Documentation",
    body: `<h1>FBI Surveillance: documentation</h1><p>Generated from the Markdown files in <code>docs/</code>.</p>${sections}`,
    sidebar: `<a class="home" href="index.html">FBI Surveillance docs</a>${nav}`,
    mermaidSrc: null,
    source: "docs/",
  });
}

// --- build ------------------------------------------------------------------
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT_DIR, "assets"), { recursive: true });
fs.copyFileSync(
  path.join(TOOLS_DIR, "node_modules", "mermaid", "dist", "mermaid.min.js"),
  path.join(OUT_DIR, "assets", "mermaid.min.js"),
);
fs.writeFileSync(path.join(OUT_DIR, "index.html"), indexPage());
let count = 0;
for (const src of allPages) {
  const { out, html } = renderPage(src);
  const dest = path.join(OUT_DIR, out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
  count++;
  console.log(`  ${toPosix(path.relative(DOCS_DIR, dest))}`);
}
console.log(`Built ${count} pages + index.html into ${toPosix(path.relative(path.resolve(DOCS_DIR, ".."), OUT_DIR))}/`);
