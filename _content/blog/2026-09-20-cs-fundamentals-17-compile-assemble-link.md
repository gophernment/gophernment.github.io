---
title: "จาก .c สู่ executable — 4 ขั้นที่ซ่อนอยู่ใน gcc -o (preprocess / compile / assemble / link) (ตอนที่ 17)"
date: 2026-09-20
tags: [cs-fundamentals, c, compiler, linker]
description: "ตอนที่ 17 ของคอร์ส CS Fundamentals — แกะคำสั่ง gcc -o คำเดียวออกเป็น 4 ขั้น (preprocess → compile → assemble → link) พร้อมดูไฟล์จริงของแต่ละขั้น (.i/.s/.o), object file กับตาราง symbol, ฝึกสร้างไลบรารีของตัวเอง 3 วิธี (.o ตรง ๆ / .a / .so) และเทียบกับ Go ที่ตัดสองขั้นแรกทิ้ง — ทุกโปรแกรมคอมไพล์และรันจริงบนเครื่อง"
---

# จาก .c สู่ executable — 4 ขั้นที่ซ่อนอยู่ใน `gcc -o` (preprocess / compile / assemble / link) (ตอนที่ 17) — CS Fundamentals: จาก 0 สู่พื้นฐานที่แท้จริง

ตอนที่แล้ว (ตอนที่ 16) เราปิดท้ายด้วยสองคำถามค้างไว้:

1. ตลอดคอร์สนี้เราเขียน `gcc -o main main.c` แล้วก็รันได้เลย — แต่จริง ๆ แล้วระหว่าง "ไฟล์ .c" กับ "โปรแกรมที่รันได้" มีขั้นตอนอะไรซ่อนอยู่บ้าง **preprocess → compile → assemble → link** แต่ละขั้นทำอะไร และ `malloc`/`printf` ที่เราเรียกใช้ อยู่ที่ไหน ถึงตอนไหนมันถึงมาอยู่ในโปรแกรมของเรา
2. เราเห็น return address ถูกเขียนทับได้เพราะมันวางอยู่บน stack — แล้วถ้าอยากรู้ "ตำแหน่งที่แท้จริง" ของ `main` ในไฟล์โปรแกรมสุดท้ายจะดูได้ยังไง และทำไมบางทีโปรแกรมถึงฟ้อง `undefined reference` ตอน link

วันนี้เราจะตอบทั้งสองข้อด้วยการ **แยกคำสั่งเดียวให้เป็นสี่คำสั่ง** แล้วดูไฟล์จริงที่เกิดขึ้นในแต่ละขั้นของมัน ทุกตัวเลขและทุกข้อความในบทนี้มาจากการรันจริงบนเครื่องเรา (Linux aarch64 / Raspberry Pi 5, GCC 14.2.0, binutils 2.44) ไม่ใช่สิ่งที่ยกมาจากตำรา

> **คำศัพท์พื้นฐานที่จะใช้ตลอดบทนี้** (อธิบายครั้งเดียวตรงนี้ แล้วใช้ต่อเลย):
> - **source file** = ไฟล์โค้ดที่เราเขียนเอง นามสกุล `.c`
> - **translation unit** (หน่วยแปลภาษา) = โค้ดหนึ่งก้อนที่คอมไพเลอร์แปลจบในรอบเดียว ปกติคือ "ไฟล์ `.c` หนึ่งไฟล์ + ทุกไฟล์ที่มัน `#include` เข้ามา"
> - **preprocessor** (ตัวประมวลผลก่อน) = โปรแกรมที่จัดการข้อความ (`#include`, `#define`) **ก่อน** คอมไพเลอร์ทำงาน
> - **compiler** (คอมไพเลอร์) = โปรแกรมที่แปลโค้ดภาษา C ให้เป็นภาษาแอสเซมบลี — เป็นตัวเดียวในทั้งสี่ขั้นที่ "เข้าใจความหมาย" ของโค้ดเรา
> - **assembler** (แอสเซมเบลอร์) = โปรแกรมที่แปลภาษาแอสเซมบลีให้เป็น "รหัสเครื่อง" (ตัวเลขที่ CPU อ่านได้จริง) แล้วห่อเป็นไฟล์ที่เรียกว่า object file
> - **object file** (ไฟล์ออบเจกต์, `.o`) = ไฟล์ที่ CPU เกือบเข้าใจแล้ว แต่ยัง "อยู่คนเดียวไม่ได้" เพราะที่อยู่ข้างในยังไม่ถูกเติมให้ครบ
> - **symbol** (สัญลักษณ์) = ชื่อของฟังก์ชัน/ตัวแปรที่ไฟล์ `.o` ประกาศออกไปให้คนอื่นเห็น (หรือยังรอคนอื่นมาให้)
> - **linker** (ตัวเชื่อม) = โปรแกรมที่รวม object files หลายไฟล์ + ไลบรารีของระบบ ให้กลายเป็นไฟล์ executable ตัวเดียวที่รันได้

---

## 1. แนวคิด: `gcc` ไม่ใช่ "โปรแกรมเดียว" — มันเป็นคนคุมวง (ภาพที่ 1)

เวลาพิมพ์ `gcc -o main main.c` เราไม่ได้เรียกโปรแกรมเดียวทำงาน แต่เรียก **`gcc` ในฐานะ "คนคุมวง" (driver)** ให้ไปเรียกเครื่องมือสี่ตัวทำงานต่อกันเป็นทอด ๆ:

![สี่ขั้นจากไฟล์ .c ไปเป็น executable: preprocess → compile → assemble → link แล้วโหลดเข้า memory ตอนรัน](/assets/diagrams/ep17-01-four-stages.svg)

ไม่ต้องเชื่อผม ลองให้ `gcc` เล่าเองด้วยธง `-v` (verbose = พูดมาก) — นี่คือคำสั่งจริงที่มันไปเรียก ข้างหลัง `gcc -o main main.c mathx.c` (ตัดบรรทัดยาว ๆ ให้อ่านง่าย):

```bash
$ gcc -v -o main_verbose main.c mathx.c
 /usr/libexec/gcc/aarch64-linux-gnu/14/cc1 -quiet -v -imultiarch aarch64-linux-gnu main.c -quiet ... -o /tmp/ccFJj6k6.s
 as -v -EL -mabi=lp64 -o /tmp/cc7BN2S.o /tmp/ccFJj6k6.s
 /usr/libexec/gcc/aarch64-linux-gnu/14/collect2 -plugin ... -dynamic-linker /lib/ld-linux-aarch64.so.1 \
     -pie -o main_verbose /usr/lib/gcc/aarch64-linux-gnu/14/../../../aarch64-linux-gnu/Scrt1.o \
     .../crti.o .../crtbeginS.o ... main.o mathx.o -lgcc -lgcc_s -lc -lgcc_s .../crtendS.o .../crtn.o
COLLECT_GCC_OPTIONS='-v' '-o' 'main_verbose' '-mlittle-endian' '-mabi=lp64' ...
```

(ในบรรทัด `collect2` ไฟล์ `.o` ที่รับจริงคือไฟล์ชั่วคราวที่ `as` เพิ่งสร้าง เช่น `/tmp/cc7BN2S.o` — บทนี้ย่อเป็น `main.o mathx.o` เพื่อให้อ่านง่าย)

อ่านสี่บรรทัดนี้ให้ออก มันคือทั้งบทนี้อยู่ในนั้น:

1. **`cc1`** — ตัวคอมไพเลอร์จริง (C Compiler 1) ทำงานกับ `main.c` แล้วเขียนผลเป็นไฟล์ `.s` ลงโฟลเดอร์ชั่วคราว
2. **`as`** — assembler แปลไฟล์ `.s` นั้นให้เป็น `.o`
3. **`collect2`** — ตัวห่อ (wrapper) ที่ `gcc` ใช้เรียก linker (`ld`) ให้ พร้อมแนบรายการไฟล์ทั้งหมดที่ต้องใช้
4. **`Scrt1.o` · `crti.o` · `crtbeginS.o` · `-lgcc` · `-lc` · `crtendS.o` · `crtn.o`** — ของที่เราไม่เคยเขียนเองสักไฟล์ แต่ถูกใส่เข้าไปให้เสมอ! นี่คือคำตอบครึ่งหนึ่งของคำถามค้างข้อ 1: `printf` มาจาก `-lc` (libc) และ "จุดเริ่มต้นจริง" ของโปรแกรมอยู่ในไฟล์ `crt` เหล่านี้ ไม่ใช่ใน `main.c` ของเรา

สังเกตด้วยว่าไฟล์กลาง (`ccFJj6k6.s`, `cc7BN2S.o`) ถูกเขียนลง**โฟลเดอร์ชั่วคราว**แล้วลบทิ้งอัตโนมัติ — ถ้าเราอยากดู มันมีธงสั่งให้เก็บไว้:

```bash
gcc -save-temps -o main main.c mathx.c   # เก็บ main.i, main.s, main.o ไว้ให้ดู
```

แต่ในบทนี้เราจะทำ "ช้า ๆ" ด้วยการสั่งทีละขั้นเอง เพื่อให้เห็นว่าแต่ละขั้นกินอะไรเข้า และคายอะไรออก

---

## 2. ทำไมเรื่องนี้สำคัญ (โยงกับของจริง)

### 2.1 "error" เกิดคนละขั้น และแก้คนละวิธี

นี่คือประโยชน์ที่จับต้องได้ทันทีในชีวิตจริง — ข้อความ error ที่เราเห็นตอน build บอก "ขั้นไหนพัง":

| ขั้นที่พัง | ข้อความที่เห็น | แปลว่า |
|---|---|---|
| preprocess | `fatal error: nope_missing.h: No such file or directory` | หาไฟล์หัวไม่เจอ — เรื่องของ path/แพ็กเกจ ไม่ใช่โค้ดผิด |
| compile | `error: expected ',' or ';' before 'return'` · `error: implicit declaration of function 'malloc'` | **ไวยากรณ์** หรือ **การประกาศ** ผิด — แก้ที่ไฟล์ `.c` ของเรา |
| assemble | แทบไม่พังจากมือเรา (พังเพราะ `gcc`/`as` ต่อกันไม่ตรงเวอร์ชัน) | ปัญหาเครื่องมือ ไม่ใช่โค้ด |
| link | `undefined reference to 'mathx_clamp'` · `multiple definition of 'shared_counter'` | โค้ดถูกต้องแล้ว แต่ "ประกอบร่าง" ไม่ครบ — แก้ที่คำสั่ง build / รายการไฟล์ |
| ตอนรัน | `error while loading shared libraries: libstats.so: cannot open ...` | ไฟล์ถูกสร้างแล้ว แต่ตอนรันหาของไม่เจอ |

คนที่เรียน C แล้วงงเป็นแถว ๆ ส่วนใหญ่คือ **เอา error ของขั้นหนึ่งไปแก้ด้วยวิธีของอีกขั้นหนึ่ง** — เช่นเห็น `undefined reference` แล้วไปแก้ไวยากรณ์ทิ้งครึ่งวัน ทั้งที่ความจริงแค่ลืมส่งไฟล์ `.o` เข้าไป

### 2.2 คอมไพเลอร์ "ไม่เคยเห็น" ไฟล์อื่น — นั่นคือเหตุผลที่ต้องมี header

นี่คือความเข้าใจผิดที่สำคัญที่สุดในบทนี้: ตอนคอมไพล์ `main.c` คอมไพเลอร์**ไม่รู้เลยว่า** `mathx.c` มีอยู่ โค้ดหน้าตาเป็นยังไง หรือมีคนเขียนฟังก์ชันชื่อนั้นจริงหรือเปล่า มันรู้แค่สิ่งที่อยู่ในไฟล์ที่เรา `#include` เข้ามา

เพราะฉะนั้น **header file (`.h`) จึงไม่ใช่ "ไฟล์โค้ด"** — มันคือ **สัญญา** (contract) ที่บอกว่า "ข้างนอกโน่นมีฟังก์ชันหน้าตาอย่างนี้อยู่" ถ้าคำประกาศใน `.h` ไม่ตรงกับตัวโค้ดจริงใน `.c` คอมไพเลอร์จะไม่รู้ตัวเลย (มันเห็นคนละไฟล์) — เรื่องนี้จะพังไปโผล่เอาตอน link หรือแย่กว่านั้นคือตอนรัน (หัวข้อ 4.5)

### 2.3 เคอร์เนลเข้าใจแค่ ELF — ที่เหลือเป็นหน้าที่ของตัวโหลด

ตอนที่เราพิมพ์ `./main` เคอร์เนล (แกนกลางของระบบปฏิบัติการ) ไม่รู้จักคำว่า "ภาษา C" หรือ "ฟังก์ชัน `main`" เลย มันรู้จักแค่ **ELF** (Executable and Linkable Format = รูปแบบไฟล์มาตรฐานของโปรแกรมบน Linux) ว่ามีส่วนไหนอยู่ตรงไหน แล้วส่งงานต่อให้ **dynamic loader** (`/lib/ld-linux-aarch64.so.1`) ซึ่งมีหน้าที่โหลดไลบรารีที่ต้องใช้และเติมที่อยู่จริงให้ — เราจะได้เห็นชื่อนี้ในทุกคำสั่งตรวจไฟล์ของบทนี้

> ต่อจากนี้ไปอีกสองตอน (ตอนที่ 18 process/thread และตอนที่ 19 syscall) เราจะโผล่ไปดูฝั่งนี้ของเส้นแบ่ง (user space ↔ kernel space) ให้เห็นว่า "การรันโปรแกรม" จริง ๆ เกิดอะไรขึ้น

### 2.4 นี่คือเหตุผลที่โลกมี Make/CMake

เมื่อรู้ว่าทุกอย่างถูกแยกเป็น `.o` ทีละไฟล์ เราก็เข้าใจทันทีว่าเครื่องมือ build อย่าง `make` ทำงานยังไง:

- มันดู "เวลาแก้ไขไฟล์" (timestamp) ว่า `.c` ไหนใหม่กว่า `.o` แล้ว **คอมไพล์ใหม่แค่ไฟล์นั้น** ที่เหลือใช้ `.o` เดิม ไม่ต้องแปลใหม่หมด
- โปรเจกต์จริงที่มีหลายพันไฟล์ build ได้ในไม่กี่วินาทีก็เพราะสถาปัตยกรรมแบบนี้
- (และนี่ก็ทำให้เรื่อง "แก้ `.h` ไฟล์เดียวแล้ว rebuild ทั้งโลก" เป็นเรื่องปกติที่ต้องยอมรับ)

---

## 3. ลงมือทำ: แยกสี่ขั้นให้เห็นกับตา

โปรแกรมตัวอย่างของบทนี้มี 2 translation unit (โค้ดเต็มอยู่ใน `course/code/ep17/`):

```
main.c    ← มี main() เรียกใช้ mathx_clamp / mathx_sum_odd / mathx_version + printf
mathx.c   ← มี "ตัวโค้ดจริง" ของ 3 ฟังก์ชันนั้น
mathx.h   ← มีแค่ "คำประกาศ" (ไม่มีโค้ดที่รันได้) — สัญญาระหว่างสองไฟล์
```

`mathx.h` หน้าตาเป็นแบบนี้ (สังเกตว่ามีแต่คำประกาศ ไม่มีปีกกาโค้ด):

```c
#ifndef MATHX_H              /* "ถ้ายังไม่เคยถูกอ่าน" — ตัวกันอ่านซ้ำ (include guard) */
#define MATHX_H              /* "จดไว้ว่าอ่านแล้ว" */

#define MATHX_MAX_BYTES 64
#define MATHX_LIMIT     1000L    /* ค่าคงที่แบบ macro: แทนข้อความตอน preprocess */

long mathx_clamp(long v, long lo, long hi);   /* ประกาศ: บอกหน้าตา ไม่มีตัวโค้ด */
long mathx_sum_odd(int limit);
const char *mathx_version(void);

#endif /* MATHX_H */
```

> **`#ifndef` / `#define` / `#endif` คืออะไร** — `#ifndef X` แปลว่า "ถ้า X ยังไม่ถูก define"; `#define X` คือการ "จดชื่อ X ไว้" ทั้งคู่ทำงานในขั้น preprocess ดังนั้นถ้าไฟล์นี้ถูก `#include` ซ้ำสองครั้ง (ซึ่งเกิดได้จริงเมื่อไฟล์ `.h` ซ้อนกันหลายชั้น) รอบที่สองจะถูก "ข้าม" ไปทันที — กฎเหล็กคือ `.h` ทุกไฟล์ต้องมีสามบรรทัดนี้เสมอ

### 3.1 ขั้นที่ 1 — preprocess: `#include` ถูก "ยัด" ไฟล์ทั้งไฟล์เข้ามา

```bash
gcc -std=c17 -E main.c -o main.i      # -E = หยุดแค่ขั้น preprocess
```

`-E` (จากคำว่า pr**e**process) สั่งให้ทำ**แค่ขั้นแรก** แล้วเขียนผลลัพธ์ออกมาเป็นข้อความธรรมดา มาดูขนาดของมันก่อนเลย:

```
$ wc -l main.c main.i
   38 main.c
  806 main.i
$ wc -c main.c main.i
 2576 main.c
22795 main.i
```

**38 บรรทัด กลายเป็น 806 บรรทัด** — โค้ดที่เราเขียนเอง 2,576 ไบต์ โป่งเป็น 22,795 ไบต์ นั่นคือ `#include` ทำงาน: มันไม่ได้ "อ้างถึง" ไฟล์อื่น มัน **คัดลอกเนื้อหาไฟล์นั้นทั้งไฟล์มาวางตรงจุดนั้นเลย** ซ้ำแล้วซ้ำอีกตามชั้นที่ซ้อนกัน

จำนวนครั้งที่ถูกยัดเข้ามาใน `main.i` คือ **37 include event** (`grep -c '^# 1 "' main.i`) — จาก `#include` แค่ 3 บรรทัดของเรา (`stdio.h`, `stdlib.h`, `mathx.h`) เพราะไฟล์หัวของระบบเองก็ `#include` กันต่อเป็นทอด ๆ

มาดูข้างใน `main.i` — สังเกตบรรทัดพิเศษที่ขึ้นต้นด้วย `#` (เรียกว่า line marker = ป้ายบอกว่าข้อความข้างล่างนี้เดิมมาจากไฟล์ไหนบรรทัดไหน):

```
$ head -14 main.i
# 0 "main.c"
# 0 "<built-in>"
# 0 "<command-line>"
# 1 "/usr/include/stdc-predef.h" 1 3 4
# 0 "<command-line>" 2
# 1 "main.c"
# 9 "main.c"
# 1 "/usr/include/stdio.h" 1 3 4
# 28 "/usr/include/stdio.h" 3 4
# 1 "/usr/include/aarch64-linux-gnu/bits/libc-header-start.h" 1 3 4
# 33 "/usr/include/aarch64-linux-gnu/bits/libc-header-start.h" 3 4
# 1 "/usr/include/features.h" 1 3 4
# 415 "/usr/include/features.h" 3 4
# 1 "/usr/include/features-time64.h" 1 3 4
...  (อีกประมาณ 770 บรรทัดเป็นของไฟล์หัวของระบบ แล้วจึงกลับมาที่โค้ดของเรา) ...
# 1 "main.c"
```

ข้อความแบบ `# 1 "/usr/include/stdio.h" 1 3 4` ไม่ได้ถูก "รัน" — มันเป็นป้ายบอกคอมไพเลอร์ว่า "ข้อความต่อจากนี้ไปเดิมมาจากไฟล์นี้ บรรทัดนี้" เพื่อให้เวลาเกิด error มันชี้บรรทัดถูก (และเพื่อให้ debugger หาไฟล์ต้นฉบับเจอ) ของจริงในไฟล์คือ **37 ป้ายแบบนี้** (นับเป็น include event — ไฟล์หัวตัวเดิมถูก `#include` ซ้ำได้ จึงมีไฟล์ต่างกันจริงแค่ 29 ไฟล์)

ถ้าเลื่อนไปดูโค้ดของเราเองที่อยู่ใน `main.i` (ลองค้นคำว่า `DOUBLE(1 + 2)`) จะเห็นว่า **macro หายไปแล้ว**:

```
# (ผลจาก main.i บรรทัดที่ 782 — ค้นคำว่า DOUBLE(1 + 2))
    printf("DOUBLE(1 + 2)      = %d\n", ((1 + 2) * (1 + 2)));
```

เรียง `#define DOUBLE(x) ((x) * (x))` ไว้บนหัวไฟล์ — ในไฟล์ `.i` ไม่เหลือคำว่า `DOUBLE` แล้ว เหลือแต่ข้อความที่ถูกแทนลงไป แบบเดียวกับตัวแปรพิเศษที่ preprocessor ใส่ให้เอง:

```
    printf("บรรทัดนี้อยู่ในไฟล์ %s บรรทัดที่ %d\n", "main.c", 36);
```

`__FILE__` กลายเป็น `"main.c"` และ `__LINE__` กลายเป็น `36` (เลขบรรทัดจริงของ `main.c`) — ทั้งหมดเกิดขึ้นในขั้นนี้ ไม่ใช่ตอนรัน

> **`__FILE__` / `__LINE__` / `__DATE__` / `__TIME__`** = macro พิเศษที่ preprocessor แทนค่าให้เองตอนคอมไพล์ (ชื่อไฟล์ บรรทัด วันที่ เวลาที่คอมไพล์) — มีประโยชน์มากเวลาทำ log/บั๊ก เพราะเรารู้ได้ว่าโค้ดที่กำลังรันถูกคอมไพล์มาจากไฟล์ไหนเมื่อไร

#### กับดักที่ 1: macro = แทนข้อความ ไม่ใช่ "เรียกฟังก์ชัน"

เพราะ preprocessor ไม่เข้าใจคณิตศาสตร์เลย มันแค่แทนข้อความตามที่เขียน (`macro_trap.c`):

```c
#define BAD_SQ(x)  x * x                    /* ไม่มีวงเล็บ */
#define GOOD_SQ(x) ((x) * (x))              /* ครอบทั้งพารามิเตอร์และนิพจน์ */
#define MAX(a, b)  ((a) > (b) ? (a) : (b))  /* ใช้พารามิเตอร์ซ้ำ */
```

รันจริง (`gcc -std=c17 -Wall -Wextra -Wpedantic -o macro_trap macro_trap.c && ./macro_trap`) ได้ผล:

```
BAD_SQ(1 + 2)  = 5    <- แทนข้อความแล้วกลายเป็น 1 + 2 * 1 + 2 = 5 (ไม่ใช่ 9)
GOOD_SQ(1 + 2) = 9    <- แทนข้อความแล้วกลายเป็น ((1+2) * (1+2)) = 9
MAX(next_value(), 0) = 2
next_value() ถูกเรียกไป 2 ครั้ง  <- ควรเป็น 1 ครั้ง ถ้ามันเป็นฟังก์ชันจริง
```

หลักฐานตรง ๆ ว่ามันเป็น "การแทนข้อความ" จริง ๆ — ดูข้อความที่ถูกแทนลงไปในไฟล์หลัง preprocess (คำสั่งเดียวกันที่เราใช้กับ `main.c` เมื่อกี้):

```bash
$ gcc -E -P macro_trap.c | grep -n '1 + 2 \* 1 + 2'
314:    printf("BAD_SQ(1 + 2)  = %d   <- แทนข้อความแล้วกลายเป็น 1 + 2 * 1 + 2 = 5 (ไม่ใช่ 9)\n", 1 + 2 * 1 + 2);
```

จะเห็นว่าไม่มีอะไรถูก "คำนวณ" เลย — มีแค่ข้อความ `1 + 2 * 1 + 2` ถูกวางลงไปตรงที่เราเขียน `BAD_SQ(1 + 2)` แล้วคอมไพเลอร์ค่อยคิดเลขนี้ (ตามลำดับความสำคัญ) ในขั้นถัดไป

สองบทเรียนจากสามบรรทัดนี้:

1. **`BAD_SQ(1 + 2)` ได้ 5 ไม่ใช่ 9** — เพราะผลลัพธ์คือ `1 + 2 * 1 + 2` และเครื่องหมาย `*` มีลำดับความสำคัญสูงกว่า `+` (คณิตศาสตร์ชั้นประถม) ตัว preprocessor ไม่ได้คิดเลขให้ เราเลยได้ผลเพี้ยน — **กฎ: macro ทุกตัวต้องครอบวงเล็บทุกพารามิเตอร์ และครอบวงเล็บทั้งนิพจน์**
2. **`MAX(next_value(), 0)` เรียก `next_value()` สองครั้ง** — เพราะพารามิเตอร์ `a` ถูกใช้ถึงสองครั้งในตัว macro (`> (b) ? (a) : (b)`) พอพารามิเตอร์เป็น "การเรียกฟังก์ชันที่มีผลข้างเคียง" (side effect = ทำงานแล้วมีอะไรเปลี่ยนในระบบ) มันเลยถูกทำซ้ำ — กับดักนี้เป็นเหตุผลที่ทั้งอุตสาหกรรมสอนว่า "ถ้าไม่ใช่ค่าคงที่ง่าย ๆ ให้ใช้ `static inline` ฟังก์ชันแทน macro"

![preprocessor แค่ "แทนข้อความ": macro ไม่มีวงเล็บให้ผลผิด และ macro ที่ใช้พารามิเตอร์ซ้ำทำงานซ้ำ](/assets/diagrams/ep17-04-preprocessor-text-substitution.svg)

(ภาพที่ 2 — สรุปกับดักของ "การแทนข้อความ" ทั้งสามกรณีจาก `macro_trap.c` ที่เพิ่งรัน พร้อมแอบเทียบ Go (`max2`) ซึ่งจะเจอเต็ม ๆ ในหัวข้อ 6)

#### กับดักที่ 2: ค่าที่กำหนดจากบรรทัดคำสั่ง

`-D` (define) คือการสั่ง `#define` จากบรรทัดคำสั่ง โดยไม่ต้องแก้ไฟล์เลย (`conditional.c`):

```bash
$ gcc -std=c17 -Wall -Wextra -Wpedantic -o conditional_default conditional.c && ./conditional_default
LEVEL = 0
คอมไพล์เมื่อ Sep 20 2026 เวลา 23:31:14
แพลตฟอร์ม: 64 บิต (pointer = 8 ไบต์)

$ gcc -std=c17 -Wall -Wextra -Wpedantic -DLEVEL=2 -o conditional_dbg conditional.c && ./conditional_dbg
[verbose] LEVEL = 2
คอมไพล์เมื่อ Sep 20 2026 เวลา 23:31:15
แพลตฟอร์ม: 64 บิต (pointer = 8 ไบต์)
```

โค้ดเดียวกัน แต่ได้โปรแกรมสองแบบ — เพราะ `#if LEVEL >= 2` เลือกข้อความไปใส่ตอน preprocess (`[verbose]` ถูกแปะเข้ามาในเวอร์ชันที่สอง) ข้อมูลนี้ไปถึงรันได้เพราะ `__DATE__`/`__TIME__` ถูกแทนค่าตั้งแต่ตอนคอมไพล์

> **Go ไม่มี preprocessor จึงไม่มีเรื่องนี้เลย** — งานแบบนี้ทำได้ด้วย **build tag** (ป้ายกำกับที่หัวไฟล์ เช่น `//go:build linux`) แล้วให้ `go build` เลือกไฟล์ให้เอง และ "ค่าคงที่" ใน Go เป็นค่าจริง (`const`) ที่คอมไพเลอร์รู้ชนิด ไม่ใช่ข้อความที่ถูกแทนลงไปแบบตาเปล่าไม่เห็น

### 3.2 ขั้นที่ 2 — compile: ภาษา C → ภาษาแอสเซมบลี

```bash
gcc -std=c17 -S -O0 main.c -o main.s   # -S = หยุดหลังขั้น compile
```

`-S` (ตัวใหญ่) สั่งให้หยุดที่ขั้นที่สอง ได้ไฟล์ `.s` ซึ่งเป็น **ภาษาแอสเซมบลี** (ภาษาระดับต่ำที่เกือบเป็นรหัสเครื่อง แต่ยังใช้ชื่อเขียนอยู่) นี่คือส่วนหัวของ `main.s` จริง ๆ จากเครื่องเรา:

```asm
	.arch armv8-a
	.file	"main.c"
	.text
	.section	.rodata
	.align	3
.LC0:
	.string	"== %s ==\n"
	.align	3
.LC1:
	.string	"clamp(150, 0, 100) = %ld\n"
	...
	.text
	.align	2
	.global	main            <- บอกว่า main จะถูกส่งออกให้ linker เห็น
	.type	main, %function
main:
	stp	x29, x30, [sp, -48]!    <- เปิดกรอบ stack (จำตอนที่ 15 ได้ไหม)
	mov	x29, sp
	str	w0, [sp, 28]           <- เก็บ argc
	str	x1, [sp, 16]           <- เก็บ argv
	bl	mathx_version          <- "branch and link" = เรียกฟังก์ชัน (จะได้เรียนละเอียดตอน 30)
	mov	x1, x0
	adrp	x0, .LC0
	add	x0, x0, :lo12:.LC0
	bl	printf
	mov	x2, 100
	mov	x1, 0
	mov	x0, 150
	bl	mathx_clamp
	...
	mov	w0, 9
	bl	mathx_sum_odd
	...
```

(ตัดบรรทัด `.cfi_*` ที่เป็นข้อมูลสำหรับ debugger และบรรทัด `...` ที่ตัดออกเพื่อย่อความ — บรรทัดที่เหลือคือของจริงทั้งหมด)

อ่านได้ 4 อย่างทันที แม้ยังไม่เคยเขียนแอสเซมบลี ARM:

1. **ข้อความทั้งหมดถูกเก็บไว้ที่หัวไฟล์ในส่วน `.rodata`** (read-only data = ข้อมูลอ่านอย่างเดียว) แล้วตั้งชื่อสั้น ๆ ว่า `.LC0`, `.LC1` — นี่คือคำตอบว่า string literal (ข้อความคงที่ที่เขียนในเครื่องหมายคำพูด เช่น `"== %s =="`) ไปอยู่ไหน
2. **`main` กลายเป็น "ป้ายชื่อ" (label) จุดเดียว** — บรรทัด `main:` คือตำแหน่งของโค้ด บรรทัด `.global main` คือการบอกว่า "ชื่อนี้ให้ linker เห็นด้วย"
3. **การเรียก `mathx_clamp(150, 0, 100)` กลายเป็นสามบรรทัด**: ใส่ค่า 100, 0, 150 ลงรีจิสเตอร์ (`mov x2/x1/x0` — สามตัวแรก) แล้วสั่ง `bl` กระโดดไปที่ชื่อ `mathx_clamp` — ค่าที่ส่งผ่านรีจิสเตอร์คือ "calling convention" ที่เราเรียนในตอนที่ 15 ตรง ๆ
4. **ค่าที่เป็น macro กลายเป็น "ตัวเลขจริง" ไปแล้ว** — ดูฟังก์ชันถัดไป

ดู `mathx_sum_odd` (ไฟล์ `mathx.s`) — สังเกตว่าตัวเลข 1000 ที่เราเขียนเป็น `MATHX_LIMIT` macro หายไปแล้ว เหลือเป็นเลขดิบ `1000`:

```asm
mathx_sum_odd:
	sub	sp, sp, #32
	str	w0, [sp, 12]       <- เก็บพารามิเตอร์ limit
	str	xzr, [sp, 24]      <- xzr = รีจิสเตอร์ที่ค่าเป็น 0 เสมอ (ใช้ตั้ง total = 0)
	ldr	w0, [sp, 12]
	cmp	w0, 0              <- if (limit <= 0)
	bgt	.L7
	mov	x0, 0
	b	.L8                <- return 0;
.L7:
	ldr	w0, [sp, 12]
	cmp	w0, 1000           <- MATHX_LIMIT กลายเป็นเลข 1000 ตรง ๆ (macro หายไปตั้งแต่ preprocess)
	ble	.L9
	mov	w0, 1000
	str	w0, [sp, 12]
.L9:
	mov	w0, 1
	str	w0, [sp, 20]       <- i = 1
	b	.L10
.L11:
	ldrsw	x0, [sp, 20]
	ldr	x1, [sp, 24]
	add	x0, x1, x0
	str	x0, [sp, 24]       <- total += i
	ldr	w0, [sp, 20]
	add	w0, w0, 2
	str	w0, [sp, 20]       <- i += 2
.L10:
	ldr	w1, [sp, 20]
	ldr	w0, [sp, 12]
	cmp	w1, w0             <- เงื่อนไข loop: i <= limit ?
	ble	.L11
	ldr	x0, [sp, 24]       <- คืนค่า total
.L8:
	add	sp, sp, 32
	ret                        <- กลับไปที่ผู้เรียก
```

(ตัดบรรทัด `.cfi_*` ซึ่งเป็นข้อมูลสำหรับ debugger ออก เพื่อให้อ่านง่าย แต่บรรทัดที่เหลือคือของจริงทั้งหมด ไม่ได้แก้)

นี่คือ "loop" ที่เราเขียนในภาษา C — กลายเป็น `cmp` (เปรียบเทียบ) + `ble` (branch if less or equal = กระโดดถ้าน้อยกว่าหรือเท่ากับ) + การย้ายค่ากลับไปกลับมาระหว่าง stack กับรีจิสเตอร์ **นี่คือภาพที่ชัดที่สุดว่า "คอมไพเลอร์ทำงานอะไรให้เรา": มันแปลโครงสร้างที่คนอ่านออก ให้เป็นคำสั่งที่ CPU ทำตามได้**

สังเกตอีกอย่าง: ที่ `-O0` (ปิดการปรับแต่งทั้งหมด) โค้ดดู "โง่" พอควร — เก็บค่าลง stack แล้วโหลดกลับทันที ลองเปิด `-O2` เทียบดู (สร้างทั้งสองเวอร์ชันไว้เทียบกัน):

```bash
gcc -std=c17 -S -O0 main.c -o main_O0.s
gcc -std=c17 -S -O2 main.c -o main_O2.s
gcc -std=c17 -c main_O0.s -o main_O0.o
gcc -std=c17 -c main_O2.s -o main_O2.o
```

```
$ wc -l main_O0.s main_O2.s          # ไฟล์แอสเซมบลี
 127 main_O0.s
 124 main_O2.s
$ size main_O0.o main_O2.o           # ขนาดโค้ดในไฟล์ .o
   text	   data	    bss	    dec	    hex	filename
    653	      0	      0	    653	    28d	main_O0.o
    625	      0	      0	    625	    271	main_O2.o
```

โค้ดที่ปรับแต่งแล้วสั้นกว่า (653 → 625 ไบต์ของ "text" = ส่วนโค้ด) — และนี่คือที่มาของคำแนะนำ "เปิด `-O2` ตอนทำ production" (แต่ตอนเรียน/ตอน debug เราใช้ `-O0` เพราะอ่านง่ายกว่า และทำให้ตัวแปรยังอยู่ในหน่วยความจำให้ debugger ดูได้)

### 3.3 ขั้นที่ 3 — assemble: แอสเซมบลี → รหัสเครื่อง (object file)

```bash
gcc -std=c17 -c main.c -o main.o     # -c = ทำจนจบขั้น assemble แล้วหยุด
gcc -std=c17 -c mathx.c -o mathx.o
```

`-c` (compile and assemble) ทำงานสามขั้นแรกให้ (preprocess → compile → assemble) แล้วหยุด ได้ไฟล์ `.o` ออกมา มาดูว่าไฟล์แต่ละขั้นเป็น "ของจริง" ชนิดไหน:

```
$ file main.c main.i main.s main.o mathx.o
main.c:  C source, Unicode text, UTF-8 text                       <- ข้อความที่คนอ่านได้
main.i:  C source, Unicode text, UTF-8 text
main.s:  assembler source, ASCII text, with very long lines (356)  <- ข้อความที่คนอ่านได้
main.o:  ELF 64-bit LSB relocatable, ARM aarch64, version 1 (SYSV), not stripped
mathx.o: ELF 64-bit LSB relocatable, ARM aarch64, version 1 (SYSV), not stripped
```

คำสำคัญคือ **relocatable** (ย้ายที่ได้) — ไฟล์ `.o` เป็น ELF แล้ว (รหัสเครื่องจริง ตัวเลขจริง) แต่ที่อยู่ข้างในยังเป็น "ที่อยู่สมมติเริ่มจาก 0" เพราะมันยังไม่รู้ว่าเพื่อน ๆ ของมันจะไปวางอยู่ตรงไหนในโปรแกรมสุดท้าย นั่นคือหน้าที่ของ linker

แล้วเราจะดู "ข้างใน" ไฟล์ `.o` ได้ยังไง? เครื่องมือที่ต้องรู้จักคือ **`nm`** (อ่านชื่อ symbol) — นี่คือผลจริงของ `nm main.o`:

```
$ nm main.o
0000000000000000 T main
                 U fprintf
                 U mathx_clamp
                 U mathx_sum_odd
                 U mathx_version
                 U printf
                 U stderr
                 U strtol
```

(จัดลำดับ `T main` ขึ้นก่อนเพื่อให้อ่านง่าย — `nm` ของจริงเรียงตามชื่อ: `U fprintf` มาก่อน `T main`)

และของ `mathx.o`:

```
$ nm mathx.o
0000000000000000 T mathx_clamp
0000000000000074 T mathx_sum_odd
00000000000000ec T mathx_version
```

อ่านตารางนี้ให้เป็น (ภาพที่ 3):

- **`T`** (Text = โค้ด) = symbol ที่ไฟล์นี้ **นิยามไว้เอง** มีตัวโค้ดจริงอยู่ข้างใน พร้อมที่อยู่ของมัน
- **`U`** (Undefined = ไม่มีนิยาม) = symbol ที่ไฟล์นี้ **ใช้แต่ไม่ได้ให้** — มันฝากข้อความไว้กับ linker ว่า "ช่วยหาชื่อนี้ให้หน่อย"
- **`main.o` ให้เองแค่ 1 ตัว (`main`) แต่ขอ 7 ตัว** — `mathx_*` 3 ตัวมาจาก `mathx.o`, อีก 4 ตัว (`printf`, `fprintf`, `stderr`, `strtol`) มาจากไลบรารีมาตรฐาน
- **เลขหน้าชื่อ symbol** (เช่น `0000000000000074`) คือตำแหน่ง**ภายในไฟล์นั้น** เริ่มจาก 0 ไม่ใช่ที่อยู่จริงใน RAM (ของจริงจะได้ตอน link)

![ตาราง symbol ของ main.o และ mathx.o พร้อมวิธีที่ linker ต่อ symbol ที่หายไปเข้ากับนิยามจริง](/assets/diagrams/ep17-02-object-symbols-link.svg)

#### เบื้องหลัง: คำสั่งเรียกฟังก์ชันยังเป็น "ช่องว่าง" อยู่

เราเห็นใน `main.s` ว่ามีคำสั่ง `bl mathx_version` — พอเป็นไฟล์ `.o` ชื่อนั้นกลายเป็น "ช่องว่างที่ยังไม่ถูกเติม" เราเห็นได้ด้วย `readelf` (เครื่องมืออ่านโครงสร้าง ELF) ในส่วนที่เรียกว่า **relocation** (รายการ "จุดที่ต้องย้าย/เติมที่อยู่"):

```
$ readelf -r main.o
Relocation section '.rela.text' at offset 0x528 contains 30 entries:
  Offset          Info           Type           Sym. Value    Sym. Name + Addend
000000000010  000d0000011b R_AARCH64_CALL26  0000000000000000 mathx_version + 0
000000000018  000500000113 R_AARCH64_ADR_PRE 0000000000000000 .rodata + 0
00000000001c  000500000115 R_AARCH64_ADD_ABS 0000000000000000 .rodata + 0
000000000020  000e0000011b R_AARCH64_CALL26  0000000000000000 printf + 0
000000000030  000f0000011b R_AARCH64_CALL26  0000000000000000 mathx_clamp + 0
...
0000000000c0  001200000137 R_AARCH64_ADR_GOT 0000000000000000 stderr + 0
```

ที่ offset 0x10 ของส่วน `.text` มีคำสั่งกระโดดที่ยังชี้ไปที่ 0 — พร้อมจดไว้ว่า "ช่องนี้ต้องเป็น `mathx_version`" **นี่คือสิ่งที่แปลว่า "object file ยังอยู่คนเดียวไม่ได้" อย่างเป็นรูปธรรม**: มันเป็นชิ้นส่วนที่สมบูรณ์ในตัวเอง ยกเว้นเรื่องที่อยู่

#### object file ยังเก็บ "ส่วน" (section) แยกตามชนิดข้อมูลด้วย

`nm` ที่อ่านมาแล้ว ตัวอักษรตัวเล็ก/ใหญ่ยังบอกอีกว่า symbol อยู่ "ส่วน" ไหน ลองไฟล์ทดสอบเล็ก ๆ (`sections.c`):

```c
int g_uninit;                                   /* ไม่ให้ค่า */
int g_zero = 0;                                 /* ให้ค่าเป็น 0 */
int g_init = 42;                                /* ให้ค่าไม่ใช่ 0 */
static const char *const g_name = "ep17";       /* ข้อมูลอ่านอย่างเดียว */
static int helper(void) { return g_init + 1; }  /* static = เห็นแค่ในไฟล์นี้ */
```

```
$ gcc -std=c17 -Wall -Wextra -Wpedantic -O0 -c sections.c -o sections.o
$ nm sections.o
0000000000000000 D g_init          <- .data: ข้อมูลที่มีค่าเริ่มต้น (ไม่ใช่ 0)
0000000000000000 d g_name          <- d ตัวเล็ก = เห็นแค่ในไฟล์นี้ (เพราะเป็น static)
0000000000000000 B g_uninit        <- .bss: ยังไม่ให้ค่า
0000000000000004 B g_zero          <- ให้ค่าเป็น 0 ก็ยังเข้า .bss (คอมไพเลอร์ฉลาดกว่าเรา)
0000000000000000 t helper          <- t ตัวเล็ก = ฟังก์ชันที่ไม่ได้ส่งออก
0000000000000014 T main
                 U printf

$ size sections.o
   text	   data	    bss	    dec	    hex	filename
    212	     12	      8	    232	     e8	sections.o

$ readelf -S sections.o | grep -E '\.text|\.rodata|\.data|\.bss'   # (ตัวจริง readelf -S พิมพ์ section มากกว่านี้ เช่น .rela.text/.data.rel.ro — ที่นี่กรองแสดงเฉพาะ 4 section ที่เกี่ยวข้อง)
  [ 1] .text             PROGBITS   0000000000000000  00000040     <- โค้ด
  [ 3] .data             PROGBITS   0000000000000000  000000b4     <- ข้อมูลที่มีค่าเริ่มต้น
  [ 4] .bss              NOBITS     0000000000000000  000000b8     <- ข้อมูลที่ยังไม่ให้ค่า
  [ 5] .rodata           PROGBITS   0000000000000000  000000b8     <- ข้อมูลอ่านอย่างเดียว
```

(`PROGBITS` = section ที่เนื้อข้อมูลจริงถูกเก็บลงไฟล์ — ตรงข้ามกับ `NOBITS` ที่เก็บแค่ขนาด ไม่กินที่ในไฟล์)

**จุดที่ควรจำไปใช้จริง: `.bss` เป็น section ชนิด `NOBITS` = "ไม่กินที่ในไฟล์เลย"** มันเก็บแค่ "ขนาด" ไว้ ส่วนเนื้อที่จริงระบบค่อยจัดให้ (และตั้งศูนย์ให้) ตอนรัน — พิสูจน์ได้ด้วยการบังคับย้าย `g_zero` ไป `.data`:

```
$ gcc -O0 -fno-zero-initialized-in-bss -c sections.c -o sections_nbss.o
$ nm sections_nbss.o | grep -E 'g_zero|g_uninit'
0000000000000000 B g_uninit
0000000000000000 D g_zero        <- ย้ายไป .data แล้ว
$ size sections.o sections_nbss.o
   text	   data	    bss	    dec	    hex	filename
    212	     12	      8	    232	     e8	sections.o
    212	     16	      4	    232	     e8	sections_nbss.o
```

`data` โตจาก 12 → 16 ไบต์ และ `bss` ลดจาก 8 → 4 แต่ **ผลรวม (`dec`) ยังเป็น 232 เท่าเดิมเป๊ะ** — เพราะ `.bss` ไม่เคยกินที่ในไฟล์ตั้งแต่แรก นี่คือ "ทำไมตัวแปร global เยอะ ๆ ที่ไม่ให้ค่า ถึงไม่ทำให้ไฟล์โปรแกรมโต" (แต่ก็ยังกิน RAM ตอนรันนะ — ตัวละ 4 ไบต์ ตัวอย่างนี้ 2 ตัวรวม 8 ไบต์)

### 3.4 ขั้นที่ 4 — link: เอา object files + ไลบรารีมาเชื่อมกัน

```bash
gcc -o main main.o mathx.o     # ไม่ต้องคอมไพล์อะไรอีก แค่ "เชื่อม"
./main 250
```

ผลรันจริง:

```
== mathx 1.0.0 ==
clamp(150, 0, 100) = 100
sum_odd(9)         = 25
DOUBLE(1 + 2)      = 9
clamp(250, 0, 200) = 200
บรรทัดนี้อยู่ในไฟล์ main.c บรรทัดที่ 36
```

ทีนี้ `nm` ไฟล์ที่ link แล้ว — เทียบกับ `main.o` เมื่อกี้จะเห็นความต่างชัดเจน:

```
$ nm main | grep -E " (T|U) "
                 U abort@GLIBC_2.17
0000000000000a98 T _fini
                 U fprintf@GLIBC_2.17
0000000000000678 T _init
                 U __libc_start_main@GLIBC_2.34
0000000000000868 T main              <- ที่อยู่จริงแล้ว! (ไม่ใช่ 0)
00000000000009a0 T mathx_clamp       <- ย้ายมาจาก mathx.o (เดิม 0x0)
0000000000000a14 T mathx_sum_odd     <- (เดิม 0x74)
0000000000000a8c T mathx_version     <- (เดิม 0xec)
                 U printf@GLIBC_2.17
0000000000000740 T _start            <- เราไม่เคยเขียนฟังก์ชันนี้! มาจาก Scrt1.o
                 U stderr@GLIBC_2.17
                 U strtol@GLIBC_2.17
```

สามอย่างที่เพิ่งเกิดขึ้น:

1. **`U mathx_*` หายไปหมด** — กลายเป็น `T` ที่มีที่อยู่จริง (`0x9a0`, `0xa14`, `0xa8c`): นี่คือคำตอบของคำถามค้างข้อ 2 — **ดู "ตำแหน่งที่แท้จริง" ของฟังก์ชันได้ด้วย `nm` หลัง link** (หรือ `objdump -d main` เพื่อดูคำสั่งทีละบรรทัดพร้อมที่อยู่)
2. **`T _start` โผล่มา และ `main` ไม่ใช่จุดเริ่มต้น** — จุดที่ CPU กระโดดเข้าไปจริง ๆ คือ `_start` (อยู่ในไฟล์ `Scrt1.o` ที่ `gcc` แนบให้เอง) ซึ่งมีหน้าที่เตรียม stack/ตัวแปรแวดล้อม แล้วเรียก `__libc_start_main` ของ libc เพื่อเรียก `main` ของเราอีกที — สังเกตว่า `__libc_start_main` ยังเป็น `U` (ยังไม่ถูกเติม) เพราะอยู่ในไฟล์ `.so` ที่จะถูกโหลดตอนรัน
3. **`printf@GLIBC_2.17`, `__libc_start_main@GLIBC_2.34`** — เครื่องหมาย `@` ที่ท้ายชื่อคือ **symbol versioning**: บอกว่าโปรแกรมนี้ต้องการ `printf` จาก libc "รุ่น 2.17" ขึ้นไป นี่คือกลไกที่ทำให้ไบนารีเก่า ๆ ยังรันได้บน Linux ใหม่ ๆ (และเป็นเหตุผลที่ไลบรารีที่เปลี่ยน ABI — กติกาการเรียกฟังก์ชัน/วางข้อมูลระหว่างโปรแกรมกับไลบรารี ถ้าเปลี่ยนแล้วโปรแกรมเก่าอาจพัง — จะต้องขึ้นเลขรุ่น)

#### link แล้ว "ยังไม่ครบ" ได้ด้วย — เพราะ 6 symbol สุดท้ายยังเป็น U

`abort`, `fprintf`, `__libc_start_main`, `printf`, `stderr`, `strtol` ยังเป็น `U` ทั้งหมด (`fprintf`, `printf`, `stderr`, `strtol` สืบมาจาก `main.o` ส่วน `abort` กับ `__libc_start_main` มาจากไฟล์ `crt`/libc ที่ gcc แนบให้) — ใครเติม? คำตอบคือ **dynamic loader ตอนที่โปรแกรมเริ่มรัน** เราเห็นรายชื่อ "ของที่ต้องยืม" ได้ด้วย `nm -D` (D = dynamic) และ `readelf -d`:

```
$ nm -D main                        # 10 รายการ: U 6 ตัว + w (weak) 4 ตัว
                 U abort@GLIBC_2.17
                 w __cxa_finalize@GLIBC_2.17
                 U fprintf@GLIBC_2.17
                 w __gmon_start__
                 w _ITM_deregisterTMCloneTable
                 w _ITM_registerTMCloneTable
                 U __libc_start_main@GLIBC_2.34
                 U printf@GLIBC_2.17
                 U stderr@GLIBC_2.17
                 U strtol@GLIBC_2.17

$ readelf -d main | head -4
Dynamic section at offset 0xfdd0 contains 26 entries:
  Tag        Type                         Name/Value
 0x0000000000000001 (NEEDED)             Shared library: [libc.so.6]      <- "ต้องยืม libc.so.6"
```

(ตัว `w` = weak symbol = symbol ที่ "มีก็ดี ไม่มีก็ไม่เป็นไร" — โปรแกรมยังรันได้ถ้าไม่มีคนให้)

และ `ldd` (list dynamic dependencies = ไล่ดูว่าโปรแกรมต้องใช้ไลบรารีอะไรและจะโหลดจากไหน) บอกปลายทางจริงบนเครื่องนี้:

```
$ ldd main
	linux-vdso.so.1 (0x00007ffec44f8000)
	libc.so.6 => /lib/aarch64-linux-gnu/libc.so.6 (0x00007ffec42b0000)
	/lib/ld-linux-aarch64.so.1 (0x00007ffec44c0000)
```

สามบรรทัดนี้เล่าเรื่องทั้งหมดของ "ตอนรัน":

1. มี **interpreter** (ตัวโหลด) `/lib/ld-linux-aarch64.so.1` ฝังอยู่ในไฟล์ `main` ตั้งแต่ตอน link — จำได้ไหมว่าเห็น `-dynamic-linker /lib/ld-linux-aarch64.so.1` ในคำสั่ง `collect2`
2. พอเราพิมพ์ `./main` เคอร์เนลอ่านบรรทัดนี้ แล้วยกตัวโหลดขึ้นมา
3. ตัวโหลดไปดึง `libc.so.6` มา **เติมค่าให้ 6 ช่องที่ยังเป็น `U`** (อีก 4 รายการเป็น `w` weak ที่มีก็ดี ไม่มีก็รันได้)

นี่คือคำตอบครึ่งหลังของคำถามค้างข้อ 1: `printf` ไม่เคย "อยู่ในโปรแกรมของเรา" มันอยู่ในไฟล์ `libc.so.6` และถูกต่อให้ตอนรันต่างหาก

#### ถ้าไม่อยากให้ถูกต่อ "ตอนรัน" — การ link แบบ static

```bash
$ gcc -static -o main_static main.o mathx.o
$ file main_static | sed 's/, BuildID.*//'
main_static: ELF 64-bit LSB executable, ARM aarch64, version 1 (GNU/Linux), statically linked
$ ldd main_static
	not a dynamic executable
$ ls -l main main_static | awk '{print $9, $5}'
main 70776
main_static 705336
```

`-static` สั่งให้ "คัดลอกโค้ด libc ที่ใช้จริงเข้าไปในไฟล์เลย" — โปรแกรมไม่ต้องพึ่งไฟล์ `.so` อีก (`ldd` บอก `not a dynamic executable`) แลกมาด้วยขนาดที่โต **70,776 → 705,336 ไบต์ (ประมาณ 10 เท่า)** — นี่คือการแลกเปลี่ยนแบบคลาสสิกของโลกนี้: *ไฟล์เดียวจบ แลกกับการกินที่และอัปเดตยากกว่า* (ถ้า libc ด้านในมีช่องโหว่ เราต้อง build ใหม่ทั้งหมด ไม่ใช่แค่อัปเดตไลบรารีของระบบ)

> **แล้วทำไมไฟล์ C 70 KB เทียบกับ Go 2 MB?** เพราะ `gcc` ปล่อยให้โค้ดระบบ (runtime, ตัวจัดการหน่วยความจำ, ตัว scheduler) อยู่ในไฟล์ `.so` นอกตัวโปรแกรม ส่วน Go **พา runtime ทั้งก้อนมาอยู่ในไบน์นารีเดียว** (หัวข้อ 6)

---

## 4. ความผิดพลาดของแต่ละขั้น (อ่าน error ให้เป็น)

มีแค่ 4 ขั้นที่พังได้ (ขั้น compile พังได้ 2 แบบ) และแต่ละแบบต้องแก้คนละที่

### 4.1 error ตอน preprocess — หาไฟล์ไม่เจอ

```bash
$ gcc -std=c17 -E missing_hdr.c -o /dev/null
missing_hdr.c:7:10: fatal error: nope_missing.h: No such file or directory
    7 | #include "nope_missing.h"     /* ไม่มีไฟล์นี้จริง — preprocessor จะหยุดทันที */
      |          ^~~~~~~~~~~~~~~~
compilation terminated.
```

จุดสำคัญคือใต้บรรทัด error มี**บรรทัดที่ผิดถูกวาดให้ดู**พร้อมลูกศรชี้ตำแหน่งคอลัมน์ (นี่คือสาเหตุที่เราไม่ควรแยกเลขบรรทัดจริงออกจากข้อความ error) แก้ที่: ติดตั้งส่วนหัวของระบบ (`gcc` บน Debian มาเป็นชุด `libc6-dev`) หรือแก้ `-I` (ตัวบอกโฟลเดอร์ที่ให้ไปหา `.h`) หรือแก้ชื่อไฟล์ให้ถูก — **ไม่ใช่แก้ตรรกะของโค้ด**

### 4.2 error ตอน compile — "ประกาศก่อนใช้" (`missing_proto.c`)

```c
#include <stdio.h>    /* มีแค่ printf — ไม่ได้ include <stdlib.h> ที่ประกาศ malloc */
int main(void) {
    char *p = malloc(16);           /* ผิด: ไม่มีใครบอก compiler ว่า malloc คืออะไร */
    ...
```

```
$ gcc -std=c17 -Wall -Wextra -Wpedantic -o missing_proto missing_proto.c
missing_proto.c: In function ‘main’:
missing_proto.c:17:15: error: implicit declaration of function ‘malloc’ [-Wimplicit-function-declaration]
   17 |     char *p = malloc(16);           /* ผิด: ไม่มีใครบอก compiler ว่า malloc คืออะไร */
      |               ^~~~~~
missing_proto.c:14:1: note: include ‘<stdlib.h>’ or provide a declaration of ‘malloc’
   13 | #include <stdio.h>    /* มีแค่ printf — ไม่ได้ include <stdlib.h> ที่ประกาศ malloc */
  +++ |+#include <stdlib.h>
   14 |
missing_proto.c:17:15: warning: incompatible implicit declaration of built-in function ‘malloc’ [-Wbuiltin-declaration-mismatch]
      |               ^~~~~~
    ... (GCC ยังฟ้อง ‘free’ ทำนองเดียวกัน — ทั้งหมดนี้เป็น error/warning ของขั้น compile ล้วน ๆ) ...
missing_proto.c:23:5: error: implicit declaration of function ‘free’ [-Wimplicit-function-declaration]
   23 |     free(p);
      |     ^~~~
```

**`implicit declaration` (การประกาศแบบเดาเอง)** = เราเรียกฟังก์ชันที่คอมไพเลอร์ไม่เคยเห็นคำประกาศของมัน ในภาษา C รุ่นเก่าเรื่องนี้แค่ "เตือน" แต่ **GCC 14 เปลี่ยนเป็น error ไปแล้ว** (ตามมาตรฐาน C ที่เลิกยอมรับตั้งแต่ C99) — และโชคดีที่มันแนะนำด้วยว่าให้เติมบรรทัดไหน (สังเกตว่า GCC ถึงกับวาด `+++ |+#include <stdlib.h>` ให้ดูว่าควรไปอยู่ตรงไหน)

> **สังเกตว่าไม่มีบรรทัด `collect2: error` ท้ายข้อความ** — ต่างจาก error ขั้น link (ข้อ 4.4) ที่มี `collect2: error: ld returned 1 exit status` เป็นบรรทัดสุดท้าย: พอ error เกิดตั้งแต่ขั้น compile, `gcc` จะหยุดทันที ไม่เรียก `collect2`/linker ต่อ และไม่สร้างไฟล์ output เลย (เป็นพฤติกรรมของ GCC 14 ขึ้นไป) — นี่คือเคล็ดแยก error ของ compile กับ link ได้ทันที และเป็นเหตุผลที่เราต้อง **"อ่านบรรทัดแรก ไม่ใช่บรรทัดสุดท้าย"** เวลาดู error ของ build

### 4.3 ตัวอย่าง error ไวยากรณ์ (ขั้น compile เหมือนกัน)

```bash
$ gcc -std=c17 -Wall -Wextra -Wpedantic -o syntax_bad syntax_bad.c
syntax_bad.c: In function ‘main’:
syntax_bad.c:11:5: error: expected ‘,’ or ‘;’ before ‘return’
   11 |     return x;
      |     ^~~~~~
syntax_bad.c:10:9: warning: unused variable ‘x’ [-Wunused-variable]
   10 |     int x = 1        /* <- ลืม ; ตรงนี้ */
      |         ^
```

error ชนิดนี้บอก**บรรทัด:คอลัมน์**ตรงเป๊ะ (`11:5` = บรรทัด 11 คอลัมน์ 5) และมักมี warning ที่ "เป็นผลพวง" ตามมา (`unused variable` เพราะบรรทัดที่ใช้ค่ามันพังไปแล้ว) — จำไว้ว่าให้แก้จาก **error ตัวแรก** เสมอ เพราะ error ตัวถัด ๆ ไปมักหายเองเมื่อตัวแรกถูกแก้

### 4.4 error ตอน link — ลืมส่งไฟล์ (`undefined reference`)

```bash
$ gcc -o main_broken main.o        # ลืม mathx.o !
/usr/bin/ld: main.o: in function `main':
main.c:(.text+0x10): undefined reference to `mathx_version'
/usr/bin/ld: main.c:(.text+0x30): undefined reference to `mathx_clamp'
/usr/bin/ld: main.c:(.text+0x48): undefined reference to `mathx_sum_odd'
/usr/bin/ld: main.c:(.text+0xfc): undefined reference to `mathx_clamp'
collect2: error: ld returned 1 exit status
```

อ่านให้ครบทุกส่วนเพราะมันบอกทางแก้ทั้งหมด: **ชื่อไฟล์ที่ยังมีช่องว่าง** (`main.o`) → **คำสั่งที่ offset เท่าไร** (`text+0x10` = ตรงกับบรรทัดใน relocation table ที่เราเห็นเมื่อกี้เป๊ะ) → **ชื่อ symbol ที่หาไม่เจอ** (`mathx_version`) ลายเซ็นของ error ชนิดนี้คือ **ชื่อไฟล์ `.c` ของเราโผล่มาในข้อความ แต่ปัญหาจริงอยู่ที่รายการไฟล์ในคำสั่ง build**

### 4.5 error ตอน link — นิยามซ้ำ (`multiple definition`)

ครั้งนี้คอมไพล์ผ่าน**ทั้งสองไฟล์** (คนละ translation unit ไม่เห็นกัน) แล้วมาพังที่ linker เพราะเป็นคนแรกที่เห็นทั้งคู่พร้อมกัน:

```
$ gcc -std=c17 -Wall -Wextra -Wpedantic -c dup_main.c -o dup_main.o && gcc ... -c dup_a.c -o dup_a.o   # ผ่านหมด
$ gcc -o dup dup_main.o dup_a.o
/usr/bin/ld: dup_a.o: in function `shared_counter':
dup_a.c:(.text+0x0): multiple definition of `shared_counter'; dup_main.o:dup_main.c:(.text+0x0): first defined here
collect2: error: ld returned 1 exit status
```

**นี่คือเหตุผลที่ `.h` ต้องมีแค่ "คำประกาศ" ไม่ใช่ "โค้ด"** — ถ้าเราเอาโค้ดจริงไปไว้ใน `.h` แล้วมีสองไฟล์ `.c` `#include` ไฟล์นั้น ทั้งสองไฟล์จะได้นิยามมาคนละชุด แล้ว linker จะฟ้องแบบนี้ทันที (ข้อยกเว้นคือ `static` และ `static inline` ซึ่ง "เห็นแค่ในไฟล์" จึงไม่ชนกัน — ตรงกับที่เห็นใน `sections.c` ว่า `helper` ขึ้นตัว `t` ตัวเล็ก)

> **กรณีที่แย่กว่าทั้งหมด: ประกาศไม่ตรงกับตัวจริง** — ถ้าคำประกาศใน `.h` บอกว่า `long mathx_clamp(long)` แต่ตัวโค้ดจริงรับ 3 พารามิเตอร์ ทั้งสองไฟล์จะคอมไพล์ผ่านและ **link ก็ผ่าน** (เพราะ linker ดูแค่ "ชื่อ") แล้วพังตอนรันแบบเดาไม่ได้ — นี่คือเหตุผลที่ทุกทีมบังคับให้คำประกาศอยู่ใน `.h` ไฟล์เดียว แล้วให้ทุก `.c` `#include` ไฟล์นั้น ไม่มีใครเขียนคำประกาศซ้ำเอง

---

## 5. โปรเจกต์ท้ายบท: สร้างไลบรารีของตัวเอง 3 วิธี

ทีนี้เราจะใช้สิ่งที่เรียนมาให้คุ้ม: เขียน **ไลบรารีของเราเอง** (ชื่อ `stats` — รวมค่าสถิติ: จำนวน/ผลรวม/ต่ำสุด/สูงสุด/เฉลี่ย) แล้ว build โปรแกรมที่ใช้ไลบรารีนั้นด้วย **3 วิธีที่ต่างกัน** เพื่อพิสูจน์ให้เห็นว่า "สิ่งที่ linker ทำ" คืออะไรจริง ๆ (โค้ดเต็มอยู่ที่ `course/code/ep17/lib_demo/`)

โครงสร้างมี 3 ไฟล์ — `stats.h` (สัญญา) · `stats.c` (โค้ดจริงของไลบรารี — **ไม่มี `main`**) · `app.c` (โปรแกรมที่ใช้ไลบรารี มี `main`)

```bash
$ make -C lib_demo clean all
gcc -std=c17 -Wall -Wextra -Wpedantic -O2 -I. -c app.c -o app.o
gcc -std=c17 -Wall -Wextra -Wpedantic -O2 -I. -c stats.c -o stats.o
gcc -o app_objects app.o stats.o
ar rcs libstats.a stats.o
gcc -o app_static app.o -L. -l:libstats.a
gcc -std=c17 -Wall -Wextra -Wpedantic -O2 -I. -fPIC -shared -o libstats.so stats.c
gcc -o app_shared app.o -L. -lstats
```

(ตัดบรรทัด `make: Entering/Leaving directory` และคำสั่ง `rm -f` ออก — คำสั่ง compile/link ที่เหลือคือของจริงทั้งหมด)

ทั้งสามวิธีให้โปรแกรมที่ **ทำงานเหมือนกันเป๊ะ** (พิสูจน์ได้ด้วยผลรัน):

```
$ ./app_objects 5 -9 30
== stats 1.0.0 ==
ชุดตัวอย่าง n=6   sum=106    min=3     max=41    mean=17.66
จาก argv     n=3   sum=26     min=-9    max=30    mean=8.66
ทำซ้ำอีกรอบ n=6   sum=106    min=3     max=41    mean=17.66
```

(`app_static` และ `app_shared` ให้ผลเหมือนกันทุกตัวอักษร — `app_shared` ต้องรันด้วย `LD_LIBRARY_PATH=. ./app_shared` เพราะมันพึ่งไฟล์ `.so` ซึ่งเราจะเห็นกับดักเต็ม ๆ ในข้อ 5.4)

> **เกร็ดจากผลรัน:** ค่าเฉลี่ยที่ได้คือ **17.66 ไม่ใช่ 17.67** เพราะ `stats_mean_x100` คำนวณ `(sum * 100) / count` ด้วยจำนวนเต็มล้วน — 10600/6 = **1766** แล้วปัดเศษทิ้ง (truncate) ก่อนหารด้วย 100 นี่คือ "กับดักเลขจำนวนเต็ม" ที่จะเจอบ่อยในงานจริง: ถ้าต้องการปัดครึ่งให้ใช้ทศนิยมหรือบวกครึ่งตัวหารเอง และจะเห็นว่า Go เวอร์ชันเดียวกันให้ 17.66 เท่ากันเพราะผมเขียนแบบเดียวกัน

### 5.1 วิธีที่ 1 — โยน `.o` ให้ linker ตรง ๆ

```bash
gcc -o app_objects app.o stats.o
```

```
$ nm app.o | grep -E "U stats|T main"
0000000000000000 T main
                 U stats_add
                 U stats_mean_x100
                 U stats_reset
                 U stats_version
```

`app.o` ไม่รู้จัก `stats` เลย ยกเว้น 4 ชื่อที่มันขอไว้ — พอเราใส่ `stats.o` เข้าไปในคำสั่งเดียวกัน linker ก็เติมให้ครบ **นี่คือลิงก์แบบ "เห็นกันจะ ๆ"** ข้อเสียคือเราต้องจำให้ครบว่าต้องส่ง `.o` ไหนบ้าง (นึกภาพโปรเจกต์ 500 ไฟล์)

ผลลัพธ์มีขนาด 70,992 ไบต์ (เก็บไว้เทียบกับวิธีถัดไป):
```
$ ls -l app_objects | awk '{print $5}'
70992
```

### 5.2 วิธีที่ 2 — ห่อเป็น static library (`libstats.a`)

```bash
ar rcs libstats.a stats.o          # ar = โปรแกรมรวบรวม (.a = archive)
gcc -o app_static app.o -L. -l:libstats.a
```

- `ar rcs` = **a**rchive **r**eplace **c**reate **s**ymbol-index: ห่อไฟล์ `.o` หลาย ๆ ตัวเป็น "กล่อง" ไฟล์เดียว พร้อมสารบัญชื่อ symbol
- `-L.` = ให้ linker ค้นหาไลบรารีในโฟลเดอร์ปัจจุบัน (`.`) ด้วย
- `-l:libstats.a` = "ใช้ไฟล์ชื่อ `libstats.a` ตรง ๆ" (ถ้าเขียน `-lstats` เฉย ๆ linker จะเลือก `.so` ก่อนถ้ามี — เราเลยต้องบังคับชื่อเต็มเพื่อการสอน)

ผลลัพธ์: **ขนาดโปรแกรมเท่ากับวิธีก่อนเป๊ะ (70,992 ไบต์)** และ `ldd app_static` **ไม่มี `libstats`** เลย เพราะโค้ดของ `stats` ถูก "ตัดปะ" เข้าไปในไฟล์แล้ว (linker หยิบมาแค่ `.o` ที่ใช้จริง ไม่ได้ยกทั้งกล่อง)

### 5.3 วิธีที่ 3 — ทำเป็น shared library (`libstats.so`)

```bash
gcc -std=c17 -Wall -Wextra -Wpedantic -O2 -I. -fPIC -shared -o libstats.so stats.c
gcc -o app_shared app.o -L. -lstats
```

- **`-shared`** = สร้างไลบรารีที่ "ใช้ร่วมกันได้" (shared library = `.so` = shared object)
- **`-fPIC`** (Position Independent Code = โค้ดที่อยู่ที่ไหนก็ทำงานได้) = จำเป็นสำหรับ `.so` เพราะไลบรารีเดียวกันถูกโหลดเข้าหน่วยความจำหนึ่งครั้งแล้วให้**หลายโปรแกรม**ใช้ร่วมกัน มันจึงต้องไม่ยึดที่อยู่ตายตัว

```
$ nm -D --defined-only libstats.so     # symbol ที่ไลบรารีนี้ "ส่งออก" ให้คนอื่นใช้
0000000000000610 T stats_add
0000000000000680 T stats_mean_x100
0000000000000600 T stats_reset
00000000000006b0 T stats_version

$ nm libstats.a                        # เทียบกัน: ไฟล์ .a เป็น "กล่อง" ที่มี .o ข้างใน
stats.o:
0000000000000010 T stats_add
0000000000000080 T stats_mean_x100
0000000000000000 T stats_reset
00000000000000b0 T stats_version
```

นี่คือความต่างเชิงโครงสร้างของสองแบบ: `.a` คือ **กล่องใส่ไฟล์ `.o`** (linker เปิดกล่องหยิบชิ้นที่ต้องใช้ตอน build) ส่วน `.so` คือ **ไฟล์ ELF ที่สมบูรณ์ในตัวเอง** มีตาราง "ของที่ส่งออก" ให้ตัวโหลดเปิดดูตอนรัน

### 5.4 กับดักของ `.so`: link ผ่าน ≠ รันได้

```
$ ldd app_shared
	linux-vdso.so.1 (0x00007fff33048000)
	libstats.so => not found                      <- !!
	libc.so.6 => /lib/aarch64-linux-gnu/libc.so.6 (0x00007fff32e00000)
	/lib/ld-linux-aarch64.so.1 (0x00007fff33010000)

$ ./app_shared
./app_shared: error while loading shared libraries: libstats.so: cannot open shared object file: No such file or directory
[exit code: 127]
```

**นี่คือ error แบบที่คนใหม่สับสนที่สุด**: build ผ่านหมด ไม่มี warning แต่โปรแกรม "ไม่เริ่มเลย" (exit code 127) เพราะตัวโหลดหาไฟล์ `.so` ไม่เจอ — มันเป็นความผิดของ **ตอนรัน** ไม่ใช่ตอน link และแก้ด้วยวิธีที่ถูกต้องคือ **ฝัง rpath** (ที่อยู่สำหรับค้นหาไลบรารี) ลงในตัวไฟล์:

```bash
$ gcc -o app_rpath app.o -L. -lstats -Wl,-rpath,'$ORIGIN'
$ ./app_rpath 5 -9 30 | head -3
== stats 1.0.0 ==
ชุดตัวอย่าง n=6   sum=106    min=3     max=41    mean=17.66
จาก argv     n=3   sum=26     min=-9    max=30    mean=8.66

$ readelf -d app_rpath | grep -E 'RUNPATH|NEEDED'
 0x0000000000000001 (NEEDED)             Shared library: [libstats.so]
 0x0000000000000001 (NEEDED)             Shared library: [libc.so.6]
 0x000000000000001d (RUNPATH)            Library runpath: [$ORIGIN]
```

- **`-Wl,-rpath,...`** = ส่งธงต่อไปให้ linker (`-Wl` = "ส่งต่อให้ linker") เพื่อจดรายการโฟลเดอร์ที่ให้ไปหาไลบรารี**ตอนรัน**
- **`$ORIGIN`** = "โฟลเดอร์ที่มีไฟล์โปรแกรมอยู่" — ไม่ใช่ path ตายตัว ทำให้ย้ายโฟลเดอร์ทั้งก้อนไปเครื่องอื่นแล้วยังรันได้
- ในงานจริงวิธีอื่นที่ใช้คือ **`ldconfig`** (เครื่องมือระบบที่ลงทะเบียนไลบรารีที่ติดตั้งลง `/usr/lib` ไว้ในแคชกลางให้ตัวโหลดหาเจอ) และ **`LD_LIBRARY_PATH`** (ที่เราใช้รันครั้งแรก) — แต่วิธีหลังเป็น "ตัวแปรแวดล้อม" ที่คนรันต้องตั้งเอง จึงไม่เหมาะกับโปรแกรมที่ต้องแจกจ่าย

![เปรียบเทียบการเชื่อมไลบรารีสามแบบ: object file ตรง ๆ static library และ shared library พร้อมกับดักของ .so](/assets/diagrams/ep17-03-static-vs-shared.svg)

(ภาพที่ 4 — สรุปสามวิธีที่เราเพิ่งทำ พร้อมกับดักของ `.so`)

---

## 6. เทียบกับ Go: ภาษาเดียวกันที่ "ไม่มี" สองในสี่ขั้น

กลับมาที่คำถามเดิมของทั้งคอร์ส — Go ซ่อนอะไรไว้? เรื่อง build นี้เป็นคำตอบอีกชั้นหนึ่ง

เขียนโปรแกรมที่ทำงานเทียบเคียงกับ `lib_demo/app.c` ใน Go (`go_stages/main.go`) — สังเกตว่า **ไม่มี `#include` ไม่มี `#define` ไม่มี `.h`** เลย:

```go
package main

import (
	"fmt"
	"os"
	"strconv"
)

const version = "stats 1.0.0" // const = ค่าจริง ไม่ใช่ "ข้อความที่ถูกแทน" — compiler รู้ชนิด

// max2 เป็น "ฟังก์ชัน" จริง — ไม่ใช่ macro: พารามิเตอร์ถูกประเมินครั้งเดียวต่อการเรียก
func max2(a, b int) int {
	if a > b {
		return a
	}
	return b
}
```

(โค้ดด้านบนตัดบางส่วนให้สั้น — `type stats` และฟังก์ชัน `next()` ที่ผลรันกับ symbol ข้างล่างอ้างถึง อยู่ในไฟล์เต็ม `go_stages/main.go`)

ผลรันจริง:

```
$ go build -o goapp . && ./goapp 5 -9 30
== stats 1.0.0 ==
max2(next(), 0) = 1
next() ถูกเรียกไป 1 ครั้ง (C แบบ macro = 2 ครั้ง)
ชุดตัวอย่าง n=6 sum=106 min=3 max=41 mean=17.66
จาก argv n=3 sum=26 min=-9 max=30
```

เทียบเป็นข้อ ๆ:

| เรื่อง | C | Go |
|---|---|---|
| preprocessor | มี (`#include`, `#define`, `#if`) | **ไม่มีเลย** — ใช้ `import`, `const`, build tag |
| ไฟล์หัว | `.h` = สัญญาระหว่างไฟล์ (ต้องเขียนเอง) | ไม่มี — `import` package เดียวกันเห็นกันทั้งชุด |
| macro trap (ประเมินซ้ำ) | เกิดได้ (`MAX(next_value(), 0)` เรียก 2 ครั้ง) | ไม่เกิด (`max2(next(), 0)` เรียก **1 ครั้ง**) |
| หน่วยที่คอมไพล์ | translation unit = ไฟล์ `.c` | package (ทั้งโฟลเดอร์) |
| ไฟล์กลาง | `.i` → `.s` → `.o` (เห็นได้) | เก็บใน cache ของ Go (`$GOCACHE`) ซ่อนจากเรา |

แล้ว "คำสั่งเดียว" ของ Go (`go build`) ข้างในทำอะไร? ใช้ธง `-x` (พิมพ์ทุกคำสั่งที่รันจริง):

```bash
$ go clean -cache && go build -x -o goapp . 2>&1 | wc -l
725      # คำสั่งจริง 725 บรรทัด (นับใหม่ทั้งหมดหลังล้าง cache — ไม่ใช่แค่ 1 คำสั่ง!)
```

นับเฉพาะเครื่องมือที่มันเรียก:

```
     55 /tool/linux_arm64/compile      <- คอมไพเลอร์ของ Go (เทียบได้กับ cc1)
     46 /tool/linux_arm64/asm          <- assembler ของ Go (เทียบได้กับ as)
     13 /tool/linux_arm64/pack         <- รวมเป็นไฟล์ .a ภายใน (คล้าย ar)
      1 /tool/linux_arm64/link         <- linker ของ Go
```

และคำสั่ง link จริง (บรรทัดที่ 722 ของรันที่เก็บผลไว้ — รันใหม่หลังล้าง cache จำนวนบรรทัดรวมจะอยู่ราว 719–726 และตำแหน่งของคำสั่ง link ก็ขยับเล็กน้อยตามเครื่อง) หน้าตาเป็นแบบนี้:

```
/usr/lib/go-1.24/pkg/tool/linux_arm64/link -o $WORK/b001/exe/a.out -importcfg $WORK/b001/importcfg.link \
    -buildmode=exe -buildid=... -extld=gcc $WORK/b001/_pkg_.a
```

จุดสำคัญ: Go **ใช้ linker ของตัวเอง** (`/pkg/tool/linux_arm64/link`) ไม่ได้เรียก `ld` เหมือน `gcc` — และมันเชื่อมผลลัพธ์ของทุก package เข้ากับ runtime ของ Go เป็นไฟล์เดียว

ผลที่ตามมาจึงต่างจากโลก C อย่างชัดเจน:

```
$ file goapp          # (ตัด BuildID ออก)
goapp: ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV), statically linked
$ ldd goapp
	not a dynamic executable

$ ls -l goapp | awk '{print $5}'
2259891               # 2.26 MB — เทียบกับ C 70,776 ไบต์ (32 เท่า)
$ go tool nm goapp | wc -l
2296                  # จำนวน symbol ในไบนารีเดียว
```

Go บน Linux (ที่ไม่ใช้ cgo) **ไม่ต้องพึ่ง `.so` ใด ๆ** — ทุกอย่างรวมอยู่ในไฟล์เดียว ผลลัพธ์คือแจกจ่ายง่ายมาก (นี่คือเหตุผลที่เครื่องมือ CLI ของ Go แจกเป็นไฟล์เดียวได้) แลกมากับขนาดไฟล์ที่ใหญ่เสมอ

**จุดที่ลึกกว่านั้นคือ "คอมไพเลอร์ลบร่องรอยทิ้ง"** — ลองหา `max2` ใน symbol table ของ Go ดู:

```
$ go tool nm goapp | grep -c max2
0                                        <- ไม่มี! ทำไมล่ะ?
$ go build -gcflags=all=-l -o goapp_noinline .     # -l = ปิด inlining
$ go tool nm goapp_noinline | grep -E 'max2|\(\*stats\)'
   a26a0 T main.(*stats).add
   a26f0 T main.max2
$ go tool nm goapp_noinline | wc -l
3332                                     # เพิ่มจาก 2,296 -> 3,332 symbol
```

คำตอบคือ **inlining** (การฝังโค้ดของฟังก์ชันเข้าไปตรงจุดที่เรียก) — คอมไพเลอร์ของ Go เห็นว่า `max2` สั้น มันเลย "คัดลอกโค้ดไปวางที่จุดเรียก" แล้ว**ไม่เหลือฟังก์ชันนั้นในไบนารีเลย** พอเราปิด inlining ด้วย `-gcflags=all=-l` ชื่อ `main.max2` ก็โผล่กลับมา (พร้อม symbol อีกหนึ่งพันตัว)

> **บทเรียนที่เชื่อมกับ C:** เรื่องนี้ทำให้เข้าใจว่าทำไม `nm` ของไบนารีที่ปรับแต่งแล้ว (`-O2`) อาจ "หา symbol ไม่เจอ" ทั้งที่โค้ดยังอยู่ — ตอนที่ 30 เราจะมาเขียน codegen เอง แล้วเห็นว่าการตัดสินใจแบบนี้เกิดตรงไหนในคอมไพเลอร์

---

## 7. รันเองให้ครบขั้นตอน

ทั้งหมดรันได้บนเครื่อง Linux/aarch64 (Raspberry Pi) ด้วย GCC 14.2.0 · binutils 2.44 · Go 1.24.4 (โค้ดและสคริปต์อยู่ใน `course/code/ep17/`):

```bash
cd course/code/ep17

# 0) รันทุกอย่างพร้อมเก็บผลลง out/ (ที่มาของตัวเลขทั้งหมดในบทนี้)
bash run_all.sh

# 1) แยก 4 ขั้นด้วยมือ
gcc -std=c17 -E main.c -o main.i          # preprocess -> main.i
gcc -std=c17 -S -O0 main.c -o main.s      # compile    -> main.s
gcc -std=c17 -c main.c -o main.o          # assemble   -> main.o
gcc -std=c17 -c mathx.c -o mathx.o
gcc -o main main.o mathx.o                # link       -> main
./main 250

# 2) ดูของจริงในไฟล์ (คำสั่งที่ต้องติดตัวไปใช้ตลอดอาชีพ)
file main.i main.s main.o main            # ไฟล์ชนิดไหน
nm main.o                                 # symbol ใน object file (T = ให้, U = ขอ)
nm mathx.o
nm main                                   # หลัง link ที่อยู่จริง
nm -D main                                # ของที่ตัวโหลดต้องไปหา
readelf -r main.o                         # relocation (ที่ว่างที่ linker ต้องเติม)
readelf -d main                           # NEEDED libc.so.6
ldd main                                  # โหลดไลบรารีจากไหนตอนรัน
gcc -v -o main_verbose main.c mathx.c     # ให้ gcc เล่าทุกคำสั่งที่มันรัน

# 3) section และ macro
gcc -O0 -c sections.c -o sections.o && nm sections.o && size sections.o
gcc -DLEVEL=2 -o conditional_dbg conditional.c && ./conditional_dbg
./macro_trap

# 4) ความผิดพลาดตั้งใจให้พัง (อ่าน error ให้เป็น แล้วลองแก้เอง)
gcc -o main_broken main.o                 # undefined reference
gcc -std=c17 -Wall -Wextra -Wpedantic -c dup_main.c -o dup_main.o && gcc -c dup_a.c -o dup_a.o && gcc -o dup dup_main.o dup_a.o
gcc -std=c17 -Wall -Wextra -Wpedantic -o missing_proto missing_proto.c   # implicit declaration

# 5) ไลบรารีของเราเอง 3 วิธี
make -C lib_demo clean all
make -C lib_demo symbols
(cd lib_demo && ./app_objects 5 -9 30 && ./app_static 5 -9 30 && LD_LIBRARY_PATH=. ./app_shared 5 -9 30)
(cd lib_demo && ./app_shared)             # ตั้งใจให้พัง: cannot open shared object file
(cd lib_demo && make app_rpath && ./app_rpath 5 -9 30)   # ทางแก้ด้วย rpath

# 6) เทียบกับ Go
(cd go_stages && go build -o goapp . && ./goapp 5 -9 30)
(cd go_stages && go clean -cache && go build -x -o goapp_x . 2>&1 | wc -l)   # ~725 บรรทัดคำสั่ง (2>&1 เพราะ -x พิมพ์ลง stderr)
(cd go_stages && go tool nm goapp | wc -l)
```

ไฟล์ในบทนี้: `main.c` · `mathx.c` · `mathx.h` · `macro_trap.c` (กับดัก macro) · `conditional.c` (คอมไพล์แบบมีเงื่อนไข) · `sections.c` (section ของ `.o`) · `missing_proto.c` · `missing_hdr.c` · `syntax_bad.c` (ตัวอย่าง error ที่ตั้งใจให้พัง) · `dup_main.c` · `dup_a.c` (นิยามซ้ำ) · `gen_svgs.py` (วาดภาพประกอบ) · `run_all.sh` (รันทั้งหมด เก็บผลใน `out/` ทุกบรรทัดที่อ้างในบทนี้) · `lib_demo/` (โปรเจกต์ท้ายบท พร้อม `Makefile`) · `go_stages/main.go`

---

## 8. โจทย์ฝึก (2 ระดับ)

### ระดับ 1 — drill (ฝึกความแม่นยำ)

1. จากผลรันของบทนี้ `main.c` มี 38 บรรทัด แต่ `main.i` มี 806 บรรทัด — บรรทัดที่เพิ่มมาเกือบทั้งหมดมาจากอะไร และทำไมคอมไพเลอร์ต้องเห็นมันด้วย (ทั้งที่เราไม่ได้เขียนเอง)?
2. `gcc -o main main.o mathx.o` ให้ไฟล์ที่ `nm` เห็น `T mathx_clamp` ที่ที่อยู่ `0x9a0` — แต่ใน `mathx.o` เดิมมันอยู่ที่ `0x0` ใครเป็นคนเปลี่ยนตัวเลขนี้ และเปลี่ยนได้ยังไงโดยไม่ต้องคอมไพล์ใหม่?
3. เพราะเหตุใด `printf` ยังเป็น `U` ใน `nm main` (หลัง link แล้ว) แต่ `mathx_clamp` กลายเป็น `T` แล้ว? แล้วโปรแกรมยังรันได้เพราะอะไร?
4. ใน `sections.o` ตัวแปร `g_zero` (ให้ค่าเป็น 0) ไปอยู่ `.bss` แต่ `g_init` (ให้ค่า 42) ไปอยู่ `.data` — ทำไมคอมไพเลอร์ถึงแยกกันได้ และทำไมเรื่องนี้ทำให้ไฟล์โปรแกรมที่ตัวแปร global ไม่ให้ค่าเยอะ ๆ ไม่บวม?
5. `BAD_SQ(1 + 2)` ให้ผล 5 (ไม่ใช่ 9) และ `MAX(next_value(), 0)` เรียกฟังก์ชัน 2 ครั้ง — ทั้งสองอย่างเป็นอาการของ "preprocessor แค่แทนข้อความ" เหมือนกันหรือไม่? อธิบายกลไกต่างกันของสองเคสนี้

### ระดับ 2 — mini-project: "ไลบรารีของฉันเอง 3 หน้า" (`lib_demo/`)

เขียนโปรแกรมภาษา C ที่ประกอบด้วย **อย่างน้อย 2 translation unit** (ไฟล์ `.c` ที่มี `main` หนึ่งไฟล์ + ไฟล์ไลบรารีที่ไม่มี `main` อีกหนึ่งไฟล์) และ **1 header** แล้วทำให้มัน build ได้ **3 วิธี** โดยทั้งสามวิธีต้องให้ผลรันเหมือนกันเป๊ะ:

1. **โยน `.o` ตรง ๆ** — `gcc -o app_objects app.o lib.o` แล้วใช้ `nm app.o` ยืนยันว่า symbol ของไลบรารีขึ้น `U` ก่อน link และกลายเป็น `T` หลัง link
2. **ห่อเป็น `.a`** — `ar rcs libxxx.a lib.o` + `gcc -o app_static app.o -L. -l:libxxx.a` แล้วใช้ `ldd` ยืนยันว่า**ไม่มี**ชื่อไลบรารีของเรา (เพราะถูกฝังไปแล้ว)
3. **ทำเป็น `.so`** — `gcc -fPIC -shared -o libxxx.so lib.c` แล้ว link ให้สำเร็จ จากนั้น**ต้องมั่นใจว่ามันรันได้จริง** โดยใช้ `-Wl,-rpath,'$ORIGIN'` (ไม่ใช่แค่ตั้ง `LD_LIBRARY_PATH`) และใช้ `readelf -d` ยืนยันว่าเห็น `RUNPATH [$ORIGIN]`

เงื่อนไขคุณภาพ (ยึดตามแนวปฏิบัติของบทนี้):
- คอมไพล์ด้วย `-std=c17 -Wall -Wextra -Wpedantic` แล้ว**ต้องไม่มี warning เลย**
- header ต้องมี include guard (`#ifndef/#define/#endif`) และมี**แค่คำประกาศ** ไม่มีโค้ดที่รันได้
- ไลบรารีต้องไม่มี `main` และฟังก์ชันที่รับตัวชี้ต้องเช็ค `NULL` คืนรหัสผลลัพธ์ได้ (ไม่พังเงียบ ๆ) และการ "รีเซ็ต/เตรียมข้อมูล" ต้องเรียกซ้ำด้วยค่าเดิมได้ผลเดิม (idempotent)
- **ท้าทายเพิ่ม:** พิสูจน์ให้ได้ว่า **แก้ไฟล์ไลบรารีแล้วไฟล์โปรแกรมไม่ต้องคอมไพล์ใหม่**:
  - โหมด `.so` — แก้ข้อความในไลบรารี แล้วสร้างใหม่ **โดยไม่แตะ `app.o`** (`make stats.o libstats.so` เฉย ๆ) แล้วรันโปรแกรมเดิม ต้องเห็นผลจากไลบรารีเวอร์ชันใหม่ทันที (บทนี้ทำแล้ว: แก้ `stats.h` จาก `stats 1.0.0` → `stats 1.1.0` แล้วสร้าง `libstats.so` ใหม่ตัวเดียว โปรแกรมที่ไม่ได้คอมไพล์ใหม่พิมพ์ `== stats 1.1.0 ==` ทันที และ `cmp app.o` ยืนยันว่า `app.o` ไม่ถูกแตะเลย)
  - โหมด `.a` — ทำตรงข้าม: ต้อง link ใหม่ถึงจะได้ของใหม่

---

## สรุป

วันนี้เราตอบคำถามค้างจากตอนที่ 16 ครบทั้งสองข้อ — เก็บหัวข้อที่ต้องจำให้ครบ:

- **`gcc -o` = เรียก 4 เครื่องมือต่อกัน**: `cpp` (preprocess) → `cc1` (compile) → `as` (assemble) → `collect2`/`ld` (link) — ดูทั้งหมดได้ด้วย `gcc -v` และเก็บไฟล์กลางไว้ดูได้ด้วย `-save-temps`
- **ไฟล์ของแต่ละขั้น**: `.c` → (38 บรรทัด) → `.i` (**806 บรรทัด** — `#include` 37 include event) → `.s` (แอสเซมบลี 127 บรรทัด) → `.o` (ELF **relocatable**) → `main` (executable 70,776 ไบต์)
- **preprocess = แทนข้อความล้วน ๆ** — `#include` คือการคัดลอกทั้งไฟล์, `#define` คือการแทนข้อความ (กับดัก: ไม่ครอบวงเล็บ → `BAD_SQ(1+2) = 5`; ใช้พารามิเตอร์ซ้ำ → เรียกฟังก์ชัน 2 ครั้ง), `-D` คือ define จากบรรทัดคำสั่ง, `__FILE__`/`__LINE__` ถูกแทนตั้งแต่ตอนคอมไพล์, และ `.h` ต้องมี include guard เสมอ
- **object file = ตาราง symbol + ที่อยู่ที่ยังว่าง** — `nm` บอก `T` (ให้) กับ `U` (ขอ) และตัวอักษรยังบอก section (`t` = static, `D` = data, `B` = bss, `d` = ข้อมูล static) · `readelf -r` บอก "ช่องว่าง" ที่ linker ต้องเติม · **`.bss` ไม่กินที่ในไฟล์เลย** (พิสูจน์: ย้ายข้อมูลไป `.data` แล้วผลรวมขนาดคงเดิม)
- **linker คือคนประกอบร่าง** — เติมที่อยู่จริงให้ symbol (`mathx_clamp` 0x0 → 0x9a0), ดึง `_start` จาก `Scrt1.o` มาเป็นจุดเริ่มต้นจริง, ใส่ `NEEDED libc.so.6` + interpreter `/lib/ld-linux-aarch64.so.1` และปล่อย 6 symbol (`U`) + 4 weak ไว้ให้ **dynamic loader เติมตอนรัน** (นี่คือคำตอบว่า `printf` อยู่ไหน — อยู่ใน `libc.so.6` ไม่เคยอยู่ในโปรแกรมเรา) · อยากฝังหมดก็ `-static` แต่ไฟล์โต 10 เท่า
- **error เกิดคนละขั้น แก้คนละที่** — `implicit declaration` = compile (ลืมประกาศ) · `undefined reference` = link (ลืมส่งไฟล์) · `multiple definition` = link (นิยามซ้ำ → เหตุผลที่ `.h` ต้องมีแค่คำประกาศ) · `cannot open shared object file` = ตอนรัน (แก้ด้วย `-Wl,-rpath,'$ORIGIN'`)
- **Go ตัดสองขั้นแรกทิ้ง** — ไม่มี preprocessor (ไม่ต้องมี `#include`/`#define`/macro trap ใช้ `import`/`const`/build tag แทน) แต่ยังมี compile → asm → pack → link อยู่ข้างใน (`go build -x` เผย 725 บรรทัดคำสั่ง: compile 55, asm 46, pack 13, link 1) และผลลัพธ์คือไบนารี **statically linked 2.26 MB** ที่ไม่ต้องพึ่ง `.so` ใด ๆ — พร้อมบทเรียนว่า inlining ทำให้ symbol หายไปจากไบนารีได้ (ปิดด้วย `-gcflags=all=-l` แล้ว `max2` กลับมา)

สองคำถามที่เราทิ้งไว้ค้างและจะเฉลยในตอนถัดไป:

(1) ตอนที่เราพิมพ์ `./main` เคอร์เนล "สร้างโปรแกรมที่กำลังรัน" ขึ้นมาอย่างไร — อะไรคือโปรเซส (process) กับเธรด (thread) ต่างกันตรงไหน ตอนที่ CPU สลับงานระหว่าง 200 โปรแกรมพร้อมกันมันเก็บ "ความจำ" ของแต่ละโปรแกรมไว้ที่ไหน (context switch) และตัวจัดคิว (scheduler) เลือกงานถัดไปด้วยกติกาอะไร

(2) ไฟล์ ELF บอกแค่ "จะเริ่มที่ไหน" แต่ตัวโหลดต้องคุยกับ**เคอร์เนล**เพื่อขอหน่วยความจำ/เปิดไฟล์/เขียนจอ — การข้ามเส้นแบ่ง user space ↔ kernel space (syscall) ทำงานยังไงกันแน่ และทำไมมันถึงเป็น "คอขวด" ที่ทุกคนต้องระวัง

พบกันตอนหน้า

---

## ภาคผนวกท้ายบท (ข้ามได้)

- **ตัวเลขทั้งหมดเป็นของเครื่องนี้โดยเฉพาะ** — ขนาดไฟล์ (2,576/22,795/2,401/3,000/70,776 ไบต์), จำนวน `.LC` และ offset (0x10, 0x74, 0x9a0) มาจาก GCC 14.2.0 + binutils 2.44 บน aarch64 กับค่า `-O0` · ต่างเครื่อง/ต่างสถาปัตยกรรม (x86-64, macOS/Clang) ตัวเลขจะไม่เท่ากัน **ชื่อขั้นและหลักการเหมือนเดิมทุกที่**
- **ค่าที่เปลี่ยนทุกครั้งที่รัน/คอมไพล์** — ข้อความ `คอมไพล์เมื่อ ... เวลา 23:31:14` (จาก `__TIME__`) เปลี่ยนทุกครั้งที่คอมไพล์ใหม่ · ที่อยู่ไลบรารีที่ `ldd` รายงาน (เช่น `0x00007ffec44f8000`) เปลี่ยนทุกรันเพราะ ASLR (การสุ่มตำแหน่งหน่วยความจำเพื่อกันโจมตี) — ตัวเลขเหล่านี้เป็นของรอบที่เก็บผลไว้เท่านั้น ไม่ใช่ค่าคงที่
- **จำนวน include event (37) ไม่ใช่ "จำนวนไฟล์ที่ต่างกัน"** — ถ้าไฟล์เดียวถูก `#include` ซ้ำสองครั้งจะนับสองครั้ง · ตัวเลขนี้ขึ้นกับเวอร์ชัน glibc (ที่นี่ 2.41-12+rpt1+deb13u4) ถ้าเครื่องอื่นอาจได้ 30–50
- **`_start` ไม่ได้อยู่ในโปรแกรมที่เราเขียน** — มันมาจากไฟล์ `Scrt1.o` (S = static-PIE, PIE = Position Independent Executable = โปรแกรมที่อยู่ตำแหน่งไหนก็รันได้) ที่ `gcc` แนบให้พร้อม `crti.o`/`crtbeginS.o`/`crtendS.o`/`crtn.o` · ชื่อ `Scrt1`/`crt1` ต่างกันตามโหมด PIE/non-PIE ซึ่งเป็นค่าเริ่มต้นของ distro · บน macOS/Windows กลไกนี้ต่างกันสิ้นเชิง (แต่หลักการ "มีโค้ดเริ่มต้นที่เราไม่ได้เขียน" เหมือนกัน)
- **`nm` บนไบนารีที่ `strip` แล้วจะไม่เห็นชื่อ symbol** — บทนี้ใช้ build แบบไม่ strip · ถ้าต้องอ่านโปรแกรมที่ strip แล้วให้ใช้ `objdump -d` หรือ `readelf` ซึ่งยังดู section/relocation ได้ (ลองเองได้: `cp main main_stripped && strip main_stripped` ทำให้ไฟล์ **70,776 → 67,616 ไบต์** และ `nm` จะตอบว่า `no symbols` — แต่โปรแกรมยังรันได้ปกติ)
- **`ar` เก็บไฟล์ `.o` หลายตัวได้** — บทนี้มี `.o` เดียวจึงดูไม่ชัด แต่บนโปรเจกต์จริง `libfoo.a` อาจมีหลายร้อย `.o` ข้างใน (ลอง `ar t libstats.a` เพื่อดูรายชื่อ)
- **เวอร์ชันที่ใช้ในบทความนี้** — GCC 14.2.0 (Debian 14.2.0-19) · binutils 2.44 (`ld`, `nm`, `ar`, `readelf`, `objdump`) · glibc 2.41-12+rpt1+deb13u4 · Linux 6.18.39+rpt-rpi-2712 aarch64 (Raspberry Pi 5, 4 cores) · Go 1.24.4 linux/arm64 · วันที่เขียน 20 กันยายน 2026 · สเปคภาษา C ปัจจุบันคือ **C23 (ISO/IEC 9899:2024)** และ GCC 15 ขึ้นไปเปลี่ยนค่า default ของ C เป็น `-std=gnu23` แล้ว — แต่บทนี้ใช้ `-std=c17` เพื่อให้พฤติกรรมตรงกันทุกเครื่องและตัวอย่างยังรันได้เหมือนเดิม ถ้าเครื่องคุณใช้ GCC รุ่นใหม่กว่า ข้อความ warning/error อาจต่างเล็กน้อยแต่ความหมายเหมือนกัน (`implicit declaration` เป็น error ตั้งแต่ GCC 14 เป็นต้นมา — เครื่องที่ใช้ GCC 13 หรือเก่ากว่าจะเห็นเป็นแค่ warning)

---

← ตอนก่อน: malloc/free + buffer overflow: ทำไม security = เรื่อง memory (ตอนที่ 16)  /  ตอนถัดไป → process/thread, context switch, scheduling (ตอนที่ 18)
