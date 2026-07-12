# Auto-discovering blog index with pagination, tags, search

## Problem

`index.html` currently lists Gophernment blog posts as hand-written `<a class="post-card">` blocks. Every new file in `_content/blog/` requires manually editing `index.html` too. This doesn't scale, has no pagination, and has no way to filter by tag or search.

## Goals

- Adding a new `.md` file to `_content/blog/` is enough — no manual `index.html` edit.
- Paginate the post list (URL-based, deep-linkable).
- Filter by tag and free-text search (title/description/tags), combined on one page.

## Non-goals

- Full-text search across article bodies.
- Changing the dev.to archive section (`<details class="archive">`) — untouched.
- Changing how individual posts render (`blog/post.html` + `assets/markdown.js`) — untouched.

## Constraints

- Static site, no server, no build tool in the repo today (deliberate — see prior session history).
- GitHub Pages is configured as "Deploy from branch" (no existing Pages Actions workflow), and this cannot be changed by the agent — it requires a manual settings change in the GitHub UI. So the generated index must be committed into the branch GitHub Pages already serves, not deployed as a separate Actions artifact.

## Architecture

```
push to main (touches _content/blog/**)
  -> GitHub Actions: scripts/build-index.mjs scans _content/blog/*.md
  -> writes index.json at repo root
  -> Actions commits index.json back to main (skipped if the triggering
     commit was already the bot's own, to avoid an infinite loop)
  -> reader opens index.html -> assets/blog-index.js fetches /index.json
     -> renders list filtered/paginated per URL query params
```

## Frontmatter schema change

Add a required `description` field (short excerpt, used for search and card display) to every post's frontmatter, alongside the existing `title`, `date`, `tags`:

```yaml
---
title: "..."
date: YYYY-MM-DD
tags: [tag1, tag2]
description: "One or two sentence excerpt shown on the card and matched by search"
---
```

The 4 existing posts under `_content/blog/` need this field backfilled. `AGENTS.md`'s frontmatter contract (section 5) needs updating to document the new required field.

## Components

### `scripts/build-index.mjs`

Node script (no external dependencies — reuses the same frontmatter-parsing logic as `assets/markdown.js`, kept in sync manually since there's no shared module system here).

- Reads all `_content/blog/*.md`.
- Parses frontmatter: `title`, `date`, `tags`, `description`.
- Slug = filename without `.md`.
- Skips (with a warning printed to stdout, non-fatal) any file missing `title` or `date`.
- Sorts by `date` descending.
- Writes `index.json` at repo root:

```json
[
  {
    "slug": "2026-07-12-go-fix-modernize",
    "title": "go fix ตัวใหม่ใน Go 1.26: ...",
    "date": "2026-07-12",
    "tags": ["go", "tooling", "static-analysis", "ai"],
    "description": "..."
  }
]
```

### `.github/workflows/build-index.yml`

- Trigger: `push` to `main` with `paths: ["_content/blog/**"]`.
- Guard against the infinite-loop case: if `github.event.head_commit.author.name` (or message) indicates the previous run's bot commit, skip. Concretely: bot commits use a fixed message prefix (`chore: rebuild blog index`); the job's first step checks `github.event.head_commit.message` and exits early if it starts with that prefix.
- Steps: checkout, run `node scripts/build-index.mjs`, `git diff --quiet index.json || (git add index.json && git commit -m "chore: rebuild blog index" && git push)`.

### `assets/blog-index.js`

Loaded by `index.html` only (not `blog/post.html`).

- `fetchIndex()` — fetch `/index.json` once, cache in memory for the page's lifetime.
- `parseQuery()` / `updateQuery(params)` — read/write `?page=`, `?tag=`, `?q=` via `URLSearchParams` + `history.pushState` (no reload).
- `filterPosts(posts, {tag, q})` — `tag` exact match against a post's `tags` array; `q` case-insensitive substring match against `title`, `description`, and joined `tags`.
- `paginate(posts, page, pageSize=6)` — slice; clamps `page` into `[1, totalPages]`.
- `render()` — orchestrates the above, writes into `#blog-list`, `#tag-filters`, `#pagination`, and a search `<input>`. Re-renders on input (debounced ~200ms) and on `popstate`.

### `index.html` changes

Replace the hand-written `<a class="post-card">` entries inside `<section class="featured">` with:

```html
<div id="blog-controls">
  <input id="blog-search" type="search" placeholder="ค้นหาบทความ...">
  <div id="tag-filters"></div>
</div>
<div id="blog-list"></div>
<nav id="pagination"></nav>
<script src="/assets/blog-index.js?v=1"></script>
<script>renderBlogIndex();</script>
```

Everything below (`<details class="archive">` dev.to section) stays as-is.

## Error handling

- `index.json` fetch fails or 404s → `#blog-list` shows: "โหลดรายการบทความไม่สำเร็จ — อ่านบทความได้ที่ dev.to ด้านล่าง" (points at the still-present archive section).
- Filtered/searched result is empty → "ไม่พบบทความที่ตรงกับคำค้นหา".
- `?page=` out of range (non-numeric, ≤0, or beyond last page) → clamp to the nearest valid page rather than erroring.
- `build-index.mjs` encountering a post with missing `title`/`date` → skip that post, print a warning, continue (doesn't fail the whole build over one bad file).

## Testing

- `node scripts/build-index.mjs` run directly against the real `_content/blog/*.md` files; inspect the resulting `index.json` for correctness (4 posts, correct sort order, all fields present).
- `python3 -m http.server` + manual browser check: pagination controls, tag filter, search, and the empty/error states (simulate by temporarily renaming `index.json`).
- No automated JS test harness in this repo — verification is manual browser + `curl` checks, consistent with how `assets/markdown.js` was verified earlier in this project.

## Rollout notes

- This is being implemented directly (design approved in conversation; user explicitly asked to skip the written-spec review round-trip and proceed to implementation).
- `AGENTS.md` needs its frontmatter contract section updated to include `description`.
