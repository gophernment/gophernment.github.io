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
