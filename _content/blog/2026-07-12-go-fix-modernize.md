---
title: "go fix ตัวใหม่ใน Go 1.26: เครื่องมือปรับโค้ดเก่าให้ทันสมัยอัตโนมัติ"
date: 2026-07-12
tags: [go, tooling, static-analysis, refactoring, ai]
description: "go fix เขียนใหม่ทั้งหมด ยืนบน Analysis Framework เดียวกับ go vet พร้อม modernizer ที่แก้สไตล์โค้ดเก่าให้อัตโนมัติ — รวมถึงโค้ดที่ AI generate"
---

`go fix` มีมานานแล้วในฐานะเครื่องมือ migrate โค้ดตอน Go API เปลี่ยน แต่ที่ผ่านมาแทบไม่มีใครใช้ เพราะ scope แคบมาก Go 1.26 เขียน `go fix` ใหม่ทั้งหมด ให้กลายเป็นเครื่องมือ "ปรับโค้ดให้ทันสมัย" (modernize) แบบกว้าง ๆ อ้างอิงจาก [Using go fix to modernize Go code](https://go.dev/blog/gofix) โดย Alan Donovan (17 กุมภาพันธ์ 2026)

**ขอบเขต:** สรุปหลักการทำงาน วิธีใช้ และตัวอย่าง modernizer ที่สำคัญ ไม่ได้ลงรายละเอียด infrastructure ภายใน (Cursor, Type Index, Facts) แบบลึก — ส่วนนั้นอ่านต่อได้จากบทความต้นฉบับ

## ที่มา: ทำไมต้อง rewrite ใหม่

เหตุผลหนึ่งที่บทความยกมาน่าสนใจเป็นพิเศษสำหรับคนที่ใช้ AI coding assistant เขียน Go — โค้ดที่ LLM สร้างมักมีสไตล์เก่ากว่าที่ควรจะเป็น:

> "such tools tended—unsurprisingly—to produce Go code in a style similar to the mass of Go code used during training, even when there were newer, better ways to express the same idea"

LLM ฝึกจาก corpus โค้ด Go จำนวนมหาศาลที่ส่วนใหญ่เขียนก่อน feature ใหม่ ๆ จะออก (`min`/`max` built-in, `range over int`, `strings.Cut`, ฯลฯ) พอ generate โค้ดใหม่ก็มักลอกสไตล์เก่าตามสัดส่วนของ training data ปรากฏการณ์นี้ตรงกับสิ่งที่งานวิจัยด้าน ML เรียกว่า **temporal distribution shift** — โมเดลถูกฝึกจากข้อมูล ณ ช่วงเวลาหนึ่ง แล้วนำไปใช้ในโลกที่ "มาตรฐานที่ดีที่สุด" เปลี่ยนไปแล้ว โมเดลจึงมักเอนเอียงไปทาง pattern ที่พบบ่อยที่สุดในอดีต ไม่ใช่ pattern ที่ดีที่สุด ณ ปัจจุบัน — `go fix` เวอร์ชันใหม่จึงเป็นเครื่องมือ "ล้างสไตล์เก่า" ให้อัตโนมัติ ไม่ว่าโค้ดนั้นจะมาจากคนเขียนเองหรือ AI ก็ตาม

## หลักการทำงาน

`go fix` ใช้ **Go Analysis Framework เดียวกับ `go vet`** — สถาปัตยกรรมแยกเป็น **analyzer** (อัลกอริทึมตรวจโค้ด) กับ **driver** (โปรแกรมที่รัน analyzer) แต่มาตรฐานของ analyzer สองฝั่งต่างกันโดยพื้นฐาน:

- **`go vet` analyzer** — ต้องมี false positive ต่ำ หน้าที่คือเตือนบั๊กที่เป็นไปได้ ไม่ใช่แก้ให้
- **`go fix` analyzer** — ต้องสร้างการแก้ไขที่ **ปลอดภัย** โดยไม่ regress ทั้ง correctness, ประสิทธิภาพ, และสไตล์

> "The task of developing a fixer is no different from that of developing a checker."

พูดง่าย ๆ คือ fixer เป็น checker ที่เข้มงวดกว่า checker ทั่วไป เพราะผลลัพธ์ถูกเอาไป apply ทับโค้ดจริงทันที ไม่ใช่แค่เตือน

## วิธีใช้งาน

```bash
$ go fix ./...
```

ดู diff ก่อน apply จริง (แนะนำเสมอ):

```bash
$ go fix -diff ./...
```

ดูรายชื่อ fixer ทั้งหมดที่มี:

```bash
$ go tool fix help
```

```
Registered analyzers:
    any          replace interface{} with any
    buildtag     check //go:build and // +build directives
    fmtappendf   replace []byte(fmt.Sprintf) with fmt.Appendf
    forvar       remove redundant re-declaration of loop variables
    hostport     check format of addresses passed to net.Dial
    inline       apply fixes based on 'go:fix inline' comment directives
    mapsloop     replace explicit loops over maps with calls to maps package
    minmax       replace if/else statements with calls to min or max
```

fixer ตัวหนึ่งที่ควรแยกให้ชัดจากตัวอื่นคือ `inline` — บทความต้นฉบับเรียกมันว่า "annotation-driven **source-level** inliner" ต่างจาก inlining ที่ compiler ทำตอน optimize โค้ด (ทำงานบน intermediate representation ชั่วคราวตอน compile แล้วทิ้ง ไม่กระทบไฟล์ต้นฉบับ) `inline` ของ `go fix` ทำงานบน AST ของ source code จริง ๆ แก้ไฟล์ `.go` ถาวรตาม directive `//go:fix inline` ที่ library author แปะไว้ — ใช้เพื่อ **ย้าย API เก่าไปใหม่** เช่น author deprecate ฟังก์ชันหนึ่งแล้วชี้ทางให้ผู้ใช้ inline เรียกฟังก์ชันใหม่แทนอัตโนมัติ ไม่ใช่เพื่อ performance เหมือน compiler inlining รายละเอียดเชิงลึกยังไม่ครบในบทความหลัก ทีม Go บอกว่าจะมีบทความแยกตามมา

ดู doc ของ fixer ตัวใดตัวหนึ่ง:

```bash
$ go tool fix help forvar
```

เลือกรันเฉพาะบาง fixer หรือ ยกเว้นบาง fixer:

```bash
$ go fix -any ./...       # รันเฉพาะ fixer 'any'
$ go fix -any=false ./... # รันทุกตัวยกเว้น 'any'
```

โปรเจกต์ที่ต้อง build หลาย platform ควรรันซ้ำตาม `GOOS`/`GOARCH` ที่ใช้จริง เพราะโค้ดบางส่วนถูก compile เฉพาะบาง platform (build tag):

```bash
$ GOOS=linux   GOARCH=amd64 go fix ./...
$ GOOS=darwin  GOARCH=arm64 go fix ./...
$ GOOS=windows GOARCH=amd64 go fix ./...
```

## ตัวอย่าง modernizer ที่ใช้บ่อย

**`minmax`** — แทน if/else ด้วย `min`/`max` built-in (Go 1.21):

```go
// ก่อน
x := f()
if x < 0 {
	x = 0
}
if x > 100 {
	x = 100
}

// หลัง
x := min(max(f(), 0), 100)
```

**`rangeint`** — แทน 3-clause for loop ด้วย range-over-int (Go 1.22):

```go
// ก่อน
for i := 0; i < n; i++ {
	f()
}

// หลัง
for range n {
	f()
}
```

**`stringscut`** — แทน `strings.Index` + slicing ด้วย `strings.Cut` (Go 1.18):

```go
// ก่อน
i := strings.Index(s, ":")
if i >= 0 {
	return s[:i]
}

// หลัง
before, _, ok := strings.Cut(s, ":")
if ok {
	return before
}
```

**`newexpr`** — ตัวอย่างที่แสดงว่า `go fix` ตาม feature ใหม่ของ Go เองได้ทันที Go 1.26 ให้ `new()` รับค่าได้ตรง ๆ ไม่ใช่แค่ type:

```go
// ก่อน — ต้องมี helper function
func newInt(x int) *int { return &x }

data, err := json.Marshal(&RequestJSON{
	URL:      url,
	Attempts: newInt(10),
})

// หลัง — ไม่ต้องมี helper แล้ว
data, err := json.Marshal(&RequestJSON{
	URL:      url,
	Attempts: new(10),
})
```

รันเฉพาะตัวนี้ด้วย `go fix -newexpr ./...` — `go fix` รู้จัก pattern "new-like function" (ฟังก์ชันที่ทำหน้าที่เหมือน `new` แค่คืนค่าที่กำหนด) แล้วแทนที่ทั้ง definition และทุกจุดที่เรียกใช้ให้อัตโนมัติ

จุดสำคัญ: modernizer ที่พึ่ง feature ใหม่แบบนี้จะเช็ค `go 1.26` ใน go.mod หรือ `//go:build go1.26` ก่อนเสมอ ไม่แก้โค้ดให้ใช้ syntax ที่ toolchain เป้าหมายยังไม่รองรับ

## Synergistic fixes — ทำไมบางทีต้องรัน `go fix` สองรอบ

การแก้ไขหนึ่งจุดอาจเปิดโอกาสให้ fixer ตัวอื่นเห็น pattern ใหม่ที่เพิ่งเกิดขึ้น ตัวอย่างจากบทความ: โค้ด `if/else` สองก้อนติดกัน (min-check กับ max-check) รอบแรก `minmax` เห็นแค่ก้อนเดียว แก้เป็น `max(f(), 0)` ก่อน พอโครงสร้างเปลี่ยน รอบสองถึงเห็น pattern ของ `min` ซ้อนเข้าไปได้อีกชั้น กลายเป็น `min(max(f(), 0), 100)` ตามตัวอย่างด้านบน

> "it may be worth running `go fix` more than once until it reaches a fixed point; twice is usually enough"

## จัดการ conflict ยังไงเมื่อหลาย fix ชนกัน

- **Syntactic conflict** — ถ้าการแก้ไขสองจุดชนตำแหน่งกันในโค้ด `go fix` ใช้ **three-way merge algorithm** แบบเดียวกับ git ถ้า merge ไม่ได้จะข้าม fix นั้นไปก่อน พร้อม warning ให้รันใหม่รอบถัดไป
- **Semantic conflict** — กรณีที่ merge ได้ทางไวยากรณ์ แต่ผลลัพธ์ขัดกันทางความหมาย เช่น 2 fixer ต่างลบการใช้ตัวแปรตัวสุดท้ายพร้อมกัน ทำให้ตัวแปรกลายเป็น unused (compile error ใน Go) — `go fix` ลบ unused import ให้อัตโนมัติในรอบสุดท้ายเพื่อลด noise ประเภทนี้ แต่ error อื่นที่หลุดมาต้องแก้เอง

## ข้อจำกัด

- **ข้าม generated files เสมอ** — ไฟล์ที่มี header บอกว่า auto-generated จะไม่ถูกแตะ ต้องแก้ที่ตัว generator เอง
- **บาง modernizer ถูกถอดออกจาก default suite เพราะเปลี่ยน behavior ทางอ้อม** ตัวอย่างที่บทความยกมา: `appendclipped` เคยแนะนำเปลี่ยน `append([]string{}, slice...)` เป็น `slices.Clone(slice)` แต่ `slices.Clone` คืน `nil` เมื่อ slice ว่าง ต่างจาก `append([]string{}, ...)` ที่คืน slice ว่างที่ไม่ใช่ `nil` — โค้ดที่เช็ค `== nil` อยู่จะพังทันทีถ้าไม่รู้ตัว ทีม Go เลยถอด fixer ตัวนี้ออกจาก suite ปกติ เป็นตัวอย่างที่ดีว่าแม้แต่ทีมสร้างเครื่องมือเองก็ยังระวังเรื่อง subtle behavior change ขนาดนี้ — บทเรียนสำหรับคนเอาไปใช้: ก่อน merge ควรมี unit test ครอบคลุมเคส `== nil` ของ slice/map ที่ผ่าน fixer มา ไม่ใช่พึ่ง suite ที่ทีม Go กรองมาให้อย่างเดียว เพราะ fixer ตัวอื่นในอนาคตอาจมี trade-off แบบเดียวกันที่ยังไม่ถูกจับได้
- **Semantic conflict บางเคสต้องแก้มือ** ไม่ใช่ทุกอย่างจบในตัว

## สิ่งที่ต้องทำถ้าจะเอาไปใช้

1. **เริ่มจาก git state ที่ clean** — เพื่อให้ diff ที่เกิดจาก `go fix` แยกออกจากงานที่ทำค้างไว้ ให้ reviewer ตรวจง่าย
2. **รัน `-diff` ก่อนเสมอ** อย่า apply ตรง ๆ รอบแรกโดยไม่ดู
3. **รันซ้ำจนไม่มีอะไรเปลี่ยนแล้ว (fixed point)** — ปกติ 2 รอบพอตามที่ทีม Go แนะนำ
4. **ถ้า build หลาย platform ให้รันครบทุก `GOOS`/`GOARCH`** ที่โปรเจกต์ support จริง ไม่งั้น fixer จะพลาด code path ที่ compile เฉพาะบาง platform
5. **ตรวจ compile/test หลัง fix ทุกครั้ง** โดยเฉพาะจุดที่เกี่ยวกับ nil vs empty slice/map ตามที่เป็นข้อจำกัดข้างต้น
6. **เพิ่ม `go fix -diff` เป็น step ใน CI** เพื่อ enforce ว่าโค้ดที่ merge เข้ามาทันสมัยอยู่เสมอ ไม่ปล่อยให้สไตล์เก่าสะสม โดยเฉพาะทีมที่ใช้ AI coding assistant เขียนโค้ดเยอะ — ผูก `go fix` ไว้ใน pre-commit hook คู่กับ `go fmt` เลยยิ่งดี จะได้ format และ modernize โค้ดที่ AI generate ก่อน commit ทุกครั้ง ไม่ต้องรอมาเจอใน CI ทีหลัง

## ทิศทางอนาคต: self-service modernizer

บทความทิ้งท้ายด้วยวิสัยทัศน์ที่ยังไม่ใช่ของวันนี้ แต่น่าติดตาม — เปิดให้ผู้เขียน library เขียน modernizer ของ API ตัวเองได้ (เช่น library ต่อ SQL database เขียน checker ดัก SQL injection ของตัวเอง) และรองรับ pattern ประเภท "อย่าลืมทำ X หลังทำ Y" (ปิดไฟล์หลังเปิด, cancel context หลังสร้าง, unlock mutex หลัง lock) เป็น built-in analyzer ที่โหลดจาก source tree ของแต่ละโปรเจกต์เอง

## สรุป

`go fix` ตัวใหม่ไม่ใช่แค่ migration tool แคบ ๆ แบบเดิมอีกต่อไป แต่เป็นเครื่องมือปรับสไตล์โค้ดให้ตามทัน Go เวอร์ชันปัจจุบันแบบอัตโนมัติ ปลอดภัยพอจะรันจริงเพราะยืนอยู่บน Analysis Framework เดียวกับ `go vet` ที่เข้มงวดเรื่อง false positive และไม่ regress ทั้ง correctness, performance, style ที่น่าสนใจเป็นพิเศษคือมันแก้ปัญหาที่ AI coding assistant สร้างขึ้นเองโดยอ้อม — โค้ดสไตล์เก่าที่ LLM มักถูก bias จาก training data ตอนนี้ล้างออกได้ด้วยคำสั่งเดียว

**หมายเหตุ:** `go fix` เวอร์ชันนี้มาพร้อม Go 1.26 รายชื่อ fixer ที่ available จะเพิ่มขึ้นเรื่อย ๆ ตามเวอร์ชัน Go ถัดไป และแผน self-service modernizer ยังเป็นทิศทางระยะยาว ไม่ใช่ของที่ใช้ได้วันนี้ ควรเช็ค `go tool fix help` เวอร์ชันที่ใช้จริงเพื่อดูรายชื่อ fixer ล่าสุดเสมอ

**อ้างอิง:**

- Donovan, A. (2026). [Using go fix to modernize Go code](https://go.dev/blog/gofix). go.dev/blog
- golang/go Issue [#71859: cmd/go: fix: apply fixes from modernizers, inline, and other analyzers](https://github.com/golang/go/issues/71859) — proposal ต้นทางของการ rewrite `go fix` ให้ยืนบน framework เดียวกับ `go vet` (Proposal-Accepted, กำหนดลง Go 1.26)
