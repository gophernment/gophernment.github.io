---
title: "TypeScript จากศูนย์ถึงเขียน Test — ตอนที่ 6: เขียน e2e test ด้วย Playwright"
date: 2026-08-29
tags: [typescript, playwright, testing]
description: "เขียน e2e test ด้วย Playwright — จำลองผู้ใช้จริงคลิก พิมพ์ และตรวจผลผ่านเบราว์เซอร์"
---

> 📅 เขียนเมื่อ: สิงหาคม 2026 | Playwright 1.62, Node.js 20+
> ⚠️ API/เวอร์ชันอาจเปลี่ยนแปลง — ตรวจสอบเอกสารล่าสุดก่อนใช้งาน
>
> 📚 ตอนที่ 6/8 ในซีรีส์ "TypeScript จากศูนย์ถึงเขียน Test"

ตอนที่แล้วเราคุยกันเรื่องหลักการทดสอบ — unit, integration, e2e และ test pyramid ตอนนี้ถึงเวลาลงมือจริง เริ่มจาก **e2e test ด้วย Playwright** ซึ่งเป็นเครื่องมือยอดนิยมสำหรับจำลองผู้ใช้จริงผ่านเบราว์เซอร์

จุดเด่นของ Playwright คือมัน "กดให้เอง" — เปิดหน้าเว็บ คลิกปุ่ม พิมพ์ข้อความ แล้วตรวจผลลัพธ์ เหมือนมีหุ่นยนต์มานั่งทดสอบเว็บให้ ทั้งหมดนี้เขียนด้วย TypeScript ซึ่งเข้ากับสิ่งที่เราเรียนมาทั้งหมด

## เตรียมโปรเจกต์และติดตั้ง

เช่นเดียวกับ tool ฝั่ง test อื่น ๆ Playwright ต้องรันบน **Node.js** (ไม่ใช่ Bun) ตรงนี้เราจึงเปลี่ยนมาใช้ `npm`/`npx` ต่อจากนี้

สมมติเรามีโฟลเดอร์โปรเจกต์อยู่แล้ว (ถ้ายังไม่มี สร้างด้วย `npm init -y` ง่าย ๆ) เริ่มจากติดตั้ง Playwright

```bash
npm install -D @playwright/test
```

จากนั้นโหลดเบราว์เซอร์ที่ใช้ทดสอบลงมา (Chrome, Firefox, WebKit) — รันครั้งเดียว

```bash
npx playwright install
```

## สร้างหน้าเว็บสำหรับทดสอบ

ก่อนเขียน test เราต้องมีหน้าเว็บสักหน้าหนึ่งก่อน ขอใช้ตัวอย่างง่าย ๆ — เครื่องนับเลขที่กดปุ่มแล้วตัวเลขเพิ่ม

สร้างไฟล์ `index.html`

```html
<!DOCTYPE html>
<html>
  <head><title>Counter</title></head>
  <body>
    <h1 id="count">0</h1>
    <button id="increment">เพิ่ม</button>
    <script>
      let count = 0;
      document.getElementById("increment").addEventListener("click", () => {
        count++;
        document.getElementById("count").textContent = count;
      });
    </script>
  </body>
</html>
```

ไฟล์นี้เปิดผ่าน `file://` ได้เลย ไม่ต้องรัน server — Playwright รองรับการเปิดไฟล์ตรง ๆ

## เขียน test แรก

สร้างไฟล์ `counter.spec.ts` แล้วเขียน test แบบนี้

```typescript
import { test, expect } from "@playwright/test";

test("กดปุ่มแล้วตัวเลขเพิ่มขึ้น", async ({ page }) => {
  await page.goto("file:///home/you/counter/index.html");

  await expect(page.locator("#count")).toHaveText("0");

  await page.getByRole("button", { name: "เพิ่ม" }).click();

  await expect(page.locator("#count")).toHaveText("1");
});
```

มาดูทีละส่วน:

- `test("ชื่อ", async ({ page }) => {...})` — ประกาศ test หนึ่งตัว `page` คือตัวแทนแท็บเบราว์เซอร์ที่ Playwright สร้างให้อัตโนมัติ
- `page.goto(...)` — เปิดหน้าเว็บ (ตรงนี้ใช้ `file://` แต่ตอนหลังใช้ URL จริง)
- `page.getByRole("button", { name: "เพิ่ม" })` — หาปุ่มจาก "บทบาท" และข้อความที่แสดง วิธีนี้ทนทานกว่าหา `#id` เพราะเลียนแบบวิธีที่ผู้ใช้จริงมองหา
- `expect(locator).toHaveText(...)` — ตรวจว่าข้อความตรงตามที่คาด

## รัน test

```bash
npx playwright test
```

จะเห็นผลประมาณนี้ — เบราว์เซอร์เปิดขึ้น (หัวแฝง) กดปุ่ม แล้วรายงานผล

```
Running 1 test using 1 worker
  ✓  1 counter.spec.ts:3:1 › กดปุ่มแล้วตัวเลขเพิ่มขึ้น (2.1s)
  1 passed (2.5s)
```

## ตรวจ title และ input ด้วย

ขยายตัวอย่างอีกนิด — เพิ่มการตรวจ title และการพิมพ์ข้อความลง input ซึ่งเป็นสิ่งที่ใช้บ่อยจริง ๆ

สมมติเพิ่มช่อง input ใน HTML

```html
<input id="name" placeholder="ชื่อของคุณ" />
<p id="greeting"></p>
<button id="say-hello">ทักทาย</button>
<script>
  document.getElementById("say-hello").addEventListener("click", () => {
    const name = document.getElementById("name").value;
    document.getElementById("greeting").textContent = `สวัสดี ${name}`;
  });
</script>
```

แล้วเขียน test

```typescript
test("พิมพ์ชื่อแล้วแสดงคำทักทาย", async ({ page }) => {
  await page.goto("file:///home/you/counter/index.html");

  await expect(page).toHaveTitle("Counter");

  await page.getByPlaceholder("ชื่อของคุณ").fill("โจ้");
  await page.getByRole("button", { name: "ทักทาย" }).click();

  await expect(page.locator("#greeting")).toHaveText("สวัสดี โจ้");
});
```

- `page.getByPlaceholder(...)` — หา input จาก placeholder
- `.fill(...)` — พิมพ์ข้อความลงช่อง (เหมือนผู้ใช้พิมพ์จริง)
- `expect(page).toHaveTitle(...)` — ตรวจ title ของหน้า

## ตั้งค่า baseURL

เวลาทดสอบเว็บจริง เราจะเปิด URL เดิมซ้ำ ๆ หลายตัว แทนที่จะเขียน URL เต็มทุกครั้ง ใช้ไฟล์ตั้งค่า `playwright.config.ts`

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://localhost:3000",
  },
});
```

ตั้งค่าแล้วเราก็เขียน `page.goto("/")` แทน URL เต็มได้เลย

## สรุป

ตอนนี้เราเขียน e2e test ได้แล้ว — เปิดหน้า คลิก พิมพ์ ตรวจผล ด้วย Playwright + TypeScript สิ่งสำคัญที่ได้เห็นคือ test นี้ตรวจ**พฤติกรรม** (กดปุ่มแล้วตัวเลขเพิ่ม) ไม่ใช่ implementation ซึ่งตรงกับหลักการ "test ที่ดี" จากตอนที่แล้ว

e2e test ครอบคลุมภาพรวมของระบบ แต่การทดสอบทุกอย่างด้วย e2e ล้วนจะช้าเกินไป ตอนหน้าเราจะไปตั้งโปรเจกต์ **Next.js + TypeScript** เพื่อเตรียมพื้นสำหรับการเขียน unit test ในตอนสุดท้าย
---

**อ่านต่อในซีรีส์:** [← ตอนที่ 5: เข้าใจการทดสอบ (Testing) ก่อนลงมือเขียน](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep5) · [ตอนที่ 7: ตั้งโปรเจกต์ Next.js + TypeScript →](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep7)

