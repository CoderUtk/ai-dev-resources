#!/usr/bin/env node
/**
 * Renders AI_Resource_Matrix.md into a full-width HTML page for GitHub Pages.
 *
 * The Markdown file stays the single source of truth — this only reads it.
 * Markdown on github.com is locked to a ~1012px container and has its CSS
 * stripped, which is why the table feels cramped there. Here we control the
 * page, so the table gets the full viewport, a sticky header row, a sticky
 * category column, and real dotted rules between entries in a cell.
 *
 * Usage: node scripts/build-site.mjs [source.md] [outDir]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const source = process.argv[2] ?? "AI_Resource_Matrix.md";
const outDir = process.argv[3] ?? "site";

/**
 * Where this repo lives, so the header link survives a rename or transfer.
 * Actions sets GITHUB_REPOSITORY; locally we read the git remote instead.
 * Returns null if neither is available, in which case the link is omitted.
 */
function repoUrl() {
  const { GITHUB_REPOSITORY, GITHUB_SERVER_URL } = process.env;
  if (GITHUB_REPOSITORY) {
    return `${GITHUB_SERVER_URL ?? "https://github.com"}/${GITHUB_REPOSITORY}`;
  }
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const m = remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return m ? `https://github.com/${m[1]}` : null;
  } catch {
    return null;
  }
}

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Markdown inline syntax -> HTML, for one entry (no <br> left at this point). */
function inline(text) {
  let s = escapeHtml(text.trim());
  s = s.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, alt, src) => `<img class="badge" src="${src}" alt="${alt}" loading="lazy">`,
  );
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, label, href) => `<a href="${href}" rel="noopener">${label}</a>`,
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s;
}

/** One table cell -> list of entry strings (empty for "—"). */
function splitCell(cell) {
  const raw = cell.trim();
  if (!raw || raw === "—" || raw === "-") return [];
  return raw
    .split(/<br\s*\/?>\s*(?:┄+\s*<br\s*\/?>)?/i)
    .map((p) => p.replace(/^┄+$/, "").trim())
    .filter(Boolean);
}

function parseTable(md) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith("|"));
  if (start === -1) throw new Error(`No Markdown table found in ${source}`);

  const block = [];
  for (let i = start; i < lines.length && lines[i].trim().startsWith("|"); i++) {
    block.push(lines[i].trim());
  }
  const cells = (line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|");

  const headers = cells(block[0]).map((c) => c.trim());
  const rows = block.slice(2).map((line) => cells(line).map(splitCell));

  const title = (md.match(/^#\s+(.+)$/m) ?? [, "Resource Matrix"])[1].trim();
  const intro = (md.match(/^>\s+(.+)$/m) ?? [, ""])[1].trim();
  return { headers, rows, title, intro };
}

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #1f2328; --muted: #656d76;
  --rule: #d0d7de; --head-bg: #f6f8fa; --row-hover: #f6f8fa;
  --accent: #0969da; --border: #d8dee4;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1;
    --rule: #30363d; --head-bg: #161b22; --row-hover: #161b22;
    --accent: #4493f8; --border: #30363d;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
header { padding: 28px 24px 16px; border-bottom: 1px solid var(--border); }
h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: -0.01em; }
.intro { margin: 0; color: var(--muted); font-size: 13px; max-width: 90ch; }
.meta { margin-top: 10px; color: var(--muted); font-size: 12px; }
.meta a { color: var(--accent); }
.wrap { overflow-x: auto; padding: 0 0 64px; }
table { border-collapse: separate; border-spacing: 0; width: 100%; }
th, td {
  text-align: left; vertical-align: top; padding: 12px 14px;
  border-bottom: 1px solid var(--border); font-size: 14px;
}
thead th {
  position: sticky; top: 0; z-index: 3;
  background: var(--head-bg); font-size: 12px; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--muted); white-space: nowrap;
  border-bottom: 1px solid var(--border);
}
tbody tr:hover td, tbody tr:hover th[scope="row"] { background: var(--row-hover); }
th[scope="row"] {
  position: sticky; left: 0; z-index: 2; background: var(--bg);
  min-width: 240px; border-right: 1px solid var(--border); font-weight: 600;
}
thead th:first-child { left: 0; z-index: 4; background: var(--head-bg); border-right: 1px solid var(--border); }
td { min-width: 210px; }
ul.stack { margin: 0; padding: 0; list-style: none; }
ul.stack li { padding: 7px 0; }
ul.stack li + li { border-top: 1px dotted var(--rule); }
ul.stack li:first-child { padding-top: 0; }
ul.stack li:last-child { padding-bottom: 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
img.badge { vertical-align: middle; margin-left: 6px; height: 18px; }
.empty { color: var(--muted); }
@media (max-width: 700px) {
  th[scope="row"] { min-width: 170px; }
  header { padding: 20px 16px 12px; }
}
`;

function renderCell(entries) {
  if (!entries.length) return '<span class="empty">—</span>';
  return `<ul class="stack">${entries.map((e) => `<li>${inline(e)}</li>`).join("")}</ul>`;
}

function renderPage({ headers, rows, title, intro }) {
  const total = rows.reduce((n, r) => n + r.slice(1).reduce((m, c) => m + c.length, 0), 0);
  const built = new Date().toISOString().slice(0, 10);
  const repo = repoUrl();

  const head = headers
    .map((h, i) => `<th${i === 0 ? "" : ""}>${inline(h.replace(/\s*\(Y-Axis\)\s*↓/, ""))}</th>`)
    .join("");

  const body = rows
    .map((cells) => {
      const label = cells[0].length ? inline(cells[0][0]) : "";
      const rest = cells.slice(1).map((c) => `<td>${renderCell(c)}</td>`).join("");
      return `<tr><th scope="row">${label}</th>${rest}</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(intro.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")).slice(0, 200)}">
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <p class="intro">${inline(intro)}</p>
  <p class="meta">${rows.length} categories · ${total} entries · built ${built}${
    repo ? ` ·\n    <a href="${repo}" rel="noopener">source on GitHub</a>` : ""
  }</p>
</header>
<div class="wrap">
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>
${body}
    </tbody>
  </table>
</div>
</body>
</html>
`;
}

const md = await readFile(source, "utf8");
const parsed = parseTable(md);
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}/index.html`, renderPage(parsed));

const entries = parsed.rows.reduce((n, r) => n + r.slice(1).reduce((m, c) => m + c.length, 0), 0);
console.log(`Built ${outDir}/index.html — ${parsed.rows.length} categories, ${entries} entries`);
