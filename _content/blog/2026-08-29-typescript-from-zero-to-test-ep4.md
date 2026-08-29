---
title: "TypeScript จากศูนย์ถึงเขียน Test — ตอนที่ 4: Type Narrowing และ Type Guards"
date: 2026-08-29
tags: [typescript, beginners, tutorial]
description: "Type narrowing และ type guards — วิธีให้ compiler รู้ว่า type คืออะไร ณ จุดนั้นของโค้ด"
---

> 📅 เขียนเมื่อ: สิงหาคม 2026 | TypeScript 7.0
> ⚠️ API/เวอร์ชันอาจเปลี่ยนแปลง — ตรวจสอบเอกสารล่าสุดก่อนใช้งาน
>
> 📚 ตอนที่ 4/8 ในซีรีส์ "TypeScript จากศูนย์ถึงเขียน Test"

ตอนที่แล้วเราจบที่ generics และ utility types ตอนนี้ถึงเรื่องที่ทำให้โค้ด TypeScript "ฉลาด" จริง ๆ — ความสามารถของ compiler ในการ**รู้ว่า type คืออะไร ณ จุดนั้นของโค้ด**

ลองคิดดู: ถ้าเรามีตัวแปรที่เป็น `string | number` (union) เราจะใช้ method ของ string ไม่ได้จนกว่า compiler จะแน่ใจว่าตอนนั้นมันเป็น string จริง ๆ กระบวนการที่ compiler จำกัด type ให้แคบลงนี้เรียกว่า **type narrowing** และมันคือหัวใจของการเขียนโค้ดที่ type-safe กับข้อมูลหลายรูปทรง

## Narrowing ด้วย `typeof`

วิธีพื้นฐานสุดคือใช้ `typeof` เช็ค type ก่อนใช้งาน

```typescript
function padLeft(value: string | number, width: number): string {
  if (typeof value === "number") {
    // ในบล็อกนี้ value ถูก narrow ให้เป็น number แล้ว
    return " ".repeat(width) + value.toString();
  }
  // มาถึงตรงนี้ value เป็น string แน่นอน
  return " ".repeat(width) + value;
}
```

จุดสำคัญคือ**ภายใน**บล็อก `if` นั้น TypeScript รู้แล้วว่า `value` เป็น `number` เราเลยเรียก `.toString()` ได้ ส่วนหลัง `if` compiler รู้ว่าถ้าไม่ใช่ number ก็ต้องเป็น string (เพราะ union มีแค่สองตัว)

## Narrowing ด้วย `instanceof`

ถ้าต้องเช็คว่าตัวแปรเป็น instance ของ class ไหน ใช้ `instanceof`

```typescript
function getDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}
```

## สร้าง Type Guard เอง

`typeof` และ `instanceof` ใช้ได้กับ type พื้นฐาน แต่ถ้าเป็น object ที่เราสร้างเอง ต้องเขียนฟังก์ชันเช็คเอง — เรียกว่า **type guard** โดยใช้ keyword `is`

```typescript
interface Cat {
  meow(): void;
}

interface Dog {
  bark(): void;
}

function isCat(animal: Cat | Dog): animal is Cat {
  return (animal as Cat).meow !== undefined;
}

function makeSound(animal: Cat | Dog) {
  if (isCat(animal)) {
    animal.meow(); // ✅ narrow เป็น Cat แล้ว
  } else {
    animal.bark(); // ✅ narrow เป็น Dog
  }
}
```

สังเกต return type ของ `isCat` — `animal is Cat` เป็นการ "สัญญา" กับ compiler ว่าถ้า function นี้คืน `true` แปลว่า `animal` เป็น `Cat` แน่นอน

## Discriminated Union: วิธีที่ใช้บ่อยที่สุด

เวลาข้อมูลมีหลายรูปทรงที่แยกจากกันได้ด้วย field ตัวหนึ่ง (เช่น `kind` หรือ `type`) เราใช้ pattern ที่เรียกว่า **discriminated union** — ใส่ literal type เป็น "ป้าย" ให้แต่ละแบบ แล้วใช้ switch เช็ค

```typescript
type ApiState =
  | { status: "loading" }
  | { status: "success"; data: string[] }
  | { status: "error"; message: string };

function render(state: ApiState) {
  switch (state.status) {
    case "loading":
      return "กำลังโหลด...";
    case "success":
      return state.data.join(", "); // ✅ มี data
    case "error":
      return state.message; // ✅ มี message
  }
}
```

`status` ที่เป็น literal type (`"loading" | "success" | "error"`) คือ "ป้าย" ที่ทำให้ compiler รู้ว่าแต่ละ branch ตัวแปรมี field อะไรบ้าง — ถ้าเราเผลอใช้ `state.data` ใน branch `loading` compiler จะฟ้องทันที เพราะในรูปทรง `loading` ไม่มี `data`

## Narrowing ค่า null/undefined

ค่าที่เป็น `null` หรือ `undefined` ต้องเช็คก่อนใช้เสมอ วิธีที่อ่านง่ายที่สุดคือเช็คความจริง (truthiness)

```typescript
function getLength(text: string | null): number {
  if (text) {
    return text.length; // ✅ text เป็น string แล้ว
  }
  return 0;
}
```

## สรุป

Type narrowing คือสิ่งที่ทำให้ TypeScript ไม่ใช่แค่ "ประกาศ type แล้วจบ" แต่เป็นภาษาที่**ติดตาม type ไปตลอดทาง**ของโค้ด — รู้ว่า ณ จุดไหนตัวแปรเป็นอะไรได้บ้าง และกันเราจากการเข้าถึง field ที่ไม่มีอยู่จริง

นี่คือทักษะสุดท้ายในส่วนของ type — จากนี้ไปเราจะเปลี่ยนไปสู่**การเขียน test** ซึ่งจะได้ใช้ทุกอย่างที่เรียนมา ทั้ง union, literal type, generics และ discriminated union อย่างเต็มที่

ตอนหน้าเราจะมาทำความเข้าใจเรื่อง **การทดสอบ (testing)** กันก่อน — unit test, integration test, e2e test คืออะไร และทำไมเราต้องเขียน
---

**อ่านต่อในซีรีส์:** [← ตอนที่ 3: Generics และ Utility types](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep3) · [ตอนที่ 5: เข้าใจการทดสอบ (Testing) ก่อนลงมือเขียน →](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep5)

