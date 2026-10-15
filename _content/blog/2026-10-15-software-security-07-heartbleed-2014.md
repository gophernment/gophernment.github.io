---
title: 'Heartbleed (2014): วันที่ความลับ 64 กิโลไบต์ไหลออกจากหน่วยความจำ (ตอนที่ 07)'
date: 2026-10-15
tags: [software-security, security, heartbleed, openssl, cve-2014-0160, memory-safety, go, c]
description: "ตอนที่ 07 ของคอร์ส Software Security — Heartbleed (2014): ช่องโหว่ CVE-2014-0160 ใน OpenSSL heartbeat (RFC 6520) ที่อ่านหน่วยความจำเกินขอบเขต (buffer over-read) แบบเงียบ ๆ ไม่ crash พร้อมเดโม C + Go รันจริง และบทเรียนว่าทำไม memory-safe language ถึงเปลี่ยนเกม"
---
# Heartbleed (2014): วันที่ความลับ 64 กิโลไบต์ไหลออกจากหน่วยความจำ (ตอนที่ 07)

> 📅 เขียนเมื่อ: 15 ตุลาคม 2026 (เวลาไทย, UTC+7)
> - **เครื่อง:** Raspberry Pi 5 (Linux 6.18.39+rpt-rpi-2712, aarch64)
> - **เวอร์ชันภาษา/เครื่องมือ:** gcc 14.2.0 (Debian 14.2.0-19) + AddressSanitizer (libasan ของ toolchain เดียวกัน) · Go 1.24.4 (linux/arm64) โดย `go.mod` ระบุ `go 1.24` (ใช้ toolchain ที่ติดตั้งบนเครื่องตรง ๆ ไม่ดาวน์โหลดเพิ่ม) · Python 3.13.5 · rsvg-convert 2.60.0 · standard library ล้วน ไม่มี dependency ภายนอก
> - **ที่มาของตัวเลข:** ทุกค่าตรวจจาก `out/00_env.txt` (OpenSSL 3.5.7 ใช้ตรวจเวอร์ชันประกอบเท่านั้น ไม่ได้ใช้ในเดโม)
> ⚠️ เครื่องมือและภาษาเปลี่ยนเวอร์ชันเรื่อย ๆ — ก่อนใช้จริงให้ตรวจเอกสารทางการล่าสุดเสมอ · เวอร์ชันล่าสุด ณ วันเขียน (ตรวจจากแหล่งปัจจุบันเมื่อ 2026-10-15): **Go 1.27.2 และ Go 1.26.9 ออก 8 ตุลาคม 2026** — รุ่นนี้มี security fix 15 รายการ (ส่วนใหญ่ใน `net/http`) — <https://go.dev/doc/devel/release> · **OpenSSL 3.6.0 ออก 1 ตุลาคม 2025** และสาย 3.6 ยังออกรุ่นย่อยต่อเนื่อง — <https://openssl.org/news/openssl-3.6-notes/> · เลขเวอร์ชันบนเครื่องเราจึงเป็นเลขที่เก่ากว่าล่าสุดได้เป็นปกติ
> 🛡️ **จริยธรรม (อ่านก่อนรันโค้ด):** บทนี้จำลอง **ช่องโหว่ Heartbleed (CVE-2014-0160)** เพื่อสอนว่าการอ่านหน่วยความจำเกินขอบเขตเกิดขึ้นได้อย่างไร และทำไมภาษาที่ตรวจขอบเขตให้ถึงเปลี่ยนเกม · **เดโมทั้งหมดรันในโปรเซสของตัวเอง ไม่เปิด socket ไม่เชื่อมต่อเครือข่ายเลย** (`network_connections=0` ในผลรัน) · เป้าหมายคือ `struct` ที่เราสร้างเองในหน่วยความจำของโปรแกรมตัวเอง · **ห้ามใช้เทคนิคนี้กับระบบของคนอื่นโดยไม่ได้รับอนุญาต — เป็นความผิดทางกฎหมายในแทบทุกประเทศ** และในทางเทคนิคก็ไม่มีประโยชน์ด้วย: เซิร์ฟเวอร์ทุกวันนี้ไม่ใช้ OpenSSL 1.0.1 แล้ว · โค้ดที่มีบั๊กทุกชิ้นเขียนกำกับว่า **เพื่อการศึกษาเท่านั้น ห้ามใช้จริง**

---

ใน[ตอนที่ 06](/blog/post.html?slug=2026-10-14-software-security-06-crypto-history) เราจบลงที่ **TLS 1.3** — ระบบที่ทำให้คนสองคนคุยกันบนสายที่ศัตรูอ่านได้ทั้งหมด แล้วยังรักษาความลับไว้ได้ · และเราปิดท้ายด้วยคำถามที่ค้างคา: *ถ้า library ที่คนทั้งโลกร่วมกันตรวจ ยังพลาดได้ แล้วเราควรพึ่งอะไร?*

บทนี้คือคำตอบของคำถามนั้น — และมันเริ่มจากปี 2012 ที่ไม่มีใครรู้ตัว

เรามี library ที่โค้ด C ราว **388,000 บรรทัด** มีคนทำงานเต็มเวลาอยู่ **คนเดียว** มีเงินบริจาคราว **2,000 ดอลลาร์ต่อปี** และถูกฝังอยู่ในเซิร์ฟเวอร์ HTTPS ราว **17% ของทั้งโลก** · แล้วในวันที่ **7 เมษายน 2014** โลกก็รู้ว่าใน library นั้นมีโค้ดที่ **อ่านหน่วยความจำเกินขอบเขต** อยู่มาสองปีกว่า และมัน **ไม่ทำให้โปรแกรมพัง** — มันแค่ตอบกลับไปพร้อมความลับที่อ่านได้

ชื่อของมันคือ **Heartbleed**

---

## 1. แนวคิด: heartbeat extension กับ "ความยาวที่ประกาศ"

### 1.1 ก่อนอื่น — heartbeat มีไว้ทำอะไร

เมื่อ TLS เปิด connection ไว้แล้ว ทั้งสองฝั่งอาจเงียบกันเป็นนาที ๆ ในบางระบบ (เช่น VPN, การเชื่อมต่อที่ต้องเลื่อนไปผ่าน NAT) เราอยากรู้ว่า "ปลายทางยังอยู่ไหม" โดย **ไม่ต้องรื้อ handshake ใหม่** (การ renegotiate แพงและยุ่งยาก)

ทางออกที่ IETF มาตรฐานไว้ใน **RFC 6520** (RFC = เอกสารมาตรฐานอินเทอร์เน็ตของ IETF · ฉบับนี้ตีพิมพ์ กุมภาพันธ์ 2012) ชื่อ **Heartbeat Extension** มีไอเดียง่ายมาก:

> ฝั่งหนึ่งส่ง **HeartbeatRequest** ที่มี payload อะไรก็ได้ (มักเป็นไบต์สุ่ม) + ความยาวของมัน → อีกฝั่ง **echo payload นั้นกลับมา** ใน **HeartbeatResponse** · ถ้าได้กลับมาแปลว่ายังอยู่

RFC 6520 ยังบอกเหตุผลที่สอง: สำหรับ **DTLS** (TLS บน UDP) payload ที่ใส่ padding เต็ม ๆ ใช้เป็น probe (ตัววัด) เพื่อหา **PMTU** (ขนาดแพ็กเก็ตใหญ่สุดที่ผ่านเส้นทางได้จริง) ได้ด้วย

นี่คือฟีเจอร์เล็ก ๆ ที่ดูไม่มีพิษภัย — และมันคือที่มาของช่องโหว่ที่ทำให้ทั้งอุตสาหกรรมต้องเปลี่ยนวิธีคิดเรื่องหน่วยความจำ

### 1.2 หน้าตาของข้อความ heartbeat

ในหัวข้อ **4. Heartbeat Request and Response Messages** ของ RFC 6520 เขียนโครงสร้างไว้แบบนี้ (นี่คือ "สัญญา" ที่ทั้งสองฝั่งตกลงกัน):

```text
struct {
    HeartbeatMessageType type;                    /* 1 ไบต์: request=1, response=2 */
    uint16               payload_length;          /* 2 ไบต์: ความยาวของ payload — big-endian */
    opaque               payload[payload_length]; /* ยาวตามที่ประกาศ */
    opaque               padding[padding_length]; /* ไบต์สุ่ม ผู้รับ "ต้องไม่สนใจ" */
} HeartbeatMessage;
```

และ RFC กำหนดความสัมพันธ์ที่สำคัญที่สุดของเรื่องนี้ไว้ตรง ๆ:

> ความยาวของข้อความทั้งหมด = `TLSPlaintext.length` · และเพราะ `type` ยาว 1 ไบต์ `payload_length` ยาว 2 ไบต์ → **`padding_length = TLSPlaintext.length − payload_length − 3`**

อ่านบรรทัดนั้นช้า ๆ อีกครั้ง เพราะมันบอกเป็นนัยว่า **ผู้รับต้องตรวจว่าค่าที่ประกาศมาสอดคล้องกับความยาวจริงของ record ที่ตนอ่านได้** — ไม่ใช่เชื่อค่าที่ประกาศมาเฉย ๆ

ในเดโมของเรา เราใช้ Go สร้างเฟรมจริงตามสัญญานี้ (แล้วเอาไปใช้ทั้งในเดโมและใน fuzzer — โปรแกรมที่ยิงอินพุตสุ่มให้โค้ดเราไม่หยุดจนกว่าจะพัง):

```go
// BuildRequest = สร้าง HeartbeatMessage จริงตาม RFC 6520 §4 (ใช้ในเดโมและเทสต์)
// declared = ค่าที่จะเขียนลงฟิลด์ payload_length · paddingBytes = padding จริงที่ใส่ลง record
func BuildRequest(payload []byte, declared int, paddingBytes int) []byte {
	rec := make([]byte, 0, HeaderLen+len(payload)+paddingBytes)
	rec = append(rec, TypeRequest, byte(declared>>8), byte(declared))
	rec = append(rec, payload...)
	rec = append(rec, make([]byte, paddingBytes)...)
	return rec
}
```

รันจริงแล้วได้เฟรมบนสายแบบนี้ (จาก `out/03_go_demo.txt`) — สังเกตว่าเฟรมที่ "โกหก" ก็ยังยาวแค่ 20 ไบต์เท่านั้น (สั้นกว่าเฟรมปกติด้วยซ้ำ) เพราะ `payload_length` เป็นแค่ **ช่องข้อมูล 2 ไบต์** ที่ผู้ส่งเขียนอะไรก็ได้ลงไป:

```
--- 1. heartbeat frame บนสาย (RFC 6520 §4): type(1) + length(2) + payload + padding ---
frame ปกติ   27 ไบต์ = 01000850494e4750494e4700000000000000000000000000000000
frame โกหก   20 ไบต์ = 01ffff5800000000000000000000000000000000
frame โกหก: payload_length ที่ประกาศ = 65535 ไบต์ แต่ payload จริงในเฟรม = 1 ไบต์ (+padding 16 ไบต์)
ต่อให้โกหก เฟรมบนสายก็ยัง 20 ไบต์ — เพราะช่อง payload_length เป็นของผู้ส่งทั้ง 16 บิต
bytes_amplification_requested=3276 เท่าของเฟรมจริง
```

`bytes_amplification_requested=3276 เท่าของเฟรมจริง` — นี่คือตัวเลขที่อธิบาย Heartbleed ในบรรทัดเดียว: **ขอ 20 ไบต์ แต่ประกาศ `payload_length` = 65,535 ไบต์** (65535 ÷ 20 = 3276.75 → โปรแกรมปัดลงเป็น 3276) ถ้าเซิร์ฟเวอร์เชื่อคำประกาศนั้น มันต้องประกอบ response ยาว 1 + 2 + 65,535 = **65,538 ไบต์** ทั้งที่ในเฟรมมีข้อมูลจริงเพียง 20 ไบต์ — ส่วนที่เหลืออีก 65,538 − 20 = **65,518 ไบต์** ต้องดึงมาจากหน่วยความจำของตัวมันเอง เพราะในคำขอไม่มีข้อมูลส่วนนั้นอยู่เลย

![เปรียบเทียบ heartbeat ปกติกับ Heartbleed: เฟรมบนสายและผลลัพธ์จากเดโมของเรา](/assets/diagrams/ep07-01-heartbeat-normal-vs-heartbleed.svg)

### 1.3 ความยาวสามตัวที่ต้องแยกให้ออก (หัวใจของทั้งบทนี้)

คำว่า "ความยาว" ในบทนี้จะโผล่สามแบบ และช่องโหว่ทั้งหมดในประวัติศาสตร์เกิดจากการเอาแบบหนึ่งไปใช้แทนอีกแบบหนึ่ง

| ชื่อ | มาจากไหน | ใครควบคุม | ในชีวิตจริง |
|---|---|---|---|
| **declared length** | ฟิลด์ในข้อความบนสาย (2 ไบต์) | **ผู้ส่ง** (ศัตรูได้) | เปลี่ยนได้ตามใจ ทุกคำขอ |
| **record length** | `TLSPlaintext.length` = จำนวนไบต์ที่ "อ่านได้จริง" ในครั้งนี้ | ระบบรับข้อมูล (เราควบคุม) | ค่าความจริงของคำขอนี้ |
| **buffer length** | `len(buf)` ของบัฟเฟอร์ที่โปรแกรมใช้รับข้อมูล | เรา (ตอนออกแบบ) | มัก **ใหญ่กว่า** record เพราะบัฟเฟอร์ถูกใช้ซ้ำ |

- **Heartbleed** (ฝั่ง C) = เอา **declared** ไปใช้เป็นความยาวในการคัดลอก **โดยไม่เทียบกับ record**
- และในหัวข้อ 3.5 เราจะเห็นบั๊กพันธุ์เดียวกันในภาษา memory-safe (ภาษาที่ runtime ตรวจขอบเขตให้เอง) ที่ **เทียบ declared กับ buffer** ทั้งที่ถูกต้องคือเทียบกับ **record**

กติกาที่จะใช้ซ้ำตลอดบทนี้: **ข้อมูลที่ข้าม “ขอบเขตความเชื่อถือ” (trust boundary) มาต้องผ่านการตรวจความสอดคล้องภายในก่อนถูกใช้เป็นความยาวหรือดัชนี** — ถ้า[ตอนที่ 04](/blog/post.html?slug=2026-10-12-software-security-04-sql-injection) สอนว่า *อย่าเอา input ไปต่อสตริงคำสั่ง* บทนี้สอนว่า *อย่าเอา input ไปใช้เป็นความยาว* · และ[ตอนที่ 02](/blog/post.html?slug=2026-10-10-software-security-02-morris-worm-1988) สอนว่า *อย่าเชื่อเครื่องปลายทาง* — ทั้งสามข้อคือหน้าเดียวกันของสมุดเล่มเดียวกัน

### 1.4 over-read ไม่เหมือน overflow — และนี่สำคัญมาก

ใน[ตอนที่ 03](/blog/post.html?slug=2026-10-11-software-security-03-smashing-the-stack) เราเขียน shellcode ทับ **return address** นั่นคือ **buffer overflow** = เขียนเกินขอบเขต (write) · Heartbleed เป็น **buffer over-read** = **อ่าน** เกินขอบเขต

| ประเด็น | buffer overflow (ตอนที่ 03) | buffer over-read (Heartbleed) |
|---|---|---|
| ทิศทาง | เขียนเกิน (write) | อ่านเกิน (read) |
| เป้าหมายของผู้โจมตี | เปลี่ยนเส้นทางควบคุม (execute) | **ขโมยข้อมูล** (confidentiality) |
| โปรแกรมเป็นอะไร | มัก crash / พฤติกรรมเพี้ยน | **ทำงานปกติทุกอย่าง** |
| ร่องรอย | stack smash, crash, core dump | ไม่มี log ไม่มีสัญญาณ (`program_exit_status=0`) |
| หมวด CWE | CWE-787 (Out-of-bounds Write) | **CWE-125 (Out-of-bounds Read)** · variant CWE-126 (Buffer Over-read) |
| ต้องใช้ความสามารถพิเศษไหม | ต้องเข้าใจ layout และจูนให้เป๊ะ | ส่ง 1 แพ็กเก็ต ไม่ต้อง auth ไม่ต้องจูน |

แถวที่สามกับสี่คือเหตุผลที่ Heartbleed ร้ายกว่าที่ตัวเลข CVSS บอก · ฝั่ง CIA triad (ที่เรารู้จักจาก[ตอนที่ 06](/blog/post.html?slug=2026-10-14-software-security-06-crypto-history)) Heartbleed ทำลาย **confidentiality** ล้วน ๆ — **integrity** กับ **availability** ไม่แตะเลย นั่นคือเหตุผลที่ CVSS v2 ให้แค่ **5.0 (MEDIUM)** ขณะที่ CVSS v3.1 ให้ **7.5 (HIGH)** (vector `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` — อ่านได้ว่า: เข้าถึงผ่านเครือข่าย ไม่ต้อง login ไม่ต้องให้เหยื่อคลิก และกระทบแต่ confidentiality ระดับสูงสุด)

---

## 2. ทำไมสำคัญ: 2012 → 2014 และห้าปีที่ตามมา

### 2.1 ไทม์ไลน์ที่ทุกอย่างผิดพลาด

- **31 ธันวาคม 2011** — โค้ดรองรับ TLS heartbeat ถูก commit เข้า repository ของ OpenSSL (ผู้เขียนคือ **Robin Seggelmann** ซึ่งเป็นหนึ่งในผู้เขียน RFC 6520 เอง) · ผ่านการ review ของ core developer · **ไม่มีใครสังเกตว่าขาดการเทียบความยาวหนึ่งครั้ง**
- **14 มีนาคม 2012** — **OpenSSL 1.0.1** ออก และเปิด heartbeat **ไว้ตามค่าเริ่มต้น** → โค้ดที่ขาดการเทียบนั้นเข้า production
- **7 เมษายน 2014** — เปิดเผยพร้อมกันโดยทีม **Codenomicon** (ผู้ตั้งชื่อ Heartbleed และทำโลโก้หัวใจมีเลือดออก) และ **Neel Mehta** แห่ง **Google Security** · ได้เลข **CVE-2014-0160** (CVE = Common Vulnerabilities and Exposures — ระบบตั้งชื่อช่องโหว่กลาง) · กระทบ OpenSSL **1.0.1 ถึง 1.0.1f** และ **1.0.2-beta1** · ทีมที่เตรียมแพตช์คือ **Adam Langley** และ **Bodo Moeller** · **เวอร์ชัน 1.0.1g ออกวันเดียวกัน**
- **11 เมษายน 2014** — **Cloudflare** เปิด *Heartbleed Challenge*: เซิร์ฟเวอร์ที่ตั้งใจให้เจาะ ให้ใครก็ได้ลองขโมย private key · **Fedor Indutny** ส่งราว **2.5 ล้านคำขอ** แล้วได้ private key จริง · **Ilkka Mattila (NCSC-FI)** ได้ในราว **1 แสนคำขอ** · ภายในวันรุ่งขึ้นมีผู้สำเร็จรวม 4 คน — ก่อนหน้านั้น Cloudflare เคยเขียนว่าอาจ "เป็นไปไม่ได้ในทางปฏิบัติ" ที่จะอ่าน key ออกมา
- **14 เมษายน 2014** — **Canada Revenue Agency** แจ้งว่าเลขประกันสังคม (SIN) ของประชาชนราว **900 ราย** หลุดออกไปจากระบบของตน จากการโจมตีที่ใช้ Heartbleed ในช่วงเวลาราว 6 ชั่วโมง

ทั้งหมดนั้นอยู่ในหน้าต่าง **2 ปี กับอีก 24 วัน** ที่โค้ดทำงานใน production โดยไม่มีใครรู้

![ไทม์ไลน์ของ Heartbleed ตั้งแต่ commit ปี 2011 ถึงนโยบาย memory-safe languages ในปัจจุบัน](/assets/diagrams/ep07-03-timeline-response.svg)

### 2.2 ตัวเลขตอนที่มันเปิด

ณ วันเปิดเผย Netcraft ประเมินว่า **ราว 17% ของเว็บไซต์ที่ใช้ SSL/TLS ทั้งหมด** (ราว **500,000 เซิร์ฟเวอร์**) รัน OpenSSL เวอร์ชันที่มีบั๊ก · และ Apache กับ nginx ซึ่งครองส่วนแบ่งเว็บกว่า 2 ใน 3 ต่างก็พึ่ง OpenSSL · คำว่า "เกือบทั้งอินเทอร์เน็ต" ที่สื่อใช้ในวันนั้นไม่ใช่การพูดเกิน

ความเสียหายที่ยืนยันได้จริง ได้แก่ private key ของใบรับรอง (ยืนยันจากการ Challenge ของ Cloudflare), session cookie (คุกกี้ที่ยืนยันว่าเราล็อกอินแล้ว)/OAuth token (กุญแจที่แอปใช้แทนรหัสผ่าน), ชื่อผู้ใช้–รหัสผ่านที่ถูกส่งเข้าแบบฟอร์ม login และข้อมูลของประชาชน (กรณี CRA)

### 2.3 ทำไมมัน "เงียบ"

ตรงนี้คือจุดที่ต้องเข้าใจเชิงกลไก ไม่ใช่แค่จำว่า "มันแย่"

- **มันไม่เขียนอะไรเลย** — เป็นการอ่าน (read) ที่คัดลอกข้อมูล "ที่มีอยู่แล้ว" ลงไปใน response → ไม่มีหน่วยความจำถูกเขียนทับ → ไม่มี crash ไม่มี core dump
- **ไม่มี log** — heartbeat ที่ผิดรูปไม่ได้ถูกบันทึกโดยค่าเริ่มต้น และการร้องขอที่ "ถูกต้องทางไวยากรณ์" (แต่โกหกเรื่องความยาว) ก็จัดอยู่ในกลุ่มที่ระบบถือว่าปกติ
- **ความลับที่อ่านได้คือสิ่งที่ "บังเอิญอยู่ตรงนั้น"** — Session key ของ connection อื่น รหัสผ่านที่เพิ่งถูกอ่านเพื่อตรวจ login ข้อความในอีเมลที่กำลังประมวลผล หรือชิ้นส่วน private key ที่เพิ่งถูกใช้ตอน handshake
- **ย้ำคำถามให้ชัด:** ถ้าอ่านได้ "บางส่วนของอะไรก็ได้" แล้วจะได้ private key จริงไหม? คำตอบที่ Cloudflare พิสูจน์ในวันที่ 11 เมษายน 2014 คือ **ได้** — เพราะการส่งซ้ำหลายล้านครั้งคือการ "ตักน้ำจากบ่อ" จนเจอสิ่งที่ต้องการ

### 2.4 แล้วเราจะรู้ได้ไหมว่าเคยถูกอ่านไปแล้ว?

นี่คือส่วนที่เจ็บที่สุดของเรื่อง และมันเป็นบทเรียนเชิงปฏิบัติ:

> ถ้าการโจมตีไม่ทิ้งร่องรอย **เราจะแยกไม่ออกระหว่าง "ยังไม่ถูกเจาะ" กับ "ถูกเจาะแล้วแต่ข้อมูลยังไม่รั่วออกไปที่ไหน"**

ผลคือทุกองค์กรที่ใช้เวอร์ชันที่มีบั๊กต้องทำสามอย่างพร้อมกัน (และนี่คือ checklist ที่วันนี้ยังใช้ได้เมื่อเจอเหตุการณ์ทำนองนี้):

1. **อัปเกรด** เป็นเวอร์ชันที่แก้แล้ว (1.0.1g หรือใหม่กว่า หรือ recompile ด้วย `-DOPENSSL_NO_HEARTBEATS` ไปก่อน)
2. **restart service** — เพราะ OpenSSL ถูกโหลดเข้าไปในหน่วยความจำตอน start การอัปเกรดไฟล์บนดิสก์โดยไม่ restart ไม่ได้เอาโค้ดที่พังออกจาก memory
3. **ถือว่า private key รั่วแล้ว** → ออกใบรับรองใหม่ + revoke (ยกเลิกใบรับรอง — ประกาศว่าห้ามเชื่อใบนั้นอีก) ใบเดิม + และเปลี่ยนรหัสผ่าน/session ที่อาจอยู่ใน memory ช่วงนั้น

ข้อ 3 คือสิ่งที่ทำให้เหตุการณ์นี้ลากยาวเป็นเดือน: ใบรับรองนับล้านใบต้องถูก revoke และออกใหม่

checklist ข้างบนบอกว่าเราต้องทำอะไรตอนเกิดเหตุ แต่ไม่บอกว่าทำไมบั๊กหนึ่งบรรทัดจึงผ่านสายตาทั้งโปรเจกต์ไปได้ — เราจึงต้องลงมือสร้างมันขึ้นมาเองเพื่อดูว่าเครื่องมือแต่ละชั้นมองเห็นอะไรและมองไม่เห็นอะไร

---

## 3. ลงมือทำ: สร้าง Heartbleed ในห้องแล็บ แล้วปิดมัน

เราจะทำสี่อย่างเรียงกัน เพื่อให้เห็นภาพครบ:

1. เขียน **เดโม C** ที่มีโครงเดียวกับ `tls1_process_heartbeat()` ของ OpenSSL 1.0.1f — ให้เห็นว่าความลับรั่วได้จริง และ **คอมไพเลอร์ไม่เตือน**
2. เปิด **AddressSanitizer (ASan)** — เครื่องมือที่แทรกการตรวจทุกครั้งที่โปรแกรมแตะหน่วยความจำ — แล้วดูว่าเครื่องมือ dynamic analysis เห็นสิ่งที่คอมไพเลอร์ไม่เห็น
3. เขียนตัวประมวลผล heartbeat ใน **Go** — ดูว่า runtime ปฏิเสธการอ่านเกินขอบเขตให้เอง และดู **กับดักที่ยังเหลืออยู่**
4. เขียน **fuzz test** ที่ทำให้เครื่องหาที่เราลืม

ทุกอย่างอยู่ใน `security/code/ep07/` และรันซ้ำได้ผลเดิมทุกครั้งด้วย `bash run_all.sh`

### 3.1 เดโม C: บั๊ก 2 บรรทัดที่ไม่มีใครเห็น

เริ่มจาก "หน่วยความจำของเซิร์ฟเวอร์" ที่เราจำลองขึ้นมา — หัวใจคือบัฟเฟอร์คำขอกับความลับ **อยู่ติดกัน** ในหน่วยความจำก้อนเดียวกัน

```c
/* struct เดียว = ลำดับฟิลด์ตายตัวตามมาตรฐาน C → secret อยู่ถัดจาก req ในก้อนเดียวกัน (offset 68) */
struct conn {
    unsigned char req[REQ_BUF];         /* ไบต์ที่เพิ่งอ่านเข้ามาจากเครือข่าย */
    int           req_len;              /* ความยาว record ที่อ่านได้จริง */
    char          secret[SECRET_LEN];   /* ← สิ่งที่ผู้โจมตีต้องการ */
};

/* 2 ไบต์แรกหลัง type คือ "ความยาวที่ผู้ส่งประกาศ" — big-endian ตาม RFC 6520 §4 */
static unsigned int declared_len(const struct conn *c)
{
    return ((unsigned int)c->req[1] << 8) | (unsigned int)c->req[2];
}
```

และนี่คือตัวฟังก์ชันที่มีบั๊ก — เทียบกับ `tls1_process_heartbeat()` ของจริงได้ตรง ๆ:

```c
/* ---------- เวอร์ชันมีบั๊ก: แบบ OpenSSL 1.0.1f (ไม่เช็ค declared กับ record จริง) ---------- */
static int hb_echo_vulnerable(const struct conn *c, unsigned char *out, size_t out_cap)
{
    unsigned int declared = declared_len(c);

    if (1u + 2u + declared > out_cap) {
        return -1;  /* เช็คแค่ปลายทางของตัวเอง ไม่ได้ตอบคำถามว่า "record จริงยาวเท่าไร" */
    }
    memcpy(out, c->req + 3, declared);  /* ← บั๊ก: declared มาจากคนที่ส่งคำขอ */
    return (int)(1 + 2 + declared);  /* ส่งคืนตามที่ผู้ส่งประกาศ — ไม่ได้แปลว่าเขาส่งมาจริง */
}
```

เทียบกับของจริงใน OpenSSL 1.0.1f (ตัดมาเฉพาะส่วนที่เกี่ยวข้อง) — รูปร่างเหมือนกันเป๊ะ:

```text
hbtype = *p++;
n2s(p, payload);        /* อ่าน 2 ไบต์ที่ผู้ส่งประกาศ */
pl = p;
...
buffer = OPENSSL_malloc(1 + 2 + payload + padding);
bp = buffer;
*bp++ = TLS1_HB_RESPONSE;
s2n(payload, bp);       /* เขียนความยาวเดิมกลับ */
memcpy(bp, pl, payload); /* ← คัดลอกตามที่ผู้ส่งประกาศ โดยไม่เทียบกับความยาว record */
```

และแพตช์ของ 1.0.1g (commit `96db902`) คือ **การเพิ่มการเทียบสองครั้ง** — ไม่มีอะไรซับซ้อนไปกว่านั้น (นี่คือโค้ดจริงจาก OpenSSL ในเวลานั้น ยกมาเฉพาะส่วนที่เกี่ยวข้อง — ไม่ใช่โค้ดในเดโมของเรา):

```text
/* บรรทัดที่ 1 ของแพตช์: record ต้องยาวพอที่จะมี header 3 ไบต์ + padding ขั้นต่ำ 16 ไบต์ */
if (1 + 2 + 16 > s->s3->rrec.length)
    return 0; /* silently discard */
hbtype = *p++;
n2s(p, payload);
/* บรรทัดที่ 2 ของแพตช์: record ต้องยาวพอสำหรับ payload ที่ประกาศมาจริง ๆ */
if (1 + 2 + payload + 16 > s->s3->rrec.length)
    return 0; /* silently discard per RFC 6520 sec. 4 */
pl = p;
```

เวอร์ชันที่แก้แล้วในเดโมของเราเขียนการเทียบทั้งสองครั้งไว้แบบเดียวกัน:

```c
/* ---------- เวอร์ชันที่แก้แล้ว: แบบ OpenSSL 1.0.1g (แพตช์ commit 96db902) ---------- */
static int hb_echo_fixed(const struct conn *c, unsigned char *out, size_t out_cap)
{
    unsigned int declared = declared_len(c);

    /* บรรทัดที่ 1 ของแพตช์: record ต้องยาวพอที่จะมี header 3 ไบต์ + padding ขั้นต่ำ 16 ไบต์ */
    if (1u + 2u + 16u > (unsigned int)c->req_len) {
        return -1;  /* silently discard */
    }
    /* บรรทัดที่ 2 ของแพตช์: record ต้องยาวพอสำหรับ payload ที่ประกาศมาจริง ๆ */
    if (1u + 2u + declared + 16u > (unsigned int)c->req_len) {
        return -1;  /* silently discard per RFC 6520 sec. 4 */
    }
    if (1u + 2u + declared > out_cap) {
        return -1;
    }
    memcpy(out, c->req + 3, declared);
    return (int)(1 + 2 + declared);  /* ผ่านการเทียบมาแล้ว — ความยาวนี้เชื่อถือได้ */
}
```

**ก่อนจะรัน ขอให้สังเกตก่อนว่าคอมไพเลอร์พูดอะไร** — เราคอมไพล์ด้วย `-Wall -Wextra` (เปิด warning มาตรฐานครบ) แล้วได้ผลแบบนี้:

```
--- gcc -O1 -Wall -Wextra -o c_demo/heartbleed_mini c_demo/heartbleed_mini.c ---
vulnerable_build_warnings=0
vulnerable_build_errors=0
(คอมไพเลอร์เงียบสนิท แม้โค้ดจะอ่านหน่วยความจำเกินขอบเขตทุกครั้งที่เจอคำขอโกหก)
```

**`vulnerable_build_warnings=0`** — นี่คือประโยคที่ต้องจำ: ในภาษา C คอมไพเลอร์ไม่รู้ว่า `declared` มาจากเครือข่าย · มันเห็นแค่ "ตัวแปรหนึ่งตัวถูกส่งเป็นความยาว" ซึ่งเป็นเรื่องปกติที่ถูกต้องได้ทุกกรณี · ความถูกต้องของการเข้าถึงหน่วยความจำทุกครั้งเป็น **หน้าที่ของคนเขียนบรรทัดนั้น**

(ในหัวข้อ 3.2 เราจะพิสูจน์ให้เห็นว่าคอมไพเลอร์ *เตือนได้* เมื่อความยาวเป็นค่าคงที่ — และนั่นคือความต่างที่อธิบายทุกอย่าง)

ทีนี้รันจริง:

```
--- ./c_demo/heartbleed_mini ---
=== เดโม Heartbleed: โครงเดียวกับ OpenSSL 1.0.1f ===
req_buf_bytes=64  secret_bytes=40  struct_bytes=108  max_declared=65535

--- 1. คำขอปกติ: declared = 8, record จริง = 27 ไบต์ ---
declared_len=8  record_len=27  payload_in_record=8  secret_offset=68
bounds_check_before_memcpy=0  ← ไม่มีการเทียบ declared กับ record_len เลย
response_len=11  payload_len=8
secret_leaked=0  program_exit_status=0  warning_printed=0

--- 2. คำขอโกหก: declared = 112, record จริง = 20 ไบต์ ---
declared_len=112  record_len=20  payload_in_record=1  secret_offset=68
bounds_check_before_memcpy=0  ← ไม่มีการเทียบ declared กับ record_len เลย
response_len=115  payload_len=112
bytes_past_record=111  (declared 112 - payload จริง 1)
found_marker=TLS-PRIVATE-KEY-DEMO-ONLY-STRICTLY-0001
secret_leaked=1  program_exit_status=0  warning_printed=0

--- 3. โค้ดที่แก้แล้ว (OpenSSL 1.0.1g): เทียบ declared กับ record ก่อน memcpy ---
( คำขอใบเดียวกันเป๊ะ กับข้อ 2 )
declared_len=112  record_len=20  payload_in_record=1  secret_offset=68
bounds_check_before_memcpy=1  (1+2+declared+16 > record_len หรือไม่)
fixed_result=refused  bytes_sent_back=0  secret_leaked=0
```

อ่านสามกรณีนี้ให้ช้า ๆ:

- **กรณี 1 (คำขอปกติ)** — เซิร์ฟเวอร์ echo กลับ 11 ไบต์ = header 3 + payload 8 ตามที่ตกลงกัน (`secret_leaked=0`)
- **กรณี 2 (คำขอโกหก)** — คำขอใบเดิมที่ยาวแค่ 20 ไบต์ แต่ **ประกาศ 112 ไบต์** · เซิร์ฟเวอร์เชื่อ แล้วคัดลอก 112 ไบต์จาก offset 3 ของบัฟเฟอร์ → **`response_len=115`, `bytes_past_record=111`, `secret_leaked=1`** และในไบต์ที่ไหลออกไปนั้นมี marker ของความลับอยู่จริง
- **กรณี 3 (คำขอเดียวกัน กับโค้ดที่แก้แล้ว)** — `fixed_result=refused  bytes_sent_back=0` คือ **ไม่มีอะไรออกไปเลย**

และบรรทัดที่ต้องอ่านซ้ำที่สุดคือ **`program_exit_status=0`** — โปรแกรมที่รั่วความลับทั้งก้อนออกไป ไม่ได้จบด้วย crash ไม่ได้พิมพ์คำเตือนสักบรรทัด · เดโมของเราจบด้วย **exit status 0** = "ทุกอย่างเรียบร้อย" (และนี่คือเหตุผลเดียวกับที่ ASan ต้องมีอยู่: มันคือผู้ที่ "พูด" แทนโปรแกรมที่ไม่มีอะไรจะพูด)

![ผังหน่วยความจำของ struct ในเดโม: บัฟเฟอร์คำขอ ความยาว record และความลับที่อยู่ติดกัน](/assets/diagrams/ep07-02-memory-layout.svg)

### 3.2 เครื่องมือไหนเห็น เครื่องมือไหนไม่เห็น

มาไล่ทีละเครื่องมือ กับโค้ดชุดเดียวกัน

**(ก) คอมไพเลอร์ — เห็นแค่เมื่อค่ามันคงที่**

ความยาวที่ "มาจากเครือข่าย" มองไม่เห็น แต่นี่คือความยาวเดิมเป๊ะ ๆ ที่ฝังเป็น **ค่าคงที่**: คอมไพเลอร์คำนวณขนาด struct ได้ (108 ไบต์) จึงเตือนตรงบรรทัดนั้นทันที (ไฟล์ `c_demo/const_len_probe.c`)

```
--- gcc -O1 -Wall -Wextra -c c_demo/const_len_probe.c (ความยาวคงที่ vs ความยาวจากเครือข่าย) ---
c_demo/const_len_probe.c: In function ‘main’:
c_demo/const_len_probe.c:37:5: warning: ‘memcpy’ forming offset [108, 114] is out of the bounds [0, 108] [-Warray-bounds=]
   37 |     memcpy(out, c->req + 3, 112);                 /* ← (ก) ค่าคงที่: gcc เตือนบรรทัดนี้ */
      |     ^~~~~~~~~~~~~~~~~~~~~~~~~~~~
constant_length_probe_warnings=1
```

ในไฟล์เดียวกันมีทั้งสองแบบ — แบบที่ความยาวมาจากพารามิเตอร์ (จำลองค่าจากเครือข่าย) **ไม่มี warning** · และนี่คือ **สองด้านของความจริงเดียวกัน**: เครื่องมือ static ไม่ใช่คู่ปรับของบั๊กชนิดนี้ ถ้าค่ามันไม่คงที่

**(ข) AddressSanitizer — เห็นทุกครั้ง (ถ้าคุณรัน)**

ASan เป็นเครื่องมือ dynamic analysis: มันใส่การตรวจรอบการเข้าถึงหน่วยความจำทุกครั้งที่รัน เราคอมไพล์โค้ดชิ้นเดิมด้วย `-g -fsanitize=address` แล้วยิงคำขอแบบที่ใช้ค่าจริงของ Heartbleed (`--exploit 65535`):

```
--- gcc -O1 -g -fsanitize=address -o c_demo/heartbleed_mini_asan ; ./c_demo/heartbleed_mini_asan --exploit 65535 ---
ERROR: AddressSanitizer: heap-buffer-overflow on address <addr> at pc <addr> bp <addr> sp <addr>
READ of size 65535 at <addr> thread T0
    #1 <addr> in hb_echo_vulnerable c_demo/heartbleed_mini.c:51
<addr> is located 0 bytes after 108-byte region [<addr>,<addr>)
SUMMARY: AddressSanitizer: heap-buffer-overflow ../../../../src/libsanitizer/sanitizer_common/sanitizer_common_interceptors_memintrinsics.inc:115 in memcpy
```

อ่านสามบรรทัดกลางให้ดี:

- **`READ of size 65535`** — ตรงกับฟิลด์ 16 บิตที่ผู้โจมตีเขียนลงไปเป๊ะ ๆ
- **`in hb_echo_vulnerable c_demo/heartbleed_mini.c:51`** — ชี้ไปที่บรรทัดที่มีบั๊กเลย (ไม่ต้องเดา)
- **`located 0 bytes after 108-byte region`** — บอกด้วยว่าเราอ่านเกินจากก้อน 108 ไบต์ (= `sizeof(struct conn)`) พอดี

(ในผลรันจริง ที่อยู่หน่วยความจำถูกแทนด้วย `<addr>` และ PID ถูกตัดออก เพราะค่าเหล่านั้นเปลี่ยนทุกครั้งที่รัน — เราจึงไม่ยกค่าที่ไม่คงที่มาอ้าง)

นี่คือคำตอบเชิงปฏิบัติว่า "แล้วจะป้องกันอย่างไรถ้าคอมไพเลอร์ไม่เตือน": **ย้ายการตรวจจับไปที่เวลารัน และรันให้บ่อย** — และนั่นพาเราไปสู่เรื่องที่ Heartbleed ทำให้เกิดการเปลี่ยนกระบวนทัศน์ครั้งใหญ่

### 3.3 เขียนมันใหม่ใน Go: ตัวตรวจที่ใช้ record ไม่ใช่ declared

ตอนนี้เรามาเขียน "ชั้นโปรโตคอล" เดียวกันใน Go (แพ็กเกจ `heartbeat` ใน `code/ep07/heartbeat/`) · ตัวอ่านที่ถูกต้องมีแค่การเทียบเดียวที่สำคัญ:

```go
// ParseRequest = ตัวอ่าน heartbeat request ที่ "ถูกต้อง"
// เทียบเท่ากับสิ่งที่แพตช์ OpenSSL 1.0.1g (commit 96db902) เพิ่มเข้ามา
func ParseRequest(record []byte) (Request, error) {
	// ← บรรทัดที่ 1 ของแพตช์: 1 + 2 + 16 > record_len → ทิ้ง (record สั้นเกินกว่าจะถูกต้องได้)
	if len(record) < HeaderLen+MinPadding {
		return Request{}, fmt.Errorf("%w: record=%d ไบต์ (ต้องมีอย่างน้อย %d)",
			ErrShortRecord, len(record), HeaderLen+MinPadding)
	}
	if record[0] != TypeRequest {
		return Request{}, fmt.Errorf("%w: type=%d", ErrNotRequest, record[0])
	}
	declared := DeclaredLen(record)
	// ← บรรทัดที่ 2 ของแพตช์: 1 + 2 + declared + 16 > record_len → ทิ้ง
	// นี่คือบรรทัดที่หายไปใน OpenSSL 1.0.1f — ถ้าไม่มี บรรทัดถัดไปจะอ่านเกิน record
	if HeaderLen+declared+MinPadding > len(record) {
		return Request{}, fmt.Errorf("%w: declared=%d record=%d ไบต์", ErrLengthLie, declared, len(record))
	}
	return Request{
		Payload: record[HeaderLen : HeaderLen+declared],
		Padding: len(record) - HeaderLen - declared,
	}, nil
}
```

รันเทียบคำขอทั้งสองใบ:

```
--- 2. ParseRequest (เวอร์ชันถูกต้อง = แพตช์ OpenSSL 1.0.1g) ---
คำขอปกติ: record=27 ไบต์ → payload=8 ไบต์ padding=16 ไบต์ err=<nil>
คำขอโกหก: record=20 ไบต์ declared=65535 → err=heartbeat: ความยาวที่ประกาศมากกว่าข้อมูลจริงใน record: declared=65535 record=20 ไบต์
บรรทัดเดียวที่ต่างกันระหว่าง 1.0.1f กับ 1.0.1g อยู่ตรงนี้ — ไม่มีอะไรซับซ้อนไปกว่านี้
```

`err=heartbeat: ความยาวที่ประกาศมากกว่าข้อมูลจริงใน record: declared=65535 record=20 ไบต์` — ความต่างระหว่างช่องโหว่ระดับโลกกับโค้ดที่ปลอดภัย คือ error หนึ่งบรรทัด

### 3.4 และถ้าเรา "ลืม" ใน Go ล่ะ? — runtime รับเอง

คำถามสำคัญสำหรับคนที่ย้ายจาก C มา Go: **ถ้าเราเผลอเขียนเหมือน OpenSSL 1.0.1f ตรง ๆ ใน Go จะเกิดอะไรขึ้น?**

```go
// EchoUncheckedRaw = ลอกโครง tls1_process_heartbeat() ของ OpenSSL 1.0.1f ตรง ๆ:
// slice ตาม declared โดยไม่เทียบกับอะไรเลย → ใน Go จะ panic (runtime ตรวจให้)
// ⚠️ การศึกษาเท่านั้น
func EchoUncheckedRaw(buf []byte) []byte {
	declared := DeclaredLen(buf)
	return buf[HeaderLen : HeaderLen+declared] // ← declared เกินความจุของ buf เมื่อไร บรรทัดนี้ panic ทันที
}
```

รันกับเฟรมโกหกเดิม:

```
--- 3. โค้ดแบบไม่เช็คเลย (EchoUncheckedRaw) ใน Go → runtime ปฏิเสธเอง ---
buf_bytes=64  declared=65535  → panic_message=runtime error: slice bounds out of range [:65538] with capacity 64
เทียบกับ C: โค้ดเดียวกันใน C จะอ่านต่อเงียบ ๆ ไม่มี panic ไม่มี log ไม่มีสัญญาณใด ๆ
(ดูฝั่ง C ได้จาก c_demo/heartbleed_mini.c: secret_leaked=1 แต่ program_exit_status=0)
```

**`runtime error: slice bounds out of range [:65538] with capacity 64`** — เลข `65538` คือ `3 + 65535` (header 3 ไบต์ + declared) และ `64` คือความจุจริงของบัฟเฟอร์ · Go ตรวจทุกการเข้าถึง slice ตอนรัน **ไม่มีใครต้องจำไปใส่การเทียบเอง** — นี่คือความหมายของ **memory-safe language**: ภาษาทำให้เราเขียนโค้ดที่อ่านเกินขอบเขตของ *ออบเจกต์ในหน่วยความจำ* แบบนั้นไม่ได้ตั้งแต่ต้น

สังเกตให้ดีว่ามันไม่ใช่ "ป้องกันได้บางส่วน" แต่เป็น **ข้อจำกัดของภาษา**: โค้ดบรรทัดนี้ *ไม่มีทาง* รันผ่านได้เลยใน Go เว้นแต่เราจะข้ามไปใช้ `unsafe` (หัวข้อ 3.6)

แต่อย่าเพิ่งดีใจ — ยังมีกับดักที่ภาษาไม่ช่วย

### 3.5 กับดักที่ยังเหลือ: "เทียบผิดตัวแปร" (และนี่คือกับดักที่ในงานจริงเจอบ่อยสุด)

สมมติเราตั้งใจดี เขียนการเทียบแล้ว — แต่เทียบ **declared กับความยาวบัฟเฟอร์** แทนที่จะเทียบกับ **ความยาว record**:

```go
// EchoAgainstBufferLen = กับดักที่ยังเหลืออยู่ในภาษา memory-safe:
// เช็ค declared กับ "ความยาวบัฟเฟอร์" (len(buf)) แทนที่จะเช็คกับ "ความยาว record"
// ทั้งสองค่านี้เท่ากันเฉพาะตอนที่บัฟเฟอร์ถูกอ่านมา "พอดีคำขอ" — ซึ่งไม่จริงในงานจริง
// (บัฟเฟอร์ของ socket ถูกใช้ซ้ำ และมีข้อมูลของคำขอก่อนหน้าค้างอยู่)
// ⚠️ การศึกษาเท่านั้น
func EchoAgainstBufferLen(buf []byte, recordLen int) ([]byte, error) {
	declared := DeclaredLen(buf)
	if declared < 0 || HeaderLen+declared > len(buf) {
		return nil, fmt.Errorf("heartbeat: declared=%d เกินความยาวบัฟเฟอร์ %d", declared, len(buf))
	}
	// บั๊กอยู่ตรงนี้: recordLen ไม่ถูกใช้เลย → อ่านเลยจุดสิ้นสุดของ record
	return buf[HeaderLen : HeaderLen+declared], nil
}
```

รันดู:

```
--- 4. กับดักที่ภาษา memory-safe ยังกันให้ไม่ได้: เช็คความยาวบัฟเฟอร์ แทนความยาว record ---
buf_bytes=64  record_bytes=20  declared=43  err=<nil>?=true
response_bytes=43  เกิน record ไป 23 ไบต์
found_marker=SESSION-COOKIE=user=tester
stale_memory_leaked=1
บทเรียน: ในภาษา memory-safe กฎยังต้องเขียนเอง — เทียบ declared กับ record ไม่ใช่กับบัฟเฟอร์
EchoChecked (เวอร์ชันที่ถูกต้อง) บนบัฟเฟอร์เดียวกัน → err= heartbeat: ความยาวที่ประกาศมากกว่าข้อมูลจริงใน record: declared=43 record=20 ไบต์  response_is_nil= true
```

**`stale_memory_leaked=1`** — ไม่มี panic ไม่มี error · โปรแกรมทำงาน "ถูกต้องตามที่เขียน" · แต่ข้อมูลของ **คำขอก่อนหน้า** ที่ยังค้างในบัฟเฟอร์ (ในเดโมคือ cookie สมมติ) ไหลออกไปกับ response 43 ไบต์

นี่คือบทเรียนที่ CISA และ NSA อยากให้ทุกคนเข้าใจ และเป็นบทเรียนที่คนมักสับสน: **memory safety ไม่ได้แปลว่า "โปรโตคอลถูกต้อง"** · ภาษาช่วยเรื่อง "ห้ามอ่านพ้นออบเจกต์" แต่ **"ความยาวที่ควรใช้" คือความหมายเชิงธุรกิจ/โปรโตคอล ซึ่งภาษามองไม่เห็น** · ต้องเขียนการเทียบกับ **record** ให้ถูกตัว

และเมื่อเทียบกับ `EchoChecked` บนบัฟเฟอร์เดียวกัน — `err=heartbeat: ความยาวที่ประกาศมากกว่าข้อมูลจริงใน record: declared=43 record=20 ไบต์` — ความต่างคือ **ตัวแปรที่เราเลือกมาเทียบ**

ตัวที่ถูกต้องคือแบบนี้ — ใช้ `recordLen` ที่ "อ่านได้จริง" ไม่ใช่ `len(buf)`:

```go
// EchoChecked = ตัวประมวลผลที่ถูกต้อง: ใช้ "ความยาว record ที่อ่านได้จริง" (recordLen)
// ไม่ใช่ "ความยาวบัฟเฟอร์" (len(buf)) — สองค่านี้ต่างกันทุกครั้งที่มีข้อมูลค้างในบัฟเฟอร์
func EchoChecked(buf []byte, recordLen int) ([]byte, error) {
	if recordLen < 0 || recordLen > len(buf) {
		return nil, fmt.Errorf("heartbeat: recordLen=%d อยู่นอกบัฟเฟอร์ (len=%d)", recordLen, len(buf))
	}
	req, err := ParseRequest(buf[:recordLen])
	if err != nil {
		return nil, err
	}
	resp := make([]byte, HeaderLen+len(req.Payload))
	resp[0] = TypeResponse
	resp[1] = byte(len(req.Payload) >> 8)
	resp[2] = byte(len(req.Payload))
	copy(resp[HeaderLen:], req.Payload)
	return resp, nil
}
```

จุดที่ต้องเห็นคือบรรทัดแรก: มันบังคับให้ **`recordLen` ต้องไม่เกิน `len(buf)`** (ข้อมูลที่ "อ้างว่าเป็น record" ต้องอยู่ในบัฟเฟอร์จริง) แล้วจากนั้น **ตัดบัฟเฟอร์ให้เหลือแค่ `buf[:recordLen]` ก่อนส่งต่อให้ parser** — ทำแบบนี้แล้วความต่างระหว่าง record กับบัฟเฟอร์จะหายไปในทางเทคนิค: หลังจากบรรทัดนี้ ทุกอย่างที่ parser เห็นจะ "มีอยู่จริง" ทั้งหมด

### 3.6 เมื่ออยากได้ความสามารถของ C: `unsafe` ปิดการตรวจทั้งหมด

แล้วถ้าเราจำเป็นต้องอ่านเกินขอบเขตจริง ๆ (เช่นทำงานกับ C library, memory-mapped I/O)? Go มีคำตอบชื่อ `unsafe` — และชื่อของมันคือคำเตือนในตัว:

```go
	// (ใน main ของเดโม) — ตัวอย่างนี้อยู่ใน section5UnsafeBypassesChecks() ของ main.go
	big := make([]byte, 128)
	copy(big[64:], "COOKIE-IN-SAME-ALLOCATION-DEMO")
	// [:4:64] จำกัด cap ไว้ 64 เพื่อโชว์ขอบเขตที่ runtime ยอมให้ slice ถึง — เกินกว่านี้ panic
	rec := big[:4:64] // len=4, cap=64 → runtime อนุญาตให้ slice ได้ถึง index 64 เท่านั้น
	rec[1], rec[2] = 0, 100

	// capturePanic = ตัวช่วยดัก panic แล้วคืนข้อความ (ไม่ทำให้โปรแกรมจบ) — จึงเห็นข้อความของ runtime ได้
	msg := capturePanic(func() { _ = rec[3 : 3+100] })
	fmt.Printf("rec_len=%d cap=%d  ขอ 103 ไบต์ด้วยการ slice ปกติ → %s\n", len(rec), cap(rec), msg)

	unsafeView := unsafe.Slice((*byte)(unsafe.Pointer(&rec[0])), 103)
	fmt.Printf("ด้วย unsafe.Slice ขอ 103 ไบต์ได้ → unsafe_read_bytes=%d\n", len(unsafeView))
	fmt.Printf("unsafe_read_past_cap=%d  (runtime ปฏิเสธจำนวนนี้ไปแล้ว)\n", 103-cap(rec))
	fmt.Printf("found_marker=%s\n", "COOKIE-IN-SAME-ALLOCATION-DEMO")
	fmt.Printf("unsafe_leaked=%d\n", boolToInt(bytes.Contains(unsafeView, []byte("COOKIE-IN-SAME-ALLOCATION"))))
	fmt.Println("unsafe ไม่ได้ทำให้เร็วขึ้น แต่ทำให้ไม่มีใครตรวจให้ — ใช้เมื่อเลี่ยงไม่ได้จริง ๆ เท่านั้น")
```

ผลรัน:

```
--- 5. unsafe ปิดการตรวจของ runtime: memory safety มีขอบเขตของมัน ---
rec_len=4 cap=64  ขอ 103 ไบต์ด้วยการ slice ปกติ → runtime error: slice bounds out of range [:103] with capacity 64
ด้วย unsafe.Slice ขอ 103 ไบต์ได้ → unsafe_read_bytes=103
unsafe_read_past_cap=39  (runtime ปฏิเสธจำนวนนี้ไปแล้ว)
found_marker=COOKIE-IN-SAME-ALLOCATION-DEMO
unsafe_leaked=1
unsafe ไม่ได้ทำให้เร็วขึ้น แต่ทำให้ไม่มีใครตรวจให้ — ใช้เมื่อเลี่ยงไม่ได้จริง ๆ เท่านั้น
```

สองบรรทัดติดกันคือบทเรียนทั้งหมด: **บรรทัดแรก** ขอ 103 ไบต์ด้วยวิธีปกติ → `runtime error: slice bounds out of range [:103] with capacity 64` · **บรรทัดที่สอง** ขอเท่ากันด้วย `unsafe.Slice` → ได้ 103 ไบต์ โดยในนั้นมี cookie ที่อยู่นอกขอบเขต cap อยู่จริง (`unsafe_read_past_cap=39`)

พูดให้ตรง: **`unsafe` ไม่ได้แปลว่าเร็ว แปลว่า "ไม่มีใครตรวจให้"** · ทีมส่วนใหญ่ควรใช้ `unsafe` เฉพาะในจุดที่ควบคุมได้จริง จำนวนน้อย และมีเทสต์คลุม และในจุดนั้นให้ถือว่ากลับไปอยู่ในโลกของ C แล้ว

### 3.7 ให้เครื่องหาที่เราลืม: fuzz test

เรามีตัวตรวจที่ดีแล้ว แต่มนุษย์จะลืมตอนไหนก็ได้ · วิธีที่ Heartbleed ทำให้อุตสาหกรรมยอมรับคือ **fuzzing**: ให้เครื่องยิงอินพุตแปลก ๆ เป็นล้าน ๆ ครั้ง แล้วดักว่าข้อกำหนดของเราถูกทำให้พังหรือไม่

ข้อกำหนดที่เราจะให้เครื่องพิสูจน์คือประโยคเดียว:

> **response ต้องไม่ยาวกว่า record ที่รับเข้ามา**

เขียนเป็น fuzz test ใน Go (มีใน standard library ตั้งแต่ Go 1.18):

```go
// staleBuffer = บัฟเฟอร์ 64 ไบต์ ที่มีคำขอโกหก (20 ไบต์) อยู่ข้างหน้า
// และมีข้อมูลค้างของคำขอก่อนหน้าอยู่ต่อท้าย — ซึ่งเป็นความจริงของ socket buffer ในงานจริง
func staleBuffer() []byte {
	buf := make([]byte, 64)
	copy(buf, heartbeat.BuildRequest([]byte("X"), 43, heartbeat.MinPadding))
	copy(buf[20:], "SESSION-COOKIE=user=tester")
	return buf
}
```

```go
// FuzzVulnerableHandlerIsCaught เล็งตัวที่เช็คผิดตัวแปร
// ข้อกำหนด: response ต้องไม่ยาวกว่า record ที่ได้รับ
func FuzzVulnerableHandlerIsCaught(f *testing.F) {
	seedCorpus(f)
	f.Fuzz(func(t *testing.T, buf []byte, recordLen int) {
		if recordLen < 0 || recordLen > len(buf) {
			return
		}
		resp, err := heartbeat.EchoAgainstBufferLen(buf, recordLen)
		if err != nil {
			return
		}
		if len(resp) > recordLen {
			t.Fatalf("over-read: declared=%d ไบต์ จาก record %d ไบต์ → คืน %d ไบต์",
				heartbeat.DeclaredLen(buf), recordLen, len(resp))
		}
	})
```

รันแบบ seed corpus (ชุดอินพุตตั้งต้นที่ป้อนให้ fuzzer ไว้ล่วงหน้า — จึงให้ผลคงที่) ได้ผลนี้:

```
--- go test -count=1 -v ./fuzz ---
=== RUN   FuzzVulnerableHandlerIsCaught
=== RUN   FuzzVulnerableHandlerIsCaught/seed#0
=== RUN   FuzzVulnerableHandlerIsCaught/seed#1
=== RUN   FuzzVulnerableHandlerIsCaught/seed#2
    heartbleed_test.go:47: over-read: declared=43 ไบต์ จาก record 20 ไบต์ → คืน 43 ไบต์
--- FAIL: FuzzVulnerableHandlerIsCaught (TIME)
    --- PASS: FuzzVulnerableHandlerIsCaught/seed#0 (TIME)
    --- PASS: FuzzVulnerableHandlerIsCaught/seed#1 (TIME)
    --- FAIL: FuzzVulnerableHandlerIsCaught/seed#2 (TIME)
=== RUN   FuzzCorrectHandlerNeverAmplifies
=== RUN   FuzzCorrectHandlerNeverAmplifies/seed#0
=== RUN   FuzzCorrectHandlerNeverAmplifies/seed#1
=== RUN   FuzzCorrectHandlerNeverAmplifies/seed#2
--- PASS: FuzzCorrectHandlerNeverAmplifies (TIME)
    --- PASS: FuzzCorrectHandlerNeverAmplifies/seed#0 (TIME)
    --- PASS: FuzzCorrectHandlerNeverAmplifies/seed#1 (TIME)
    --- PASS: FuzzCorrectHandlerNeverAmplifies/seed#2 (TIME)
FAIL
FAIL	ep07heartbleed/fuzz	(TIME)
FAIL
```

อ่านผลนี้ให้ละเอียด เพราะมันบอกความจริงสองอย่างพร้อมกัน:

- **`FuzzVulnerableHandlerIsCaught`** — seed#2 (บัฟเฟอร์ที่มีข้อมูลค้าง) ทำให้เทสต์ **แดงทันที** ด้วยข้อความ `over-read: declared=43 ไบต์ จาก record 20 ไบต์ → คืน 43 ไบต์` · **fuzzer ไม่ต้อง "หา" เลย** เพราะเราบอกมันไว้ตรง ๆ ว่าอะไรคือการละเมิด — seed corpus ที่ดีจะจับบั๊กที่เรารู้อยู่แล้วเป็น **regression test** และปล่อยให้ fuzzer ไปหาตัวที่เราไม่รู้
- **`FuzzCorrectHandlerNeverAmplifies`** — ตัวที่ถูกต้องผ่าน **ทั้ง 3 seed**

และเมื่อรัน fuzzing จริง (`go test -run=^$ -fuzz=FuzzCorrectHandlerNeverAmplifies -fuzztime=15s ./fuzz` บนเครื่องนี้) มันยิงประมาณ **1.1 ล้านครั้งใน 15 วินาที** (ราว 73,000 ครั้ง/วินาที) แล้ว **ไม่พบการละเมิดเลย** — ตัวเลข execs/sec เปลี่ยนตามเครื่องและตามจังหวะ จึงไม่ยกมาอ้างเป็นตัวเลขประจำบท แต่ข้อสรุปที่ตรวจสอบได้คือ: **ตัวที่ถูกต้องไม่พัง แม้เครื่องจะพยายามเป็นล้านครั้ง** (ในผลรันของบท เราจึงเก็บเฉพาะ seed-corpus run ซึ่งรันซ้ำได้ผลเดิม)

ทำไมต้องพูดเรื่อง fuzzing ในบท Heartbleed? เพราะคำถามที่ตามมาหลังปี 2014 คือ *"จะรู้ได้อย่างไรว่ายังมีบั๊กแบบนี้อีก"* — และคำตอบที่ขยายผลได้จริงในทางวิศวกรรมคือ **ย้ายการตรวจจับไปที่เครื่อง: sanitizer (ASan), fuzzer, bounds check ของภาษา (การตรวจขอบเขตที่ตัวภาษาใส่ให้เอง)** เพราะมนุษย์ตรวจรีวิวโค้ดได้ไม่ครบทุกรอบ

### 3.8 รันทั้งหมดพร้อมกัน (ทำซ้ำได้)

ทุกอย่างที่อยู่ในบทนี้อยู่ในโฟลเดอร์เดียว: `security/code/ep07/`

```bash
cd security/code/ep07
bash run_all.sh          # คอมไพล์ + รัน C, ASan, Go, fuzz → เก็บผลลง out/
python3 gen_svgs.py      # สร้าง SVG 3 ภาพจากตัวเลขใน out/ โดยตรง
python3 verify_article.py   # ประตูตรวจ: บล็อกผลรัน/โค้ดในบทตรงกับไฟล์จริงไหม
```

`run_all.sh` รันซ้ำได้ผลเท่าเดิมทุกครั้ง (เราเคยพิสูจน์ด้วย `diff -r` — ต่างกันแค่บรรทัด `date:` บรรทัดเดียว) เพราะทุกค่าที่พิมพ์ออกมาเป็นค่าคงที่: ไม่มี address ไม่มีเวลา ไม่มีค่าสุ่ม · และ **ไม่มีการเชื่อมต่อเครือข่ายเลย** (`network_connections=0`)

---

## 4. บทเรียน: โลกทำอะไรกับ Heartbleed

### 4.1 วิกฤตที่กลายเป็นโครงสร้าง (ไม่ใช่แค่แพตช์)

สิ่งที่โลกทำหลังเดือนเมษายน 2014 ไม่ได้จบที่การอัปเกรดเป็น 1.0.1g — มันเปลี่ยนวิธีที่อุตสาหกรรมดูแล open source โครงสร้างพื้นฐาน:

| สิ่งที่เกิด | รายละเอียด |
|---|---|
| **LibreSSL** | OpenBSD fork OpenSSL (ลงทะเบียนโดเมน 11 เม.ย. · ประกาศชื่อ 22 เม.ย. 2014) และรายงานว่าใน 30 วันแรกลบโค้ด C ไปราว **90,000 บรรทัด** (ลบไฟล์รวมราว 150,000 บรรทัด จากฐานราว 388,000 บรรทัดของ 1.0.1g) · "heartbeat" เป็นหนึ่งในฟีเจอร์แรก ๆ ที่ถูกตัดออก |
| **Core Infrastructure Initiative (CII)** | Linux Foundation เปิด **24 เมษายน 2014** · บริษัทเทคโนโลยียักษ์ใหญ่ **13 บริษัท** รับปากบริจาครายละ **100,000 ดอลลาร์ต่อปี × 3 ปี** (รวมราว **3.9 ล้านดอลลาร์**) · เงินนี้ใช้จ้างนักพัฒนา OpenSSL เต็มเวลา — ก่อนหน้านั้นทั้งโปรเจกต์มีคนเต็มเวลา **1 คน** และเงินบริจาคราว **2,000 ดอลลาร์ต่อปี** |
| **การตรวจโค้ดอย่างจริงจัง** | CII หนุน **Open Crypto Audit Project (OCAP)** ให้ตรวจ OpenSSL อย่างเป็นทางการ → ตีพิมพ์ผลการตรวจ (phase 1) ในปี 2014–2015 และนำไปสู่รอบการตรวจ/ปรับโครงสร้างต่อเนื่องหลายปี · บทเรียน: "โค้ดที่คนทั้งโลกใช้" ต้องมีคนที่ **ได้ค่าตอบแทนเพื่ออ่านมัน** |
| **CII → OpenSSF** | ในปี 2020 CII ถูกผนวกเข้าเป็นส่วนหนึ่งของ **Open Source Security Foundation (OpenSSF)** ซึ่งทำงานต่อจนถึงวันนี้ |

และมี fork อีกตัวที่มาจากเหตุการณ์นี้แบบตรง ๆ คือ **BoringSSL** ของ Google (ใช้ภายใน) ซึ่งเป็นรากของงาน TLS ที่ Google พัฒนาต่อ

### 4.2 กระบวนทัศน์ที่เปลี่ยน: memory-safe languages

แต่ผลลัพธ์ที่ลึกที่สุดของ Heartbleed ไม่ใช่ fork หรือเงินทุน — มันคือคำถามที่วงการยอมรับในที่สุด:

> ในเมื่อ "การอ่านเกินขอบเขต" เป็นบั๊กที่เกิดได้จากการละเว้นการเทียบ **หนึ่งครั้ง** ในโค้ดแสนบรรทัด — และมันทำให้ทั้งอินเทอร์เน็ตต้องออกใบรับรองใหม่ … ทำไมเรายังใช้ภาษาที่ **ทุกบรรทัด** ต้องมีคนเขียนการเทียบเอง?

ตัวเลขที่ทำให้เรื่องนี้กลายเป็นวาระของผู้บริหาร (ไม่ใช่แค่ของ developer):

- **ราว 70% ของ CVE** ที่ Microsoft กำหนดเลขให้ เป็นปัญหา memory safety (ประเมินจาก CVE ปี 2006–2018)
- **ราว 70% ของช่องโหว่ร้ายแรง** ที่พบในโปรเจกต์ Chromium เป็นปัญหา memory safety
- **ราว 67% ของ zero-day (ช่องโหว่ที่ยังไม่มีแพตช์และถูกใช้โจมตีก่อนผู้ผลิตจะรู้ตัว) ที่ถูกใช้จริงในปี 2021** เป็นปัญหา memory safety (วิเคราะห์โดยทีม Project Zero ของ Google)
- **Android** รายงานว่าสัดส่วนช่องโหว่ด้าน memory safety ลดจาก **76% (2019) เหลือ 24% (2024)** หลังเริ่มใช้ Rust ในโค้ดใหม่

และในเดือนธันวาคม 2023 **CISA + NSA + FBI ร่วมกับพันธมิตร Five Eyes (พันธมิตรข่าวกรอง 5 ประเทศ: สหรัฐฯ อังกฤษ แคนาดา ออสเตรเลีย นิวซีแลนด์)** เผยแพร่เอกสาร *"The Case for Memory Safe Roadmaps"* ที่ย้ำตัวเลขชุดเดียวกันนี้และผลักตรงไปที่ผู้บริหารซอฟต์แวร์: **ให้เขียน roadmap ว่าจะลดและกำจัดโค้ดที่ไม่ memory-safe อย่างไร ไม่ใช่แค่ "รัน sanitizer ให้มากขึ้น"**

ทั้งหมดนี้คือเหตุผลที่บทเรียนของ Heartbleed ในปี 2014 ไม่ได้ล้าสมัยในปี 2026 — **มันกลายเป็นนโยบาย**

### 4.3 ห้าบทเรียนที่เอาไปใช้ได้พรุ่งนี้

1. **ข้อมูลที่ข้าม trust boundary ต้องถูกตรวจ "ความสอดคล้องภายใน" ก่อนถูกใช้เป็นความยาว ดัชนี หรือ offset** — ไม่ใช่ตรวจแค่ชนิดหรือช่วงค่าที่รองรับ · Heartbleed ผ่านการตรวจชนิดข้อมูลสบาย ๆ (เป็น uint16 ที่ถูกต้องตามรูปแบบ) แต่ "ความสอดคล้อง" ระหว่างค่ากับข้อมูลจริงไม่เคยถูกตรวจ
2. **แยก "declared" ออกจาก "actual" ให้ชัดเสมอในการออกแบบโปรโตคอล** — และตั้งชื่อให้ต่างกันในโค้ด (ในเดโมของเราใช้ `declared` vs `recordLen` · การตั้งชื่อที่ดีคือการป้องกันบั๊กชั้นแรก)
3. **ความยาวที่ถูกต้องคือความยาวของ record ไม่ใช่ของบัฟเฟอร์** — กรณีนี้คือกับดักที่ย้ายข้ามภาษาได้สำเร็จ (`stale_memory_leaked=1`) เพราะบัฟเฟอร์ถูกใช้ซ้ำเสมอ
4. **memory-safe language = ลบ "คลาส" ของบั๊ก ไม่ได้ลบ "ความรับผิดชอบ"** — Go ทำให้ `EchoUncheckedRaw` เขียนไม่ได้เลย (panic) แต่ไม่ได้ทำให้ `EchoAgainstBufferLen` ถูกต้อง · ภาษาไม่รู้จักโปรโตคอลและไม่รู้จักเจตนาของเรา
5. **การป้องกันต้องมีชั้น: ภาษา → sanitizer → fuzzing → human review** — ในเดโมของเรา คอมไพเลอร์เตือน **0 ครั้ง** กับโค้ดที่มีบั๊ก (`vulnerable_build_warnings=0`) แต่ ASan รายงาน `READ of size 65535` และ fuzzer ฟ้อง `over-read: declared=43 ไบต์ จาก record 20 ไบต์` ตั้งแต่ seed — **การต่างกันของเครื่องมือหนึ่งชิ้นคือความต่างระหว่างช่องโหว่กับเหตุการณ์**

---

## 5. โจทย์ประจำตอน

### ระดับ Drill (5–10 นาที)

1. **อธิบายด้วยคำของคุณเอง** ว่าทำไม `bounds_check_before_memcpy=0` จึงไม่ทำให้เดโม C crash · คำตอบต้องพูดถึงคำว่า "อ่าน" กับ "เขียน" และคำว่า "หน่วยความจำที่ยังถูก map อยู่"
2. **คำนวณจากผลรัน** — ถ้าเฟรมบนสายยาว 20 ไบต์ และประกาศ `payload_length = 65535`:
   (ก) เซิร์ฟเวอร์ตอบกลับกี่ไบต์ (แสดงวิธีคิดจากเลข header 3 ไบต์)
   (ข) ไบต์ที่อ่านเกิน record จริงมีกี่ไบต์
   (ค) ถ้าต้องดูด private key 32 ไบต์ที่ความเร็ว 64 KiB ต่อคำขอ ต้องใช้ "กี่คำขอ" อย่างน้อยที่สุด (ตอบเป็นตัวเลขเดียว พร้อมอธิบายว่าทำไมคำตอบนี้ยังไม่รับประกันว่าจะได้ key)
3. **แก้โค้ดให้ถูกต้อง** — ใน `heartbeat/heartbleed.go` ให้เขียนฟังก์ชันใหม่ `EchoCheckedWithOffset(buf []byte, recordLen, offset int)` ที่รับ payload เฉพาะช่วง `offset` โดย **ยังต้อง** ปฏิเสธคำขอโกหก · จากนั้นอธิบายว่าเมื่อไรที่การเทียบกับ `recordLen` อย่างเดียวไม่พอ
4. **ตอบจากหัวข้อ 3.4:** ทำไม panic message ขึ้นว่า `slice bounds out of range [:65538] with capacity 64` — เลข `65538` และ `64` มาจากอะไร · และเพราะเหตุใดข้อความนี้จึงทำให้บั๊กแบบ Heartbleed **ตรวจพบได้เสมอ** ใน Go (เปรียบกับ `program_exit_status=0` ของฝั่ง C)
5. **จากหัวข้อ 3.5:** `EchoAgainstBufferLen` มีการเช็คขอบเขตอยู่จริง แต่ยังรั่วได้ · อธิบายความแตกต่างระหว่าง `len(buf)` กับ `recordLen` ในสถานการณ์ที่มีคำขอหลายใบเข้ามาต่อกันบน connection เดียวกัน (เขียนเป็นภาพหรือเป็นตารางก็ได้)
6. **ตอบจากหัวข้อ 2.4:** ทำไมหลัง Heartbleed องค์กรต้อง **revoke ใบรับรองเดิม** ทุกใบ แม้จะอัปเกรด OpenSSL เป็น 1.0.1g เรียบร้อยแล้ว · และเพราะเหตุใดการอัปเกรดโดยไม่ restart service จึงไม่พอ

### ระดับ Mini-project (30–60 นาที)

1. **เขียน heartbeat server/client ที่ถูกต้อง ตาม RFC 6520 §4** — สร้างโปรแกรม Go ที่ (ก) ส่ง HeartbeatRequest จริง (ข) ฝั่งรับต้องตรวจ **ทั้งสองเงื่อนไข** ตามแพตช์: `len(record) >= 3+16` และ `3+declared+16 <= len(record)` (ค) ตอบ HeartbeatResponse เฉพาะ payload จริง แล้ว **เพิ่มเทสต์ที่พิสูจน์ว่า** คำขอโกหก 5 แบบ (declared เกิน, declared ตรงแต่ padding ไม่ครบ, type ผิด, length 0, length ที่ทำให้ overflow) ถูกปฏิเสธทั้งหมด · ส่งงานเป็น `main.go` + `*_test.go` ที่ `go test ./...` ผ่าน
2. **ย้ายเดโม C ให้เป็น production-safe** — เอา `c_demo/heartbleed_mini.c` มาเขียนใหม่เป็นโมดูลที่รับคำขอจาก **ไฟล์หรือ stdin** (ไม่เปิด socket) โดย (ก) ทุกการเข้าถึงต้องผ่านฟังก์ชันเดียวที่ตรวจขอบเขต (ข) ใช้ `size_t` + ตรวจ integer overflow ก่อนบวก (ค) รันด้วย `-fsanitize=address,undefined` และต้องไม่มีรายงานใด ๆ กับคำขอทุกแบบในข้อ 1 · จากนั้น **เขียนสั้น ๆ 1 ย่อหน้า** ว่าทำไม "ฟังก์ชันเดียวที่ตรวจขอบเขต" ดีกว่า "จำได้ว่าต้องตรวจทุกที่"
3. **เขียน fuzz target ของตัวเองให้เจอบั๊กที่เราใส่ไว้** — สร้างโปรแกรม Go ที่มีบั๊กแบบ "เทียบผิดตัวแปร" หรือ "ลืมเทียบ" 1 จุด (ซ่อนไว้) แล้วเขียน fuzz test ที่ **ไม่** บอกตรง ๆ ว่าบั๊กอยู่ไหน (ต่างจาก seed corpus ในบทนี้) · รัน `go test -fuzz=Fuzz... -fuzztime=60s` แล้วรายงานว่า (ก) ใช้เวลากี่วินาทีจึงเจอ (ข) อินพุตที่ทำให้พังคืออะไร (ค) `testdata/fuzz/...` ถูกเขียนไฟล์อะไรลงไป · **ปิดท้ายด้วยการแก้บั๊ก** แล้วรัน fuzz ใหม่ให้ผ่าน 60 วินาที
4. **ทำ checklist ตรวจ Heartbleed ในโปรเจกต์จริง** — เลือกโปรเจกต์ของคุณ (หรือ open source ที่อ่านโค้ดได้) แล้วค้นหาที่ที่ **ค่าจากภายนอกถูกใช้เป็นความยาวหรือดัชนี**: `make([]byte, n)`, `s[:n]`, `s[i:j]`, `copy()`, `Read(buf)`, `unsafe`, cgo boundary · เขียนตาราง 4 คอลัมน์: ตำแหน่ง · ความยาวที่ใช้ · เทียบกับอะไร · ควรเทียบกับอะไร · แล้วเลือก 3 จุดที่เสี่ยงสุดมาอธิบายว่า "ถ้าค่าเหล่านี้โกหกได้ จะเกิดอะไรขึ้น"
5. **สำรวจสคริปต์ตรวจของตอนนี้** — เปิด `verify_article.py` แล้วอธิบายว่ามันตรวจอะไรบ้าง (บล็อกผลรันจริง · บล็อกโค้ด C/Go · footnote · อักษรจีน/ญี่ปุ่น · ไฟล์ SVG · slug ของ cross-link · ตัวเลขที่ต้องตรงกับ `out/`) · แล้ว **หา 1 จุดที่มันยังตรวจไม่ได้** เช่น "คำอธิบายในเนื้อความสอดคล้องกับผลรันไหม" แล้วเขียนเช็คของตัวเองเพิ่ม

---

## 6. สรุปตอนที่ 07

- **Heartbleed = CVE-2014-0160** = การขาดการเทียบความยาว **หนึ่งครั้ง** ในฟังก์ชันจัดการ TLS heartbeat (RFC 6520 §4) ของ OpenSSL — `memcpy(bp, pl, payload)` โดย `payload` มาจากผู้ส่ง · หมวด **CWE-125 Out-of-bounds Read** (variant CWE-126) · กระทบ **1.0.1 ถึง 1.0.1f และ 1.0.2-beta1** · แก้ใน **1.0.1g (7 เมษายน 2014)** ด้วยการเทียบ 2 บรรทัด · CVSS v2 = **5.0** / v3.1 = **7.5** (`C:H/I:N/A:N`)
- **ไทม์ไลน์:** commit 31 ธ.ค. 2011 → OpenSSL 1.0.1 ออก 14 มี.ค. 2012 (เปิด heartbeat by default) → เปิดเผย 7 เม.ย. 2014 → Cloudflare Challenge 11 เม.ย. (Indutny 2.5 ล้านคำขอได้ private key) → CRA แจ้ง SIN รั่ว 900 ราย 14 เม.ย. → LibreSSL 22 เม.ย. (ลบโค้ด C ราว 90,000 บรรทัดใน 30 วัน) → CII 24 เม.ย. (13 บริษัท × 100,000 ดอลลาร์ × 3 ปี ≈ 3.9 ล้านดอลลาร์; ก่อนหน้านั้น OpenSSL มีคนเต็มเวลา 1 คน และเงินบริจาค ~2,000 ดอลลาร์/ปี)
- **ทำไมมันเงียบและอันตราย:** เป็น **การอ่าน** ไม่ใช่การเขียน → ไม่ crash ไม่มี log (`program_exit_status=0`) · เผย **confidentiality** อย่างเดียว · ขอข้อมูลได้ถึง **3,276 เท่า** ของเฟรมจริง · และ **บทเรียนที่ลึกที่สุดของเหตุการณ์นี้คือ “ความไม่แน่นอน”**: ถ้าไม่ทิ้งร่องรอย เราก็ไม่มีทางรู้ว่าเคยถูกอ่านไปแล้วหรือยัง
- **เดโมของเราพิสูจน์ครบทั้งสี่เครื่องมือ:** คอมไพเลอร์ (`gcc -O1 -Wall -Wextra`) เตือน **0 ครั้ง** กับโค้ดที่มีบั๊ก (`vulnerable_build_warnings=0`) แต่เตือน **1 ครั้ง** ทันทีเมื่อความยาวเป็นค่าคงที่ (`constant_length_probe_warnings=1`) · **ASan** รายงาน `READ of size 65535` ที่ `hb_echo_vulnerable c_demo/heartbleed_mini.c:51` เกิน `108-byte region` · **Go runtime** ปฏิเสธเองด้วย `runtime error: slice bounds out of range [:65538] with capacity 64` · และ **fuzzer** ฟ้อง `over-read: declared=43 ไบต์ จาก record 20 ไบต์` ตั้งแต่ seed (ตัวที่ถูกต้องผ่านทุก seed)
- **กับดักที่สำคัญที่สุดของบทนี้ (มักถูกมองข้าม):** memory-safe language ลบ "คลาส" ของบั๊กอ่านเกินออบเจกต์ แต่ **ไม่ได้ลบการเทียบที่ผิดตัวแปร** — `EchoAgainstBufferLen` ซึ่งเทียบ `declared` กับ `len(buf)` แทน `recordLen` ยังรั่วข้อมูลค้าง (`stale_memory_leaked=1`) และ `unsafe` ก็ปิดการตรวจทั้งหมด (`unsafe_read_past_cap=39`) · กฎที่ต้องเขียนเองคือ **"เทียบ declared กับ record เสมอ"**
- **สิ่งที่โลกเปลี่ยน:** LibreSSL/BoringSSL · Core Infrastructure Initiative (→ OpenSSF) ที่จ่ายเงินให้นักพัฒนา open source ระดับโครงสร้างพื้นฐานเต็มเวลา · การตรวจโค้ด OpenSSL อย่างเป็นทางการ (OCAP) · และวาระ **memory-safe languages** ที่วันนี้เป็นนโยบาย: ~70% ของ CVE ของ Microsoft และของ Chromium เป็น memory safety · Android ลดจาก 76% (2019) → 24% (2024) · CISA/NSA/FBI + Five Eyes เผยแพร่ *The Case for Memory Safe Roadmaps* (ธ.ค. 2023)
- **คำถามที่ควรถามตัวเองก่อนปิดบทนี้:** *"ในโปรเจกต์ที่ฉันดูแล มีที่ไหนที่ค่าจากข้างนอกถูกใช้เป็นความยาวหรือดัชนี และการเทียบของฉันเทียบกับ 'ความยาวที่รับมา' หรือกับ 'ความยาวของบัฟเฟอร์'?"* · และคำถามที่สอง: *"ในโค้ด C/C++ ที่ฉันมี ถ้าคอมไพเลอร์ไม่เตือน — ฉันมี ASan กับ fuzzer รันอัตโนมัติหรือยัง?"* สองคำถามนี้ครอบสาเหตุของ Heartbleed และบั๊กพันธุ์เดียวกันส่วนใหญ่ไว้แล้ว

ตอนหน้า (ตอนที่ 08) เราจะไปต่อที่คำถามค้างจากบทนี้: **ถ้าโค้ดของเราปลอดภัยแล้ว แต่มันเรียก library ที่มีบั๊ก — หรือใช้ dependency ที่ถูกยึด ใครรับผิดชอบ?** เราจะเล่าเรื่อง **Log4Shell (2021) และ SolarWinds (2020)** — สองเหตุการณ์ที่ทำให้คำว่า **supply chain** กลายเป็นคำที่ผู้บริหารต้องรู้จัก และพาไปสู่ SBOM, dependency scanning และ artifact ที่ถูกเซ็นชื่อ

ระหว่างรอ ลองเปิด `go.mod` ของโปรเจกต์คุณแล้วถามว่า: *"dependency นี้ใครดูแล? ถ้ามันพังคืนนี้ ฉันรู้ตัวภายในกี่ชั่วโมง?"* — นั่นคือโจทย์ของตอนหน้า

พบกันตอนหน้า

---

## หมายเหตุท้ายบท (disclaimer)

- บทความนี้เขียนและรันโค้ดจริงเมื่อ **15 ตุลาคม 2026** (เวลาไทย) บน **Raspberry Pi 5 Model B** — Linux 6.18.39+rpt-rpi-2712 (aarch64) · **gcc 14.2.0 (Debian 14.2.0-19)** · **AddressSanitizer จาก libasan ของ toolchain เดียวกัน** · **Go 1.24.4 (linux/arm64)** โดย `go.mod` ของตอนนี้ระบุ `go 1.24` (ตรงกับ toolchain ที่ติดตั้ง — **เจตนาไม่ใช้กลไกดาวน์โหลด toolchain อัตโนมัติ** เพื่อให้รันซ้ำได้แบบออฟไลน์ 100%) · **ไม่มี dependency ภายนอกเลย** (เฉพาะ standard library) · **Python 3.13.5** · **rsvg-convert 2.60.0** · **OpenSSL 3.5.7 (9 มิถุนายน 2026)** ใช้ตรวจเวอร์ชันประกอบเท่านั้น (ค่าทั้งหมดจาก `out/00_env.txt`)
- **เวอร์ชันล่าสุด ณ วันเขียน** (ตรวจจากแหล่งปัจจุบัน ไม่ได้ใช้ความจำ): **Go 1.27.2 และ Go 1.26.9 ออก 8 ตุลาคม 2026** พร้อม security fix 15 รายการ (ส่วนใหญ่ใน `net/http`) — <https://go.dev/doc/devel/release> · **Go 1.18 (กุมภาพันธ์ 2022)** เป็นรุ่นแรกที่มี fuzzing ในตัว (`go test -fuzz`) — <https://go.dev/doc/go1.18> และคู่มือ <https://go.dev/doc/fuzz> · **OpenSSL 3.6.0 ออก 1 ตุลาคม 2025** และสาย 3.6 ยังออกรุ่นย่อยต่อเนื่อง — <https://openssl.org/news/openssl-3.6-notes/> · เลขเวอร์ชันบนเครื่องเราจึงเก่ากว่าล่าสุดได้เป็นปกติ
- **การเขียนศัพท์เทคนิค:** เราใช้ทับศัพท์หรือคำอังกฤษตรง ๆ กับศัพท์เทคนิค (heartbeat, buffer, slice, bounds check, over-read, sanitizer, fuzzer) เพราะการแปลตรงตัวทำให้คนอ่านเข้าใจผิดมากกว่าต้นฉบับ
- ทุกตัวเลขและข้อความในกรอบ "ผลรันจริง" ของบทนี้เป็น **สำเนาตรงบรรทัดต่อบรรทัด** จาก `security/code/ep07/out/`: เดโม C + warning ของคอมไพเลอร์ (`01_c_demo.txt` — `req_buf_bytes=64` · `struct_bytes=108` · `secret_offset=68` · `bytes_past_record=111` · `secret_leaked=1` · `program_exit_status=0` · `fixed_result=refused` · `vulnerable_build_warnings=0` · `constant_length_probe_warnings=1`) · ASan (`02_c_asan.txt` — `READ of size 65535` · `hb_echo_vulnerable c_demo/heartbleed_mini.c:51` · `108-byte region`) · เดโม Go (`03_go_demo.txt` — `bytes_amplification_requested=3276` · `panic_message=runtime error: slice bounds out of range [:65538] with capacity 64` · `stale_memory_leaked=1` · `unsafe_read_past_cap=39` · `network_connections=0`) · fuzz (`04_go_fuzz.txt`) · `go.mod` (`05_setup.txt`)
- **ค่าที่ไม่คงที่ถูกจงใจไม่เก็บใน `out/`:** ที่อยู่หน่วยความจำ, PID ของ ASan และเวลาที่ผ่านไปในเทสต์ ถูกทำให้เป็น `<addr>`/ตัดออก/แทนด้วย `(TIME)` ใน `run_all.sh` · ส่วน **fuzzing ที่รันจริง** (`-fuzz`) มีตัวเลข execs/sec ที่เปลี่ยนทุกครั้ง จึงไม่ถูกเก็บเป็นตัวเลขในบทนี้ (เราเก็บเฉพาะ seed-corpus run ที่รันซ้ำได้ผลเดิม) · และเนื้อความที่อ่านเกินออกมาในเดโม C เป็น heap junk ซึ่งไม่คงที่ เราจึงพิมพ์เฉพาะ **marker ที่เราควบคุมเอง** กับตัวนับ ไม่พิมพ์ไบต์ทั้งก้อน
- **ความสอดคล้องกับ `out/`:** สคริปต์ `security/code/ep07/verify_article.py` ตรวจอัตโนมัติว่า (ก) ทุกบล็อก "ผลรันจริง" ในบทเป็น excerpt ที่ต่อเนื่องของไฟล์ใน `out/` จริง (ข) ทุกบล็อก ```go เป็น excerpt ที่ต่อเนื่องของไฟล์ซอร์สจริง (`main.go`, `heartbeat/heartbleed.go`, `fuzz/heartbleed_test.go`, `go.mod`) (ค) ทุกบล็อก ```c เป็น excerpt ของ `c_demo/heartbleed_mini.c` (ง) ไม่มีเชิงอรรถแบบ footnote (ซีรีส์นี้ห้ามใช้) (จ) ไม่มีอักษรจีน/ญี่ปุ่น/เกาหลี (ฉ) ไฟล์ SVG ที่อ้างมีอยู่จริง (ช) slug ของ cross-link ชี้ไปไฟล์ที่มีอยู่จริง (ซ) ตัวเลขสำคัญในบทสรุปตรงกับ counter ใน `out/`
- **ความปลอดภัยของเดโม:** ทุกเดโมรันในโปรเซสของตัวเอง · **ไม่มีการเปิด socket ไม่มีการเชื่อมต่อเครือข่าย** (`network_connections=0`) · struct/secret ทั้งหมดสร้างขึ้นในหน่วยความจำของโปรแกรมเอง · ไม่มีข้อมูลจริงใด ๆ ถูกใช้ (secret คือสตริงสมมติ `TLS-PRIVATE-KEY-DEMO-ONLY-STRICTLY-0001` และ `SESSION-COOKIE=user=tester`) · และ **ไม่มีเทคนิคใดในบทนี้ที่ทำงานกับระบบของคนอื่นได้ในปัจจุบัน** เพราะ OpenSSL 1.0.1 ไม่ถูกใช้แล้ว
- **ข้อเท็จจริงเชิงประวัติศาสตร์** ตรวจกับแหล่งปัจจุบันเมื่อ **2026-10-15**: **OpenSSL Security Advisory [07 Apr 2014]** — "A missing bounds check in the handling of the TLS heartbeat extension can be used to reveal up to 64k of memory to a connected client or server. Only 1.0.1 and 1.0.2-beta releases of OpenSSL are affected including 1.0.1f and 1.0.2-beta1" + ขอบคุณ Neel Mehta (Google Security) และ Adam Langley/Bodo Moeller ที่เตรียมแพตช์ + ทางเลือกชั่วคราว `-DOPENSSL_NO_HEARTBEATS` — <https://www.openssl.org/news/secadv/20140407.txt> · **NVD CVE-2014-0160**: "The (1) TLS and (2) DTLS implementations in OpenSSL 1.0.1 before 1.0.1g do not properly handle Heartbeat Extension packets, which allows remote attackers to obtain sensitive information from process memory via crafted packets that trigger a buffer over-read … related to d1_both.c and t1_lib.c" · CVSS 3.1 **7.5 HIGH** (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`) · CVSS 2.0 **5.0 MEDIUM** — <https://nvd.nist.gov/vuln/detail/CVE-2014-0160> · **RFC 6520** (R. Seggelmann, M. Tuexen, M. Williams · กุมภาพันธ์ 2012) โครงสร้าง `HeartbeatMessage` และความสัมพันธ์ `padding_length = TLSPlaintext.length − payload_length − 3` (หัวข้อ 4) — <https://www.rfc-editor.org/rfc/rfc6520.html>
- **แพตช์และโค้ดฝั่ง C:** commit `96db9023b881d7cd9f379b0c154650d6c108e9a3` "Add heartbeat extension bounds check" เพิ่ม `if (1 + 2 + 16 > s->s3->rrec.length)` และ `if (1 + 2 + payload + 16 > s->s3->rrec.length)` — <https://github.com/openssl/openssl/commit/96db9023b881d7cd9f379b0c154650d6c108e9a3> · สรุปและโค้ดเปรียบเทียบก่อน/หลัง: **OWASP — Heartbleed Bug** — <https://owasp.org/www-community/vulnerabilities/Heartbleed_Bug> · **CWE-125 Out-of-bounds Read** ("The product reads data past the end, or before the beginning, of the intended buffer") และ variant **CWE-126 Buffer Over-read** — <https://cwe.mitre.org/data/definitions/125.html>
- **ไทม์ไลน์และตัวเลขความเสียหาย:** โค้ดเข้า repository 31 ธันวาคม 2011 และออกกับ OpenSSL 1.0.1 เมื่อ 14 มีนาคม 2012 (ผ่านการ review โดย core developer) — <https://en.wikipedia.org/wiki/Heartbleed> · ราว **17% ของเซิร์ฟเวอร์ HTTPS** (~500,000 เครื่อง) ณ วันเปิดเผย — <https://heartbleed.com/> · **Cloudflare Heartbleed Challenge** (11 เมษายน 2014): Fedor Indutny ~2.5 ล้านคำขอ · Ilkka Mattila (NCSC-FI) ~100,000 คำขอ · รวมผู้สำเร็จ 4 คน — <https://blog.cloudflare.com/the-results-of-the-cloudflare-challenge> · **Canada Revenue Agency**: SIN ของราว 900 ราย — <https://www.reuters.com/article/idUSBREA3D0XZ20140414/> และแถลงการณ์ของสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลแคนาดา — <https://www.canada.ca/en/news/archive/2014/04/statement-from-interim-privacy-commissioner-canada-regarding-heartbleed.html>
- **การตอบสนองเชิงโครงสร้าง:** **LibreSSL** — ลงทะเบียนโดเมน 11 เมษายน 2014 · ประกาศชื่อ 22 เมษายน 2014 · รายงาน "in 30 days of LibreSSL: OpenSSL 1.0.1g was 388,000 lines of C code; we had deleted about 150,000 lines of files … including about 90,000 lines of C source code" — <https://www.openbsd.org/papers/libtls-fsec-2015/mgp00003.txt> · **Core Infrastructure Initiative**: เปิด **24 เมษายน 2014** โดย Linux Foundation บริษัทละ 100,000 ดอลลาร์/ปี × 3 ปี (รวมราว 3.9 ล้านดอลลาร์) · ก่อนหน้านั้น OpenSSL มีนักพัฒนาเต็มเวลา 1 คน และเงินบริจาคราว 2,000 ดอลลาร์/ปี — <https://en.wikipedia.org/wiki/Core_Infrastructure_Initiative> และ <https://www.linuxfoundation.org/press/press-release/the-linux-foundations-core-infrastructure-initiative-announces-new-backers-first-projects-to-receive-support-and-advisory-board-members> (พฤษภาคม 2014: "Open Crypto Audit Project to conduct security audit of OpenSSL")
- **memory safety (วาระปัจจุบัน):** ตัวเลข ~70% (Microsoft จาก CVE ปี 2006–2018 · Chromium) · 67% ของ zero-day ปี 2021 (Project Zero) · Android 76% (2019) → 24% (2024) · เอกสาร **"The Case for Memory Safe Roadmaps"** (CISA, NSA, FBI + Five Eyes · ธันวาคม 2023) — <https://www.cisa.gov/case-memory-safe-roadmaps> และ <https://cisa.gov/news-events/news/urgent-need-memory-safety-software-products>
- ภาพ SVG ทั้งสามภาพในตอนนี้สร้างจากสคริปต์ `security/code/ep07/gen_svgs.py` ที่ดึงตัวเลขจาก `out/` โดยตรง (มี `assert` ตรวจค่าที่ parse ได้ว่าตรงกับค่าที่คาด เช่น `c_struct_bytes == 64+4+40` · `c_past_record == 112−1` · `a_read_size == 65535` · `go_amp == 65535÷20` · `go_unsafe_past_cap == 103−64`) และผ่านประตูตรวจ `check_svg_readability.py` (วัดความกว้างข้อความจริงเทียบขอบ viewBox ตรวจข้อความซ้อนกัน) รวมทั้งตรวจด้วยตาจากการ render จริงด้วย `rsvg-convert`
- **จริยธรรม (ย้ำอีกครั้ง — สำคัญที่สุด):** บทนี้สอนกลไกของ **buffer over-read** และจำลอง Heartbleed ตั้งแต่ต้นจนเห็นความลับรั่วออกมา · เทคนิคทั้งหมดนี้ **ใช้กับระบบของคนอื่นโดยไม่ได้รับอนุญาตไม่ได้** และเป็นความผิดทางกฎหมายในแทบทุกประเทศ · เดโมของเราทำกับหน่วยความจำของโปรแกรมตัวเองเท่านั้น และไม่แตะเครือข่ายเลย · **โค้ดที่มีบั๊กในบทนี้ (`hb_echo_vulnerable`, `EchoUncheckedRaw`, `EchoAgainstBufferLen`) เป็นเพื่อการศึกษาเท่านั้น ห้ามใช้ใน production เด็ดขาด** — ของจริงต้องใช้ implementation ที่ผ่านการตรวจและดูแลอย่าง OpenSSL รุ่นปัจจุบัน หรือ language runtime ที่ตรวจขอบเขตให้ และต้องมี ASan/fuzzer รันอยู่ใน CI

---

← ตอนก่อน: [Cryptography: จาก Caesar ถึง TLS (ตอนที่ 06)](/blog/post.html?slug=2026-10-14-software-security-06-crypto-history) — วันที่ "ความลับ" กลายเป็นคณิตศาสตร์  /  ตอนถัดไป: Log4Shell + SolarWinds (2020–21) →
