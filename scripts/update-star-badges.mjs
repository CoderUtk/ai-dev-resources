#!/usr/bin/env node
/**
 * Keeps a GitHub star badge attached to every GitHub repo link in the matrix.
 *
 * The badges themselves are live (shields.io re-fetches on every page load), so
 * this script does not write star numbers into the file. What it does is make
 * sure that:
 *   1. every `[Name](https://github.com/owner/repo)` link has a badge after it,
 *   2. every badge points at the same owner/repo as the link next to it,
 *   3. links to repos that don't exist get flagged instead of badged.
 *
 * So you can paste a bare GitHub link into a cell and the badge appears on the
 * next run.
 *
 * Usage: node scripts/update-star-badges.mjs [--check] [file...]
 *   --check   exit 1 if anything would change, write nothing (for CI dry runs)
 */

import { readFile, writeFile } from "node:fs/promises";
import { appendFile } from "node:fs/promises";

const DEFAULT_FILES = ["AI_Resource_Matrix.md"];
const BADGE_STYLE = "style=flat&label=&color=444";

// github.com paths that look like `owner/repo` but aren't repos.
const RESERVED_OWNERS = new Set([
  "topics", "orgs", "sponsors", "marketplace", "features", "collections",
  "about", "pricing", "settings", "apps", "users", "search", "explore",
  "trending", "notifications", "login", "join", "enterprise", "readme",
]);

// [label](https://github.com/owner/repo) optionally followed by an existing badge.
const LINK_RE = new RegExp(
  String.raw`\[([^\]]+)\]\(https://github\.com/([A-Za-z0-9][A-Za-z0-9-]*)/([A-Za-z0-9._-]+?)/?\)` +
    String.raw`(\s*!\[[^\]]*\]\(https://img\.shields\.io/github/stars/[^)]*\))?`,
  "g",
);

const token = process.env.GITHUB_TOKEN ?? "";
const checkOnly = process.argv.includes("--check");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const repoCache = new Map();

/** @returns {Promise<{ok: boolean, stars: number|null, reason: string|null}>} */
async function lookupRepo(slug) {
  if (repoCache.has(slug)) return repoCache.get(slug);

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ai-dev-resources-star-badges",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let result;
  try {
    const res = await fetch(`https://api.github.com/repos/${slug}`, { headers });
    if (res.status === 404) {
      result = { ok: false, stars: null, reason: "not found (renamed or deleted?)" };
    } else if (res.status === 403 || res.status === 429) {
      // Rate limited: assume the repo is fine rather than stripping badges.
      result = { ok: true, stars: null, reason: "rate limited, skipped validation" };
    } else if (!res.ok) {
      result = { ok: true, stars: null, reason: `HTTP ${res.status}, skipped validation` };
    } else {
      const body = await res.json();
      result = { ok: true, stars: body.stargazers_count ?? null, reason: null };
    }
  } catch (err) {
    result = { ok: true, stars: null, reason: `request failed: ${err.message}` };
  }

  repoCache.set(slug, result);
  return result;
}

function badgeFor(owner, repo) {
  return ` ![★](https://img.shields.io/github/stars/${owner}/${repo}?${BADGE_STYLE})`;
}

async function processFile(path) {
  const original = await readFile(path, "utf8");

  // Collect every match first so the API calls can run before rewriting.
  const matches = [...original.matchAll(LINK_RE)];
  const slugs = new Set();
  for (const [, , owner, repo] of matches) {
    if (!RESERVED_OWNERS.has(owner.toLowerCase())) slugs.add(`${owner}/${repo}`);
  }
  await Promise.all([...slugs].map(lookupRepo));

  const added = [];
  const fixed = [];
  const broken = [];
  const notes = [];

  const updated = original.replace(LINK_RE, (whole, label, owner, repo, existingBadge) => {
    if (RESERVED_OWNERS.has(owner.toLowerCase())) return whole;

    const slug = `${owner}/${repo}`;
    const link = `[${label}](https://github.com/${slug})`;
    const info = repoCache.get(slug);

    if (info?.reason && info.ok) notes.push(`${slug}: ${info.reason}`);

    if (!info?.ok) {
      // Broken repo: don't badge it, and drop a stale badge if one is there.
      broken.push(`${slug} — ${info?.reason ?? "unknown error"} (linked as "${label}")`);
      return link;
    }

    const wanted = badgeFor(owner, repo);
    if (!existingBadge) {
      added.push(`${slug}${info.stars != null ? ` (${info.stars.toLocaleString()} ★)` : ""}`);
      return link + wanted;
    }
    if (existingBadge !== wanted) {
      fixed.push(`${slug} — badge pointed elsewhere`);
      return link + wanted;
    }
    return whole;
  });

  return { path, original, updated, added, fixed, broken, notes };
}

async function summarize(results) {
  const lines = ["## Star badge sync", ""];
  let changed = false;

  for (const r of results) {
    if (r.updated !== r.original) changed = true;
    const touched = r.added.length + r.fixed.length;
    lines.push(`**${r.path}** — ${touched} badge(s) updated, ${r.broken.length} broken link(s)`, "");
    const section = (title, items) => {
      if (!items.length) return;
      lines.push(`<details><summary>${title} (${items.length})</summary>`, "");
      for (const i of items) lines.push(`- ${i}`);
      lines.push("", "</details>", "");
    };
    section("Badges added", r.added);
    section("Badges corrected", r.fixed);
    section("Broken repo links", r.broken);
    section("Notes", r.notes);
  }

  if (!changed) lines.push("_No changes needed._");

  const text = lines.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, text + "\n");
  }
}

const targets = files.length ? files : DEFAULT_FILES;
const results = [];
for (const path of targets) results.push(await processFile(path));

for (const r of results) {
  for (const b of r.broken) console.log(`::warning file=${r.path}::Broken GitHub link — ${b}`);
}

const anyChanged = results.some((r) => r.updated !== r.original);

if (checkOnly) {
  await summarize(results);
  process.exit(anyChanged ? 1 : 0);
}

for (const r of results) {
  if (r.updated !== r.original) await writeFile(r.path, r.updated);
}
await summarize(results);
