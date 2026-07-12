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
