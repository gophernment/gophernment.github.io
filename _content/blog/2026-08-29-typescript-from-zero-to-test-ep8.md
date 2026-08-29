---
title: "TypeScript จากศูนย์ถึงเขียน Test — ตอนที่ 8: เขียน unit test ใน Next.js ด้วย Vitest"
date: 2026-08-29
tags: [typescript, nextjs, testing]
description: "เขียน unit test ใน Next.js ด้วย Vitest + React Testing Library — ปิดท้ายซีรีส์"
---

> 📅 เขียนเมื่อ: สิงหาคม 2026 | Vitest 4, Next.js 16, Node.js 20+
> ⚠️ API/เวอร์ชันอาจเปลี่ยนแปลง — ตรวจสอบเอกสารล่าสุดก่อนใช้งาน
>
> 📚 ตอนที่ 8/8 ในซีรีส์ "TypeScript จากศูนย์ถึงเขียน Test"

มาถึงตอนสุดท้ายแล้ว — เราจะเขียน **unit test** ให้กับโปรเจกต์ Next.js ที่ตั้งไว้ในตอนที่แล้ว นี่คือชิ้นสุดท้ายของภาพที่เราตั้งใจไว้ตั้งแต่ตอนแรก: เริ่มจากติดตั้ง TypeScript ไล่เรียน type มาทั้งหมด จนมาถึงการเขียน test ได้จริง

สำหรับ unit test เราใช้ **Vitest** — test runner ที่เร็วมาก และทำงานกับ TypeScript ได้ตรง ๆ ไม่ต้องตั้งค่า compile แยก (Vitest ต้องรันบน Node.js เช่นเดียวกับ Next.js ในตอนที่แล้ว ตรงนี้เราจึงใช้ `npm` ต่อ)

## ติดตั้ง

เข้าไปในโปรเจกต์ Next.js (จากตอนที่แล้ว) แล้วติดตั้ง Vitest พร้อมเครื่องมือทดสอบ React component

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

แต่ละตัวทำหน้าที่:

- **vitest** — ตัวรัน test
- **jsdom** — จำลอง DOM ใน Node.js (เพราะ unit test ไม่ได้รันในเบราว์เซอร์จริง)
- **@testing-library/react** — ช่วยเรนเดอร์ component เพื่อทดสอบ
- **@testing-library/jest-dom** — เพิ่ม matcher ให้ตรวจผลลัพธ์ได้สะดวกขึ้น
- **@testing-library/user-event** — จำลองการกระทำของผู้ใช้ (คลิก พิมพ์)

## ตั้งค่า Vitest

สร้างไฟล์ `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./setup.ts"],
  },
});
```

และไฟล์ `setup.ts` ที่โหลด matcher พิเศษจาก jest-dom

```typescript
import "@testing-library/jest-dom/vitest";
```

เพิ่ม script `"test"` ลงใน `package.json` เพื่อให้รันง่าย

```json
{
  "scripts": {
    "test": "vitest"
  }
}
```

## เริ่มจาก test ฟังก์ชันเดี่ยว

ก่อนไปถึง component ขออุ่นเครื่องด้วยการทดสอบฟังก์ชันธรรมดา สร้างไฟล์ `lib/greet.ts`

```typescript
export function greet(name: string): string {
  return `Hello, ${name}`;
}
```

แล้วเขียน test ใน `lib/greet.test.ts`

```typescript
import { expect, test } from "vitest";
import { greet } from "./greet";

test("greet คืนค่าคำทักทายพร้อมชื่อ", () => {
  expect(greet("World")).toBe("Hello, World");
});
```

โครงสร้างเหมือน Playwright ทุกอย่าง — `test(...)` ประกาศ test, `expect(...)` ตรวจผล แต่ต่างกันที่ unit test ไม่ต้องเปิดเบราว์เซอร์ จึงเร็วมาก (ตัวนี้รันในหลักมิลลิวินาที)

## ทดสอบ React component

คราวนี้ทดสอบ component จริง ๆ — ใช้ `Counter` จากตอนที่แล้ว (Client Component ที่มี state)

สร้างไฟล์ `app/Counter.tsx`

```tsx
"use client";

import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      นับแล้ว {count} ครั้ง
    </button>
  );
}
```

เขียน test ใน `app/Counter.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import Counter from "./Counter";

test("กดปุ่มแล้วตัวนับเพิ่มขึ้น", async () => {
  render(<Counter />);

  const button = screen.getByRole("button");
  expect(button).toHaveTextContent("นับแล้ว 0 ครั้ง");

  await userEvent.click(button);
  await userEvent.click(button);

  expect(button).toHaveTextContent("นับแล้ว 2 ครั้ง");
});
```

ไล่ดูทีละบรรทัด:

- `render(<Counter />)` — เรนเดอร์ component ลงใน DOM จำลอง (jsdom)
- `screen.getByRole("button")` — หา element จากบทบาท เช่นเดียวกับ Playwright ที่เรียนมาในตอนที่ 6
- `userEvent.click(button)` — จำลองการคลิกแบบผู้ใช้จริง (ต้อง `await` เพราะเป็น async)
- `toHaveTextContent(...)` — matcher จาก jest-dom ที่เราตั้งค่าใน `setup.ts`

แนวคิดสำคัญคือเราทดสอบ**จากมุมมองผู้ใช้** — เรนเดอร์แล้วดูว่าหน้าจอแสดงอะไร กดแล้วผลเปลี่ยนยังไง ไม่ได้ไปยุ่งกับ state ภายในของ component

## รัน test

```bash
npm test
```

หรือ

```bash
npx vitest
```

จะเห็นผลประมาณนี้

```
 ✓ lib/greet.test.ts (1)
 ✓ app/Counter.test.tsx (1)

 Test Files  2 passed (2)
      Tests  2 passed (2)
```

## ปิดท้าย: ภาพรวมเส้นทางที่เราเดินมา

ย้อนกลับไปดูภาพใหญ่ — เราเริ่มจากศูนย์แล้วเดินมาถึงตรงนี้ครบทุกขั้น:

1. **ตอนที่ 1-2** — ติดตั้ง TypeScript + Bun และเรียน type พื้นฐาน
2. **ตอนที่ 3-4** — generics, utility types, narrowing และ type guards
3. **ตอนที่ 5** — เข้าใจหลักการทดสอบ (test pyramid)
4. **ตอนที่ 6** — เขียน e2e test ด้วย Playwright
5. **ตอนที่ 7-8** — ตั้ง Next.js แล้วเขียน unit test ด้วย Vitest

จากตรงนี้ คุณมีพื้นฐานครบที่จะต่อยอดเองแล้ว — ลองเพิ่ม test ให้ component ตัวอื่น, เขียน Playwright test ให้เว็บ Next.js ของคุณ, หรือลงลึกเรื่อง mocking และ integration test ต่อ

ขอให้สนุกกับการเขียน TypeScript และทดสอบโค้ดให้แน่นหนาครับ
---

**ย้อนกลับ:** [← ตอนที่ 7: ตั้งโปรเจกต์ Next.js + TypeScript](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep7)

