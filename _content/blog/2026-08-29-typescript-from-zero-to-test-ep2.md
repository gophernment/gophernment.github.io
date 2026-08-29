---
title: "TypeScript จากศูนย์ถึงเขียน Test — ตอนที่ 2: Type พื้นฐานที่ต้องรู้ก่อนไปต่อ"
date: 2026-08-29
tags: [typescript, beginners, tutorial]
description: "รวม type พื้นฐานที่ต้องรู้ — primitive, array, object, interface, function, union และ literal type"
---

> 📅 เขียนเมื่อ: สิงหาคม 2026 | TypeScript 7.0
> ⚠️ API/เวอร์ชันอาจเปลี่ยนแปลง — ตรวจสอบเอกสารล่าสุดก่อนใช้งาน
>
> 📚 ตอนที่ 2/8 ในซีรีส์ "TypeScript จากศูนย์ถึงเขียน Test"

ตอนที่แล้วเราติดตั้งทุกอย่างเสร็จ และ compile โค้ดแรกผ่านไปแล้ว ตอนนี้ถึงเวลาสะสม "คำศัพท์" — วิธีประกาศ type ให้กับตัวแปร ฟังก์ชัน และ object แบบต่าง ๆ

ถ้าเทียบกับการเรียนภาษาใหม่ type พื้นฐานพวกนี้คือคำศัพท์ชุดแรกที่ใช้บ่อยที่สุด ต่อให้ไปถึงตอนเขียน test เราก็วนกลับมาใช้ของพวกนี้ตลอด ดังนั้นค่อย ๆ ทำความเข้าใจให้แม่นตรงนี้ก่อนดีที่สุด

## Type พื้นฐาน: string, number, boolean

ประกาศ type ง่าย ๆ ด้วยเครื่องหมายโคลอน `:` ต่อท้ายชื่อตัวแปร

```typescript
let name: string = "โจ้";
let age: number = 30;
let isStudent: boolean = false;
```

แค่สามบรรทัดนี้ หลักการก็ครบแล้ว — TypeScript จะคอยเช็คให้ว่าเราจะไม่เอา string ไปใส่ในตัวแปรที่ประกาศว่าเป็น number

```typescript
age = "สามสิบ"; // ❌ Type 'string' is not assignable to type 'number'
```

จริง ๆ หลายครั้งเราไม่ต้องประกาศ type ให้ครบทุกตัว เพราะ TypeScript เดาเอาเองได้จากค่าที่เรากำหนดให้ — เรียกว่า **type inference** (ความสามารถของ compiler ในการเดา type จากค่าที่กำหนด โดยไม่ต้องประกาศเองทุกตัว)

```typescript
let score = 100; // TypeScript เดาเองว่าเป็น number
score = 200;     // ✅
score = "สูง";   // ❌
```

## Array และ Tuple

สำหรับ array ให้ใส่ `[]` ต่อท้าย type ของสมาชิก

```typescript
let numbers: number[] = [1, 2, 3];
let names: string[] = ["โจ้", "จิน", "มิ้น"];
```

แต่ถ้าอยากได้ array ที่กำหนดจำนวนและ type ของแต่ละช่องแบบตายตัว (เช่น พิกัด x, y) ให้ใช้ **tuple**

```typescript
let point: [number, number] = [10, 20];
point = [30, 40]; // ✅
point = [30, 40, 50]; // ❌ เกินสองช่อง
point = ["x", "y"];   // ❌ ต้องเป็น number
```

## Object และ Interface

สำหรับ object เราประกาศ type ของแต่ละ property ได้สองวิธี วิธีแรกเขียนตรง ๆ เลย

```typescript
const user: { name: string; age: number } = {
  name: "โจ้",
  age: 30,
};
```

แต่พอ object เริ่มซับซ้อน การเขียนแบบนี้จะอ่านยากขึ้นเรื่อย ๆ เราจึงใช้ **interface** ตั้งชื่อให้กับ "รูปทรง" ของ object แทน แล้วนำไปใช้ซ้ำได้

```typescript
interface User {
  name: string;
  age: number;
  isStudent: boolean;
}

const user: User = {
  name: "โจ้",
  age: 30,
  isStudent: false,
};
```

interface คือหัวใจสำคัญของการเขียน TypeScript — มันคือการ "กำหนดสัญญา" ว่า object ตัวนี้ต้องมี property อะไรบ้าง type อะไร ทีมอื่น (หรือ AI) จะได้เข้าใจตรงกันว่าข้อมูลหน้าตาเป็นยังไง

นอกจาก interface แล้วยังมี **type alias** ที่ใช้ประกาศ type ตั้งชื่อได้เหมือนกัน ใช้แทนกันได้เป็นส่วนใหญ่ แต่ถ้าเป็นการอธิบาย "รูปทรงของ object" แล้วล่ะก็ interface เป็นตัวเลือกที่คนส่วนใหญ่ใช้เป็นหลัก

```typescript
type Point = {
  x: number;
  y: number;
};
```

## Function และ Parameter

ประกาศ type ให้ function ทั้งส่วน parameter และค่าที่ return กลับ

```typescript
function add(a: number, b: number): number {
  return a + b;
}
```

parameter ที่อาจไม่มีมาก็ใส่เครื่องหมาย `?` เพื่อบอกว่าเป็น optional

```typescript
function greet(name: string, title?: string): string {
  return title ? `${title} ${name}` : name;
}
```

## Union Type: "อย่างใดอย่างหนึ่ง"

บ่อยครั้งค่าตัวหนึ่งเป็นได้หลาย type เช่น เลข ID ที่บางครั้งเป็น string บางครั้งเป็น number เราใช้ `|` เพื่อบอกว่า "อย่างใดอย่างหนึ่ง"

```typescript
let id: string | number;

id = "abc123"; // ✅
id = 456;      // ✅
id = true;     // ❌
```

## Literal Type: จำกัดค่าให้ตายตัว

ถ้าไม่อยากให้ค่าอะไรก็ได้มาใส่ แต่จำกัดให้เป็นค่าที่กำหนดไว้เท่านั้น (เช่น สถานะคำสั่งซื้อ) ใช้ **literal type**

```typescript
type OrderStatus = "pending" | "paid" | "shipped";

function updateStatus(status: OrderStatus) {
  // ...
}

updateStatus("paid");     // ✅
updateStatus("delivered"); // ❌ ไม่มีในรายการ
```

วิธีนี้ปลอดภัยกว่าใช้ string เปล่า ๆ มาก เพราะพิมพ์ผิดตัวเดียว compiler ก็จะฟ้องทันที

## any และ unknown

มีสอง type ที่เจอบ่อยและควรรู้จักให้ถูก

**`any`** คือการ "ปิดระบบ type" — ตัวแปรที่เป็น `any` จะทำอะไรก็ได้ ไม่มีการเช็คใด ๆ ทั้งสิ้น ฟังดูสะดวกแต่จริง ๆ มันคือการยอมแพ้ต่อประโยชน์ทั้งหมดของ TypeScript จึงควรเลี่ยงให้มากที่สุด

```typescript
let anything: any = 42;
anything = "hello";
anything.foo.bar(); // ไม่ error — แต่รันแล้วพังแน่นอน
```

**`unknown`** ต่างกันตรงที่ยังคง "ปลอดภัย" — เราทำอะไรกับ `unknown` ไม่ได้จนกว่าจะตรวจเช็ค type ก่อน

```typescript
let something: unknown = 42;

// something.toFixed(); // ❌ ยังทำไม่ได้ ต้องเช็คก่อน
if (typeof something === "number") {
  something.toFixed(2); // ✅ ตอนนี้รู้แล้วว่าเป็น number
}
```

จำง่าย ๆ ว่า ถ้าจำเป็นต้อง "หนี" จากระบบ type ให้ใช้ `unknown` แล้วค่อย ๆ ตรวจ ก่อนใช้ — อย่าใช้ `any` เป็นทางลัด

## สรุป

ตอนนี้เรามีคำศัพท์พื้นฐานครบแล้ว — primitive type, array/tuple, object/interface, function, union, literal type และความต่างของ any/unknown ทั้งหมดนี้คือสิ่งที่เราจะเอาไปประกอบกันเป็นโค้ดจริงในทุกตอนถัดไป

ตอนหน้าเราจะลงลึกเรื่อง **generics และ utility type** — วิธีเขียน type ให้ "นำกลับมาใช้ซ้ำ" ได้โดยไม่ต้องประกาศซ้ำ ๆ ซึ่งเป็นบันไดขั้นถัดไปก่อนเข้าสู่การเขียน test จริงจัง
---

**อ่านต่อในซีรีส์:** [← ตอนที่ 1: รู้จัก ติดตั้ง และเขียนโค้ดแรก](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep1) · [ตอนที่ 3: Generics และ Utility types →](/blog/post.html?slug=2026-08-29-typescript-from-zero-to-test-ep3)

