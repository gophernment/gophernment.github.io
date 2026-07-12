# Auto-discovering Blog Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `index.html` discover `_content/blog/*.md` posts automatically (no manual edit per post), with URL-based pagination, tag filtering, and search — driven by a GitHub Actions-generated `index.json`.

**Architecture:** A Node script (`scripts/build-index.mjs`) scans `_content/blog/*.md`, parses frontmatter, and writes `index.json` at the repo root. A GitHub Actions workflow runs this script on every push touching `_content/blog/**` and commits the result back to `main` (GitHub Pages here is "Deploy from branch", so the generated file must live in the branch it serves). A new browser script (`assets/blog-index.js`) fetches `/index.json` once and renders a paginated, filterable, searchable post list into `index.html`, driven entirely by URL query params (`?page=`, `?tag=`, `?q=`) so results are deep-linkable.

**Tech Stack:** Plain Node.js (`node:fs`, `node:test`, `node:assert/strict` — no npm dependencies), plain browser JS (no framework, matches `assets/markdown.js`'s existing style), GitHub Actions.

## Global Constraints

- No external npm dependencies — this repo has no `package.json` and shouldn't gain one. Use only Node built-ins.
- Frontmatter parsing logic in `scripts/build-index.mjs` must stay behaviorally identical to `parseFrontmatter` in `assets/markdown.js` (same regex approach) — there's no shared module system between the Node build script and the browser scripts here, so this is kept in sync by hand, not by import.
- `assets/blog-index.js` is loaded via plain `<script src=...>` (no `type="module"`), consistent with `assets/markdown.js` — functions are defined as global functions, not exported.
- Every post's frontmatter must include `description` going forward (spec: `docs/superpowers/specs/2026-07-12-auto-blog-index-design.md`).
- Pagination page size: 6 posts per page.
- Search matches against `title`, `description`, and `tags` only — not article body text.

---

### Task 1: `scripts/build-index.mjs` — scan posts, write `index.json`

**Files:**
- Create: `scripts/build-index.mjs`
- Create: `scripts/build-index.test.mjs`

**Interfaces:**
- Produces: `parseFrontmatter(text: string) -> { meta: object, body: string }` (exported)
- Produces: `buildIndex(blogDir: string) -> Array<{slug, title, date, tags, description}>` (exported)
- Produces (CLI side effect when run directly): writes `index.json` at the repo root, one JSON array, sorted by `date` descending (ties broken by `slug` descending), skipping any post missing `title` or `date` (with a `console.warn`).

- [ ] **Step 1: Write the failing test**

Create `scripts/build-index.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter, buildIndex } from "./build-index.mjs";

test("parseFrontmatter extracts title, date, tags, description", () => {
  const text = [
    "---",
    'title: "Hello"',
    "date: 2026-01-02",
    "tags: [a, b]",
    'description: "desc"',
    "---",
    "",
    "Body text",
  ].join("\n");
  const { meta, body } = parseFrontmatter(text);
  assert.equal(meta.title, "Hello");
  assert.equal(meta.date, "2026-01-02");
  assert.deepEqual(meta.tags, ["a", "b"]);
  assert.equal(meta.description, "desc");
  assert.equal(body.trim(), "Body text");
});

test("buildIndex sorts by date descending and skips posts missing title/date", () => {
  const dir = mkdtempSync(join(tmpdir(), "blog-test-"));
  writeFileSync(
    join(dir, "2026-01-01-old.md"),
    '---\ntitle: "Old"\ndate: 2026-01-01\ntags: [go]\ndescription: "old post"\n---\nbody'
  );
  writeFileSync(
    join(dir, "2026-02-01-new.md"),
    '---\ntitle: "New"\ndate: 2026-02-01\ntags: [ai]\ndescription: "new post"\n---\nbody'
  );
  writeFileSync(
    join(dir, "2026-03-01-broken.md"),
    "---\ntags: [x]\n---\nno title or date"
  );

  const posts = buildIndex(dir);

  assert.equal(posts.length, 2);
  assert.equal(posts[0].slug, "2026-02-01-new");
  assert.equal(posts[1].slug, "2026-01-01-old");
  assert.deepEqual(posts[0].tags, ["ai"]);
  assert.equal(posts[0].description, "new post");

  rmSync(dir, { recursive: true, force: true });
});

test("buildIndex breaks same-date ties by slug descending", () => {
  const dir = mkdtempSync(join(tmpdir(), "blog-test-"));
  writeFileSync(
    join(dir, "2026-07-12-aaa.md"),
    '---\ntitle: "AAA"\ndate: 2026-07-12\ntags: []\ndescription: "a"\n---\nbody'
  );
  writeFileSync(
    join(dir, "2026-07-12-zzz.md"),
    '---\ntitle: "ZZZ"\ndate: 2026-07-12\ntags: []\ndescription: "z"\n---\nbody'
  );

  const posts = buildIndex(dir);

  assert.equal(posts[0].slug, "2026-07-12-zzz");
  assert.equal(posts[1].slug, "2026-07-12-aaa");

  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/`
Expected: FAIL — `Cannot find module './build-index.mjs'` (the module doesn't exist yet).

- [ ] **Step 3: Write `scripts/build-index.mjs`**

```js
#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    if (key === "tags") {
      val = val
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      val = val.replace(/^"(.*)"$/, "$1");
    }
    meta[key] = val;
  }
  return { meta, body: m[2] };
}

export function buildIndex(blogDir) {
  const files = readdirSync(blogDir).filter((f) => f.endsWith(".md"));
  const posts = [];
  for (const file of files) {
    const text = readFileSync(join(blogDir, file), "utf8");
    const { meta } = parseFrontmatter(text);
    if (!meta.title || !meta.date) {
      console.warn(`skipping ${file}: missing title or date`);
      continue;
    }
    posts.push({
      slug: file.replace(/\.md$/, ""),
      title: meta.title,
      date: meta.date,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      description: meta.description || "",
    });
  }
  posts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0;
  });
  return posts;
}

function main() {
  const posts = buildIndex("_content/blog");
  writeFileSync("index.json", JSON.stringify(posts, null, 2) + "\n");
  console.log(`wrote index.json with ${posts.length} posts`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-index.mjs scripts/build-index.test.mjs
git commit -m "Add build-index.mjs to generate blog index.json from frontmatter"
```

---

### Task 2: Backfill `description` frontmatter on existing posts + update `AGENTS.md`

**Files:**
- Modify: `_content/blog/2026-07-12-observability-ai-agent-go.md:1-5`
- Modify: `_content/blog/2026-07-12-ai-agent-architecture-go.md:1-5`
- Modify: `_content/blog/2026-07-12-go-flight-recorder.md:1-5`
- Modify: `_content/blog/2026-07-12-go-fix-modernize.md:1-5`
- Modify: `AGENTS.md` (section 5, frontmatter contract)

**Interfaces:**
- Consumes: none
- Produces: every file in `_content/blog/*.md` now has a `description` field, which `buildIndex` (Task 1) reads via `meta.description`.

- [ ] **Step 1: Add `description` to each post's frontmatter**

In `_content/blog/2026-07-12-observability-ai-agent-go.md`, replace:

```yaml
---
title: "ความสำคัญของ Observability ใน AI Agent (ตัวอย่างด้วย Go)"
date: 2026-07-12
tags: [ai, agent, observability, go, monitoring, tracing]
---
```

with:

```yaml
---
title: "ความสำคัญของ Observability ใน AI Agent (ตัวอย่างด้วย Go)"
date: 2026-07-12
tags: [ai, agent, observability, go, monitoring, tracing]
description: "ทำไม AI agent ต้องการ trace/log/metric มากกว่า service ทั่วไป พร้อมตัวอย่าง OpenTelemetry ใน Go และ trade-off เรื่องค่าใช้จ่าย"
---
```

In `_content/blog/2026-07-12-ai-agent-architecture-go.md`, replace:

```yaml
---
title: "โครงสร้าง AI Agent: หลักการสร้าง Agent ด้วยตัวเอง (สำหรับนักพัฒนา Go)"
date: 2026-07-12
tags: [ai, agent, architecture, go, llm]
---
```

with:

```yaml
---
title: "โครงสร้าง AI Agent: หลักการสร้าง Agent ด้วยตัวเอง (สำหรับนักพัฒนา Go)"
date: 2026-07-12
tags: [ai, agent, architecture, go, llm]
description: "แกะโครงสร้าง AI agent เป็น 4 ส่วนประกอบ (model, tools, memory, control loop) พร้อมตัวอย่าง Go ประกอบเป็น agent เองได้ ไม่ต้องพึ่ง framework"
---
```

In `_content/blog/2026-07-12-go-flight-recorder.md`, replace:

```yaml
---
title: "Flight Recorder ใน Go 1.25: debug production ย้อนหลังโดยไม่ต้องเก็บ trace ทั้งเส้นทาง"
date: 2026-07-12
tags: [go, tracing, debugging, observability, production]
---
```

with:

```yaml
---
title: "Flight Recorder ใน Go 1.25: debug production ย้อนหลังโดยไม่ต้องเก็บ trace ทั้งเส้นทาง"
date: 2026-07-12
tags: [go, tracing, debugging, observability, production]
description: "เก็บ execution trace วนใน ring buffer ตลอดเวลา แล้ว snapshot เฉพาะช่วงที่มีปัญหาจริง — ไม่ต้องรู้ล่วงหน้าว่าจะพังตอนไหน"
---
```

In `_content/blog/2026-07-12-go-fix-modernize.md`, replace:

```yaml
---
title: "go fix ตัวใหม่ใน Go 1.26: เครื่องมือปรับโค้ดเก่าให้ทันสมัยอัตโนมัติ"
date: 2026-07-12
tags: [go, tooling, static-analysis, refactoring, ai]
---
```

with:

```yaml
---
title: "go fix ตัวใหม่ใน Go 1.26: เครื่องมือปรับโค้ดเก่าให้ทันสมัยอัตโนมัติ"
date: 2026-07-12
tags: [go, tooling, static-analysis, refactoring, ai]
description: "go fix เขียนใหม่ทั้งหมด ยืนบน Analysis Framework เดียวกับ go vet พร้อม modernizer ที่แก้สไตล์โค้ดเก่าให้อัตโนมัติ — รวมถึงโค้ดที่ AI generate"
---
```

- [ ] **Step 2: Update `AGENTS.md` frontmatter contract**

In `AGENTS.md`, section 5 ("Directory Structure & File Naming"), replace:

```yaml
  ---
  title: "Title in Thai"
  date: YYYY-MM-DD
  tags: [tag1, tag2]
  ---
```

with:

```yaml
  ---
  title: "Title in Thai"
  date: YYYY-MM-DD
  tags: [tag1, tag2]
  description: "One or two sentence excerpt — shown on the homepage card and matched by search"
  ---
```

- [ ] **Step 3: Verify all 4 posts parse correctly**

Run:

```bash
node -e "
import('./scripts/build-index.mjs').then(({ buildIndex }) => {
  const posts = buildIndex('_content/blog');
  console.log(JSON.stringify(posts, null, 2));
  if (posts.length !== 4) throw new Error('expected 4 posts, got ' + posts.length);
  for (const p of posts) {
    if (!p.description) throw new Error('missing description: ' + p.slug);
  }
  console.log('OK: 4 posts, all have description');
});
"
```

Expected: prints 4 post objects, then `OK: 4 posts, all have description`.

- [ ] **Step 4: Commit**

```bash
git add _content/blog/*.md AGENTS.md
git commit -m "Add description frontmatter field to all posts"
```

---

### Task 3: GitHub Actions workflow to rebuild `index.json` on push

**Files:**
- Create: `.github/workflows/build-index.yml`

**Interfaces:**
- Consumes: `scripts/build-index.mjs` (Task 1) via `node scripts/build-index.mjs`
- Produces: on every push to `main` touching `_content/blog/**`, a bot commit updating `index.json` (skipped if `index.json` didn't change, and skipped entirely if the triggering commit was itself a previous bot commit, to avoid an infinite loop)

- [ ] **Step 1: Write the workflow file**

Create `.github/workflows/build-index.yml`:

```yaml
name: Rebuild blog index

on:
  push:
    branches: [main]
    paths:
      - "_content/blog/**"

permissions:
  contents: write

jobs:
  build-index:
    if: ${{ !startsWith(github.event.head_commit.message, 'chore: rebuild blog index') }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Build index.json
        run: node scripts/build-index.mjs

      - name: Commit index.json if changed
        run: |
          if git diff --quiet -- index.json; then
            echo "index.json unchanged, nothing to commit"
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add index.json
          git commit -m "chore: rebuild blog index"
          git push
```

- [ ] **Step 2: Validate YAML syntax locally**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-index.yml'))" 2>&1 || node -e "require('node:fs').readFileSync('.github/workflows/build-index.yml','utf8')"`

Expected: no error printed (if `python3-yaml` isn't installed, the fallback `node -e` just confirms the file reads as text — the real validation happens once pushed and the workflow runs; there is no local GitHub Actions runner in this repo).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-index.yml
git commit -m "Add GitHub Actions workflow to rebuild blog index.json"
```

---

### Task 4: `assets/blog-index.js` — pure filtering/pagination/query-param logic

**Files:**
- Create: `assets/blog-index.js` (this task adds only the pure functions below; Task 5 appends the DOM-rendering functions to the same file)

**Interfaces:**
- Produces: `parseQueryParams(search: string) -> { page: number, tag: string, q: string }` (global function)
- Produces: `buildQueryString({page, tag, q}) -> string` (global function, e.g. `"?page=2&tag=go"` or `""`)
- Produces: `filterPosts(posts: Array<Post>, {tag, q}) -> Array<Post>` (global function)
- Produces: `paginatePosts(posts: Array<Post>, page: number) -> {items: Array<Post>, page: number, totalPages: number}` (global function, page size fixed at 6)
- `Post` shape (matches `index.json` from Task 1): `{slug, title, date, tags: string[], description}`

- [ ] **Step 1: Write `assets/blog-index.js` with the pure functions**

```js
/*
 * Client-side logic for the auto-discovering blog index on index.html.
 * Loaded as a plain script (no module system), same convention as
 * assets/markdown.js. Reads /index.json (generated by
 * scripts/build-index.mjs) and renders a paginated, filterable,
 * searchable post list driven by URL query params.
 */

const BLOG_PAGE_SIZE = 6;

function parseQueryParams(search) {
  const p = new URLSearchParams(search);
  const pageNum = parseInt(p.get("page"), 10);
  return {
    page: Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1,
    tag: p.get("tag") || "",
    q: p.get("q") || "",
  };
}

function buildQueryString({ page, tag, q }) {
  const p = new URLSearchParams();
  if (page && page > 1) p.set("page", String(page));
  if (tag) p.set("tag", tag);
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function filterPosts(posts, { tag, q }) {
  let result = posts;
  if (tag) {
    result = result.filter((post) => post.tags.includes(tag));
  }
  const needle = (q || "").trim().toLowerCase();
  if (needle) {
    result = result.filter((post) => {
      const haystack = [post.title, post.description, ...post.tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }
  return result;
}

function paginatePosts(posts, page) {
  const totalPages = Math.max(1, Math.ceil(posts.length / BLOG_PAGE_SIZE));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * BLOG_PAGE_SIZE;
  return {
    items: posts.slice(start, start + BLOG_PAGE_SIZE),
    page: clamped,
    totalPages,
  };
}
```

- [ ] **Step 2: Write and run an inline assertion script (no test framework needed for browser-global scripts — same verification style used for `assets/markdown.js` earlier in this project)**

Run:

```bash
node -e "
$(cat assets/blog-index.js)
const assert = require('node:assert/strict');

assert.deepEqual(parseQueryParams('?page=2&tag=go&q=fix'), { page: 2, tag: 'go', q: 'fix' });
assert.deepEqual(parseQueryParams(''), { page: 1, tag: '', q: '' });
assert.deepEqual(parseQueryParams('?page=abc'), { page: 1, tag: '', q: '' });

assert.equal(buildQueryString({ page: 1, tag: '', q: '' }), '');
assert.equal(buildQueryString({ page: 2, tag: 'go', q: '' }), '?page=2&tag=go');
assert.equal(buildQueryString({ page: 1, tag: '', q: 'fix' }), '?q=fix');

const posts = [
  { slug: 'a', title: 'Go fix', description: 'modernize', tags: ['go', 'ai'] },
  { slug: 'b', title: 'Flight recorder', description: 'trace', tags: ['go', 'tracing'] },
  { slug: 'c', title: 'Agent architecture', description: 'loop', tags: ['ai'] },
];
assert.deepEqual(filterPosts(posts, { tag: 'ai', q: '' }).map((p) => p.slug), ['a', 'c']);
assert.deepEqual(filterPosts(posts, { tag: '', q: 'trace' }).map((p) => p.slug), ['b']);
assert.deepEqual(filterPosts(posts, { tag: 'go', q: 'fix' }).map((p) => p.slug), ['a']);
assert.deepEqual(filterPosts(posts, { tag: '', q: '' }).map((p) => p.slug), ['a', 'b', 'c']);

const many = Array.from({ length: 14 }, (_, i) => ({ slug: 'p' + i, title: '', description: '', tags: [] }));
const p1 = paginatePosts(many, 1);
assert.equal(p1.items.length, 6);
assert.equal(p1.totalPages, 3);
const pOver = paginatePosts(many, 99);
assert.equal(pOver.page, 3);
assert.equal(pOver.items.length, 2);
const pUnder = paginatePosts(many, 0);
assert.equal(pUnder.page, 1);

console.log('all assertions passed');
"
```

Expected: `all assertions passed` printed, no errors.

- [ ] **Step 3: Commit**

```bash
git add assets/blog-index.js
git commit -m "Add pure query/filter/pagination logic to blog-index.js"
```

---

### Task 5: `assets/blog-index.js` — DOM rendering and event wiring

**Files:**
- Modify: `assets/blog-index.js` (append to the file created in Task 4)

**Interfaces:**
- Consumes: `parseQueryParams`, `buildQueryString`, `filterPosts`, `paginatePosts` (Task 4)
- Produces: `renderBlogIndex() -> Promise<void>` (global function, called on page load and `popstate`)
- Produces: `initBlogIndexEvents() -> void` (global function, called once on page load, wires up click/input handlers)
- Expects these DOM elements to exist (added to `index.html` in Task 6): `#blog-search` (input), `#tag-filters` (container), `#blog-list` (container), `#pagination` (nav)

- [ ] **Step 1: Append DOM-rendering functions to `assets/blog-index.js`**

```js
let cachedPosts = null;

async function fetchBlogIndex() {
  if (cachedPosts) return cachedPosts;
  const res = await fetch("/index.json");
  if (!res.ok) throw new Error(`index.json fetch failed: ${res.status}`);
  cachedPosts = await res.json();
  return cachedPosts;
}

function renderTagFilters(posts, activeTag) {
  const tags = [...new Set(posts.flatMap((p) => p.tags))].sort();
  const container = document.getElementById("tag-filters");
  container.innerHTML = tags
    .map((t) => {
      const active = t === activeTag ? " active" : "";
      return `<button type="button" class="tag-chip${active}" data-tag="${t}">${t}</button>`;
    })
    .join("");
}

function renderPostList(items) {
  const list = document.getElementById("blog-list");
  if (items.length === 0) {
    list.innerHTML = "<p>ไม่พบบทความที่ตรงกับคำค้นหา</p>";
    return;
  }
  list.innerHTML = items
    .map(
      (post) => `
<a class="post-card" href="/blog/post.html?slug=${post.slug}">
<h3>${post.title}</h3>
<p class="desc">${post.description}</p>
<div class="meta">
${post.tags.map((t) => `<span class="badge">${t}</span>`).join("")}
<span class="date">${post.date}</span>
<span class="cta">อ่านบทความ →</span>
</div>
</a>`
    )
    .join("\n");
}

function renderPagination(page, totalPages, query) {
  const nav = document.getElementById("pagination");
  if (totalPages <= 1) {
    nav.innerHTML = "";
    return;
  }
  const parts = [];
  for (let p = 1; p <= totalPages; p++) {
    const qs = buildQueryString({ ...query, page: p });
    const active = p === page ? " active" : "";
    parts.push(`<a class="page-link${active}" href="/${qs}" data-page="${p}">${p}</a>`);
  }
  nav.innerHTML = parts.join("");
}

async function renderBlogIndex() {
  const listEl = document.getElementById("blog-list");
  let posts;
  try {
    posts = await fetchBlogIndex();
  } catch (e) {
    listEl.innerHTML =
      "<p>โหลดรายการบทความไม่สำเร็จ — อ่านบทความได้ที่ dev.to ด้านล่าง</p>";
    document.getElementById("tag-filters").innerHTML = "";
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  const query = parseQueryParams(location.search);
  const searchInput = document.getElementById("blog-search");
  if (searchInput && searchInput.value !== query.q) searchInput.value = query.q;

  renderTagFilters(posts, query.tag);
  const filtered = filterPosts(posts, query);
  const { items, page, totalPages } = paginatePosts(filtered, query.page);
  renderPostList(items);
  renderPagination(page, totalPages, query);
}

function navigateBlogIndex(query) {
  const qs = buildQueryString(query);
  history.pushState({}, "", qs || location.pathname);
  renderBlogIndex();
}

function initBlogIndexEvents() {
  document.getElementById("tag-filters").addEventListener("click", (e) => {
    const btn = e.target.closest(".tag-chip");
    if (!btn) return;
    const query = parseQueryParams(location.search);
    const nextTag = query.tag === btn.dataset.tag ? "" : btn.dataset.tag;
    navigateBlogIndex({ ...query, tag: nextTag, page: 1 });
  });

  document.getElementById("pagination").addEventListener("click", (e) => {
    const link = e.target.closest(".page-link");
    if (!link) return;
    e.preventDefault();
    const query = parseQueryParams(location.search);
    navigateBlogIndex({ ...query, page: parseInt(link.dataset.page, 10) });
  });

  let debounceTimer;
  document.getElementById("blog-search").addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const value = e.target.value;
    debounceTimer = setTimeout(() => {
      const query = parseQueryParams(location.search);
      navigateBlogIndex({ ...query, q: value, page: 1 });
    }, 200);
  });

  window.addEventListener("popstate", renderBlogIndex);
}
```

- [ ] **Step 2: Verify the file has no syntax errors**

Run: `node --check assets/blog-index.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add assets/blog-index.js
git commit -m "Add DOM rendering and event wiring to blog-index.js"
```

---

### Task 6: Wire `index.html` to the new dynamic index

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `renderBlogIndex()`, `initBlogIndexEvents()` (Task 5), served files `/index.json` (Task 1/3) and `/assets/blog-index.js` (Task 4/5)

- [ ] **Step 1: Add CSS for the new controls**

In `index.html`, find the existing `<style>` block's rule for `.badge { ... }` (already present from the earlier redesign) and add these new rules immediately after it:

```css
#blog-controls { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
#blog-search {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 0.9em;
  font-family: inherit;
  color: var(--text);
  background: var(--bg);
}
#blog-search:focus { outline: none; border-color: var(--accent); }
#tag-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.tag-chip {
  font-size: 0.8em;
  color: var(--muted);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 5px 12px;
  cursor: pointer;
  font-family: inherit;
}
.tag-chip:hover { border-color: var(--accent); color: var(--accent); }
.tag-chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }
#pagination { display: flex; gap: 8px; margin-top: 24px; justify-content: center; }
.page-link {
  display: inline-block;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.9em;
}
.page-link:hover { border-color: var(--accent); color: var(--accent); }
.page-link.active { background: var(--accent); color: #fff; border-color: var(--accent); }
```

- [ ] **Step 2: Replace the hardcoded post cards with dynamic containers**

Find the `<section class="featured">` block. It currently contains `<h2>จาก Gophernment Blog</h2>` followed by four hand-written `<a class="post-card">...</a>` blocks. Replace everything between `<h2>จาก Gophernment Blog</h2>` and the closing `</section>` with:

```html
<div id="blog-controls">
<input id="blog-search" type="search" placeholder="ค้นหาบทความ...">
<div id="tag-filters"></div>
</div>

<div id="blog-list"><p>กำลังโหลดบทความ...</p></div>
<nav id="pagination"></nav>

</section>

<script src="/assets/blog-index.js?v=1"></script>
<script>
initBlogIndexEvents();
renderBlogIndex();
</script>
```

(The `</section>` above replaces the original closing tag — don't leave a duplicate.)

- [ ] **Step 3: Manual browser verification**

Run:

```bash
node scripts/build-index.mjs
python3 -m http.server 8080 &
sleep 1
curl -s -o /dev/null -w "index.html: %{http_code}\n" http://localhost:8080/
curl -s -o /dev/null -w "index.json: %{http_code}\n" http://localhost:8080/index.json
curl -s -o /dev/null -w "blog-index.js: %{http_code}\n" http://localhost:8080/assets/blog-index.js
```

Expected: all three print `200`.

Then open `http://localhost:8080/` in a real browser and check:
- The 4 posts render as cards under "จาก Gophernment Blog".
- Clicking a tag chip filters the list and the URL gains `?tag=...`.
- Clicking the same tag chip again clears the filter.
- Typing in the search box (e.g. "flight") filters to matching posts after ~200ms.
- Reloading the page with a `?tag=go` or `?q=...` URL directly shows the filtered state on load.
- Browser back/forward buttons move between filter states correctly.

Stop the server:

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Wire index.html to the dynamic, filterable blog index"
```

---

### Task 7: Bootstrap the initial `index.json`

**Files:**
- Create: `index.json` (generated, not hand-written)
- Modify: `.gitignore` — do NOT add `index.json` here; it must be committed (GitHub Pages serves it as a static file, and the Actions workflow in Task 3 only regenerates it on future pushes, so the first version must already exist in the repo)

**Interfaces:**
- Consumes: `scripts/build-index.mjs` (Task 1)

- [ ] **Step 1: Generate `index.json` from the current state of `_content/blog/`**

Run:

```bash
node scripts/build-index.mjs
cat index.json
```

Expected: prints `wrote index.json with 4 posts`, and `cat` shows a JSON array of 4 objects (go-fix-modernize, go-flight-recorder, ai-agent-architecture-go, observability-ai-agent-go — in that order, per the date-then-slug-descending sort from Task 1).

- [ ] **Step 2: Commit**

```bash
git add index.json
git commit -m "Generate initial index.json"
```

- [ ] **Step 3: Push everything and verify the Actions workflow doesn't loop**

```bash
git push origin main
```

After pushing, check the Actions tab (or `git log --oneline -5` after a minute) — since this push touches `_content/blog/**` (Task 2's commit) and `index.json` is already up to date, the workflow should run once, see no diff in `index.json`, print "index.json unchanged, nothing to commit", and NOT create a bot commit. Confirm no unexpected extra commit appears.

---

## Self-Review Notes

- **Spec coverage:** discovery mechanism (Task 1+3), pagination (Task 4+5+6), tag filter (Task 4+5+6), search (Task 4+5+6), frontmatter schema change (Task 2), bootstrap so the page works immediately (Task 7) — all covered.
- **Type consistency:** `Post` shape `{slug, title, date, tags, description}` is identical across `build-index.mjs` (Task 1), the pure functions (Task 4), and the DOM renderer (Task 5).
- **No placeholders:** every step has complete, runnable code.
