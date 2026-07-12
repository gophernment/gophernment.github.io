/*
 * Minimal markdown renderer shared by /blog/post.html to render any
 * file in /_content/blog/*.md without a per-post HTML page.
 * Supports the subset of markdown used in this blog: frontmatter,
 * h1-h6, bold, inline code, fenced code blocks, links, unordered
 * lists, and GFM pipe tables.
 */

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, u) => `<img src="${u}" alt="${alt}" style="max-width: 100%; height: auto; display: block; margin: 1.5rem auto; border-radius: 8px;">`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => {
    const external = /^https?:\/\//.test(u);
    return external
      ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>`
      : `<a href="${u}">${t}</a>`;
  });
  return s;
}

function parseFrontmatter(text) {
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

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      const code = escapeHtml(codeLines.join("\n"));
      const cls = lang ? ` class="language-${lang}"` : "";
      html += `<pre><code${cls}>${code}</code></pre>\n`;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html += `<h${level}>${renderInline(heading[2])}</h${level}>\n`;
      i++;
      continue;
    }

    if (line.includes("|") && lines[i + 1] && /^\s*\|?\s*-{2,}/.test(lines[i + 1])) {
      const splitRow = (row) =>
        row
          .split("|")
          .map((c) => c.trim())
          .filter((c, idx, arr) => !(c === "" && (idx === 0 || idx === arr.length - 1)));
      const headerCells = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      html += "<table>\n<tr>" + headerCells.map((c) => `<th>${renderInline(c)}</th>`).join("") + "</tr>\n";
      for (const row of rows) {
        html += "<tr>" + row.map((c) => `<td>${renderInline(c)}</td>`).join("") + "</tr>\n";
      }
      html += "</table>\n";
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      html += "<ul>\n";
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        html += `<li>${renderInline(lines[i].replace(/^[-*]\s+/, ""))}</li>\n`;
        i++;
      }
      html += "</ul>\n";
      continue;
    }

    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    html += `<p>${renderInline(paraLines.join(" "))}</p>\n`;
  }

  return html;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function formatThaiDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  const [, y, mo, d] = m;
  return `${parseInt(d, 10)} ${THAI_MONTHS[parseInt(mo, 10) - 1]} ${y}`;
}

async function loadBlogPost() {
  const slug = new URLSearchParams(location.search).get("slug");
  const root = document.getElementById("post-root");
  const titleEl = document.getElementById("post-title");
  const metaEl = document.getElementById("post-meta");

  if (!slug) {
    root.innerHTML = "<p>ไม่พบบทความ — ขาด slug ใน URL</p>";
    return;
  }

  let res;
  try {
    res = await fetch(`/_content/blog/${slug}.md`);
  } catch (e) {
    root.innerHTML = "<p>โหลดบทความไม่สำเร็จ ลองใหม่อีกครั้ง</p>";
    return;
  }
  if (!res.ok) {
    root.innerHTML = "<p>ไม่พบบทความนี้ (404)</p>";
    return;
  }

  const text = await res.text();
  const { meta, body } = parseFrontmatter(text);

  const title = meta.title || slug;
  document.title = `${title} — Gophernment`;
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta && meta.title) descMeta.setAttribute("content", meta.title);

  titleEl.textContent = title;
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  metaEl.innerHTML =
    `<span>${formatThaiDate(meta.date)}</span>` +
    tags.map((t) => `<span class="badge">${t}</span>`).join("");

  root.innerHTML = renderMarkdown(body);
}
