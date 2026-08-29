---
title: "TypeScript จากศูนย์ถึงเขียน Test — ตอนที่ 3: Generics และ Utility types"
date: 2026-08-29
tags: [typescript, beginners, tutorial]
description: "Generics และ utility types — วิธีเขียน type ให้ยืดหยุ่นและนำกลับมาใช้ซ้ำโดยไม่ต้องประกาศซ้ำ"
---

> 📅 เขียนเมื่อ: สิงหาคม 2026 | TypeScript 7.0
> ⚠️ API/เวอร์ชันอาจเปลี่ยนแปลง — ตรวจสอบเอกสารล่าสุดก่อนใช้งาน
>
> 📚 ตอนที่ 3/8 ในซีรีส์ "TypeScript จากศูนย์ถึงเขียน Test"

ตอนที่แล้วเราได้รู้จัก type พื้นฐานกันแล้ว — string, number, interface, union และ literal type ตอนนี้ถึงเวลาขยับไปเรื่องที่ทำให้ TypeScript ต่างจากภาษา "มี type ธรรมดา" จริง ๆ นั่นคือ **generics** และ **utility types**

ถ้าตอนที่แล้วคือการเรียนคำศัพท์ ตอนนี้คือการเรียน "แม่แบบ" — วิธีเขียน type ที่นำกลับมาใช้ซ้ำได้ โดยไม่ต้องประกาศแบบเดิมซ้ำแล้วซ้ำเล่า

## ปัญหาที่ generics มาแก้

ลองดู function นี้ ที่รับ array แล้วคืนค่า element ตัวแรกออกมา

```typescript
function firstElement(arr: string[]): string | undefined {
  return arr[0];
}
```

มันใช้ได้กับ array ของ string แต่ถ้าอยากได้ array ของ number ล่ะ? เราก็ต้องเขียน function ใหม่ (หรือใช้ `any` ซึ่งเรารู้แล้วว่าไม่ควร)

**Generics** คือทางออก — เราเขียน type เป็น "ตัวแปร" ที่รอให้ผู้ใช้ระบุตอนเรียกใช้จริง

```typescript
function firstElement<T>(arr: T[]): T | undefined {
  return arr[0];
}

const n = firstElement([1, 2, 3]); // number | undefined
const s = firstElement(["a", "b"]); // string | undefined
```

`<T>` คือ type parameter — ตัวอักษร `T` เป็นแค่ชื่อ (ย่อมาจาก "type") ตั้งชื่ออะไรก็ได้ ตอนเรียกใช้ TypeScript จะเดา `T` เอาเองจาก argument ที่ส่งเข้าไป

## Generics กับ Interface

Generics ใช้กับ interface ได้ด้วย และนี่คือจุดที่มันทรงพลังที่สุด — การอธิบาย "รูปทรงที่ซ้อนรูปทรง"

```typescript
interface ApiResponse<T> {
  data: T;
  status: number;
}

const userResponse: ApiResponse<{ name: string }> = {
  data: { name: "โจ้" },
  status: 200,
};
```

`ApiResponse<T>` คือแม่แบบของ response ทั่วไป ที่ส่วน `data` จะเป็นอะไรก็ได้ขึ้นอยู่กับว่าเราใส่ type อะไรให้ `T` — API เดียวใช้ตอบได้ทั้ง user, product, order โดยไม่ต้องประกาศ interface ซ้ำ

## จำกัดขอบเขตด้วย extends

บางครั้งเราอยากให้ `T` เป็นได้แค่ type ที่มีคุณสมบัติบางอย่าง ใช้ `extends` เพื่อจำกัด

```typescript
function getLength<T extends { length: number }>(item: T): number {
  return item.length;
}

getLength("hello");   // ✅ 5 (string มี length)
getLength([1, 2, 3]); // ✅ 3 (array มี length)
getLength(42);        // ❌ number ไม่มี length
```

บรรทัดสุดท้าย compiler จะฟ้องทันที เพราะ `number` ไม่มี property `length` — เรากันของที่ไม่ควรเข้ามาได้ตั้งแต่ตอนเขียน

## Utility types: ของสำเร็จรูปที่ใช้บ่อย

TypeScript มาพร้อม type สำเร็จรูปชุดหนึ่งที่สร้างจาก type อื่น — เรียกว่า **utility types** ขอยกตัวที่ใช้บ่อยที่สุด

สมมติมี interface นี้

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  age: number;
}
```

### `Omit` — ตัดบาง field ออก

เวลาสร้าง user ใหม่ เรายังไม่มี `id` (ฐานข้อมูลจะสร้างให้ทีหลัง) ใช้ `Omit` ตัด `id` ออก

```typescript
type CreateUserInput = Omit<User, "id">;
// { name: string; email: string; age: number }
```

### `Pick` — เลือกแค่บาง field

อยากได้แค่ชื่อกับอีเมล ใช้ `Pick`

```typescript
type UserContact = Pick<User, "name" | "email">;
// { name: string; email: string }
```

### `Partial` — ทำให้ทุก field เป็น optional

เวลาอัปเดตข้อมูล เราอาจอยากแก้แค่บาง field ใช้ `Partial`

```typescript
type UserUpdate = Partial<User>;
// ทุก field เป็น optional หมด
```

### `Record` — สร้าง map ที่คีย์เป็น type ที่กำหนด

อยากทำ dictionary เก็บคะแนนตามชื่อผู้ใช้ ใช้ `Record`

```typescript
type Scores = Record<string, number>;

const scores: Scores = {
  โจ้: 95,
  จิน: 88,
};
```

## สรุป

Generics และ utility types คือเครื่องมือที่ทำให้ type ของเรา "นำกลับมาใช้ซ้ำ" ได้ — เขียนแม่แบบครั้งเดียว แล้วเอาไปใช้กับข้อมูลหลายรูปทรง ต่างจากตอนที่แล้วที่ประกาศ type ทีละตัว

จำไว้ว่าเป้าหมายไม่ใช่เขียน type ให้ซับซ้อน แต่คือเขียนให้ **ยืดหยุ่นและชัดเจน** — generics ใช้เมื่อเจอ pattern ซ้ำ ๆ ส่วน utility types ใช้เมื่อต้องการ "ดัดแปลง" type ที่มีอยู่แล้ว

ตอนหน้าเราจะลงลึกเรื่อง **type narrowing และ type guards** — วิธีที่ TypeScript ใช้ "จำกัด" type ให้แคบลงในแต่ละจุดของโค้ด ซึ่งจำเป็นมากเมื่อไปถึงตอนเขียน test
---

**อ่านต่อในซีรีส์:** [← ตอนที่ 2: Type พื้นฐานที่ต้องรู้ก่อนไปต่อ](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep2) · [ตอนที่ 4: Type Narrowing และ Type Guards →](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep4)

