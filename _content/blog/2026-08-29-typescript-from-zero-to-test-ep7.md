---
title: "TypeScript จากศูนย์ถึงเขียน Test — ตอนที่ 7: ตั้งโปรเจกต์ Next.js + TypeScript"
date: 2026-08-29
tags: [typescript, nextjs, react]
description: "ตั้งโปรเจกต์ Next.js + TypeScript และเข้าใจโครงสร้าง App Router กับ Server/Client Component"
---

> 📅 เขียนเมื่อ: สิงหาคม 2026 | Next.js 16, React 19, Node.js 20+
> ⚠️ API/เวอร์ชันอาจเปลี่ยนแปลง — ตรวจสอบเอกสารล่าสุดก่อนใช้งาน
>
> 📚 ตอนที่ 7/8 ในซีรีส์ "TypeScript จากศูนย์ถึงเขียน Test"

ตอนที่แล้วเราจบที่ Playwright ตอนนี้ถึงคราวของ **Next.js** — เฟรมเวิร์กสำหรับเขียนเว็บแอปด้วย React ที่มาพร้อมการรองรับ TypeScript ตั้งแต่ต้น ซึ่งเป็นพื้นสุดท้ายก่อนที่เราจะเขียน unit test ในตอนหน้า

ถ้ายังไม่รู้จัก Next.js ขออธิบายสั้น ๆ — React คือ library สำหรับสร้าง UI จาก "component" และ Next.js คือเฟรมเวิร์กที่ห่อ React ให้ทำงานจริงจังขึ้น (จัดการ routing, rendering, และอีกสารพัดให้เราไม่ต้องตั้งเอง)

> ⚠️ ถึงตรงนี้ต้องใช้ **Node.js** จริงแล้ว (Next.js ต้องการ Node) — ถ้ายังไม่ได้จัดการ Node version ให้กลับไปดู[ตอนที่ 1 เรื่อง fnm](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep1) เพื่อตั้งให้เรียบร้อยก่อน

## สร้างโปรเจกต์

จุดนี้ต้องเปลี่ยนมาใช้ **Node.js** แล้ว — ต่างจากตอนก่อนหน้าที่ใช้ Bun เพราะ Next.js ต้องรันบน Node.js (Next.js 16 ระบุ requirement ว่า `node >= 20.9.0`) นี่คือเหตุผลที่เราเตรียม fnm ไว้ตั้งแต่ตอนที่ 1

Next.js มีตัวสร้างโปรเจกต์สำเร็จรูป ใช้ `npx` (ตัวรัน package ของ Node) ตามนี้

```bash
npx create-next-app@latest my-app
```

ตัวสร้างจะถามคำถามหลายข้อ เช่น ใช้ TypeScript ไหม, ใช้ Tailwind ไหม, ใช้ App Router ไหม — สำหรับซีรีส์นี้เลือก **Yes** ให้ TypeScript และ **App Router** (เป็นตัวเลือก default อยู่แล้ว) ที่เหลือตอบตามใจได้เลย

สร้างเสร็จ เข้าไปในโฟลเดอร์แล้วเปิด dev server ด้วย `npm` (ตัวจัดการ package มาตรฐานของ Node)

```bash
cd my-app
npm run dev
```

เปิดเบราว์เซอร์ไปที่ `http://localhost:3000` จะเห็นหน้าแรกของ Next.js — เท่านี้โปรเจกต์ Next.js + TypeScript ก็พร้อมแล้ว (สังเกตว่าเราแทบไม่ต้องตั้งค่า TypeScript อะไรเลย เพราะ Next.js จัดการให้อัตโนมัติ)

## เข้าใจโครงสร้าง App Router

โฟลเดอร์ที่สำคัญที่สุดคือ `app/` — ไฟล์ในนี้คือ "เส้นทาง" (route) ของเว็บเรา ตั้งชื่อไฟล์เท่ากับ URL ที่ต้องการ

```
app/
├── layout.tsx      # โครงหลักของทุกหน้า
├── page.tsx        # หน้าแรก (URL "/")
└── about/
    └── page.tsx    # หน้า "/about"
```

เปิดไฟล์ `app/page.tsx` มาดู — มันคือ React component ที่เขียนด้วย TypeScript

```tsx
export default function Home() {
  return (
    <main>
      <h1>ยินดีต้อนรับ</h1>
      <p>นี่คือโปรเจกต์ Next.js + TypeScript</p>
    </main>
  );
}
```

สิ่งที่ควรสังเกตคือไฟล์นี้**ไม่มี** type annotation ยุ่งยากอะไร — แต่ TypeScript ยังทำงานอยู่เบื้องหลังเต็มที่ ถ้าลองส่ง prop ผิด type เข้าไปใน component ตัวอื่น compiler จะฟ้องทันที

## เขียน component พร้อม type

สร้าง component ง่าย ๆ พร้อมประกาศ type ของ prop เพื่อเห็นการทำงานของ TypeScript ใน Next.js

สร้างไฟล์ `app/Greeting.tsx`

```tsx
type GreetingProps = {
  name: string;
};

export default function Greeting({ name }: GreetingProps) {
  return <p>สวัสดี, {name}</p>;
}
```

แล้วเอาไปใช้ใน `app/page.tsx`

```tsx
import Greeting from "./Greeting";

export default function Home() {
  return (
    <main>
      <h1>ยินดีต้อนรับ</h1>
      <Greeting name="โจ้" />
    </main>
  );
}
```

ลองแกล้งส่ง type ผิดดู

```tsx
<Greeting name={42} /> {/* ❌ Type 'number' is not assignable to type 'string' */}
```

editor จะโชว์ error แดง ๆ ทันที — นี่คือ TypeScript ที่เราฝึกมาทั้ง 4 ตอน ทำงานให้เราแบบเรียลไทม์

## Server Component vs Client Component

มีเรื่องหนึ่งที่ Next.js ต่างจาก React ทั่วไป และสำคัญต่อการเขียน test — component แบ่งเป็นสองประเภท

**Server Component** (default) — เรนเดอร์บน server ใช้กับงานที่ไม่ต้อง interact กับผู้ใช้ เช่นอ่านข้อมูลจากฐานข้อมูล ส่งเป็น HTML ไปให้เบราว์เซอร์

**Client Component** — ทำงานบนเบราว์เซอร์ ใช้กับงานที่มี state หรือ event handler (ปุ่มกด, ฟอร์ม) ประกาศด้วยคำสั่ง `"use client"` บนสุดของไฟล์

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

ทำไมต้องรู้จักสองตัวนี้? เพราะตอนเขียน unit test เราจะทดสอบ **Client Component** (ที่มี logic และ state) เป็นหลัก — นี่คือจุดเชื่อมต่อไปยังตอนสุดท้าย

## สรุป

ตอนนี้เรามีโปรเจกต์ Next.js + TypeScript ที่พร้อมใช้งาน — เข้าใจโครงสร้าง App Router, เขียน component พร้อม type และรู้จักความต่างของ Server/Client Component

ตอนสุดท้ายเราจะเขียน **unit test** ให้กับ component เหล่านี้ด้วย Vitest + React Testing Library ซึ่งเป็นการปิดท้ายเส้นทาง "จากติดตั้ง TypeScript จนเขียน test ได้" ที่เราตั้งใจไว้ตั้งแต่ต้น
---

**อ่านต่อในซีรีส์:** [← ตอนที่ 6: เขียน e2e test ด้วย Playwright](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep6) · [ตอนที่ 8: เขียน unit test ใน Next.js ด้วย Vitest →](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep8)

