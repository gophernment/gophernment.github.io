# AI Agent Instructions for gophernment.github.io

This document defines the core guidelines, editorial philosophy, and quality standards for all AI agents authoring, reviewing, or editing content in this repository. Any agent contributing to this blog must strictly adhere to these principles.

---

## 1. Core Editorial Philosophy

Our goal is to deliver technical content that is **academically sound, practically useful, and engaging to read**.

- **Engaging & Informative:** Write articles that make complex topics approachable and entertaining. Avoid dry, academic-only jargon without explanation.
- **Clear References:** Every claim, code snippet, and design recommendation must be backed by credible, verifiable sources (academic papers, official documentation, or industry standards).
- **Practical Demonstrations:** Include minimal, functional code examples and simple diagrams (such as Mermaid diagrams or ASCII illustrations) to help readers grasp the concepts quickly.

---

## 2. Review and Verification Process

Before any article is published, it must undergo a rigorous review process through two distinct persona lenses:

1. **Domain Expert Lens (Academic & Senior Engineer):**
   - Audit the code for best practices, performance bottlenecks, compilation issues, and correct API usage.
   - Verify that the theoretical concepts align with current academic research and industry standards.
2. **Professional Writer Lens:**
   - Review the structural flow, readability, and narrative pacing.
   - Ensure the tone is welcoming, engaging, and maintains reader interest from start to finish.

---

## 3. Language & Transliteration Guidelines

- **Primary Language:** The blog posts are written in **Thai**.
- **Technical Terms (Transliteration):** Use transliterations (ทับศัพท์) or English terms for industry jargon where appropriate (e.g., *Observability*, *Deterministic*, *Latency*, *Span*). This allows Thai readers to easily use these terms for further self-directed research.

---

## 4. Epistemological Humility & Temporal Constraints

Technology evolves rapidly. To maintain intellectual integrity and avoid misleading readers:
- **No Absolute Certainty:** Never present ideas or methodologies as absolute, permanent truth.
- **Acknowledge Temporal Context:** Always state the timeframe or contextual constraints under which the article is written (e.g., "As of [Month/Year]" or "Based on [Library Version]").
- **Future Evolution Disclaimer:** Include a gentle disclaimer/caveat indicating that future technological shifts, new research, or paradigm changes might challenge or disprove the current content.

---

## 5. Directory Structure & File Naming

- Blog posts are stored as Markdown files in the `_content/blog/` directory.
- File names must follow the format: `YYYY-MM-DD-kebab-case-title.md` (e.g., `_content/blog/2026-07-12-observability-ai-agent-go.md`).
- Front matter in each markdown post must define:
  ```yaml
  ---
  title: "Title in Thai"
  date: YYYY-MM-DD
  tags: [tag1, tag2]
  description: "One or two sentence excerpt — shown on the homepage card and matched by search"
  ---
  ```
