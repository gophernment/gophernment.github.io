---
title: "TypeScript จากศูนย์ถึงเขียน Test — ตอนที่ 1: รู้จัก ติดตั้ง และเขียนโค้ดแรก"
date: 2026-08-29
tags: [typescript, bun, beginners]
description: "ปูพื้นฐาน TypeScript ตั้งแต่ติดตั้ง Bun เขียนโค้ดแรก แล้วเข้าใจความต่างระหว่างการรันโค้ดกับการตรวจ type"
---

> 📅 เขียนเมื่อ: สิงหาคม 2026 | Bun 1.4, TypeScript 7.0
> ⚠️ API/เวอร์ชันอาจเปลี่ยนแปลง — ตรวจสอบเอกสารล่าสุดก่อนใช้งาน
>
> 📚 ตอนที่ 1/8 ในซีรีส์ "TypeScript จากศูนย์ถึงเขียน Test"

ก่อนจะไปถึงเรื่องเขียน test ด้วย Playwright หรือ unit test ใน Next.js เราต้องตั้งหลักกันก่อนที่จุดเริ่มต้น เพราะถ้าฐานไม่แน่น พอไปถึงตอน test ซึ่งต้องใช้ type เยอะ ๆ จะงงกันเป็นแถว

ซีรีส์นี้ผมตั้งใจเขียนให้คนที่เขียน JavaScript เป็นอยู่แล้ว แต่ยังไม่เคยแตะ TypeScript (หรือเคยลองแล้วรู้สึกว่า "มันวุ่นวายจัง") ได้ไล่ตามไปด้วยกัน ตั้งแต่ติดตั้งจนจบที่เขียน test ได้จริง รวมทั้งหมด 8 ตอน

ในตอนแรกนี้เราจะทำแค่สามอย่าง: **รู้จักว่า TypeScript คืออะไร → ติดตั้งให้เสร็จ → เขียนโค้ดแรกแล้วรันดู** ถ้าทำสามอย่างนี้ได้ ต่อจากนี้ก็เป็นการสะสมคำศัพท์และ pattern ไปเรื่อย ๆ

## ทำไมต้องมี TypeScript

เขียน JavaScript ไปสักพัก คุณน่าจะเคยเจอ error แบบนี้

```javascript
function getPrice(item) {
  return item.price * item.quantity;
}

getPrice({ price: "100" }); // "100" * undefined = NaN เงียบ ๆ ไม่มีใครเตือน
```

โค้ดนี้ `price` เป็น string พอเอาไปคูณ มันเลยได้ `NaN` แล้วก็ส่งต่อ ๆ กันไป ไม่มี error ฟ้องตอนเขียน กว่าจะรู้ตัวก็ตอนรันแล้วค่าผิดเพี้ยนไปไกลแล้ว

TypeScript แก้ปัญหานี้ด้วยการเพิ่ม "ระบบ type" เข้าไปบน JavaScript — คือเราประกาศว่า `price` ต้องเป็นตัวเลข แล้วตัว type checker จะคอยดักจับให้ว่าเราใช้ผิด type ตรงไหน ตั้งแต่ตอนเขียนเลย ยังไม่ทันรัน

```typescript
function getPrice(item: { price: number; quantity: number }) {
  return item.price * item.quantity;
}

getPrice({ price: "100" }); // ❌ error ตอนตรวจ: Type 'string' is not assignable to type 'number'
```

เห็นไหม — error เดิมที่เคยโผล่ตอนรัน กลายเป็นข้อความแดง ๆ ที่บอกชัดเจนตั้งแต่ตอนเขียนโค้ด นี่คือเหตุผลหลักที่ทีมโปรเจกต์ใหญ่ ๆ เปลี่ยนจาก JavaScript มาเป็น TypeScript กันแทบทั้งหมด

## ติดตั้ง Bun

ซีรีส์นี้เราจะใช้ **Bun** เป็นทั้ง runtime และ package manager — ข้อดีคือมันรัน TypeScript ได้ตรง ๆ ไม่ต้องตั้งค่าอะไรยุ่งยาก และเร็วกว่าตัวอื่นพอสมควร

ไปที่เว็บ bun.sh แล้วติดตั้งตามคำสั่ง (บน macOS/Linux ใช้คำสั่งนี้)

```bash
curl -fsSL https://bun.sh/install | bash
```

ติดตั้งเสร็จแล้วเปิด terminal ใหม่ แล้วตรวจสอบว่าใช้ได้

```bash
bun --version
```

ถ้าเห็นเลขเวอร์ชันขึ้นมา (เช่น `1.4.x`) แปลว่าพร้อมแล้ว Bun จะมาพร้อมกับตัวจัดการ package ในตัวเลย เราไม่ต้องติดตั้งอะไรเพิ่ม

## ตั้งโปรเจกต์แรก

สร้างโฟลเดอร์ใหม่ แล้วรัน `bun init` เพื่อให้ Bun สร้างโครงโปรเจกต์ให้อัตโนมัติ

```bash
mkdir my-first-ts
cd my-first-ts
bun init
```

คำสั่งนี้จะสร้างไฟล์พื้นฐานให้ครบชุด — ทั้ง `package.json` (บัตรประชาชนของโปรเจกต์), `tsconfig.json` (ไฟล์ตั้งค่า TypeScript) และไฟล์ `index.ts` ตัวอย่าง มาให้เลย ไม่ต้องสร้างเองทีละไฟล์แบบสมัยก่อน

## ติดตั้ง TypeScript

แม้ Bun จะรัน TypeScript ได้เอง แต่เราก็ยังติดตั้งตัว `typescript` ไว้ด้วย เพื่อใช้ตัว **type checker** (เดี๋ยวจะอธิบายว่าทำไม) ใช้คำสั่งนี้ — `-d` แปลว่า dev dependency คือของที่ใช้ตอนพัฒนาเท่านั้น

```bash
bun add -d typescript
```

ติดตั้งเสร็จ ใน `package.json` จะมีบรรทัด `"devDependencies": { "typescript": "..." }` เพิ่มขึ้นมา

## ตั้งค่า tsconfig.json

ไฟล์ `tsconfig.json` ที่ `bun init` สร้างไว้ให้ จะมี option พื้นฐานมาแล้ว แต่มีตัวหนึ่งที่สำคัญที่สุด ขอให้เข้าไปเช็คว่ามีอยู่จริง

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

- **`strict`** — สั่งให้ TypeScript เข้มงวดสุด ๆ เปิดไว้เลย ไม่ต้องคิดมาก มันคือเหตุผลที่คนใช้ TypeScript
- **`target`** — ระบุว่าโค้ด compile ไปเป็น JavaScript เวอร์ชันไหน (ถ้าไม่แน่ใจปล่อย default ไว้ก่อน)

## เขียนโค้ดแรก

เปิดไฟล์ `index.ts` แล้วเขียนแบบนี้

```typescript
function greet(name: string): string {
  return `Hello, ${name}`;
}

const message = greet("TypeScript");
console.log(message);
```

สังเกต `: string` สองจุด — จุดแรกหลัง `name` ประกาศว่า parameter ต้องเป็น string และจุดที่สองหลังวงเล็บ ประกาศว่า function นี้ return ค่าเป็น string นี่คือ "type annotation" ที่เราจะได้ใช้กันเยอะมากในตอนถัดไป

## รันเลย ไม่ต้อง compile

ตรงนี้คือจุดที่ Bun ต่างจากวิธีดั้งเดิม — เรา**ไม่ต้อง compile** โค้ด `.ts` เป็น `.js` ก่อนรัน แค่สั่ง `bun run` ตรง ๆ ได้เลย

```bash
bun run index.ts
# Hello, TypeScript
```

## ตรวจ type ด้วย tsc

แต่เดี๋ยวก่อน มีจุดสำคัญที่ต้องรู้: Bun รัน TypeScript ด้วยวิธีที่เรียกว่า **type stripping** — คือมันแค่ "ลอก" ส่วน type ออกแล้วรันโค้ดที่เหลือ โดย**ไม่ได้ตรวจ**ว่า type ถูกต้องไหม

ถ้าอยากให้ TypeScript ช่วยดักจับความผิดพลาด (ซึ่งคือหัวใจของมันเลย) ต้องรันตัวตรวจ type แยกต่างหาก

```bash
bunx tsc --noEmit
```

`--noEmit` แปลว่า "แค่ตรวจ อย่าสร้างไฟล์ `.js`" ลองแกล้งทำผิดดูเพื่อเห็นผล

```typescript
greet(42); // ❌ Argument of type 'number' is not assignable to parameter of type 'string'
```

รัน `bunx tsc --noEmit` อีกครั้ง จะเห็น error ฟ้องขึ้นมาทันที

สรุปให้เห็นภาพชัด: **Bun ดูแลเรื่องรันโค้ดให้เร็ว ส่วน `tsc` ดูแลเรื่องตรวจ type ให้ถูก** — สองตัวนี้ทำงานคนละหน้าที่ และเราจะใช้ทั้งคู่ไปตลอดซีรีส์นี้

## สรุป

ตอนนี้เรามีโปรเจกต์ TypeScript ที่พร้อมใช้งานแล้ว — ติดตั้ง Bun, ตั้งโปรเจกต์, ติดตั้ง TypeScript, รันโค้ดแรกด้วย `bun run` และตรวจ type ด้วย `tsc --noEmit` ขั้นตอนทั้งหมดนี้คือรากฐานที่ทุกตอนถัดไปจะยืนอยู่บนนั้น

ตอนถัดไปเราจะลงลึกเรื่อง **type พื้นฐาน** — string, number, array, object และ function ประกาศ type ยังไงให้อ่านง่าย ซึ่งเป็นคำศัพท์จำเป็นก่อนจะไปถึงเรื่อง test
---

**อ่านต่อ:** [ตอนที่ 2: Type พื้นฐานที่ต้องรู้ก่อนไปต่อ →](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep2)

