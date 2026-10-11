---
title: 'Smashing the Stack (1996): วันที่โลกเรียนรู้ว่า "เขียนเกินบัฟเฟอร์" คือการยึดเครื่อง (ตอนที่ 03)'
date: 2026-10-11
tags: [software-security, security, buffer-overflow, stack-smashing, shellcode, exploit]
description: "ตอนที่ 03 ของคอร์ส Software Security — แกะบทความ Smashing the Stack (Phrack 49, 1996, Aleph One): ผัง stack frame, กลไกเขียนเกินบัฟเฟอร์จนทับ return address, shellcode และเกราะ stack canary / NX bit / ASLR พร้อมเดโมรันจริง (C stack_smash + Go hijack model)"
---
# Smashing the Stack (1996): วันที่โลกเรียนรู้ว่า "เขียนเกินบัฟเฟอร์" คือการยึดเครื่อง (ตอนที่ 03)

> 📅 เขียนเมื่อ: 11 ตุลาคม 2026 (เวลาไทย, UTC+7) | โค้ดในบทนี้ทดสอบจริงบน Raspberry Pi 5 (Linux 6.18.39, aarch64) ด้วย **Go 1.24.4** และ **gcc 14.2.0** — เวอร์ชันล่าสุด ณ วันเขียน: **Go 1.27.2** (ออก 8 ตุลาคม 2026) และ **GCC 16.2** (ออก 7 สิงหาคม 2026)
> ⚠️ เครื่องมือและภาษาเปลี่ยนเวอร์ชันเรื่อย ๆ — ก่อนใช้จริงให้ตรวจเอกสารทางการล่าสุดเสมอ
> 🛡️ **จริยธรรม:** ตอนนี้สอนกลไกของ **exploit** (โค้ดหรือเทคนิคที่ใช้ประโยชน์จากช่องโหว่เพื่อให้โปรแกรมทำงานผิดไปจากที่ออกแบบ) ตรง ๆ — เดโมและโจทย์ทุกข้อในบทนี้ **ทำใน environment ที่คุณควบคุมเองเท่านั้น** (เครื่องตัวเอง, VM, container หรือ lab ที่ตั้งใจให้ทดลอง) **ห้ามใช้เทคนิคเหล่านี้กับระบบของคนอื่นโดยไม่ได้รับอนุญาต** ซึ่งผิดกฎหมายในแทบทุกประเทศ · เดโมในบทนี้ **ไม่รัน shellcode (โค้ดที่ผู้โจมตีเขียนขึ้นเพื่อให้ CPU รัน) จริงแม้แต่ไบต์เดียว** และไม่แตะหน่วยความจำจริงของ process — เราใช้ "โมเดล" เพื่อดูกลไกเท่านั้น · โค้ดที่โชว์มี label กำกับชัดว่า **"ห้ามใช้จริง"**

---

ใน[ตอนที่ 02](/blog/post.html?slug=2026-10-10-software-security-02-morris-worm-1988) เราเห็นเส้นทาง ① ของ Morris Worm แวบหนึ่ง: `fingerd` อ่านข้อมูลเข้า buffer 512 ไบต์ แต่หนอนส่ง 536 ไบต์ ไบต์ที่เกิน 24 ไบต์นั้นไหลไปทับ **return address** แล้ว CPU ก็กระโดดไปรันคำสั่งของหนอนแทน

วันนี้เราจะกลับไปที่กลไกนั้นให้เต็ม ๆ — ไม่ใช่ในฐานะ "เรื่องเล่าปี 1988" แต่ในฐานะ**เทคนิคที่ถูกเขียนเป็นตำรา** เมื่อวันที่ **8 พฤศจิกายน 1996** ในนิตยสาร Phrack ฉบับที่ 49 บทความชื่อ *Smashing the Stack for Fun and Profit*

และที่สำคัญ: ตอนนี้คือ**ต้นตอ**ของเกราะสามชั้นที่คุณใช้อยู่ทุกวันนี้โดยไม่รู้ตัว — **stack canary**, **NX bit** และ **ASLR**

> **หมายเหตุสำหรับผู้เรียน:** บทนี้ต่อจาก[ตอนที่ 16 ของซีรีส์ CS Fundamentals](/blog/post.html?slug=2026-09-19-cs-fundamentals-16-memory-safety-overflow) ที่คุณเรียนเรื่อง stack frame, return address, stack protector และ ASLR ไปแล้ว · ตอนนั้นคุณเรียนในฐานะ "คนเขียนโปรแกรม" (ทำไมมันพัง และจะกันยังไง) — ตอนนี้เราจะ **นั่งลงในเก้าอี้ของผู้โจมตี** เพื่อเข้าใจว่าทำไมแต่ละเกราะถึงถูกสร้างขึ้นมาพอดีแบบนั้น · ถ้าจำศัพท์เรื่อง stack frame ไม่ได้แล้ว บทนี้จะทวนให้ใหม่ทุกจุดที่ใช้

วันนี้เราจะทำสี่อย่าง: เข้าใจ **stack frame ในมุมของ security** และคำว่า shellcode ให้ตรงกัน · ไปดูว่า **8 พฤศจิกายน 1996** เกิดอะไรขึ้นที่เปลี่ยนวงการไปตลอดกาล · ลงมือเขียนโค้ดรันได้จริงสองชิ้นที่โชว์กลไกการยึด control flow แบบปลอดภัย · แล้วปิดท้ายด้วยการดู **เกราะ canary / NX / ASLR ที่เปิดอยู่จริงบนเครื่องคุณ** ด้วยคำสั่งของจริง

---

## 1. แนวคิด: ทำไม "เขียนเกิน 1 ไบต์" ถึงหมายถึง "ยึดเครื่อง"

ก่อนจะไปถึงเรื่อง exploit ขอวางภาพให้ตรงกันก่อน เพราะหัวใจของบทนี้มีประโยคเดียว:

> **หน่วยความจำที่โปรแกรมใช้เก็บ "ข้อมูล" กับหน่วยความจำที่โปรแกรมใช้เก็บ "คำสั่งที่จะทำต่อไป" อยู่ติดกัน — และ CPU ไม่รู้จักความต่างระหว่างสองอย่างนี้**

ถ้าคุณคุม "ข้อมูล" ได้ และข้อมูลนั้นไหลไปทับ "คำสั่งที่จะทำต่อไป" ได้ — คุณก็คุมโปรแกรม

### 1.1 stack frame ในมุมของ security: สี่ช่องที่เรียงติดกัน

นึกถึงฟังก์ชัน C หนึ่งตัว ตอนถูกเรียก CPU จะจองพื้นที่ให้มันก้อนหนึ่งบน **stack** (ส่วนหน่วยความจำที่โตและหดตามการเรียกฟังก์ชัน) เรียกว่า **stack frame** (กรอบพื้นที่ของฟังก์ชัน) ข้างในมีของสี่อย่างที่เรียงติดกัน:

| ลำดับ (จากที่อยู่ต่ำไปสูง) | เก็บอะไร | ในมุมของ security |
|---|---|---|
| `buf` (ตัวแปรในเครื่อง) | ข้อมูลที่โปรแกรมกรอกเอง เช่น buffer รับ input | **จุดที่ผู้โจมตีเขียนเข้ามาได้** |
| canary (ค่าเฝ้าดู) | ค่าลับที่ compiler ใส่คั่น (ถ้าเปิดเกราะ) | **กับดัก**: ถ้าถูกทับ = ตรวจเจอ |
| saved frame pointer | ที่อยู่ของ frame ฟังก์ชันผู้เรียก | ต้องผ่านก่อนถึงเป้าหมาย |
| **return address** | ที่อยู่ที่ CPU จะกระโดดกลับหลังฟังก์ชันจบ | **เป้าหมายจริง** — คุมค่านี้ = คุมการทำงาน |

![ผัง stack frame: buf → canary → saved frame pointer → return address และทิศที่ strcpy เขียนเกิน](/assets/diagrams/ep03-01-stack-frame.svg)

สังเกตสามอย่างในผังนี้:

1. **`buf` อยู่ต่ำสุด และ return address อยู่สูงสุด** — การคัดลอกข้อมูลเข้ามากเกินไปจึงไหล**ขึ้น**ไปเรื่อย ๆ ตามลำดับ: `buf` → canary → saved fp → return address
2. **อยู่ติดกันไม่มีช่องว่าง** — นี่คือเหตุผลว่าทำไม "เกินไป 4 ไบต์" ก็เพียงพอที่จะเปลี่ยนค่าทั้งช่อง
3. **ระยะห่างระหว่างต้น buffer กับ return address คือตัวเลขที่ผู้โจมตีต้องรู้** เราเรียกมันว่า **offset** (ระยะเยื้อง = จำนวนไบต์ที่ต้องเขียนทับก่อนถึงเป้าหมาย) ในเดโมของวันนี้ offset นี้คือ **72 ไบต์**

### 1.2 return address คืออะไร (ทวนแบบเร็ว แต่ให้ครบ)

CPU รันคำสั่งทีละคำสั่งตามลำดับ แต่เมื่อเจอ "เรียกฟังก์ชัน" มันต้องรู้ว่า**พอฟังก์ชันนั้นจบแล้ว จะกลับไปทำงานต่อที่บรรทัดไหน** — คำตอบคือมันเก็บ "ที่อยู่ของบรรทัดถัดไป" ไว้บน stack ก่อนกระโดดเข้าไป นั่นแหละคือ **return address**

เพราะฉะนั้นคำสั่ง "กลับจากฟังก์ชัน" ของ CPU (มักเรียกว่า `ret`) แปลง่าย ๆ ว่า: **อ่านค่าจากช่อง return address แล้วกระโดดไปที่นั่น** — ไม่ตรวจสอบอะไรเลย ไม่ถามว่า "ที่อยู่นี้สมควรไหม" มันแค่เชื่อค่าที่อยู่ในหน่วยความจำ

นี่คือรากของทุกอย่างในบทนี้: **ถ้าเราเขียนทับช่องนั้นได้ เราก็เลือกได้ว่าโปรแกรมจะกระโดดไปไหนต่อ** เราเรียกผลลัพธ์นี้ว่า **control flow hijack** (การยึดทิศทางการทำงานของโปรแกรม = บังคับให้โปรแกรมไปทำสิ่งที่เราเลือก ไม่ใช่สิ่งที่ผู้เขียนตั้งใจ)

### 1.3 shellcode คืออะไร — และทำไมมันถึงเป็นไปได้

คำที่คุณจะเจอทุกที่ในสายนี้คือ **shellcode** คุณอาจคิดว่ามันคือ "โค้ดเปิด shell" แต่ความหมายที่ตรงกว่าคือ:

> **shellcode = ชุดไบต์ที่ผู้โจมตีเขียนขึ้นเอง โดยจงใจให้มันเป็นภาษาเครื่องที่ CPU รันได้** (ชื่อนี้มาจากยุคแรกที่มันมักทำหน้าที่เปิด shell ให้ผู้โจมตีสั่งงานเครื่องเหยื่อ แต่จริง ๆ ข้างในเป็นอะไรก็ได้)

ทำไมมันถึงเป็นไปได้? เพราะ **CPU ไม่มีแนวคิดเรื่อง "ข้อมูล" กับ "โค้ด"** มันมีแค่หน่วยความจำที่เต็มไปด้วยเลขฐานสอง เมื่อ CPU ถูกสั่งให้ "ดึงคำสั่งจากที่อยู่ X" มันก็เอาไบต์ที่อยู่ตรงนั้นมาตีความเป็นคำสั่ง ไม่สนว่าไบต์นั้นถูกเขียนขึ้นในฐานะ "ข้อมูลที่ผู้ใช้พิมพ์" หรือ "โค้ดของโปรแกรม"

เราพิสูจน์ข้อนี้ได้ด้วยเครื่องมือจริง — ดูไบต์ของฟังก์ชันเล็ก ๆ ที่เราเขียนเอง (ตัดมาเฉพาะส่วนดิสแอสเซมเบลีจาก `out/09_shellcode_bytes.txt` — ไฟล์เต็มอยู่ในหัวข้อ 3.4):

```
0000000000000000 <answer>:
   0:	52800540 	mov	w0, #0x2a                  	// #42
   4:	d65f03c0 	ret

0000000000000008 <add_two>:
   8:	8b010000 	add	x0, x0, x1
   c:	d65f03c0 	ret
```

คอลัมน์กลางคือ **ไบต์จริงที่อยู่ในโปรแกรม** สังเกตว่า:

- ฟังก์ชัน `answer` ทั้งฟังก์ชันคือแค่ **8 ไบต์** — `52800540` (ใส่ค่า 42 ลง register) ต่อด้วย `d65f03c0` (คำสั่ง `ret`)
- นี่คือ "ข้อความ" ที่ CPU อ่าน — และมันเป็นได้แค่ **ชุดไบต์** เท่านั้น **ถ้าเราวางชุดไบต์นี้ลงในหน่วยความจำและบังคับให้ CPU กระโดดมาที่มัน มันจะรัน** โดยไม่รู้เลยว่ามันไม่ได้มาจากโปรแกรมเดิม

> **เกร็ดที่ควรรู้ (และตรงไปตรงมา):** `objdump` พิมพ์คำสั่งเป็น "คำ" 32 บิต เรียงตามตัวเลข แต่ไบต์ที่เก็บจริงในหน่วยความจำของเครื่อง little-endian (เก็บไบต์ล่างก่อน) จะเรียงกลับด้าน — `52800540` ในหน่วยความจำคือไบต์ `40 05 80 52` · เรื่องนี้สำคัญมากเวลาอ่าน payload ของจริง เพราะ "ไบต์ที่เขียน" กับ "ตัวเลขที่อ่านได้" เป็นคนละทิศกัน

**ส่วนในบทนี้เราจะไม่รัน shellcode** เหตุผลมีสามข้อ และขอบอกตรง ๆ เพราะมันเป็นเรื่องของจริยธรรมและความจริงทางเทคนิค:

1. การรัน shellcode จริงต้องปิดเกราะสองชั้น (**ASLR** และ **NX**) ซึ่งต้องมีสิทธิ์ระดับระบบ และเป็นการ "ปิดการป้องกัน" ของเครื่องคุณ
2. ผลลัพธ์ขึ้นกับแพลตฟอร์มมาก — shellcode ของ **x86-64 ใช้ไม่ได้กับ aarch64** (คนละชุดคำสั่ง) บทความที่บอกว่า "รันได้ทุกเครื่อง" จึงมักไม่จริง
3. การเข้าใจกลไกไม่ได้ต้องแลกมาด้วยการยิงจริง — และเราอยากให้คุณเข้าใจ**เพื่อป้องกัน**

### 1.4 ศัพท์สี่คำที่ต้องแม่นก่อนไปต่อ

| ศัพท์ | ความหมาย | ในบริบทนี้ |
|---|---|---|
| **buffer overflow** | เขียนข้อมูลเกินขอบเขตของ buffer | ต้นเหตุ (CWE-121: Stack-based Buffer Overflow) · CWE (Common Weakness Enumeration — รายการช่องโหว่) |
| **exploit** | โค้ด/เทคนิคที่ใช้ประโยชน์จากช่องโหว่ | สิ่งที่เปลี่ยน bug ให้เป็น "ยึดเครื่อง" |
| **payload** | ชุดข้อมูลที่ผู้โจมตีส่งเข้าไป | มักมี offset + ที่อยู่เป้าหมาย (+ shellcode) |
| **control flow hijack** | บังคับทิศทางการทำงานของโปรแกรม | ผลลัพธ์ปลายทาง — เลือกได้ว่า CPU จะไปทำอะไรต่อ |

และคำที่ห้าซึ่งจะกลับมาในตอนหลัง: **setuid** (โปรแกรมที่รันด้วยสิทธิ์ของเจ้าของไฟล์แทนสิทธิ์คนรัน — ถ้าเป็น root ก็ยิ่งอันตราย) มันคือเหตุผลว่าทำไมช่องโหว่แบบนี้ในโปรแกรมระบบถึงเท่ากับ "ได้สิทธิ์ทั้งเครื่อง"

---

## 2. ทำไมสำคัญ: 8 พฤศจิกายน 1996 — วันที่ "เทคนิค" กลายเป็น "ตำรา"

ถ้าให้เลือกวันเดียวที่แบ่งยุคของ software security ผมจะเลือกวันนั้น

### 2.1 Smashing the Stack for Fun and Profit (Phrack ฉบับที่ 49)

**Phrack** เป็นนิตยสารอิเล็กทรอนิกส์ (e-zine) ของชุมชน security ที่เริ่มตีพิมพ์ตั้งแต่ปี 1985 และยังมีอยู่จนถึงวันนี้ ฉบับที่ **49** ออกเมื่อ **8 พฤศจิกายน 1996** ในไฟล์ทั้งหมด 16 ไฟล์ของฉบับนั้น **ไฟล์ที่ 14** ชื่อ *Smashing The Stack For Fun And Profit*

> **หมายเหตุความแม่นยำ:** หน้าปกของ Phrack 49 ระบุ Volume Seven, Issue Forty-Nine, File 14 of 16 — เลข "49" คือเลขฉบับ ส่วน "14" คือลำดับไฟล์ในฉบับ ไม่ใช่เลขฉบับ · วันที่ตีพิมพ์คือ **1996-11-08**

ก่อนบทความนี้ ความรู้เรื่อง buffer overflow บน stack ถูกพูดถึงในแวดวงแคบ ๆ (และใน[เหตุการณ์ Morris Worm ปี 1988](/blog/post.html?slug=2026-10-10-software-security-02-morris-worm-1988) ซึ่งใช้มันจริง) แต่ไม่มีใครเรียบเรียงเป็น**คู่มือที่อ่านแล้วทำตามได้** — Smashing the Stack คือเล่มนั้น มันเขียนให้ครบทั้ง: ผัง stack frame ทีละไบต์ · วิธีหาว่าต้องเขียนทับกี่ไบต์จึงจะถึง return address · วิธีเขียน shellcode เอง · วิธีทำให้โปรแกรมกระโดดไปหา shellcode นั้น

นี่คือเหตุผลที่คนเรียน security ต้องรู้จักมัน: **มันไม่ได้ค้นพบช่องโหว่ใหม่ มันเปลี่ยนช่องโหว่ที่มีอยู่แล้วให้กลายเป็น "ทักษะที่ใครก็ทำตามได้"**

### 2.2 Aleph One คือใคร

ผู้เขียนใช้นามแฝงว่า **Aleph One** ตัวจริงคือ **Elias Levy** นักวิทยาศาสตร์คอมพิวเตอร์ชาวเวเนซุเอลา (Aleph คืออักษรตัวแรกของอักษรฮีบรู — เป็นการเล่นคำว่า "หนึ่ง" ในเชิงสัญลักษณ์) หลังจากนั้นเขาเป็นผู้ดูแล **Bugtraq** (mailing list เปิดเผยช่องโหว่ที่ทรงอิทธิพลที่สุดยุคนั้น) ระหว่างปี 1996–2001 และเป็นผู้ร่วมก่อตั้งบริษัท **SecurityFocus** ซึ่งถูก Symantec ซื้อไปในปี 2002

ข้อเท็จจริงนี้สำคัญต่อจิตใจของเราในฐานะคนทำงาน security: คนที่เขียน "ตำราโจมตี" เล่มนั้น ไม่ได้เป็นอาชญากร — เขาเป็นวิศวกรที่เลือกจะ**เขียนสิ่งที่ทุกคนในวงในรู้กันดีออกมาให้ทุกคนเห็น** เพื่อให้โลกได้แก้มัน ผลลัพธ์คืออุตสาหกรรม security ทั้งสายเกิดและโตขึ้นจากตรงนั้น

### 2.3 ผลลัพธ์ระยะยาว: canary / NX / ASLR — เกราะสามชั้นที่คุณใช้ทุกวันนี้

นี่คือหัวใจของตอนนี้ ตอนที่บทความนี้ออกมา ผู้เขียนระบบต้องตอบคำถามใหม่ว่า: *"ถ้าเราเขียนโค้ดให้ล้นไม่ได้ทุกที่ไม่ได้จริง ๆ แล้ว เราพอมีกลไกที่จับ/ขวาง/ทำให้เดาไม่ได้ไหม?"* คำตอบเกิดขึ้นเรียงกันแบบนี้:

| เกราะ | กันขั้นไหนในกลไก | เกิดเมื่อไร (แหล่งปัจจุบัน) |
|---|---|---|
| **stack canary** | จับ "การทับ" — เทียบค่าเฝ้าดูก่อน `ret` ถ้าเปลี่ยน = abort | **StackGuard** ของ Crispin Cowan และคณะ เสนอที่งาน USENIX Security **1998** (prototype เดิมใช้ค่า `0xDEADBEEF`) · **ProPolice** ต่อยอดปี 2000–2001 (สลับตำแหน่งตัวแปรให้ array อยู่เหนือ scalar) · เป็นค่าเริ่มต้นทั้งระบบครั้งแรกใน **OpenBSD 3.3 (2003)** |
| **NX bit / W^X** (Write XOR Execute — หน่วยความจำจะเขียนได้หรือรันได้อย่างเดียว) | ขวาง "การรันข้อมูล" — หน้าที่เป็นข้อมูลรันเป็นโค้ดไม่ได้ | PaX (patch ของ Linux) ราวปี **2000** · **OpenBSD W^X (2003)** · Windows XP SP2 เปิด DEP (Data Execution Prevention) ในปี **2004** · NX bit มีในฮาร์ดแวร์ x86-64 ตั้งแต่ราวปี 2003–2004 |
| **ASLR** | ทำให้ "เดาไม่ได้" — สุ่มที่อยู่ทุกครั้งที่โปรแกรมเริ่ม | **PaX ASLR (2001)** · **OpenBSD 3.4 (2003)** เป็น OS ที่ใช้กันกว้างตัวแรกที่เปิดให้เป็นค่าเริ่มต้น · เข้า Linux mainstream ราวปี **2005** |

แล้วผู้โจมตีก็ไม่หยุด: เมื่อ NX ขวางการวางโค้ดใหม่ เขาก็เลี่ยงไปใช้**โค้ดที่มีอยู่แล้วในโปรแกรม** — เทคนิค **return-into-libc** (= ชี้ return address ไปยังฟังก์ชันที่มีอยู่แล้วในโปรแกรม เช่น `system()` ใน libc แทนที่จะวางโค้ดใหม่) (Solar Designer ประกาศบน Bugtraq เดือนสิงหาคม **1997**) และต่อยอดเป็น **ROP (Return-Oriented Programming)** ที่ Hovav Shacham นิยามเป็นทางการในงาน CCS **2007** แปลว่าไม่มีเกราะชั้นไหน "พอ" เดี่ยว ๆ — เรื่องนี้จะกลับมาในตอนท้ายอีกที

![สามการป้องกัน canary/NX/ASLR กันคนละขั้น พร้อมไทม์ไลน์และผลจำลองจากเดโม](/assets/diagrams/ep03-03-defenses.svg)

> สังเกตว่าทั้งสามเกราะโผล่**หลัง**ปี 1996 ทั้งนั้น — และโผล่เพราะ**มีคนพิสูจน์ให้เห็นว่ากลไกนี้ทำงานได้จริง** นี่คือรูปแบบที่ซ้ำตลอดประวัติศาสตร์ security: ความรู้ก่อน เกราะทีหลัง และเกราะมักตามมาห่างเป็นสิบปี

---

## 3. ลงมือทำ: จำลองกลไกด้วยมือตัวเอง (อย่างปลอดภัย)

> **หมายเหตุความปลอดภัย:** ทุกอย่างในหัวข้อนี้รันในโฟลเดอร์ที่เราสร้างเองบนเครื่องคุณ **ไม่มีการเชื่อมต่อเครือข่าย ไม่มีการรัน shellcode และไม่มีการแตะหน่วยความจำจริงของ process** — เราใช้ struct บน heap จำลอง "ผังของ stack" และใช้ตารางที่อยู่จำลอง "การกระโดดของ CPU" เท่านั้น

เราจะทำห้าอย่าง:

- **เดโม A (`stack_smash.c`)** — จำลอง frame ที่มี `buf` → canary → saved fp → ret addr แล้วดูว่า "ล้นขึ้นไปทีละ ~4 ไบต์" ทับอะไร (รันจริง 6 กรณี)
- **เดโม B (`hijack_model.go`)** — จำลองการยึด control flow + นับอัตราความสำเร็จเมื่อเปิด canary / NX / ASLR
- **ดู "ไบต์" ของภาษาเครื่องจริง (`shellcode_bytes.c` + `objdump`)** — ดูด้วยตาว่า "shellcode" คือชุดไบต์แบบไหน
- **ดู canary ในโค้ดจริง (`canary_demo.c` + `objdump`)** — ฟังก์ชัน `parse()` ที่ถือ array ในเครื่อง คอมไพล์เปิด/ปิด `-fstack-protector-strong` เพื่อดูว่า compiler ใส่ canary ให้เอง
- **ตรวจเกราะจริงบนเครื่อง** (`out/10_protections.txt`) — ดูว่า canary / NX / PIE-ASLR ของจริงเปิดอยู่ไหม

### 3.1 ตั้งที่ทำงาน

```bash
mkdir -p ~/security-lab/ep03 && cd ~/security-lab/ep03
```

### 3.2 เดโม A — frame เรียงติดกัน และบันไดการล้น

เขียนไฟล์ `stack_smash.c` (เดโมเพื่อการสอน — **ห้ามใช้จริง**):

```c
/*
 * stack_smash.c — เดโมเพื่อการสอนเท่านั้น (ห้ามใช้จริง)
 *
 * จำลอง "stack frame" ของฟังก์ชัน C โดยวางเขตข้อมูลเรียงกันในหน่วยความจำที่
 * เราควบคุมเอง (บน heap) ลำดับเดียวกับที่อยู่บน stack จริง:
 *
 *     buf  ->  canary  ->  saved frame pointer  ->  return address
 *
 * ทำไมต้องจำลองบน heap แทนการล้น stack จริง?
 *   การล้น stack จริงต้องปิด stack canary (-fno-stack-protector) และต้องไม่ให้
 *   ASLR/NX รบกวน อีกทั้งผลลัพธ์ยังต่างกันตามสถาปัตยกรรม (x86-64 vs aarch64)
 *   เดโมนี้จำลอง "กลไก" ให้ผลเหมือนกันทุก OS โดยไม่ทำให้โปรแกรม crash
 *
 * เรา calloc struct + padding (PAD ไบต์) และจำกัดความยาว input ไม่เกิน
 * sizeof(struct frame) + PAD - 1 เสมอ -> เขียนเกิน buffer ได้โดยไม่พ้น allocation
 * และ "ไม่รันโค้ดของผู้โจมตี" — เราแค่ดูว่าข้อมูลที่อยู่ "ข้าง ๆ" ถูกทับหรือไม่
 *
 * ต้องคอมไพล์ด้วย -O0: การอ่านเขตข้อมูลที่ถูกเขียนทับเป็น undefined behavior
 * ที่ -O0 compiler ไม่จัดเรียงใหม่ ผลจึงตรงตามที่ตาเห็น
 */
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define BUF_SIZE 64
#define PAD 128

/* ค่าเริ่มต้นของแต่ละเขตข้อมูลบน frame (ค่าจำลองที่มองเห็นได้ชัด) */
#define CANARY_GOOD 0xDEADBEEFu   /* StackGuard ต้นฉบับ (1998) ใช้ค่า 0xDEADBEEF */
#define SAVED_FP_GOOD 0x7FFFEFF0u /* ที่อยู่ frame pointer ของฟังก์ชันที่เรียกมา (จำลอง) */
#define RET_ADDR_GOOD 0x00400ABCu /* ที่อยู่ return address ปกติ (จำลอง) */

struct frame {
    char buf[BUF_SIZE];   /* ของจริง: local buffer บน stack */
    unsigned int canary;  /* ของจริง: ค่าเฝ้าดูที่ compiler ใส่คั่นก่อน return address */
    unsigned int saved_fp;/* ของจริง: saved frame pointer ของฟังก์ชันที่เรียกมา */
    unsigned int ret_addr;/* ของจริง: return address — เป้าหมายของผู้โจมตี */
};

static const char *verdict_ret(unsigned int r)
{
    return (r == RET_ADDR_GOOD) ? "ยังปกติ" : "ถูกเขียนทับ (ผู้โจมตีคุมค่าได้)";
}

int main(int argc, char **argv)
{
    long n = (argc > 1) ? atol(argv[1]) : (long)sizeof(struct frame);
    long cap = (long)sizeof(struct frame) + PAD - 1;
    if (n < 0 || n > cap) {
        fprintf(stderr, "n ต้องอยู่ระหว่าง 0 ถึง %ld (เพดานปลอดภัยของเดโม)\n", cap);
        return 2;
    }

    char *payload = malloc((size_t)n + 1);
    if (!payload) {
        fprintf(stderr, "out of memory\n");
        return 2;
    }
    memset(payload, 'A', (size_t)n); /* 'A' = 0x41 ทำให้อ่านตัวเลขที่ถูกทับออกมาได้ชัด */
    payload[n] = '\0';

    struct frame *f = calloc(1, sizeof(struct frame) + PAD);
    if (!f) {
        fprintf(stderr, "out of memory\n");
        return 2;
    }
    f->canary = CANARY_GOOD;
    f->saved_fp = SAVED_FP_GOOD;
    f->ret_addr = RET_ADDR_GOOD;

    printf("buffer size          = %d byte\n", BUF_SIZE);
    printf("ขนาด frame           = %zu byte (buf[%d] + canary + saved fp + ret addr)\n",
           sizeof(struct frame), BUF_SIZE);
    printf("ระยะถึง ret addr     = %zu byte (offsetof)\n", offsetof(struct frame, ret_addr));
    printf("ส่ง input            = %ld byte\n", n);
    printf("overflow เกิน buffer = %ld byte\n", (n > BUF_SIZE) ? n - BUF_SIZE : 0);
    printf("\n");

    /* ---- คัดลอกแบบ unsafe: เหมือน strcpy()/gets() ที่ไม่รู้ขนาดปลายทาง ---- */
    strcpy(f->buf, payload); /* <-- จุดที่ผิด: ไม่ตรวจขนาดเลย */
    unsigned int canary_after = f->canary;
    unsigned int fp_after = f->saved_fp;
    unsigned int ret_after = f->ret_addr;
    printf("หลัง unsafe (strcpy ไม่ตรวจขนาด):\n");
    printf("  canary   = 0x%08X\n", canary_after);
    printf("  saved fp = 0x%08X\n", fp_after);
    printf("  ret addr = 0x%08X   <-- %s\n", ret_after, verdict_ret(ret_after));

    /* ---- ตรวจค่าเฝ้าดู (จำลองสิ่งที่ compiler ทำก่อน ret) ---- */
    printf("\nตรวจค่าเฝ้าดูก่อน ret (stack canary check):\n");
    if (canary_after != CANARY_GOOD) {
        printf("  canary เปลี่ยนจาก 0x%08X เป็น 0x%08X -> จับได้!\n",
               CANARY_GOOD, canary_after);
        printf("  (ของจริง compiler จะเรียก __stack_chk_fail แล้ว abort ไม่ยอมให้ ret)\n");
    } else {
        printf("  canary ยังเป็น 0x%08X -> ผ่าน (ไม่มีการเขียนทับ)\n", CANARY_GOOD);
    }

    /* ---- เวอร์ชัน safe: รู้ขนาดปลายทางและตรวจก่อนคัดลอก ---- */
    f->canary = CANARY_GOOD;
    f->saved_fp = SAVED_FP_GOOD;
    f->ret_addr = RET_ADDR_GOOD;
    memset(f->buf, 0, BUF_SIZE);
    printf("\nเวอร์ชัน safe (ตรวจขนาดก่อนคัดลอก):\n");
    if ((size_t)n >= BUF_SIZE) {
        printf("  ปฏิเสธ: input ยาว %ld >= buffer %d\n", n, BUF_SIZE);
    } else {
        memcpy(f->buf, payload, (size_t)n + 1);
        printf("  รับได้ (ยาว %ld < %d): canary = 0x%08X, ret addr = 0x%08X\n",
               n, BUF_SIZE, f->canary, f->ret_addr);
    }

    printf("\n--- สรุป (key=value) ---\n");
    printf("buf_size=%d\n", BUF_SIZE);
    printf("frame_size=%zu\n", sizeof(struct frame));
    printf("ret_offset=%zu\n", offsetof(struct frame, ret_addr));
    printf("sent=%ld\n", n);
    printf("overflow=%ld\n", (n > BUF_SIZE) ? n - BUF_SIZE : 0);
    printf("canary_after=0x%08X\n", canary_after);
    printf("saved_fp_after=0x%08X\n", fp_after);
    printf("ret_after=0x%08X\n", ret_after);
    printf("canary_detected=%d\n", canary_after != CANARY_GOOD);
    printf("ret_hijacked=%d\n", ret_after != RET_ADDR_GOOD);

    free(f);
    free(payload);
    return 0;
}
```

จุดที่ผมอยากให้คุณสังเกตในโค้ดนี้:

- `struct frame` มี `buf[64]` แล้วตามด้วย `canary`, `saved_fp`, `ret_addr` — **เรียงติดกันในหน่วยความจำเป๊ะ ๆ** เหมือนที่ buffer กับ return address เรียงติดกันบน stack จริง · `offsetof(struct frame, ret_addr)` คือ "offset" ที่เราพูดถึงในหัวข้อ 1.1
- `strcpy(f->buf, payload)` คือหัวใจ — มันคัดลอกไป**จนจบสตริง** ไม่สนว่า buffer มีที่พอไหม
- เราจอง**เกินขนาดจริงมาอีก 128 ไบต์** (PAD) และจำกัด input ให้ยาวไม่เกิน `sizeof(struct frame) + PAD - 1` เพื่อไม่ให้เขียนพ้นพื้นที่จัดสรร — **เดโมนี้จึงปลอดภัย ไม่ crash** (บนของจริง ไบต์ที่เกินไปจะทับ return address แล้ว "กระโดด" ไปรันโค้ดของผู้โจมตี เราไม่ทำส่วนนั้นเพราะนั่นคือการโจมตีจริง)
- **ต้องมี `-O0`** เพราะการอ่านเขตข้อมูลที่ถูกเขียนทับเป็น undefined behavior; ที่ `-O0` compiler ไม่จัดเรียงใหม่ เราจึงเห็นผลตามที่ตาเห็น

คอมไพล์และรัน — และนี่คือ **บันไดการล้น** ที่สวยที่สุดของบทนี้: เราไล่เพิ่ม input ทีละ ~4 ไบต์ (โดยมี 63 = น้อยกว่า 1 ไบต์ กับ 79 = เลย return address ไป 3 ไบต์ เป็นขอบ) แล้วดูว่าทับอะไร:

```bash
gcc -std=c17 -O0 -Wall -Wextra -Wpedantic -o stack_smash stack_smash.c
```

```bash
./stack_smash 63     # น้อยกว่า buffer 1 ไบต์
./stack_smash 64     # พอดี buffer แต่ strcpy เติม '\0' เกินไป 1 ไบต์
./stack_smash 68     # ทับ canary ครบ 4 ไบต์
./stack_smash 72     # ทับ canary + saved fp และแตะ ret addr 1 ไบต์
./stack_smash 76     # ทับ ret addr ครบ 4 ไบต์
./stack_smash 79     # เขียนเลย ret addr ไปอีก 3 ไบต์
```

![ตารางบันไดการล้น: input แต่ละขนาดทับเขตข้อมูลใด (ผลรันจริง)](/assets/diagrams/ep03-02-overflow-ladder.svg)

ผลรันจริงบนเครื่องผู้เขียน — กรณีส่ง **76 ไบต์** (ทับ return address ครบ) จาก `out/06_smash_76.txt`:

```
--- ส่ง 76 byte (ทับ return address ครบ 4 ไบต์ = hijack control flow) ---
buffer size          = 64 byte
ขนาด frame           = 76 byte (buf[64] + canary + saved fp + ret addr)
ระยะถึง ret addr     = 72 byte (offsetof)
ส่ง input            = 76 byte
overflow เกิน buffer = 12 byte

หลัง unsafe (strcpy ไม่ตรวจขนาด):
  canary   = 0x41414141
  saved fp = 0x41414141
  ret addr = 0x41414141   <-- ถูกเขียนทับ (ผู้โจมตีคุมค่าได้)

ตรวจค่าเฝ้าดูก่อน ret (stack canary check):
  canary เปลี่ยนจาก 0xDEADBEEF เป็น 0x41414141 -> จับได้!
  (ของจริง compiler จะเรียก __stack_chk_fail แล้ว abort ไม่ยอมให้ ret)

เวอร์ชัน safe (ตรวจขนาดก่อนคัดลอก):
  ปฏิเสธ: input ยาว 76 >= buffer 64

--- สรุป (key=value) ---
buf_size=64
frame_size=76
ret_offset=72
sent=76
overflow=12
canary_after=0x41414141
saved_fp_after=0x41414141
ret_after=0x41414141
canary_detected=1
ret_hijacked=1
```

และกรณีที่ผมคิดว่าให้บทเรียนลึกที่สุด — ส่ง **64 ไบต์ "พอดี buffer"** จาก `out/03_smash_64.txt`:

```
--- ส่ง 64 byte (พอดี buffer แต่ '\0' ปิดท้ายไหลเข้า canary 1 ไบต์) ---
buffer size          = 64 byte
ขนาด frame           = 76 byte (buf[64] + canary + saved fp + ret addr)
ระยะถึง ret addr     = 72 byte (offsetof)
ส่ง input            = 64 byte
overflow เกิน buffer = 0 byte

หลัง unsafe (strcpy ไม่ตรวจขนาด):
  canary   = 0xDEADBE00
  saved fp = 0x7FFFEFF0
  ret addr = 0x00400ABC   <-- ยังปกติ

ตรวจค่าเฝ้าดูก่อน ret (stack canary check):
  canary เปลี่ยนจาก 0xDEADBEEF เป็น 0xDEADBE00 -> จับได้!
  (ของจริง compiler จะเรียก __stack_chk_fail แล้ว abort ไม่ยอมให้ ret)

เวอร์ชัน safe (ตรวจขนาดก่อนคัดลอก):
  ปฏิเสธ: input ยาว 64 >= buffer 64

--- สรุป (key=value) ---
buf_size=64
frame_size=76
ret_offset=72
sent=64
overflow=0
canary_after=0xDEADBE00
saved_fp_after=0x7FFFEFF0
ret_after=0x00400ABC
canary_detected=1
ret_hijacked=0
```

อ่านบันไดทั้งหมดให้ดี มีสี่จุดที่คนมักเข้าใจผิด:

1. **ส่ง 64 ไบต์ "พอดี" ก็ยังล้น** — `overflow เกิน buffer = 0 byte` แต่ `canary` กลายเป็น `0xDEADBE00`! เพราะ `strcpy` เขียนตัวปิดสตริง `'\0'` เพิ่มอีก 1 ไบต์ (รวม 65) ไบต์นั้นเข้าไปเซ็ต**ไบต์ล่างสุด**ของ canary เป็น 0 → `0xDEADBEEF` กลายเป็น `0xDEADBE00` (little-endian เก็บไบต์ล่างก่อน) · นี่คือกับดัก off-by-one (เขียนเกินไป 1 ไบต์) ที่แม้แต่โปรแกรมเมอร์ระวังตัวก็พลาด และเป็นเหตุผลว่าทำไม **"นับให้พอดี" ไม่เท่ากับ "ปลอดภัย"**
2. **ส่ง 68 ไบต์ — ตัว "ข้าง ๆ" ถูกแตะก่อนเป้าหมาย** — `canary = 0x41414141` (4 ไบต์ของ `'A'`) แต่ `saved fp = 0x7FFFEF00` (โดนแค่ไบต์ล่างเพราะ `'\0'`) และ `ret addr` ยังไม่ถูกแตะ · นี่คือหน้าตาของ "การไหลขึ้นทีละนิด" — และถ้าเราเปิด canary จริง โปรแกรมหยุดตรงนี้ทันที
3. **ส่ง 72 ไบต์ — แตะ return address แค่ 1 ไบต์ ก็เปลี่ยนปลายทางแล้ว** — `ret addr` เปลี่ยนจาก `0x00400ABC` เป็น `0x00400A00` · ผู้โจมตี**ไม่จำเป็นต้องทับทั้งช่อง** บางครั้งแค่เปลี่ยนไบต์เดียวก็พอกระโดดไปที่อื่นได้ (เทคนิคนี้มีชื่อว่า partial overwrite และเป็นวิธีที่ใช้หลบ ASLR บ่อยที่สุดในโลกจริง)
4. **ส่ง 76 ไบต์ — ทับครบ = เลือกปลายทางได้เอง** — `ret addr = 0x41414141` เท่ากับผู้โจมตีเขียน "ให้กระโดดไปที่ 0x41414141" ตรง ๆ · ในเดโมเราใช้ `'A'` เพื่อให้เห็นชัด แต่ของจริงตรงนี้คือ**ที่อยู่ที่ผู้โจมตีเลือก** และ**การคุมค่านี้ได้ = คุมการทำงานของโปรแกรม**

และดู **เวอร์ชัน safe** ท้ายทุกกรณี — มันเช็คก่อนว่า `n >= BUF_SIZE` แล้ว**ปฏิเสธ**ทันที ทั้ง 64, 68, 72, 76, 79 ไบต์ถูกปฏิเสธหมด:

> **บทเรียนของเดโม A:** canary ไม่ได้ทำให้บั๊กหายไป — มันแค่เปลี่ยน "การยึดเครื่องแบบเงียบ ๆ" ให้กลายเป็น "โปรแกรมตายพร้อมเสียงเตือน" · ส่วนทางแก้จริงคือ **รู้ขนาดและตรวจก่อน** (`n >= BUF_SIZE` → ปฏิเสธ) ไม่ใช่ "ใช้ฟังก์ชันที่ฉลาดขึ้น"

### 3.3 เดโม B — จำลองการยึด control flow + นับผลของ canary / NX / ASLR

เดโม A แสดง "การทับ" ได้ แต่ยังไม่แสดง "การยึด" และยังไม่แสดงว่าเกราะแต่ละชั้นช่วยจริงไหม เดโม B (เขียนด้วย Go) ปิดช่องนั้น โดยจำลอง frame เป็น `[]byte` แล้วจำลอง "การกระโดดของ CPU" ด้วยการ lookup ตารางที่อยู่ — **ไม่มีการรันโค้ดใด ๆ จาก payload**

เขียนไฟล์ `hijack_model.go` (เดโมเพื่อการสอน — **ห้ามใช้จริง**):

```go
// hijack_model.go — เดโมเพื่อการสอนเท่านั้น (ห้ามใช้จริง)
//
// โมเดล "การ hijack control flow" จากการเขียน return address เกิน buffer
// (แนวคิดจากบทความ Smashing the Stack for Fun and Profit, 1996)
//
// เดโมนี้ "ไม่รัน shellcode" และไม่แตะหน่วยความจำจริงของ process เลย —
// เราจำลอง stack frame เป็น []byte ที่ Go จัดการเอง แล้วจำลอง "CPU กระโดดกลับ"
// ด้วยการ lookup ตารางที่อยู่ (address -> ชื่อปลายทาง) เท่านั้น
//
// รันในเครื่องตัวเองเท่านั้น (โปรแกรมนี้ไม่มีการเชื่อมต่อเครือข่าย)
package main

import (
	"encoding/binary"
	"fmt"
	"math/rand"
)

const (
	bufSize   = 64 // ขนาด local buffer
	frameSize = bufSize + 4 + 4 + 4 // 76: buf + canary + saved fp + ret addr
	offCanary = bufSize    // 64
	offFP     = bufSize + 4 // 68
	offRet    = bufSize + 8 // 72
)

// ค่าเริ่มต้นบน frame (จำลอง)
const (
	canaryGood = 0xDEADBEEF
	fpGood     = 0x7FFFEFF0
	retGood    = 0x00400ABC
)

// ที่อยู่ "ปลายทาง" ที่มีอยู่จริงในโปรแกรม (จำลอง — เป็นแค่ชื่อ ไม่ใช่ที่อยู่จริง)
const (
	addrNormalRet = 0x00400ABC // return ปกติกลับไปหาผู้เรียก
	addrAdminFn   = 0x00409999 // ฟังก์ชัน admin ที่ไม่ควรถูกเรียก (จำลอง)
	addrBufCode   = 0x7FFEE100 // ที่อยู่ของ buffer บน stack (พื้นที่ "ข้อมูล")
)

var targetTable = map[uint32]string{
	addrNormalRet: "return ปกติ -> กลับไปหาฟังก์ชันผู้เรียก",
	addrAdminFn:   "กระโดดเข้าฟังก์ชัน admin ที่ไม่ควรถูกเรียก (จำลอง)",
	addrBufCode:   "กระโดดเข้า buffer ที่วาง shellcode ไว้ (พื้นที่ข้อมูล)",
}

func newFrame() []byte {
	f := make([]byte, frameSize)
	binary.LittleEndian.PutUint32(f[offCanary:], canaryGood)
	binary.LittleEndian.PutUint32(f[offFP:], fpGood)
	binary.LittleEndian.PutUint32(f[offRet:], retGood)
	return f
}

// copyUnbounded จำลอง strcpy(): คัดลอกไปเรื่อย ๆ จนหมด src แล้วเติม '\0'
// ไม่สนใจว่าปลายทางมีที่พอไหม — เขียนเฉพาะที่อยู่ใน frame ไม่เขียนพ้นที่จัดสรร
func copyUnbounded(dst, src []byte) int {
	written := 0
	for _, b := range src {
		if written < len(dst) {
			dst[written] = b
		}
		written++
	}
	if written < len(dst) {
		dst[written] = 0
		written++
	}
	return written
}

func readU32(f []byte, off int) uint32 {
	return binary.LittleEndian.Uint32(f[off:])
}

// jump จำลอง "CPU กระโดดกลับ" — บอกว่าปลายทางคืออะไร
func jump(ret uint32) string {
	if name, ok := targetTable[ret]; ok {
		return name
	}
	return "ที่อยู่ไม่มีในโปรแกรม -> crash (segmentation fault)"
}

func payload(n int) []byte {
	p := make([]byte, n)
	for i := range p {
		p[i] = 'A' // 0x41 — ให้เห็นตัวเลขที่ถูกทับชัด ๆ
	}
	return p
}

// craftedPayload สร้าง payload ที่ผู้โจมตี "จงใจ" ให้ไบต์สุดท้ายเป็นที่อยู่เป้าหมาย
// ต้องผ่าน canary กับ saved fp ไปก่อน (72 ไบต์) แล้วจึงถึง return address (4 ไบต์)
func craftedPayload(target uint32) []byte {
	p := payload(offRet)
	buf := make([]byte, 4)
	binary.LittleEndian.PutUint32(buf, target)
	return append(p, buf...)
}

// attemptNone: ยุคก่อนมีการป้องกัน — เขียนทับ return address ได้ตรง ๆ
func attemptNone() bool {
	f := newFrame()
	copyUnbounded(f, craftedPayload(addrAdminFn))
	return readU32(f, offRet) == addrAdminFn
}

// attemptCanary: มี stack canary — โปรแกรมเทียบค่าเฝ้าดูก่อน ret
func attemptCanary() bool {
	f := newFrame()
	copyUnbounded(f, craftedPayload(addrAdminFn))
	if readU32(f, offCanary) != canaryGood {
		return false // ตรวจเจอ -> abort ก่อนถึง ret
	}
	return readU32(f, offRet) == addrAdminFn
}

// attemptNX: มี NX bit (W^X) — stack เป็นข้อมูล รันไม่ได้
func attemptNX() bool {
	f := newFrame()
	// ผู้โจมตีวาง shellcode ใน buffer แล้วชี้ return address กลับเข้า buffer เอง
	copyUnbounded(f, payload(frameSize))
	binary.LittleEndian.PutUint32(f[offRet:], addrBufCode)
	ret := readU32(f, offRet)
	// NX เปิด -> หน้ารันไม่ได้ -> CPU fault แม้กระโดดสำเร็จ
	return !isDataPage(ret)
}

func isDataPage(addr uint32) bool { return addr == addrBufCode }

// attemptASLR: ที่อยู่เป้าหมาย = base + offset โดย base สุ่ม K บิตทุกครั้งที่เริ่มโปรแกรม
// ผู้โจมตีเดาที่อยู่ด้วยค่าคงที่ (base = 0) เพราะไม่รู้ค่าสุ่มของรอบนี้
func attemptASLR(bits uint, rng *rand.Rand) bool {
	slots := 1 << bits
	base := uint32(rng.Intn(slots)) * 0x1000 // หน้า (page) ที่โปรแกรมถูกโหลดในรอบนี้
	guess := uint32(0) * 0x1000              // ค่าที่ผู้โจมตีเดาไว้ล่วงหน้า
	return base == guess
}

func main() {
	fmt.Println("=== ตอนที่ 03 — โมเดล hijack control flow (ไม่รัน shellcode จริง) ===")
	fmt.Printf("stack frame: buf[%d] | canary | saved fp | ret addr (รวม %d byte)\n",
		bufSize, frameSize)
	fmt.Printf("ระยะจากต้น buf ถึง return address = %d byte\n\n", offRet)

	// ---- 1) ไม่มีการป้องกัน (ยุค 1996) ----
	fmt.Println("① ไม่มีการป้องกัน (ยุค 1996): เขียนเกิน buffer ทับ return address ตรง ๆ")
	{
		f := newFrame()
		pl := craftedPayload(addrAdminFn) // 72 ไบต์ + ที่อยู่เป้าหมาย 4 ไบต์
		copyUnbounded(f, pl)
		fmt.Printf("   ส่ง %d byte (72 ไบต์ + ที่อยู่เป้าหมาย 4 ไบต์) -> ret addr = 0x%08X (ค่าเดิม 0x%08X)\n",
			len(pl), readU32(f, offRet), retGood)
		fmt.Printf("   ret -> %s\n", jump(readU32(f, offRet)))
	}

	// ---- 2) เปิด stack canary ----
	fmt.Println("\n② เปิด stack canary: โปรแกรมเทียบค่าเฝ้าดูก่อน ret")
	{
		f := newFrame()
		copyUnbounded(f, craftedPayload(addrAdminFn))
		got := readU32(f, offCanary)
		fmt.Printf("   canary กลายเป็น 0x%08X (ค่าเดิม 0x%08X) -> %s\n",
			got, canaryGood, map[bool]string{true: "จับได้ -> abort", false: "ผ่าน"}[got != canaryGood])
		fmt.Println("   ของจริง: compiler เรียก __stack_chk_fail แล้วพิมพ์ *** stack smashing detected ***")
	}

	// ---- 3) เปิด NX (W^X) ----
	fmt.Println("\n③ เปิด NX bit (W^X): stack เป็นข้อมูล รันไม่ได้")
	{
		f := newFrame()
		copyUnbounded(f, craftedPayload(addrBufCode))
		fmt.Printf("   ผู้โจมตีชี้ ret -> 0x%08X (buffer ที่วาง shellcode)\n", readU32(f, offRet))
		fmt.Println("   NX เปิด -> CPU fault: หน้านี้เขียนได้แต่อ่านเป็นโค้ดไม่ได้ -> shellcode ไม่รัน")
	}

	// ---- 4) เปิด ASLR ----
	fmt.Println("\n④ เปิด ASLR: สุ่มที่อยู่ทุกครั้งที่โปรแกรมเริ่ม")
	rng := rand.New(rand.NewSource(20261011))
	const tries = 100000
	aslrHits := map[uint]int{}
	for _, bits := range []uint{0, 12, 20} {
		hits := 0
		for i := 0; i < tries; i++ {
			if attemptASLR(bits, rng) {
				hits++
			}
		}
		aslrHits[bits] = hits
		fmt.Printf("   base สุ่ม %2d บิต (%7d ช่อง) -> เดาถูก %d ครั้ง จาก %d ครั้ง\n",
			bits, 1<<bits, hits, tries)
	}
	fmt.Println("   ยิ่งสุ่มมากบิต ยิ่งเดาไม่ได้ — ผู้โจมตีต้องมีช่องรั่วข้อมูลเพื่ออ่านที่อยู่จริงก่อน")

	// ---- 5) รันการทดลองซ้ำเพื่อนับอัตราความสำเร็จ ----
	const trials = 100
	noneHits, canaryHits, nxHits := 0, 0, 0
	for i := 0; i < trials; i++ {
		if attemptNone() {
			noneHits++
		}
		if attemptCanary() {
			canaryHits++
		}
		if attemptNX() {
			nxHits++
		}
	}
	fmt.Println("\n⑤ ทดลองซ้ำ 100 ครั้งต่อการตั้งค่า (นับครั้งที่ hijack สำเร็จจริง)")
	fmt.Printf("   ไม่มีการป้องกัน   : %d/%d\n", noneHits, trials)
	fmt.Printf("   canary เปิด        : %d/%d\n", canaryHits, trials)
	fmt.Printf("   NX เปิด            : %d/%d\n", nxHits, trials)

	fmt.Println("\n--- สรุปสำหรับตรวจอัตโนมัติ (key=value) ---")
	finalFrame := newFrame()
	copyUnbounded(finalFrame, payload(frameSize))
	fmt.Printf("buf_size=%d\n", bufSize)
	fmt.Printf("frame_size=%d\n", frameSize)
	fmt.Printf("ret_offset=%d\n", offRet)
	fmt.Printf("payload_bytes=%d\n", frameSize)
	fmt.Printf("ret_after=0x%08X\n", readU32(finalFrame, offRet))
	fmt.Printf("none_hits=%d\n", noneHits)
	fmt.Printf("none_tries=%d\n", trials)
	fmt.Printf("canary_hits=%d\n", canaryHits)
	fmt.Printf("canary_tries=%d\n", trials)
	fmt.Printf("nx_hits=%d\n", nxHits)
	fmt.Printf("nx_tries=%d\n", trials)
	fmt.Printf("aslr_bits0_hits=%d\n", aslrHits[0])
	fmt.Printf("aslr_bits12_hits=%d\n", aslrHits[12])
	fmt.Printf("aslr_bits20_hits=%d\n", aslrHits[20])
	fmt.Printf("aslr_tries=%d\n", tries)
}
```

รันได้เลย:

```bash
go run hijack_model.go
```

ผลรันจริงบนเครื่องผู้เขียน (`out/08_hijack_model.txt`):

```
=== โมเดล hijack control flow + ผลของ canary / NX / ASLR ===
=== ตอนที่ 03 — โมเดล hijack control flow (ไม่รัน shellcode จริง) ===
stack frame: buf[64] | canary | saved fp | ret addr (รวม 76 byte)
ระยะจากต้น buf ถึง return address = 72 byte

① ไม่มีการป้องกัน (ยุค 1996): เขียนเกิน buffer ทับ return address ตรง ๆ
   ส่ง 76 byte (72 ไบต์ + ที่อยู่เป้าหมาย 4 ไบต์) -> ret addr = 0x00409999 (ค่าเดิม 0x00400ABC)
   ret -> กระโดดเข้าฟังก์ชัน admin ที่ไม่ควรถูกเรียก (จำลอง)

② เปิด stack canary: โปรแกรมเทียบค่าเฝ้าดูก่อน ret
   canary กลายเป็น 0x41414141 (ค่าเดิม 0xDEADBEEF) -> จับได้ -> abort
   ของจริง: compiler เรียก __stack_chk_fail แล้วพิมพ์ *** stack smashing detected ***

③ เปิด NX bit (W^X): stack เป็นข้อมูล รันไม่ได้
   ผู้โจมตีชี้ ret -> 0x7FFEE100 (buffer ที่วาง shellcode)
   NX เปิด -> CPU fault: หน้านี้เขียนได้แต่อ่านเป็นโค้ดไม่ได้ -> shellcode ไม่รัน

④ เปิด ASLR: สุ่มที่อยู่ทุกครั้งที่โปรแกรมเริ่ม
   base สุ่ม  0 บิต (      1 ช่อง) -> เดาถูก 100000 ครั้ง จาก 100000 ครั้ง
   base สุ่ม 12 บิต (   4096 ช่อง) -> เดาถูก 23 ครั้ง จาก 100000 ครั้ง
   base สุ่ม 20 บิต (1048576 ช่อง) -> เดาถูก 0 ครั้ง จาก 100000 ครั้ง
   ยิ่งสุ่มมากบิต ยิ่งเดาไม่ได้ — ผู้โจมตีต้องมีช่องรั่วข้อมูลเพื่ออ่านที่อยู่จริงก่อน

⑤ ทดลองซ้ำ 100 ครั้งต่อการตั้งค่า (นับครั้งที่ hijack สำเร็จจริง)
   ไม่มีการป้องกัน   : 100/100
   canary เปิด        : 0/100
   NX เปิด            : 0/100

--- สรุปสำหรับตรวจอัตโนมัติ (key=value) ---
buf_size=64
frame_size=76
ret_offset=72
payload_bytes=76
ret_after=0x41414141
none_hits=100
none_tries=100
canary_hits=0
canary_tries=100
nx_hits=0
nx_tries=100
aslr_bits0_hits=100000
aslr_bits12_hits=23
aslr_bits20_hits=0
aslr_tries=100000
```

อธิบายให้ครบก่อนไปต่อ:

- **① `payload` ที่ "จงใจ" ≠ payload ที่เป็น `'A'` ล้วน** — สังเกตว่า `craftedPayload` เอา `'A'` 72 ไบต์มาเป็น "ทางผ่าน" แล้วปิดท้ายด้วย **ที่อยู่เป้าหมาย 4 ไบต์** (`0x00409999`) · นี่คือรูปร่างจริงของ exploit payload: **offset + ที่อยู่ที่เลือก** · ผลคือ `ret addr = 0x00409999` แล้ว "CPU" (ในโมเดลของเรา) กระโดดเข้าฟังก์ชันที่โปรแกรมไม่ได้ตั้งใจให้เรียก — 100 จาก 100 ครั้ง
- **② canary กลายเป็น `0x41414141` และถูกจับได้ทุกครั้ง** — `canary_hits = 0/100` · จุดสำคัญคือ payload ที่จะไปถึง return address **ต้องเขียนผ่าน canary ก่อนเสมอ** (เพราะมันเรียงติดกัน) มันจึง "ทิ้งรอย" ไว้ทุกครั้ง · ในโมเดลนี้เราใช้ canary แบบคงที่ แต่ของจริง GCC/Clang สร้างค่า canary **สุ่มต่อ process** เพื่อไม่ให้ผู้โจมตี "ฝังค่า canary ที่ถูกต้อง" ลงใน payload ได้
- **③ NX ทำงานคนละขั้นกับ canary** — canary จับ "การทับ" แต่ถ้าผู้โจมตีชี้ return address กลับเข้า buffer ตัวเอง (ที่วาง shellcode ไว้) NX จะบอกว่า "หน้านี้เป็นข้อมูล รันไม่ได้" → `nx_hits = 0/100` · นี่คือเหตุผลที่ NX ต้องมีคู่กับ canary: **canary กันการทับ return address ส่วน NX กันการรันโค้ดที่วางไว้ในหน่วยความจำข้อมูล**
- **④ ตัวเลขของ ASLR คือคำตอบว่าทำไมมันได้ผล** — เมื่อ `base` ไม่ถูกสุ่มเลย (0 บิต) ผู้โจมตีที่เดาที่อยู่ด้วยค่าคงที่ถูก **100000/100000 ครั้ง** · พอสุ่ม 12 บิต (4,096 ช่อง) เหลือ **23/100000** · พอ 20 บิต (1,048,576 ช่อง) เหลือ **0/100000** · ตัวเลขนี้ยังบอกเป็นนัยว่า **ASLR ไม่ได้ "ทำให้โจมตีไม่ได้" แต่มันทำให้ "เดาไม่ได้"** — ถ้าผู้โจมตีมีช่องโหว่อีกอันที่ "อ่าน" หน่วยความจำได้ เขาจะอ่านที่อยู่จริงออกมาแล้วคุมค่าให้ตรงได้ (เราเรียกช่องแบบนี้ว่า info leak หรือช่องรั่วข้อมูล) และนี่คือเหตุผลที่ช่องโหว่ "อ่านเกินขอบเขต" อันตรายกว่าที่คนคิด
- **⑤ ทดลองซ้ำ 100 ครั้งยืนยันว่าไม่ใช่ความบังเอิญ** — `100/100` → `0/100` → `0/100` เป็นเส้นตรง ไม่ใช่การเดาถูกครั้งเดียว

> **ทำไมไม่ต้องรันโค้ดจริงก็ยังนับเป็น "หลักฐาน" ได้?** เพราะเราแยกประเด็นให้ชัด: เดโมนี้ไม่ได้อ้างว่า "ผู้โจมตีทำได้จริงบนเครื่องนี้" มันอ้างว่า **"ตรรกะของกลไกเป็นแบบนี้"** — และตัวเลขที่ออกมา (offset 72 ไบต์, การทับตามลำดับ, canary ถูกแตะทุกครั้งที่ payload ไปถึง ret) ตรงกับที่เดโม A ของจริงยืนยันแบบคำต่อคำ · ตัวเลขทุกตัวในบทนี้เป็นค่าคงที่ของเดโม (จำนวนไบต์, offset, จำนวนครั้งที่รัน) — ไม่มีตัวเลขเวลาที่ลอยตัว จึงรันซ้ำได้ผลเท่าเดิมเสมอ

### 3.4 ดู shellcode ให้เป็น "ไบต์" — ด้วย objdump

เพื่อปิดหัวข้อ 1.3 ให้เป็นรูปธรรม เรามีไฟล์เล็ก ๆ ที่ไม่มี overflow และไม่มี shellcode — มีแค่ฟังก์ชันให้ดิสแอสเซมเบิลดู:

```c
/*
 * shellcode_bytes.c — โชว์ "ไบต์" ของภาษาเครื่องจริง (ไม่รันอะไรอันตราย)
 *
 * ใช้คู่กับ objdump ใน run_all.sh เพื่อดูว่าโค้ดที่ compiler สร้าง = ชุดไบต์
 * ที่ CPU ตีความเป็นคำสั่งทีละคำ — "shellcode" ก็คือชุดไบต์แบบนี้
 * ที่ผู้โจมตีเขียนขึ้นเองด้วยมือ เพื่อให้ CPU รันสิ่งที่เขาต้องการ
 *
 * ไฟล์นี้ไม่มี overflow ไม่มี shellcode — มีแค่ฟังก์ชันเล็ก ๆ ให้ดิสแอสเซมเบิลดู
 */
#include <stdint.h>

__attribute__((noinline)) int answer(void)
{
    return 42;
}

__attribute__((noinline)) uint64_t add_two(uint64_t a, uint64_t b)
{
    return a + b;
}
```

```bash
gcc -std=c17 -O2 -c -o shellcode_bytes.o shellcode_bytes.c
objdump -d shellcode_bytes.o
```

ผลรันจริง (`out/09_shellcode_bytes.txt`):

```
=== objdump -d: ไบต์ของภาษาเครื่อง (คอลัมน์ซ้าย = ที่อยู่, กลาง = ไบต์, ขวา = คำสั่ง) ===

shellcode_bytes.o:     file format elf64-littleaarch64


Disassembly of section .text:

0000000000000000 <answer>:
   0:	52800540 	mov	w0, #0x2a                  	// #42
   4:	d65f03c0 	ret

0000000000000008 <add_two>:
   8:	8b010000 	add	x0, x0, x1
   c:	d65f03c0 	ret
```

ข้อสังเกตที่อยากให้คุณจำ: `answer` ทั้งฟังก์ชันคือ **8 ไบต์** และ `ret` คือ 4 ไบต์ `d65f03c0` หมายความว่า **"โค้ด" ไม่ใช่ของวิเศษ** — มันคือชุดไบต์สั้น ๆ ที่เราเขียนไว้ในหน่วยความจำได้ ถ้าที่นั้น "รันได้" · นั่นคือทั้งหมดของแนวคิด shellcode (และเป็นเหตุผลที่ NX bit มีค่า: มันบอกว่า **"ที่ตรงนี้รันไม่ได้"** ซึ่งทำให้ชุดไบต์ของเราไร้ความหมาย)

### 3.5 ตรวจเกราะจริงบนเครื่องคุณด้วยคำสั่งจริง

ก่อนไปดูผลรัน มาดูโค้ดจริงที่เราจะใช้ตรวจกันก่อน — `canary_demo.c` เป็นไฟล์เล็ก ๆ ที่ **ไม่มี overflow และไม่รัน input อันตราย** มีแค่ฟังก์ชัน `parse()` ที่ถือ array ในเครื่อง (`char tmp[32]`) ซึ่งเป็นเงื่อนไขที่ทำให้ `-fstack-protector-strong` ใส่ค่าเฝ้าดู (canary) ลงบน stack frame ให้เอง:

```c
/*
 * canary_demo.c — โชว์ว่า compiler "ใส่ stack canary ให้เอง" เมื่อเปิด flag
 *
 * ฟังก์ชัน parse() มี array ในเครื่อง (char tmp[32]) ซึ่งเป็นเงื่อนไขที่ทำให้
 * -fstack-protector-strong ใส่ค่าเฝ้าดู (canary) ลงบน stack frame
 *
 * ไฟล์นี้ "ไม่" มี overflow และไม่รัน input ที่เป็นอันตราย — เราดูแค่โค้ดที่
 * compiler สร้าง (objdump/readelf) ว่ามี canary จริงหรือไม่
 */
#include <stdio.h>

__attribute__((noinline)) static int parse(const char *s)
{
    char tmp[32]; /* array ในเครื่อง -> ถูกคุ้มด้วย canary เมื่อเปิด -fstack-protector-strong */
    int i = 0;
    for (; s[i] != '\0' && i < 31; i++) {
        tmp[i] = s[i];
    }
    tmp[i] = '\0';
    return i;
}

int main(void)
{
    printf("%d\n", parse("hello"));
    return 0;
}
```

คอมไพล์สองครั้ง — เปิดกับปิด canary — เพื่อเทียบดิสแอสเซมเบลีของ `parse()` (ผลรันเต็มอยู่ในหัวข้อนี้ด้านล่าง):

```bash
gcc -std=c17 -O0 -fstack-protector-strong -o canary_on  canary_demo.c
gcc -std=c17 -O0 -fno-stack-protector   -o canary_off canary_demo.c
```

ทีนี้มาดูของจริง — เกราะสามชั้นที่เราพูดถึงมันเปิดอยู่ไหม? ทั้งหมดนี้คือผลรันจาก `out/10_protections.txt`:

```
=== 1) stack canary: เทียบเปิด/ปิด -fstack-protector-strong ===
--- เปิด (-fstack-protector-strong): สัญลักษณ์ __stack_chk_fail ---
     6: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND __stack_chk_fail@GLIBC_2.17 (3)
    77: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND __stack_chk_fail@GLIBC_2.17
--- เปิด: บรรทัดที่ compiler เก็บ canary และตรวจก่อน ret (ตัดจากโค้ดจริงของ parse) ---
 87c:	f947e800 	ldr	x0, [x0, #4048]
 884:	f9001fe1 	str	x1, [sp, #56]
 8f8:	f947e800 	ldr	x0, [x0, #4048]
 8fc:	f9401fe3 	ldr	x3, [sp, #56]
 910:	97ffff78 	bl	6f0 <__stack_chk_fail@plt>
--- ปิด (-fno-stack-protector): สัญลักษณ์ __stack_chk_fail ---
(ไม่พบ __stack_chk_fail — ปิด canary แล้ว)

=== 2) NX bit: GNU_STACK RW (NX เปิด) เทียบกับ -z execstack RWE (NX ปิด) ===
--- คอมไพล์ปกติ (ค่าเริ่มต้น): ---
  GNU_STACK      0x000000 0x0000000000000000 0x0000000000000000 0x000000 0x000000 RW  0x10
--- คอมไพล์ด้วย -z execstack (ปิด NX โดยเจตนา เพื่อการสอนเท่านั้น): ---
  GNU_STACK      0x000000 0x0000000000000000 0x0000000000000000 0x000000 0x000000 RWE 0x10

=== 3) ASLR + PIE: ชนิดไฟล์ของ executable ===
--- ชนิดไฟล์ (Type: DYN = PIE ทำให้ ASLR สุ่มที่อยู่ของตัวโปรแกรมได้) ---
  Type:                              DYN (Position-Independent Executable file)
--- ระดับ ASLR ของ kernel (0=ปิด, 1=สุ่มบางส่วน, 2=สุ่มทั้งหมด) ---
randomize_va_space = 2
```

อ่านให้ครบ สามเกราะนี้คือ **สามเกราะจากกลไกในบทนี้โดยตรง**:

1. **canary มีจริง และ compiler ใส่ให้เอง** — เมื่อเปิด `-fstack-protector-strong` โปรแกรมจะมีสัญลักษณ์ `__stack_chk_fail` (ฟังก์ชันที่ถูกเรียกเมื่อค่าเฝ้าดูเปลี่ยน — ตัวเดียวกับที่เดโมของเราเล่า) และถ้าปิด flag ตัวนั้นหายไปเลย · และท่อนที่ตัดมาจากโค้ดจริงของ `parse` แสดงกลไกครบทั้งวงใน 5 บรรทัด: `adrp`+`ldr x0, [x0, #4048]` = โหลดที่อยู่ของ `__stack_chk_guard` (ตัวแปร global) ผ่าน GOT (ตารางชี้ที่อยู่ของสัญลักษณ์ภายนอก) แล้ว `ldr x1, [x0]` ในบรรทัดถัดไปคืออ่านค่าจริง · `str x1, [sp, #56]` = **เก็บ canary ลง frame** (ตรงกับ "ช่อง canary" ในผังของเรา) · แล้วก่อน `ret` มีการอ่านกลับมาเทียบและ `bl __stack_chk_fail` = ถ้าไม่ตรงก็เรียกฟังก์ชัน abort · นี่คือของจริงที่ตรงกับ "② เปิด stack canary" ในเดโม B เป๊ะ · (หมายเหตุ: บน **x86-64** canary ถูกอ่านผ่าน TLS/`%fs:0x28` แต่บน **ARM64** มันเป็นตัวแปร global `__stack_chk_guard` แบบที่เห็นในดิสแอสเซมเบลีนี้ — ไม่ใช่ TLS)
2. **NX bit คือการที่ GNU_STACK เป็น `RW` (อ่าน/เขียนได้ แต่รันไม่ได้)** — เทียบกับตอนที่เราจงใจปิดมันด้วย `-z execstack` ซึ่งกลายเป็น **`RWE`** (มี `E` = executable เพิ่มมา) · ตัวอักษร `E` ที่เพิ่มขึ้น 1 ตัวนี้คือความต่างระหว่าง "shellcode รันได้" กับ "shellcode รันไม่ได้" ทั้งหมด
3. **ASLR เปิดอยู่ที่ระดับ 2** — `randomize_va_space = 2` แปลว่าเคอร์เนลสุ่มทั้ง stack, library **และ** heap · และไฟล์โปรแกรมเป็น **`DYN` (Position-Independent Executable, PIE)** ซึ่งเป็นเงื่อนไขที่ทำให้ ASLR สุ่มที่อยู่**ของตัวโปรแกรมเอง**ได้ด้วย (ถ้าเป็น `EXEC` แบบเก่า ส่วนโค้ดจะอยู่ที่อยู่เดิมทุกครั้ง)

```bash
# ถ้าคุณอยากลองด้วยมือเอง (ในเครื่องคุณเท่านั้น)
readelf -lW ./stack_smash | grep GNU_STACK     # -> RW  = NX เปิด
cat /proc/sys/kernel/randomize_va_space        # -> 2   = ASLR เปิดเต็ม
```

### 3.6 รันทั้งหมดพร้อมกัน (ทำซ้ำได้)

โค้ดทุกไฟล์ของตอนนี้อยู่ที่ `security/code/ep03/` และมีสคริปต์เดียวรันทุกอย่างเก็บผลลง `out/`:

```bash
bash run_all.sh          # -> out/00_env.txt ... out/10_protections.txt
```

ตัวเลขและข้อความทุกตัวที่ยกมาในบทนี้มาจากไฟล์ใน `out/` นั้นจริง ๆ ไม่ได้พิมพ์จากความจำ

---

## 4. โจทย์ประจำตอน

### ระดับ Drill (5–10 นาที)

1. **"offset 72 ไบต์" หมายถึงอะไร** ในบริบทของตอนนี้ และเพราะอะไรตัวเลขนี้จึงเป็นตัวเลขที่ผู้โจมตีต้องรู้ก่อน (ตอบให้ครบสองส่วน: มันคืออะไร + เอาไปใช้ตรงไหน)
2. จากเดโม A: อธิบายด้วยคำของคุณเองว่าทำไมการส่ง **64 ไบต์ "พอดี buffer"** ถึงทำให้ canary กลายเป็น `0xDEADBE00` (คำตอบต้องพูดถึง `'\0'` และ little-endian)
3. จากเดโม B: canary กับ NX "กันคนละขั้น" — อธิบายว่าขั้นไหน และยกตัวเลขจากผลรันของทั้งสองมายืนยัน (`canary_hits`, `nx_hits`)
4. อธิบายด้วยคำของคุณเองว่าทำไม **`ASLR` 20 บิต ถึงได้ 0 จาก 100,000** แต่ **0 บิต ถึงได้ 100,000 จาก 100,000** และทำไมข้อสรุปที่ถูกต้องคือ "ASLR ทำให้เดาไม่ได้" ไม่ใช่ "ASLR ทำให้โจมตีไม่ได้"

### ระดับ Mini-project (30–60 นาที)

1. **หาค่า offset ของตัวเองแบบ "เดาแล้วพิสูจน์"** — แก้ `stack_smash.c` ให้ `buf` เล็กลงเป็น 16 ไบต์ แล้ว **(ก)** ทำนายด้วยการคำนวณว่า offset ของ `ret_addr` จะเป็นเท่าไร **(ข)** พิมพ์ `offsetof(struct frame, ret_addr)` ออกมาพิสูจน์ **(ค)** รันกรณี "ทับพอดี 1 ไบต์ / ทับครบ" และอธิบายว่าเกิดอะไรขึ้น (ทำในเครื่องตัวเองเท่านั้น)
2. **ต่อยอดเดโม A ให้ "ปลอดภัยจริง"** — แก้ให้ใช้ฟังก์ชันที่รู้ขนาดปลายทาง พร้อมเพิ่มเทสต์ input ยาว 0, 15, 16, 17, 63, 64, 66 ไบต์ แล้วพิสูจน์ว่า canary **ไม่เปลี่ยนเลยแม้กรณีเดียว** พิมพ์ตารางผลลัพธ์มาให้ครบ — นี่คือทักษะที่แยก "เขียนโค้ดให้รันได้" กับ "เขียนโค้ดที่ผู้โจมตีแตกไม่ได้"
3. **ทดลอง ASLR ของจริง (ในเครื่องตัวเอง)** — เขียนโปรแกรม Go หรือ C ที่พิมพ์ที่อยู่ของตัวแปรบน stack แล้วรัน 5 ครั้งติดกัน บันทึกว่าที่อยู่เปลี่ยนทุกครั้งไหม · จากนั้น **ใน sandbox ของตัวเองเท่านั้น** ลองปิด ASLR ชั่วคราวเฉพาะ process (เช่น `setarch $(uname -m) -R ./โปรแกรม` — ต้องมีสิทธิ์เท่าที่จำเป็น) แล้วรันซ้ำ ดูว่าที่อยู่คงเดิมหรือไม่ · สรุปเป็นตารางว่าเห็นอะไร และเพราะอะไรผลนี้จึงตรงกับตัวเลขในเดโม B ข้อ ④
4. **เขียน "บันไดการป้องกัน" ของตัวเอง 1 หน้า (เตรียมต่อตอนที่ 07)** — วาดตาราง 4 คอลัมน์: *ขั้นของ exploit* (เขียนเกิน → ทับ canary → ทับ return address → กระโดดไป shellcode), *เกราะที่ขวางขั้นนั้น*, *เกราะนั้นเกิดปีไหน*, *ถ้าข้ามเกราะนั้นได้ ผู้โจมตีจะทำอะไรต่อ* (ใบ้: ROP/ret2libc) — เก็บไว้ เพราะเราจะใช้ต่อในตอนที่ 07 (Heartbleed — เมื่อ "อ่านเกินขอบเขต" เอาชนะ ASLR ได้) และตอนที่ 21 (input validation/output encoding)

---

## 5. สรุปตอนที่ 03

- **แก่นของเรื่อง:** ข้อมูล (`buf`) กับ "คำสั่งที่จะทำต่อไป" (`return address`) อยู่ติดกันบน stack และ CPU ไม่รู้จักความต่างระหว่างสองอย่างนี้ — **เขียนเกิน 1 ไบต์ จึงอาจเท่ากับยึดเครื่อง**
- **`shellcode` = ชุดไบต์ที่ผู้โจมตีเขียนขึ้นให้เป็นภาษาเครื่องที่ CPU รันได้** — ไม่ใช่ของวิเศษ · `objdump` ของเราพิสูจน์ว่าฟังก์ชัน `answer` ทั้งฟังก์ชันมีแค่ 8 ไบต์ (`52800540` = ใส่ค่า 42 · `d65f03c0` = `ret`)
- **`Smashing the Stack for Fun and Profit`** เขียนโดย **Aleph One** (= **Elias Levy**) ตีพิมพ์ใน **Phrack 49, File 14 of 16, 8 พฤศจิกายน 1996** — มันไม่ได้ค้นพบช่องโหว่ใหม่ มันเปลี่ยนความรู้ในแวดวงแคบให้เป็น**คู่มือที่ทำตามได้** และทำให้โลกต้องลงมือสร้างเกราะจริง
- **เดโม A** แสดง **บันไดการล้น** จากผลรันจริง: 63 ไบต์ปลอดภัย · **64 ไบต์ "พอดี buffer" ก็ยังล้น** (`canary = 0xDEADBE00`) · 68 ไบต์ทับ canary (`0x41414141`) · **72 ไบต์แตะ return address แค่ 1 ไบต์ ปลายทางก็เปลี่ยน** (`0x00400ABC` → `0x00400A00`) · **76 ไบต์ทับครบ = เลือกปลายทางเองได้** (`0x41414141`) — และเวอร์ชัน safe ปฏิเสธทุกกรณีด้วยการเช็ค `n >= BUF_SIZE` เพียงเงื่อนไขเดียว
- **เดโม B** ยืนยันด้วยการนับ: ไม่มีการป้องกัน **100/100** · เปิด canary **0/100** · เปิด NX **0/100** · เปิด ASLR 0 บิต **100000/100000** → 12 บิต **23/100000** → 20 บิต **0/100000**
- **เกราะสามชั้นที่เกิดจากบทเรียนนี้** — **stack canary** (StackGuard, USENIX Security 1998; ค่าต้นฉบับ `0xDEADBEEF`; OpenBSD 3.3 เป็นค่าเริ่มต้นทั้งระบบปี 2003) · **NX bit / W^X** (PaX ~2000, OpenBSD 2003, Windows DEP 2004) · **ASLR** (PaX 2001, OpenBSD 3.4 2003, Linux mainstream ~2005) — และทั้งสามก็ถูกข้ามได้ด้วย **ret2libc (1997)** และ **ROP (2007)**
- **บนเครื่องของคุณเอง** เกราะทั้งสามเปิดอยู่: `GNU_STACK` เป็น **`RW`** (NX เปิด — เทียบกับ `-z execstack` ที่ได้ **`RWE`**) · โปรแกรมเป็น **`DYN` (PIE)** · และ `randomize_va_space = 2`

ตอนหน้า (ตอนที่ 04) เราจะออกจาก "หน่วยความจำ" ไปสู่ "ฐานข้อมูล" — **SQL Injection** ตำนานที่สอนโลกทั้งใบให้รู้จักประโยคที่ว่า **"never trust input"** เราจะดูว่าทำไมการต่อสตริงคำสั่งกับ input ของผู้ใช้ถึงเป็นหายนะ เราจะทำเดโมที่รันได้จริงใน Go และจะเห็นว่า **parameterized query** (การส่งค่าแยกจากคำสั่ง ไม่ใช่ต่อเป็นข้อความ) กันได้อย่างไร

ระหว่างรอ ลองถามตัวเองกับโค้ดที่คุณเขียนล่าสุดว่า *"ตรงไหนที่โปรแกรมของฉันเชื่อข้อมูลจากข้างนอกโดยไม่ตรวจขนาด — และถ้าข้อมูลนั้นยาวกว่าที่คาด ข้อมูลก้อนแรกที่จะถูกเขียนทับคืออะไร"* — คำถามนี้คือคำถามเดียวกับที่ Aleph One เขียนออกมาเป็นตำราในปี 1996

พบกันตอนหน้า

---

## หมายเหตุท้ายบท (disclaimer)

- บทความนี้เขียนและรันโค้ดจริงเมื่อ **11 ตุลาคม 2026** (เวลาไทย) บน **Raspberry Pi 5 Model B**, Linux 6.18.39+rpt-rpi-2712 (aarch64) · รันด้วย **Go 1.24.4 (linux/arm64)** · **gcc 14.2.0** (Debian 14.2.0-19) · **Python 3.13.5** · **rsvg-convert 2.60.0** — ค่าตรวจจาก `security/code/ep03/out/00_env.txt`
- **เวอร์ชันล่าสุด ณ วันที่เขียน** (ตรวจจากแหล่งปัจจุบัน ไม่ได้ใช้ความจำ): Go stable ล่าสุดคือ **Go 1.27.2** (ออก 8 ตุลาคม 2026 — <https://go.dev/dl/>) · GCC สายหลักล่าสุดคือ **GCC 16.2** (ออก 7 สิงหาคม 2026 — <https://gcc.gnu.org/releases.html>) ส่วน Debian ที่ใช้รันมี gcc 14.2.0 · เลขเวอร์ชันบนเครื่องเราจึงเก่ากว่าล่าสุดได้เป็นปกติ
- ทุกตัวเลขและข้อความที่ยกมาในบทเป็น **ผลรันจริง** จาก `security/code/ep03/out/`: ขนาด frame `76 byte` (buf `64` + canary + saved fp + ret addr), ระยะถึง return address `72 byte`, บันไดการล้นที่ input `63/64/68/72/76/79` ไบต์ให้ canary/saved fp/ret addr ตามที่ยกมา (`0xDEADBEEF` → `0xDEADBE00` → `0x41414141`, ret `0x00400ABC` → `0x00400A00` → `0x41414141`), และตัวเลขของเดโม B (`none 100/100`, `canary 0/100`, `nx 0/100`, ASLR `0 บิต 100000/100000`, `12 บิต 23/100000`, `20 บิต 0/100000`) · **เวลาที่ใช้จริง (wall-clock)** ตั้งใจ**ไม่**ยกมาเป็นตัวเลขในบทเลย เพราะเปลี่ยนตามเครื่องและตามการรัน — โปรแกรมที่ใช้เวลาไม่พิมพ์ค่าออกมา
- **ความปลอดภัยของเดโม:** เดโมทั้งหมดในบท **ไม่รัน shellcode** และไม่แตะหน่วยความจำจริงของ process — เดโม A จำลอง frame บน heap ที่เราจองเอง (มี padding 128 ไบต์และเพดานความยาว input) เดโม B จำลอง frame เป็น `[]byte` ของ Go แล้ว "กระโดด" ด้วยการ lookup ตารางที่อยู่เท่านั้น · ส่วน `-z execstack` ที่ใช้ในหัวข้อ 3.5 ใช้เพียงเพื่อ**สาธิตส่วนต่าง `RW` กับ `RWE`** ไม่ได้ใช้รันโค้ดใด ๆ
- **ข้อเท็จจริงเชิงประวัติศาสตร์** ตรวจกับแหล่งปัจจุบันเมื่อ **2026-10-11**: *Smashing The Stack For Fun And Profit* ตีพิมพ์ใน **Phrack ฉบับที่ 49, ไฟล์ 14 จาก 16, วันที่ 8 พฤศจิกายน 1996** โดย **Aleph One** (= **Elias Levy** ชาวเวเนซุเอลา, ผู้ดูแล Bugtraq 1996–2001 และผู้ร่วมก่อตั้ง SecurityFocus) — <https://phrack.org/issues/49/14> และ <https://en.wikipedia.org/wiki/Elias_Levy> · **StackGuard** (stack canary) เสนอโดย Crispin Cowan และคณะที่งาน **USENIX Security 1998** โดย prototype ต้นฉบับใช้ค่า `0xDEADBEEF` และค่าสมัยใหม่สุ่มต่อ process · **ProPolice** (Hiroaki Etoh, พัฒนาราวปี 2000–2001) เพิ่มการสลับตำแหน่งตัวแปรใน frame และ OpenBSD 3.3 (2003) เป็นระบบแรกที่เปิดให้เป็นค่าเริ่มต้นทุกโปรแกรม · **NX / W^X** มาจาก PaX (ราวปี 2000) และ OpenBSD W^X (2003); Windows เปิด DEP ใน XP SP2 (2004) · **ASLR** มาจาก PaX ASLR (2001) และ OpenBSD 3.4 (2003) เป็น OS ที่ใช้กว้างตัวแรกที่เปิดให้เป็นค่าเริ่มต้น ก่อนเข้า Linux mainstream ราวปี 2005
- **เทคนิคที่ต่อยอดจากเกราะเหล่านี้:** **return-into-libc** (Solar Designer, Bugtraq, สิงหาคม 1997) และ **Return-Oriented Programming** (Hovav Shacham, *The Geometry of Innocent Flesh on the Bone*, CCS 2007) — เราไม่ได้ลงมือทำเทคนิคเหล่านี้ในบทนี้เลย แค่ระบุว่ามันมีอยู่จริงและเป็นเหตุผลว่าทำไม "ไม่มีเกราะชั้นไหนพอ"
- **มาตรฐานที่อ้าง:** เดโมนี้เป็นตัวอย่างของ **CWE-121 (Stack-based Buffer Overflow)** ในตระกูล **CWE-787 (Out-of-bounds Write)** ซึ่งยังอยู่ในกลุ่มความเสี่ยงต้น ๆ ของ **CWE Top 25** และ **OWASP** · รายละเอียดเรื่อง CVE/CWE/CVSS จะอยู่ที่ตอนที่ 16
- ภาพ SVG ทั้งสามภาพในตอนนี้สร้างจากสคริปต์ `security/code/ep03/gen_svgs.py` ที่ดึงตัวเลขจาก `out/` โดยตรง (มี `assert` ตรวจว่าแถวที่ parse ครบและค่าตรงกับที่คาด) และผ่านประตูตรวจ `check_svg_readability.py` (วัดความกว้างข้อความจริงเทียบขอบ viewBox) รวมทั้งตรวจด้วยตาจากการ render จริงด้วย `rsvg-convert`
- **จริยธรรม (ย้ำอีกครั้ง — สำคัญที่สุดในตอนนี้):** ตอนนี้สอนกลไกของ exploit ตรง ๆ แต่ **ทุกเดโมไม่รัน shellcode และไม่แตะระบบใดนอกจากหน่วยความจำที่โปรแกรมตัวเองจอง** · การนำเทคนิคในบทนี้ (buffer overflow, return-address overwrite, shellcode, การปิด NX/ASLR) ไปใช้กับระบบที่คุณไม่ได้เป็นเจ้าของหรือไม่ได้รับอนุญาตเป็นความผิดทางกฎหมายในแทบทุกประเทศ — **ทำใน environment ที่คุณควบคุมเองเท่านั้น** (เครื่องตัวเอง, VM, container, lab) และโค้ดที่โชว์มี label **"ห้ามใช้จริง"** กำกับแล้วทุกไฟล์

---

← ตอนก่อน: [Morris Worm (1988): หนอนตัวแรกที่แพร่ทาง internet](/blog/post.html?slug=2026-10-10-software-security-02-morris-worm-1988)  /  ต่อด้วยตอนที่ 04: [SQL Injection: จุดกำเนิด "never trust input"](/blog/post.html?slug=2026-10-12-software-security-04-sql-injection)
