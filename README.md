# ai-dev-resources

A curated matrix of AI and Claude development resources — 29 categories, 98 entries — organised by what you're trying to do (rows) against how the tool ships (columns: MCP, Website/SaaS, Agent/Plugin, Skill/Config, CLI, Code Repo).

## Browse

**→ [coderutk.github.io/ai-dev-resources](https://coderutk.github.io/ai-dev-resources/)** — full-width table with a sticky header and category column. Easier to scan than the Markdown, which GitHub renders in a narrow fixed-width container.

Or read the source table directly: **[AI_Resource_Matrix.md](AI_Resource_Matrix.md)**.

## Adding a resource

Edit [AI_Resource_Matrix.md](AI_Resource_Matrix.md) — it is the single source of truth. Drop the link into the cell where it belongs, separating it from any neighbours with `<br>┄┄┄┄┄┄┄┄<br>`:

```markdown
[Some Tool](https://github.com/owner/repo)
```

You don't need to add a star badge. On push, CI attaches one, and rebuilds the site.

## Automation

[`.github/workflows/matrix.yml`](.github/workflows/matrix.yml) runs on every push that touches the matrix, weekly on Mondays, and on demand:

- **[`scripts/update-star-badges.mjs`](scripts/update-star-badges.mjs)** — adds a star badge to any GitHub link missing one, corrects badges that drifted from the link beside them, skips org and topic URLs, and flags dead repos as build warnings. Star counts themselves are live [shields.io](https://shields.io) images, so they never go stale.
- **[`scripts/build-site.mjs`](scripts/build-site.mjs)** — renders the Markdown table into `site/index.html` and deploys it to GitHub Pages. The generated output is not committed.

Both run standalone too:

```bash
node scripts/update-star-badges.mjs   # --check to dry-run
node scripts/build-site.mjs           # writes site/index.html
```
