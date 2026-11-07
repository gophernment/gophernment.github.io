---
title: 'Secrets และ Supply Chain: ความลับที่หลุดไปกับ git และหลักฐานว่า artifact ที่ deploy คือ artifact ที่ build (ตอนที่ 29)'
date: 2026-11-07
tags: [software-security, secrets-management, supply-chain, sbom, code-signing, dependency-pinning, go]
description: "ตอนที่ 29 — ลบความลับออกจาก repo แล้วมันยังอยู่ในประวัติ 2 revision · ไฟล์ 0644 ถูกประตูปฏิเสธตอนบูต · SBOM 10 component มี typosquat 1 ตัว · artifact ที่ deploy ต่างจากที่ build (digest ไม่ตรง) · ลายเซ็นที่ครอบแค่ tag ถูกสลับ commit · MVS ดัน dependency เดิมขึ้น 1 ขั้น · go.mod/go.sum ถูกจับ 4 ข้อและประตูปฏิเสธการบูต"
---

# Secrets และ Supply Chain: ความลับที่หลุดไปกับ git และหลักฐานว่า artifact ที่ deploy คือ artifact ที่ build (ตอนที่ 29)

> 📅 เขียนเมื่อ: 7 พฤศจิกายน 2026 (เวลาไทย, UTC+7) · รันบน Raspberry Pi 5 (`Linux 6.18.60+rpi-2712 aarch64`) ด้วย `go1.24.4 linux/arm64` — รุ่นล่าสุดตอนเขียนคือ Go 1.27 (สิงหาคม 2026) แต่บทนี้ใช้เฉพาะ standard library ที่มีมานานแล้ว (`crypto/ed25519`, `crypto/hmac`, `crypto/sha256`, `encoding/json`, `os/exec`) และ `go.mod` ตั้ง `go 1.24` ไว้ · Python 3.13.5 · rsvg-convert 2.60.0 · ไม่มี dependency ภายนอก (`external_deps=0`) ไม่เปิดพอร์ต (`listen_calls=0`) ไม่แตะเครือข่าย (`network_dial_calls=0`) ไม่มีเวลาจริงในเส้นทางที่พิมพ์ผล (`time_now_calls=0`) · เอกสารอ้างอิงที่ตรวจก่อนเขียน: OWASP Top 10:2025 (A03:2025 Software Supply Chain Failures — หมวดที่ถูกจัดอันดับหนึ่งในการสำรวจด้วยสัดส่วน 50% ของผู้ตอบ และมีอัตราการเกิดเฉลี่ย 5.19% ในข้อมูลที่ส่งเข้ามา), NIST SP 800-218 SSDF v1.1 (กุมภาพันธ์ 2022 — ยังเป็นฉบับ final และมี SSDF v1.2 / SP 800-218 Rev.1 วางเป็น initial public draft เมื่อ 17 ธันวาคม 2025), SLSA v1.0 (19 เมษายน 2023) → SLSA v1.1 (21 เมษายน 2025) → SLSA v1.2 (24 พฤศจิกายน 2025, เพิ่ม Source Track), CycloneDX 1.7 (21 ตุลาคม 2025 — เป็น ECMA-424 ฉบับที่ 2 เมื่อธันวาคม 2025; ฉบับแรกคือ v1.6), SPDX 3.0 (เมษายน 2024), CWE-798, CWE-522, CWE-506, CWE-1357, CWE-1395, CWE-347, CWE-829
>
> ⚠️ **หมายเหตุเรื่องจริยธรรม (อ่านก่อนทุกอย่าง):** เดโมทุกตัวในบทนี้ทำงานในหน่วยความจำของโปรแกรมเดียวหรือในโฟลเดอร์ชั่วคราวของเครื่องคุณ ไม่มีพอร์ตเปิด ไม่มีแพ็กเก็ตออกนอกเครื่อง และไม่แตะข้อมูลของใคร · "ความลับ" ทุกค่าเป็นค่าปลอมที่ผมสร้างขึ้น (`CANARY-...`) หรือค่าตัวอย่างที่ผู้ให้บริการเผยแพร่เอง (`AKIA...EXAMPLE`) · โค้ดที่จงใจ insecure (ประวัติ git ที่มีความลับถูก commit และไฟล์ความลับ mode 0644) เขียนเพื่อการสอนเท่านั้น — **ห้ามใช้จริง** · การสแกนหา secret ทำได้เฉพาะกับ repository ที่คุณเป็นเจ้าของหรือได้รับอนุญาตเป็นลายลักษณ์อักษร — การสแกน repo ของผู้อื่นโดยไม่ได้รับอนุญาตเป็นความผิดทางอาญาในหลายประเทศ รวมถึงประเทศไทย · และการทดสอบห่วงโซ่กับระบบที่คนอื่นใช้งานอยู่ต้องมีขอบเขตเป็นลายลักษณ์อักษรเสมอ

---

ตอนที่ 28 เราจบด้วยประโยคที่ค้างไว้: **"ความลับที่ไม่ได้อยู่ใน log แต่ถูก commit ลง git"** คืนนี้เราจะไปที่ประโยคนั้นตรง ๆ และต่อด้วยคำถามอีกข้อที่มาคู่กันเสมอในงานจริง: **เมื่อ artifact ถูก build แล้วส่งขึ้น production เรารู้อะไรได้บ้างว่ามันคือของที่เราสร้างจริง**

สองเรื่องนี้อยู่ในบทเดียวกันเพราะมีศัตรูตัวเดียวกัน: **ความเชื่อที่ว่า "สิ่งที่มองไม่เห็นในไดเรกทอรีงาน = ไม่มีอยู่"** ความลับที่ถูกลบออกจากไฟล์แล้วยังอยู่ในประวัติ git และโค้ดที่คุณอ่านในเครื่องยังไม่ใช่โค้ดที่รันบนเซิร์ฟเวอร์ ทั้งสองกรณีคือช่องว่างระหว่าง *สิ่งที่คุณเห็น* กับ *สิ่งที่มีอยู่จริง* และช่องว่างนี้คือที่อยู่ของเหตุการณ์ใหญ่ ๆ ในรอบสิบปีที่ผ่านมา

คำสามคำที่ต้องแยกให้ชัดตั้งแต่ต้น:

- **secret** (ความลับ) คือค่าที่ให้สิทธิ์เมื่อรู้ — รหัสผ่าน, API key, private key, token, ใบรับรอง · ไม่ใช่ "ข้อมูลลับ" ทั่วไป แต่คือ *ข้อมูลที่ใช้ยืนยันตัวตนได้*
- **credential** (ข้อมูลรับรอง) คือสิ่งที่ระบบใช้ตัดสินว่า "คุณคือใคร" — secret เป็นส่วนหนึ่งของ credential แต่ credential มีความหมายกว้างกว่า (เช่น username + secret)
- **provenance** (ที่มา) คือหลักฐานว่าของชิ้นหนึ่ง *ใครสร้าง จากอะไร ด้วยเครื่องมืออะไร* — ต่างจาก **integrity** (ความถูกต้องของเนื้อ) ที่บอกแค่ว่า "ไม่ถูกแก้ระหว่างทาง"

และประโยคที่ผมอยากให้จำไว้ก่อนอ่านต่อ: **การหมุน (rotate) ความลับช่วยได้เสมอ แต่การลบความลับออกจากประวัติช่วยได้ครั้งเดียวคือเมื่อยังไม่มีใครเห็น** ถ้าเคย push ขึ้น remote สาธารณะแล้ว ให้ถือว่ามันรั่ว — ต่อให้ลบ commit ทิ้งในนาทีถัดมา

ตัวย่อที่ใช้ทั้งบท: **SBOM** (software bill of materials — บัญชีส่วนประกอบของซอฟต์แวร์), **MVS** (minimal version selection — วิธีเลือกเวอร์ชันของ Go: แต่ละข้อกำหนดใน `go.mod` คือ *ขั้นต่ำ* และการเลือกค่ามากสุดของขั้นต่ำทั้งหลายคือเวอร์ชันต่ำสุดที่ทุกข้อกำหนดพอใจ จึงเรียกว่า minimal), **transitive** (dependency ของ dependency — ของที่ไม่ได้อยู่ใน `go.mod` ของเราแต่ถูกดึงมาเพราะ dependency ของเราขอ), **attestation** (เอกสารรับรองที่ผูก artifact เข้ากับผู้สร้างและซอร์ส), **MAC** (message authentication code — ค่าตรวจสอบความถูกต้องที่ใช้คีย์ลับ), **typosquat** (การเผยแพร่แพ็กเกจชื่อคล้ายของจริงเพื่อให้คนพิมพ์ผิดแล้วติดตั้งตัวปลอม) — และอีกสองคำที่เหลือของบทนี้: **revision** (1 revision = 1 commit) กับ **snapshot** (เนื้อไฟล์ ณ commit นั้น)

ห้ากลุ่มตัวเลขของคืนนี้ (ทุกตัวมาจาก `out/`):

- **เดโม 1 — secret scanning บนประวัติ** · **6 commit** · ตรวจได้ **11 รายการ** (ต้องแก้ **5** · allowlist **6** — allowlist คือรายการที่อนุญาต: ค่าที่ทีมรู้อยู่แล้วว่าเป็นตัวอย่างหรือ fixture จึงไม่ต้องแก้) · ความลับตัวเดียวกันยังอยู่ **1 revision** ใน snapshot แต่ **2 revision** ใน diff · `.gitignore` ถูกเพิ่มที่ commit 2 และลบประวัติไม่ได้ (`gitignore_removes_history=0`)
- **เดโม 2 — ความลับสามแหล่ง** · **3 แหล่ง** · ไฟล์ mode 0644 ถูกประตูปฏิเสธตอนบูต (**1**) · โปรเซสลูกที่รันได้เห็นค่าใน env (**1**) · envelope (โครงที่ห่อความลับพร้อม metadata + MAC ที่เปิดด้วยคีย์หลัก) ตรวจ MAC ผ่าน แต่ทนการแก้ไบต์เดียวไม่ได้ (**tamper_rejected=1**) · envelope เดียวกันที่เขียนไว้ mode 0644 ก็ถูกประตูปฏิเสธ (**1 เคส**)
- **เดโม 3 — SBOM + ตัวตนของ artifact** · **10 component** (**4 direct** + **6 transitive**) · ขาด hash **0** · ไม่มี license **1** · typosquat **1** ตัว (ระยะแก้ไข **1** ตัวอักษร) · artifact ที่ deploy มี **4 ไฟล์** ขณะที่ build มี **3 ไฟล์** → digest (ลายนิ้วมือของไฟล์ = ค่า hash ของเนื้อไฟล์ เปลี่ยนไบต์เดียวค่าเปลี่ยน) ไม่ตรง (`artifact_match=0`)
- **เดโม 4 — ลายเซ็น** · **2 commit** · ลายเซ็น ed25519 (อัลกอริทึมลายเซ็นดิจิทัลแบบคีย์คู่ — ผู้เซ็นถือ private key ผู้ตรวจถือ public key เท่านั้น) **64 ไบต์** ตรวจผ่าน **1** · ลายเซ็นที่ครอบแค่ชื่อ tag ยอมรับการสลับ commit (**1 เคส**) ขณะที่ลายเซ็นที่ครอบเนื้อ commit ปฏิเสธ (**1 เคส**) · HMAC ที่คีย์อยู่กับผู้ตรวจ ปลอมลายเซ็นได้เอง (**1 เคส**)
- **เดโม 5 — pinning** (ระบุเวอร์ชันตายตัวแทนการปล่อยช่วง) · **6 โมดูล** ที่ถูกเลือก · MVS ดัน mux จาก **v1.2.0** เป็น **v1.4.0** โดยเราไม่ได้แก้โค้ด (**1** ขั้น) · ช่วงเวอร์ชันให้ผลต่างกันระหว่างสอง index (**1**) ขณะที่การปักหมุดให้ผลต่าง **0**

## 1. แนวคิด: ความลับมีอายุ และ artifact มีที่มา

### 1.1 ความลับสี่คำถาม — ก่อนจะถามว่า "เก็บที่ไหน"

คนมักเริ่มจากเครื่องมือ ("จะใช้ Vault (เครื่องมือเก็บความลับกลาง) ดีไหม") ซึ่งเป็นคำถามที่ผิดลำดับ เพราะเครื่องมือเป็นคำตอบของข้อจำกัด ไม่ใช่ตัวปัญหา ผมใช้สี่คำถามนี้ตัดสินทุกครั้ง:

1. **ใครอ่านได้** — ใครก็ตามที่อ่านไฟล์ได้ ก็ได้สิทธิ์นั้นทันที · ไฟล์ mode 0644 บนเครื่องที่มีผู้ใช้หลายคนจึงไม่ใช่ "ที่เก็บ" แต่คือ "การประกาศ"
2. **อยู่นานแค่ไหน** — ความลับที่อายุสั้น (lease — สิทธิ์ใช้งานชั่วคราวที่มีวันหมดอายุเอง แล้วต้องขอใหม่) รั่วแล้วเสียหายน้อยกว่าความลับที่อายุเป็นปีโดยธรรมชาติ · นี่คือเหตุผลที่ระบบใหญ่หันไปใช้ credential ชั่วคราว
3. **ตรวจอะไรได้ตอนใช้** — ความลับที่ตรวจ MAC ได้จะบอกคุณว่า "ค่านี้ถูกแก้" ส่วนความลับที่เป็นสตริงเปล่า ๆ บอกได้แค่ว่า "มีค่า"
4. **รู้ตัวเมื่อไรว่ารั่ว** — ถ้าไม่มีทางรู้ ก็ต้องหมุนตามกำหนดเวลา ไม่ใช่หมุนเมื่อมีเหตุ

ข้อ 4 คือข้อที่คนออกแบบระบบมักข้าม และเป็นข้อที่ทำให้เหตุการณ์เล็กกลายเป็นเหตุการณ์ใหญ่ เพราะช่วงเวลาระหว่าง "รั่ว" กับ "รู้ว่ารั่ว" คือช่วงที่ผู้โจมตีใช้ประโยชน์ได้เต็มที่

### 1.2 ทำไม git เก็บทุกอย่าง และทำไม `.gitignore` ไม่ใช่การลบ

git เก็บข้อมูลเป็น **object** สี่ชนิด (blob = เนื้อไฟล์, tree = รายชื่อไฟล์ในโฟลเดอร์, commit = ตัวชี้ไป tree + parent + ข้อความ, tag) และแต่ละ object ถูกระบุด้วย hash ของเนื้อตัวเอง · เมื่อคุณ `git rm` ไฟล์ สิ่งที่เกิดขึ้นคือ commit ใหม่มี tree ที่ไม่มีไฟล์นั้น — แต่ commit เก่ายังชี้ไปยัง blob เดิม และ blob เดิมยังอยู่ใน object database

พูดอีกแบบ: **`.gitignore` เป็นกฎของอนาคต ไม่ใช่คำสั่งลบอดีต** มันบอก git ว่า "อย่าเก็บไฟล์นี้ใน commit หน้า" แต่ไม่แตะ commit ที่มีอยู่แล้ว

และมีชั้นที่สองที่คนมักลืม: **diff ของการลบก็เก็บเนื้อไว้** เมื่อคุณลบไฟล์ git เก็บ patch ที่มีบรรทัดขึ้นต้นด้วย `-` ซึ่งมีค่าความลับนั้นอยู่ · ดังนั้นการสแกนประวัติต้องดูทั้ง snapshot และ diff — เดโม 1 วัดความต่างนี้ไว้ตรง ๆ: snapshot เห็น **1 revision** แต่ diff เห็น **2 revision**

![ความลับที่ถูกลบยังอยู่ในประวัติ: snapshot 1 revision กับ diff 2 revision และสามแหล่งที่เก็บความลับซึ่งมีอายุต่างกัน](/assets/diagrams/ep29-01-secret-history.svg)

*ภาพที่ 1 — หก commit ที่จำลองขึ้น: commit 1 พาความลับเข้า repo, commit 2 ลบไฟล์และเพิ่ม `.gitignore` แต่ทั้ง snapshot ของ commit 1 และบรรทัดที่ถูกลบใน diff ของ commit 2 ยังมีความลับอยู่ · ตัวเลขทุกตัวบนการ์ดอ่านจาก `out/01` และ `out/02`*

ผลที่ตามมาจึงเป็นลำดับงานที่ตายตัว: **สแกน → หมุน → แล้วจึงเขียนประวัติใหม่** ถ้าเขียนประวัติใหม่ก่อนหมุน คุณจะเสียเวลาทั้งวันไปกับการ force-push (เขียนทับประวัติบน remote ด้วยประวัติใหม่) และความลับก็ยังใช้ได้อยู่ เพราะสำเนาที่คนอื่น clone ไปแล้วไม่หายไปด้วย

### 1.3 Supply chain: สี่ข้อต่อที่ความเชื่อถูกส่งต่อ

ตอนที่ 8 เราดู Log4Shell และ SolarWinds ในฐานะ *เหตุการณ์* — คืนนี้เราดูมันในฐานะ *จุดที่ต้องมีด่าน* ห่วงโซ่ที่ผมใช้ในบทนี้มีสี่ข้อต่อ:

1. **source** — commit ที่นักพัฒนาเขียน · ของที่ต้องตรวจ: ลายเซ็นของ commit, ว่า commit นี้อยู่ใน branch ที่ได้รับอนุมัติ
2. **build** — กระบวนการที่เปลี่ยนซอร์สเป็น artifact · ของที่ต้องตรวจ: ซอร์สที่ build คือ commit ที่เซ็นจริงไหม, build input มีอะไรบ้าง
3. **artifact** — ไฟล์ที่ออกมา (binary, image, หรือ tarball ซึ่งเป็นไฟล์บีบอัด .tar/.tar.gz ที่เผยแพร่เป็นของจริงให้ดาวน์โหลด) · ของที่ต้องตรวจ: digest ของเนื้อไฟล์, SBOM ที่ผูกกับ digest นั้น
4. **deploy** — ของที่รันจริงบนเครื่อง · ของที่ต้องตรวจ: digest ที่รันเท่ากับ digest ที่ build ไหม, มี component เกินมาไหม

ความเชื่อถูกส่งต่อในทุกข้อต่อ และนี่คือคำจำกัดความของ supply chain attack: **คุณไม่ได้ถูกเจาะที่ระบบของคุณ แต่ถูกเจาะที่ของที่คุณเชื่อ**. SolarWinds ถูกแก้ที่ build system จึงได้ artifact ที่ *เซ็นถูกต้อง* ออกมา — ลายเซ็นไม่ได้โกหก มันแค่รับรองของที่ถูกแก้แล้ว · xz-utils (CVE-2024-3094, มีนาคม 2024) ถูกแก้ที่ tarball ซึ่งไม่ตรงกับ git repository ที่คนช่วยกันอ่าน · Codecov (2021) ถูกแก้ที่ *สคริปต์ที่ CI ดาวน์โหลดมารัน* ซึ่งดึงค่าจาก environment ของ CI ออกไป

บทเรียนร่วมของทั้งสามเรื่อง: **ทุกข้อต่อที่คุณตรวจไม่ถึง จะกลายเป็นข้อต่อที่คนอื่นตัดสินแทนคุณ**

### 1.4 SBOM และ attestation: สองเอกสารที่คนละคำถาม

SBOM ตอบคำถาม "ในของชิ้นนี้มีอะไรบ้าง" — ชื่อ, เวอร์ชัน, hash, สัญญาอนุญาต, และความสัมพันธ์ระหว่าง component · มาตรฐานที่ใช้กันจริงมีสองตระกูล: **SPDX** (3.0, เมษายน 2024; รุ่นก่อนหน้าเป็น ISO/IEC 5962:2021) และ **CycloneDX** (1.7, ตุลาคม 2025; v1.6 ได้เป็น ECMA-424 และ 1.7 เป็น ECMA-424 ฉบับที่ 2 เมื่อธันวาคม 2025) — ทั้งคู่ตอบคำถามเดียวกันด้วยโครงต่างกัน และการเลือกใช้ไม่สำคัญเท่าการที่ SBOM ต้องมี **hash** กับ **version** ครบ เพราะ SBOM ที่ไม่มีสองอย่างนี้ตอบคำถามตอนเกิดเหตุไม่ได้

attestation ตอบคำถามอีกข้อ: "ของชิ้นนี้ถูกสร้างโดยใคร จากซอร์สไหน" — มาตรฐานที่ใช้คือ **in-toto** (รูปแบบเอกสารที่เรียกว่า statement — ระบุ "ของชิ้นไหน" กับ "ใครสร้างจากอะไร") และ **SLSA** (กรอบระดับความเชื่อถือของ build; v1.0 19 เมษายน 2023 → v1.1 21 เมษายน 2025 → v1.2 24 พฤศจิกายน 2025 ที่เพิ่ม Source Track เข้ามาคุมฝั่งการเขียนและรีวิวโค้ด)

ความต่างที่ต้องเข้าใจ: **SBOM ที่ไม่มีลายเซ็นคือคำกล่าวอ้าง และ SBOM ที่มีลายเซ็นคือหลักฐาน** เพราะการใส่ชื่อ component ลง JSON ทำได้โดยใครก็ได้ — สิ่งที่ทำให้มันน่าเชื่อคือการที่ digest ใน SBOM ถูกเซ็นพร้อมกับข้อมูลผู้สร้าง

## 2. ทำไมเรื่องนี้สำคัญ: สี่เหตุการณ์ที่ราคาแพงกว่าที่คิด

### 2.1 Uber 2016: credential ใน private repository

ปี 2016 ผู้โจมตีเข้าถึงระบบของ Uber ผ่าน **credential ของระบบคลาวด์ที่ถูกเก็บไว้ใน private repository บน GitHub** — ไม่ใช่ repo สาธารณะ และไม่ได้ถูกค้นเจอด้วยการกวาดทั้งเน็ต แต่เป็นการเข้าถึง repo นั้น · ข้อมูลของผู้ใช้และคนขับราว **57 ล้านคน** ถูกดาวน์โหลดออกไป · และส่วนที่แพงที่สุดไม่ใช่ตัวเหตุการณ์ แต่คือการที่บริษัทปกปิดมันไว้ จนต้องจ่ายค่าปรับ **148 ล้านดอลลาร์** ในปี 2018 ให้กับหน่วยงานของรัฐทั้ง 50 รัฐ

บทเรียนที่ผมอยากให้เห็น: **"private" ไม่ใช่ชั้นป้องกัน** มันคือการตั้งค่าสิทธิ์ของแพลตฟอร์ม ซึ่งป้องกันได้แค่คนที่ไม่มีสิทธิ์ใน repo — ไม่ได้ป้องกันคนที่ได้สิทธิ์มาแล้ว (บัญชีที่ถูกขโมย, token ของ CI ที่รั่ว, พนักงานที่ลาออกแล้วยังมีสิทธิ์) และ private repo ก็ถูก clone ลงเครื่องจำนวนมากโดยอัตโนมัติ

### 2.2 Codecov 2021: สคริปต์ที่ CI ดาวน์โหลดมารัน

มกราคมถึงเมษายน 2021 ผู้โจมตีแก้ **Bash Uploader** ของ Codecov — สคริปต์ที่ลูกค้าจำนวนมากเรียกใช้ใน CI ด้วยคำสั่ง `bash <(curl ...)` · สคริปต์ที่ถูกแก้จะอ่าน environment ของ CI แล้วส่งค่าที่น่าสนใจออกไปยังโดเมนภายนอก ก่อนจะทำงานปกติเพื่อไม่ให้ใครสงสัย

นี่คือเหตุการณ์ที่อธิบายว่า ทำไมคำถาม "เราเชื่อสคริปต์นี้ไหม" จึงต้องตอบด้วย **hash หรือลายเซ็น** ไม่ใช่ด้วยชื่อโดเมน · และเป็นเหตุผลที่ CI สมัยใหม่ผูก action/plugin ด้วย digest ไม่ใช่ tag

### 2.3 SolarWinds 2020 และ xz-utils 2024: artifact ที่ถูกต้องตามลายเซ็น

ทั้งสองกรณีคือคำตอบของคำถาม "เซ็นแล้วปลอดภัยไหม" — **ไม่** ถ้าสิ่งที่ถูกเซ็นคือของที่ถูกแก้ไปแล้ว · SolarWinds: ผู้โจมตีแก้ build system จึงได้ binary ที่เซ็นด้วยคีย์จริง · xz-utils: ผู้โจมตีแก้ tarball ที่เผยแพร่ ซึ่งมีไฟล์ที่ไม่ตรงกับ git repository (ดูตอนที่ 8 สำหรับรายละเอียดของ SolarWinds)

สิ่งที่ทั้งสองกรณีบอกเหมือนกัน: **ลายเซ็นพิสูจน์ว่า "ใครเซ็น" ไม่ได้พิสูจน์ว่า "สร้างจากอะไร"** การจะตอบข้อหลังได้ต้องมี attestation ที่ผูก artifact กับ commit และ build input

### 2.4 dependency confusion 2021: ชื่อที่พิมพ์ผิดหนึ่งตัวอักษร

กุมภาพันธ์ 2021 นักวิจัยคนหนึ่ง (Alex Birsan) เผยแพร่แพ็กเกจชื่อเดียวกับ dependency ภายในของบริษัทใหญ่หลายแห่งขึ้น registry สาธารณะ (คลังแพ็กเกจ เช่น npm, PyPI, Go module proxy) แล้วรอให้ระบบ build ที่ค้นหาแพ็กเกจจาก registry สาธารณะ *ก่อน* registry ภายใน ดึงตัวปลอมไปใช้ · ผลคือได้สิทธิ์รันโค้ดใน build ของบริษัทราว 35 แห่ง และได้รางวัลรวมกว่าหนึ่งแสนดอลลาร์จากหลายบริษัท

เดโม 3 ของคืนนี้จำลองด้านที่เล็กที่สุดของเรื่องนี้: ชื่อที่ต่างกัน **1 ตัวอักษร** (`gorila` กับ `gorilla`) หลุดเข้ามาใน dependency และ SBOM ที่ตรวจด้วย allowlist จับได้เพราะระยะแก้ไขเป็น 1 — ไม่ใช่เพราะมีรายชื่อดำ

## 3. ลงมือทำ: ห้าเดโมที่วัดได้ทุกก้าว

### 3.1 โครงของ repo

```text
code/ep29/
├── internal/leakscan/     กฎจับความลับ + เดินประวัติสองชั้น (tree/diff)
├── internal/secretkit/    envelope + MAC + lease + generation + ประตูตอนบูต
├── internal/sbom/         SBOM แบบย่อ, allowlist, typosquat, digest ของ artifact
├── internal/attest/       ed25519, HMAC, statement (subject + builder + source)
├── internal/pin/          parser ของ go.mod, MVS, ช่วงเวอร์ชัน, ตรวจ go.sum
├── cmd/leakscan/          เดโม 1: สแกนประวัติที่จำลองขึ้น (ห้ามใช้จริง)
├── cmd/secretstore/       เดโม 2: ความลับสามแหล่ง + ประตู (ห้ามใช้จริง)
├── cmd/sbom/              เดโม 3: SBOM + ตัวตนของ artifact
├── cmd/attest/            เดโม 4: ลายเซ็น commit/artifact
├── cmd/pin/               เดโม 5: pinning + MVS
└── run_all.sh             รันทุกอย่างแล้วเก็บผลลง out/
```

ทั้ง repo มี 15 ไฟล์ Go และ 29 เทสต์ ไม่มี dependency ภายนอก (`external_deps=0`) ไม่มีพอร์ต (`listen_calls=0`) และไม่มี `time.Now()` ในเส้นทางที่พิมพ์ผล (`time_now_calls=0`) — เพราะเดโมที่ต้องพึ่งบริการภายนอกหรือเวลาจริงจะรันซ้ำบนเครื่องอื่นไม่ได้ และตัวเลขในบทความก็จะเชื่อถือไม่ได้

มีจุดหนึ่งที่ผมอยากชี้ล่วงหน้าเพราะคนอ่านมักถาม: เดโม 2 มีการเรียกโปรเซสลูกหนึ่งครั้ง (`child_process_calls=1`) เพื่อ *วัด* ว่า environment variable รั่วไปถึงโปรเซสลูกจริงไหม — ไม่ใช่การต่อเครือข่าย และไม่ใช่การเรียกเครื่องมือภายนอก

### 3.2 เดโม 1: การลบไฟล์ไม่ได้ลบประวัติ

เดโมนี้จำลองประวัติ git ที่มีความลับถูก commit ลงไปจริง — เป็นสถานการณ์ที่ **ห้ามใช้จริง** กับ repository ของใคร และค่าทุกค่าในไฟล์เป็นค่าปลอม

ตัวแทนของประวัติคือ `Change` หนึ่งครั้ง และ method ที่ทำให้เห็นปัญหาคือ `Patch` — มันสร้าง diff แบบเดียวกับที่ git เก็บ:

```go
// Patch แสดง diff ของ change นี้ในรูปแบบที่ git เก็บ (แบบย่อ ไม่มี context)
// สำคัญต่อเดโม: บรรทัดที่ถูกลบยังปรากฏเป็นข้อความ "-..." ในประวัติ
func (c Change) Patch() string {
	var b strings.Builder
	fmt.Fprintf(&b, "diff --git a/%s b/%s\n", c.Path, c.Path)
	switch c.Op {
	case "add":
		lines := strings.Split(c.Content, "\n")
		b.WriteString("new file mode 100644\n--- /dev/null\n")
		fmt.Fprintf(&b, "+++ b/%s\n@@ -0,0 +1,%d @@\n", c.Path, len(lines))
		for _, ln := range lines {
			b.WriteString("+" + ln + "\n")
		}
	case "del":
		lines := strings.Split(c.Content, "\n")
		b.WriteString("deleted file mode 100644\n")
		fmt.Fprintf(&b, "--- a/%s\n+++ /dev/null\n@@ -1,%d +0,0 @@\n", c.Path, len(lines))
		for _, ln := range lines {
			b.WriteString("-" + ln + "\n")
		}
	case "mod":
		oldLines := strings.Split(c.Old, "\n")
		newLines := strings.Split(c.Content, "\n")
		fmt.Fprintf(&b, "--- a/%s\n+++ b/%s\n@@ -1,%d +1,%d @@\n", c.Path, c.Path, len(oldLines), len(newLines))
		for _, ln := range oldLines {
			b.WriteString("-" + ln + "\n")
		}
		for _, ln := range newLines {
			b.WriteString("+" + ln + "\n")
		}
	}
	return b.String()
}
```

อ่าน diff สี่ส่วนให้ครบก่อนไปต่อ เพราะทั้งสี่ส่วนคือสิ่งที่สแกนเนอร์ต้องเข้าใจ:

- `@@ -0,0 +1,%d @@` คือ **hunk header** — `-0,0` แปลว่าไฟล์เดิมไม่มีบรรทัด (ไฟล์ใหม่เอี่ยม) และ `+1,%d` แปลว่าไฟล์ใหม่เริ่มที่บรรทัด 1 มี `%d` บรรทัด ตัวเลขนี้ต้องคำนวณจาก `len(lines)` ไม่ใช่พิมพ์ค่าคงที่ ไม่งั้น patch ที่สร้างออกมาจะชี้ผิดบรรทัด
- `--- /dev/null` แปลว่าฝั่งเดิมไม่มีไฟล์ (กรณี add) ขณะที่ `+++ /dev/null` คือกรณี del และ `deleted file mode 100644` บอกว่า commit นี้ลบทั้งไฟล์ ไม่ใช่แก้บรรทัด — ทั้งสามส่วนนี้คือ "metadata ของการเปลี่ยน" ที่บอกคนอ่านว่า hunk ต่อไปควรตีความอย่างไร
- เนื้อแต่ละบรรทัดขึ้นต้นด้วย `+` (เพิ่ม) `-` (ลบ) หรือเว้นวรรค (ไม่เปลี่ยน) — เครื่องหมายเป็นส่วนหนึ่งของ patch ไม่ใช่ส่วนหนึ่งของไฟล์
- และเพราะบรรทัด `-` ยังถูกเก็บเป็นข้อความใน object ของ commit นั้น การลบไฟล์จึงไม่ได้ลบเนื้อออกจากประวัติ: สแกนเนอร์ที่อ่านแค่ snapshot จะไม่เห็นบรรทัดนี้เลย ซึ่งคือเหตุผลทั้งหมดที่ต้องสแกนสองชั้น

การสแกนจึงต้องเดินสองชั้น ชั้นแรกคือ snapshot สะสม (apply change ทุกตัวแล้วอ่านเนื้อไฟล์) ชั้นที่สองคือ diff ของแต่ละ commit:

```go
// Analyze เดินทั้งประวัติ: snapshot (tree) และ patch (diff) แยกกัน
func Analyze(commits []Commit, needle string) Report {
	r := Report{Commits: len(commits), ByRule: map[string]int{}}
	tree := map[string]string{}
	paths := map[string]bool{}
	seen := map[string]bool{}

	for _, c := range commits {
		// นับ diff ของ commit นี้ครั้งเดียว แม้ commit จะแตะหลายไฟล์ที่มีค่าความลับ
		// (revision = commit · ถ้านับต่อ change ตัวเลขจะพองจนเทียบกับ snapshot ไม่ได้)
		diffCounted := false
		for _, ch := range c.Changes {
			paths[ch.Path] = true
			switch ch.Op {
			case "add", "mod":
				tree[ch.Path] = ch.Content
			case "del":
				delete(tree, ch.Path)
			}
			for _, f := range ScanText(c.Seq, ch.Path, ch.Patch()) {
				key := fmt.Sprintf("%d|%s|%s|%s", f.Commit, f.Path, f.Rule, f.Value)
				if seen[key] {
					continue
				}
				seen[key] = true
				r.Findings = append(r.Findings, f)
			}
			if !diffCounted && strings.Contains(ch.Patch(), needle) {
				r.NeedleDiffRevisions++
				diffCounted = true
			}
			if c.Seq == 1 || r.NeedleFirstCommit == 0 {
				if strings.Contains(ch.Content, needle) {
					r.NeedleFirstCommit = c.Seq
				}
			}
		}
		// snapshot หลัง apply change ทั้งหมดของ commit นี้
		for _, content := range tree {
			if strings.Contains(content, needle) {
				r.NeedleTreeRevisions++
				break
			}
		}
		if c.Subject != "" && strings.Contains(c.Subject, "gitignore") {
			r.IgnoreCommit = c.Seq
		}
	}

	r.Paths = len(paths)
	for _, f := range r.Findings {
		r.ByRule[f.Rule]++
		if f.Known {
			r.Allowlisted++
		} else {
			r.Actionable++
		}
	}
	sort.Slice(r.Findings, func(i, j int) bool {
		if r.Findings[i].Commit != r.Findings[j].Commit {
			return r.Findings[i].Commit < r.Findings[j].Commit
		}
		return r.Findings[i].Rule < r.Findings[j].Rule
	})
	return r
}
```

โค้ดนี้สั้น แต่มีห้าจุดที่ต้องอ่านให้ออก:

1. `tree[ch.Path] = ch.Content` เก็บสถานะของไฟล์หลัง apply change ทุกตัวของ commit นั้น — `tree` จึงเป็น snapshot สะสม ไม่ใช่เนื้อของ change เดี่ยว ๆ · `del` ลบ key ออก แปลว่าไฟล์หายจาก snapshot ตั้งแต่ commit นั้นเป็นต้นไป
2. `seen[key]` กันการรายงานซ้ำด้วยกุญแจ `commit|path|rule|value` — ความลับค่าเดียวที่โผล่ทั้ง snapshot และ diff ของ commit เดียวกันจะถูกรายงานครั้งเดียว แต่ยังถูกนับเป็น revision ในทั้งสองชั้น เพราะสองตัวนับนั้นตอบคำถามคนละข้อ ("ยังอยู่ในไฟล์ไหม" กับ "ยังอยู่ใน patch ไหม")
3. `break` ในลูป snapshot ถามว่า "commit นี้ยังเห็นความลับไหม" ไม่ใช่ "เห็นกี่ไฟล์" — `NeedleTreeRevisions` จึงเป็นจำนวน commit ไม่ใช่จำนวนไฟล์
4. `if c.Seq == 1 || r.NeedleFirstCommit == 0` บันทึก commit แรกที่พบครั้งเดียว (และบังคับให้ commit 1 ถูกตรวจเสมอ) — ตัวเลขนี้ตอบ "ความลับเข้ามาตั้งแต่เมื่อไร" ซึ่งเป็นคำถามที่ audit log ตอบไม่ได้ถ้าไม่มีการสแกนประวัติ
5. `NeedleDiffRevisions` นับครั้งเดียวต่อ commit (ธง `diffCounted`) แม้ commit เดียวจะแตะหลายไฟล์ที่มีความลับ — เพราะ revision หมายถึง commit ถ้านับต่อไฟล์ ตัวเลขจะพองจนเทียบกับ snapshot ไม่ได้

ผลรันทั้งไฟล์ (ค่าถูกปิดด้วย `***` — การพิมพ์ซ้ำคือการทำผิดซ้ำ):

```
# เดโม 1: secret scanning บนประวัติ git ที่จำลองขึ้น — ไม่มี repo จริง ไม่มีการต่อเครือข่าย
commits=6
paths_touched=5
findings_total=11
findings_actionable=5
findings_allowlisted=6
rule_private_key=1
rule_aws_access_key=3
rule_github_token=2
rule_token_assign=3
rule_high_entropy=2
secret_in_tree_revisions=1
secret_in_diff_revisions=2
secret_first_commit=1
gitignore_added_in_commit=2
gitignore_removes_history=0
rotate_required=1

# ผลจับได้ — ค่าถูกปิดด้วย *** เพราะการพิมพ์ซ้ำคือการทำผิดซ้ำ
c   path                           rule             masked       verdict
c1  deploy/config.yaml             token_assign     CANARY***    ACTION
c2  deploy/config.yaml             token_assign     CANARY***    ACTION
c3  .github/workflows/ci.yml       aws_access_key   AKIAIO***    allow
c3  .github/workflows/ci.yml       github_token     ghp_Q2***    ACTION
c3  .github/workflows/ci.yml       high_entropy     wJalrX***    allow
c4  .github/workflows/ci.yml       aws_access_key   AKIAIO***    allow
c4  .github/workflows/ci.yml       github_token     ghp_Q2***    ACTION
c4  .github/workflows/ci.yml       high_entropy     wJalrX***    allow
c5  deploy/tls/local.key           private_key      -----BEGIN*** ACTION
c6  testdata/fixture_key.txt       aws_access_key   AKIAIO***    allow
c6  testdata/fixture_key.txt       token_assign     fixtur***    allow

# diff ของ commit 2 (ลบไฟล์) — บรรทัดที่ถูกลบยังอยู่ในประวัติ
diff --git a/deploy/config.yaml b/deploy/config.yaml
deleted file mode 100644
--- a/deploy/config.yaml
+++ /dev/null
@@ -1,4 +0,0 @@
-db:
-  host: db.internal
-  user: payments
-  password: "CANARY***"
```

อ่านสี่บรรทัดให้ดี: `secret_in_tree_revisions=1` กับ `secret_in_diff_revisions=2` คือหัวใจของเรื่องนี้ — **ความลับตัวเดียวอยู่ 1 ที่ใน snapshot และ 2 ที่ใน diff** เพราะ diff ของ commit ที่ลบไฟล์มีบรรทัด `-  password: "CANARY***"` อยู่ · และ `gitignore_added_in_commit=2` กับ `gitignore_removes_history=0` คือคำตอบว่าทำไมการเพิ่ม `.gitignore` ไม่ช่วยอะไรกับสิ่งที่ commit ไปแล้ว

อีกบรรทัดที่ควรอ่านคือ `findings_allowlisted=6`: ผลจับได้ 11 รายการ ไม่ได้หมายความว่ามีความลับ 11 ตัว — ในนั้นมีค่าตัวอย่างที่ AWS เผยแพร่เอง (`AKIA...EXAMPLE`) ซึ่งโผล่ทั้งใน diff ของ commit 3 และ commit 4 และในไฟล์ fixture ที่ `testdata/` · **ตัวเลขที่สำคัญจึงไม่ใช่ "จับได้กี่รายการ" แต่คือ "ต้องแก้กี่รายการ"** ซึ่งคือ 5

เหตุผลที่ต้องมี allowlist ไม่ใช่แค่ "ฟ้องให้หมด": เครื่องสแกนที่ฟ้องค่าตัวอย่างทุกครั้งจะถูกปิดภายในสองสัปดาห์ และเมื่อถูกปิด มันก็ไม่จับของจริงเลย · ผมเลือกเดินทางกลาง: กฎจับให้กว้าง (5 กฎ รวม entropy — entropy คือการวัดความสุ่มของสตริง: ค่าสุ่มยาว ๆ ดูไม่เหมือนคำธรรมดา) แล้วตัดสินด้วย allowlist ที่มีสองชั้นคือ **ค่าที่รู้ว่าเป็นตัวอย่าง** และ **path ที่ทีมตกลงว่าเป็น fixture**

### 3.3 เดโม 2: ความลับหนึ่งค่า สามแหล่ง และประตูที่ปฏิเสธตอนบูต

เดโมนี้จงใจสร้างแหล่งความลับที่ไม่ปลอดภัย (ไฟล์ 0644) เพื่อวัดว่าประตูจับได้หรือไม่ — **ห้ามใช้จริง** และคีย์หลักในเดโมเป็นสตริงคงที่ ซึ่งเป็นสิ่งที่ของจริงห้ามทำ — ผลรันวัดข้อนี้ไว้ด้วย `demo_master_key_is_const=1` (สคริปต์อ่านซอร์สของตัวเองแล้วเจอคีย์เป็นค่าคงที่ในไฟล์ ไม่ใช่ค่าที่ดึงจากที่เก็บคีย์)

envelope คือโครงที่ผมใช้บ่อยที่สุดในงานจริง เพราะมันเล็กพอจะอธิบายได้หมดในหน้าหนึ่ง และมากพอจะตอบสี่คำถามในหัวข้อ 1.1 ได้ — ฟิลด์ `Gen` ในนั้นคือ generation (เลขรุ่นของความลับ ใช้ตรวจว่ามีคนย้อนไปใช้รุ่นเก่า) · หัวใจคือ **ไบต์ที่ถูกเซ็นต้องเรียงฟิลด์ตายตัว** ไม่พึ่งลำดับของ map หรือ struct ที่อาจสลับได้:

```go
// canon คือไบต์ที่ถูกเซ็น — ต้องเรียงฟิลด์ตายตัว ไม่พึ่ง json.Marshal
// (ถ้าพึ่ง map หรือ struct ที่สลับฟิลด์ได้ ลายเซ็นจะไม่ตรงกันข้ามเครื่อง)
func canon(e Envelope) []byte {
	return []byte(fmt.Sprintf("v%d|%s|g%d|%s|ttl%d|%s", e.V, e.ID, e.Gen, e.Issued, e.TTL, e.Secret))
}

// Seal ห่อความลับด้วย MAC จากคีย์หลัก (คีย์หลักไม่ถูกเก็บใน envelope)
func Seal(master []byte, e Envelope) ([]byte, error) {
	e.V = 1
	m := hmac.New(sha256.New, master)
	m.Write(canon(e))
	e.Mac = hex.EncodeToString(m.Sum(nil))
	return json.Marshal(e)
}
```

ฝั่งที่เปิดใช้ต้องตรวจ **MAC ก่อน** แล้วจึงตรวจ generation และ lease · แต่เหตุผลไม่ใช่ "ถ้าตรวจ `Gen` ก่อน ผู้โจมตีจะแก้ `Gen` เป็นเลขสูงแล้วผ่านประตูได้" เพราะ `canon()` มี `Gen` อยู่ด้วย MAC จึงครอบมันไว้แล้ว · เหตุผลจริงมีสองข้อ: (1) **อย่าตัดสินใจด้วยฟิลด์ที่ยังไม่ผ่านการพิสูจน์** — ค่าที่ผู้โจมตีเขียนได้ต้องไม่ถูกใช้ตัดสินก่อนที่ลายเซ็นจะยืนยันว่าเนื้อนี้คือเนื้อที่ผู้ถือคีย์ออกให้จริง (2) **อย่าให้ error บอกใบ้ว่าด่านไหนผ่านแล้ว** — การคืน error ของชั้นถัดไปกับข้อมูลที่ยังไม่ผ่าน MAC คือการยืนยันให้ผู้โจมตีรู้ว่า MAC ตรง และรู้ว่าควรแก้ฟิลด์ไหนต่อ:

```go
// Open ตรวจ MAC ก่อน แล้วจึงตรวจ generation และ lease
// เหตุผลไม่ใช่ "ถ้าตรวจ Gen ก่อน ผู้โจมตีจะแก้ Gen ได้" เพราะ canon() มี Gen อยู่
// MAC จึงครอบมันอยู่แล้ว — เหตุผลจริงคือ: อย่าตัดสินใจด้วยฟิลด์ที่ยังไม่ผ่านการพิสูจน์
// และอย่าให้ error ของชั้นถัดไปบอกใบ้ว่าด่านไหนผ่านมาแล้ว
func Open(master, raw []byte, now time.Time, minGen int) (*Lease, error) {
	var e Envelope
	// ไม่คืน error ของ json ตรง ๆ เพราะข้อความนั้นมีเนื้อไฟล์ (ซึ่งคือความลับ) ติดมาด้วย
	if err := json.Unmarshal(raw, &e); err != nil {
		return nil, ErrMac
	}
	if e.V != 1 {
		return nil, ErrMac
	}
	m := hmac.New(sha256.New, master)
	m.Write(canon(e))
	want, err := hex.DecodeString(e.Mac)
	if err != nil {
		return nil, ErrMac
	}
	if !hmac.Equal(m.Sum(nil), want) {
		return nil, ErrMac
	}
	if e.Gen < minGen {
		return nil, ErrDowngrade
	}
	issued, err := time.Parse(time.RFC3339, e.Issued)
	if err != nil {
		return nil, ErrMac
	}
	expires := issued.Add(time.Duration(e.TTL) * time.Second)
	if !now.Before(expires) {
		return nil, ErrExpired
	}
	buf := []byte(e.Secret)
	return &Lease{Secret: string(buf), Gen: e.Gen, Expires: expires, buf: buf}, nil
}
```

และประตูตอนบูตก็สั้นกว่าเดิมมาก แต่ตัดสินแบบ **fail closed** (ไม่ผ่าน = ไม่เริ่ม) ไม่ใช่ fail open:

```go
// Check คืน error ถ้าแหล่งนี้ใช้ไม่ได้ — ไม่คืนข้อมูลความลับออกมา
func (g Gate) Check(s Source) error {
	switch s.Kind {
	case KindEnv:
		if !g.AllowEnv {
			return ErrInsecureSource
		}
		return nil
	case KindFile:
		// 0644 = เจ้าของเขียนได้ ที่เหลืออ่านได้ — ใช้กับความลับไม่ได้
		if s.Mode.Perm()&0o077 != 0 {
			return ErrInsecureSource
		}
		return nil
	case KindSealed:
		// MAC ให้ integrity ไม่ได้ให้ confidentiality — ไฟล์ที่คนอื่นอ่านได้
		// จึงยังเป็นแหล่งที่ไม่ปลอดภัย แม้เนื้อจะผ่าน MAC ตอนเปิด
		if s.Mode.Perm()&0o077 != 0 || len(s.Payload) == 0 {
			return ErrInsecureSource
		}
		return nil
	default:
		return ErrInsecureSource
	}
}
```

ผลรัน:

```
# เดโม 2: ความลับหนึ่งค่า สามแหล่ง — environment, ไฟล์ 0644, envelope ที่ปิดผนึก
sources=3
source_env_child_process_sees=1
source_env_visible_in_environ=1
source_file0644_world_readable=1
source_file0644_group_readable=1
source_sealed_world_readable=0
gate_refused_file0644=1
gate_refused_sealed=0
gate_refused_sealed_world_readable=1
mac_verify_ok=1
tamper_rejected=1
expired_lease_rejected=1
downgrade_rejected=1
error_texts_contain_secret=0
zeroized_bytes=15
lease_ttl_seconds=900
secret_generation=3
demo_master_key_is_const=1

# วิธีตัดสินแต่ละแหล่ง
env         -> boot-only  (อายุ = โปรเซส) ทุกลูกที่รันได้เห็นค่า
file-0644   -> ปฏิเสธ     (อายุ = จนกว่าจะหมุน) บิต 0o004/0o040 เปิดให้คนอื่นอ่าน
sealed-0600 -> ผ่าน       (อายุ = 900 วินาที) MAC + generation + lease ตรวจทุกครั้งที่เปิด
sealed-0644 -> ปฏิเสธ     MAC ผ่านก็จริง แต่สิทธิ์อ่านของไฟล์ยังเปิดให้คนอื่น

# lease หมดอายุเมื่อ: 2026-11-07T00:15:00Z (issued + ttl)
```

สามบรรทัดที่ควรอ่านคู่กัน: `source_file0644_world_readable=1` (บิต 0o004 เปิดให้คนอื่นอ่าน), `gate_refused_file0644=1` (ประตูจับได้และไม่ยอมเริ่ม) และ `source_env_child_process_sees=1` (โปรเซสลูกรันได้ทุกตัวเห็นค่า) · ส่วน `tamper_rejected=1`, `expired_lease_rejected=1`, `downgrade_rejected=1` คือสามการโจมตีที่ envelope ตอบได้ครบ และ `error_texts_contain_secret=0` คือด่านที่คนมักลืม: **ข้อความ error ก็เป็นช่องทางรั่ว** · ส่วน `gate_refused_sealed_world_readable=1` คือจุดที่ผมแก้ระหว่างทาง: ประตูรุ่นแรกตรวจแค่ "payload ว่างไหม" ทำให้ envelope ที่เขียน mode 0644 ผ่านได้ทั้งที่ใครในเครื่องก็อ่านได้ — MAC ให้ **integrity** (รู้ว่าเนื้อถูกแก้) ไม่ได้ให้ **confidentiality** (กันคนอ่าน) สองอย่างนี้จึงต้องถูกตรวจแยกกันเสมอ

ผมต้องพูดตรง ๆ เรื่องหนึ่งที่หลายบทความข้าม: `zeroized_bytes=15` ไม่ได้หมายความว่าความลับหายจากหน่วยความจำจริง · ใน Go string เป็นค่าที่คัดลอกได้ตลอดและการล้างไบต์ไม่ได้ล้างสำเนาที่ GC ย้ายไปแล้ว · สิ่งที่ทำได้จริงคือ **ทำให้อายุสั้น** (lease 900 วินาทีในเดโม) และ **แยกโปรเซสที่ถือความลับ** ออกจากโปรเซสที่ให้บริการ — นี่คือเหตุผลที่ระบบใหญ่ใช้ sidecar (โปรเซสข้างเคียงที่ถือความลับแทนโปรเซสหลัก) หรือ helper process ไม่ใช่การพยายาม zeroize ในภาษาที่มี GC

### 3.4 เดโม 3: SBOM ที่ตอบคำถามได้ และ artifact ที่ไม่ตรงกับที่ build

ตัวตรวจ SBOM ที่ผมใช้มีการตัดสินสองแบบ: ตรวจความครบ (version + hash) และตรวจรายชื่อ (allowlist + ระยะใกล้เคียง) · ส่วนหลังนี้สำคัญเพราะการโจมตีที่พบบ่อยไม่ใช่ "แพ็กเกจแปลกหน้า" แต่คือ "แพ็กเกจชื่อคล้าย":

```go
// Verify ตรวจ SBOM เทียบกับ allowlist ของ module ที่ทีมอนุมัติ
func Verify(b BOM, allow []string) []Problem {
	var ps []Problem
	known := map[string]bool{}
	for _, a := range allow {
		known[a] = true
	}
	for _, c := range b.Components {
		if c.Version == "" || c.Hash == "" {
			ps = append(ps, Problem{Kind: "missing_hash", Component: c.Name,
				Detail: "ไม่มี version หรือ hash — ตอบคำถามตอนเกิดเหตุไม่ได้"})
		}
		if c.License == "" {
			ps = append(ps, Problem{Kind: "missing_license", Component: c.Name,
				Detail: "ไม่รู้สัญญาอนุญาต — ตรวจข้อผูกพันทางกฎหมายไม่ได้"})
		}
		if !known[c.Name] {
			kind, detail := "unknown_module", "ไม่อยู่ใน allowlist ของ module ที่อนุมัติ"
			if near, dist := Nearest(c.Name, allow); dist > 0 && dist <= 2 {
				kind = "typosquat"
				detail = fmt.Sprintf("คล้าย %s ต่างกัน %d ตัวอักษร", near, dist)
			}
			ps = append(ps, Problem{Kind: kind, Component: c.Name, Detail: detail})
		}
	}
	return ps
}
```

และตัววัดระยะที่ใช้จับ typosquat คือ Levenshtein — สั้นพอจะเขียนเองได้ และทำให้เราเลิกพึ่งรายชื่อดำ:

```go
// Levenshtein คือระยะแก้ไขขั้นต่ำระหว่างสองสตริง (เพิ่ม/ลบ/แทน อย่างละ 1)
func Levenshtein(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	prev := make([]int, len(rb)+1)
	cur := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			cur[j] = min3(cur[j-1]+1, prev[j]+1, prev[j-1]+cost)
		}
		prev, cur = cur, prev
	}
	return prev[len(rb)]
}
```

`Nearest(c.Name, allow)` วน allowlist แล้วเรียก `Levenshtein` ทุกตัว คืนชื่อที่ใกล้ที่สุดพร้อมระยะของมัน (ใช้ตัดสินว่าเป็น typosquat หรือเป็นของแปลกหน้าจริง) · `min3(a, b, c)` คือหาค่าน้อยสุดในสามค่า — บรรทัดที่ทำให้ Levenshtein เป็น O(len(a)·len(b)) แทนที่จะเป็น exponential

ผลรัน:

```
# เดโม 3: SBOM + ตัวตนของ artifact — ไม่ต่อเครือข่าย ไม่เรียก go command
components=10
direct=4
transitive=6
missing_hash=0
missing_license=1
unknown_modules=0
typosquat=1
typosquat_distance=1
sbom_digest=98e538b91cff92ff
artifact_files=3
deployed_files=4
artifact_match=0
reproducible_rebuild_match=1
deployed_components=11
unexpected_components=1
gate_allowed=0

# component สองตัวแรกของ SBOM (JSON ที่เอกสารนี้สร้างจริง)
[{"name":"github.com/go-chi/chi/v5","version":"v5.2.0","hash":"sha256:b4f841f5695c83754038618884c6f8f86b607f745a72a9b441c84e498cb7a226","license":"MIT","scope":"direct"},{"name":"github.com/google/uuid","version":"v1.6.0","hash":"sha256:d0d666767bf9063c153c1db881965da6f7d0e0520c57a34c15ba38f51547e2fa","license":"BSD-3-Clause","scope":"direct"}]

# ปัญหาที่ประตูจับได้
  typosquat        github.com/gorila/mux        คล้าย github.com/gorilla/mux ต่างกัน 1 ตัวอักษร
  missing_license  golang.org/x/sys             ไม่รู้สัญญาอนุญาต — ตรวจข้อผูกพันทางกฎหมายไม่ได้

# digest: build=727ee84a9fc526da deploy=3731a9a51e1527b8 rebuilt=727ee84a9fc526da
# component ที่อยู่ใน deploy แต่ไม่อยู่ใน build:
  github.com/evil-labs/telemetry v2.3.1
```

อ่านสี่ค่าคู่กัน: `components=10` (4 direct + 6 transitive — transitive คือ dependency ของ dependency ซึ่งเป็นที่ที่ typosquat ซ่อนตัวง่ายที่สุด), `typosquat=1` พร้อม `typosquat_distance=1`, `missing_license=1` และ `artifact_match=0`

ค่าสุดท้ายคือเรื่องใหญ่: digest ของ artifact ที่ build (`727ee84a9fc526da`) ไม่เท่ากับ digest ของสิ่งที่อยู่บนเครื่อง (`3731a9a51e1527b8`) เพราะมีไฟล์เกินมาหนึ่งไฟล์ และ SBOM ของเครื่องนั้นมี `deployed_components=11` คือเกินมา 1 component (`github.com/evil-labs/telemetry`) · นี่คือรูปแบบเดียวกับ SolarWinds ในขนาดจิ๋ว: **ทุกอย่างดูปกติ ยกเว้นตัวเลขสองตัวที่ไม่เท่ากัน**

ในทางกลับกัน `reproducible_rebuild_match=1` คือคุณสมบัติที่ทำให้การตรวจจับเป็นไปได้ — ถ้า build ซ้ำจากซอร์สเดิมไม่ได้ digest เดิม การเทียบ digest ก็ไม่มีความหมาย เพราะเราไม่มี "ค่าที่ควรเป็น"

แต่ digest ตอบได้แค่ "ของเหมือนกันไหม" — มันไม่ตอบว่า "ใครสร้างจากซอร์สไหน" · ของที่ digest ตรงกันยังมาจาก commit คนละตัวได้ และลายเซ็นที่ครอบแค่ digest ก็ไม่ได้ผูกกับ source เลย · ตรงนี้เองที่ต้องมีลายเซ็นและ attestation ซึ่งเป็นเรื่องของเดโมถัดไป

![ห่วงโซ่สี่ข้อต่อ: source, build, artifact, deploy พร้อมค่าที่วัดได้ในแต่ละข้อต่อ และสองกล่องว่า SBOM ตอบอะไรได้กับตอบอะไรไม่ได้](/assets/diagrams/ep29-02-supply-chain.svg)

*ภาพที่ 2 — สี่ข้อต่อและสิ่งที่ต้องตรวจในแต่ละข้อ: ลายเซ็นที่ source, SBOM ที่ build, digest ที่ artifact, และการเทียบ digest กับ component ที่ deploy · ตัวเลขทุกตัวมาจาก `out/03` และ `out/04`*

### 3.5 เดโม 4: ลายเซ็นพิสูจน์ได้เท่ากับสิ่งที่มันครอบ

เริ่มจากสิ่งที่ git ทำ: id ของ object คือ hash ของ `"<kind> <len>\x00" + body` · ในหัวข้อนี้ `kind` คือชนิดของ object (blob/tree/commit), `len` คือขนาด body เป็นไบต์ และ `\x00` คือไบต์ศูนย์ที่คั่นหัวกับ body — สามอย่างนี้ทำให้ object คนละชนิดที่เนื้อเหมือนกันยังได้ hash ต่างกัน · เราใช้ SHA-256 ไม่ใช่ SHA-1 เพราะ SHA-1 ถูกพิสูจน์แล้วว่าหา collision ได้ (เนื้อ 2 แบบที่ต่างกันแต่ hash ออกมาเท่ากัน) ตั้งแต่ปี 2017 (SHAttered):

```go
// ObjectID คือ id ของ object แบบ git: sha256("<kind> <len>\x00" + body)
// git รุ่นเดิมใช้ SHA-1 ซึ่งพิสูจน์แล้วว่าหา collision ได้ (SHAttered, 2017)
// จึงใช้ SHA-256 ในเดโมนี้
func ObjectID(kind string, body []byte) string {
	h := sha256.New()
	fmt.Fprintf(h, "%s %d\x00", kind, len(body))
	h.Write(body)
	return hex.EncodeToString(h.Sum(nil))
}
```

จากนั้นคือด่านที่ผมอยากให้จำ: **ลายเซ็นที่ดีต้องครอบทุกฟิลด์ที่ทำให้ commit หนึ่งต่างจากอีก commit** และการตรวจต้องตรวจ *เนื้อ* ไม่ใช่ *ชื่อ* ของ ref (ชื่ออ้างอิงที่ชี้ไปยัง commit เช่น `refs/heads/main` หรือ `refs/tags/v0.9.0`):

```go
// VerifyReleaseRef คือผู้ตรวจที่ผิดแบบพบบ่อย: ตรวจว่าชื่อ ref ถูกเซ็นจริง
// แล้วเชื่อ commit ที่ ref ชี้อยู่โดยไม่ตรวจว่าเนื้อ commit คือสิ่งที่ถูกเซ็น
// จึงยอมรับ commit ใดก็ได้ที่ tag ชี้ไป — ช่องว่างนี้คือสิ่งที่เดโมวัด
func VerifyReleaseRef(pub ed25519.PublicKey, ref string, sig []byte, commit Commit) bool {
	if !Verify(pub, []byte(ref), sig) {
		return false
	}
	return commit.Tree != "" && commit.Message != ""
}
```

ผลรัน:

```
# เดโม 4: ลายเซ็น commit/artifact — ed25519 เทียบกับ HMAC (คีย์ปลอมทั้งหมดในไฟล์นี้)
commits=2
commit_a=8cd5e887d7e5
commit_b=21a6e4b0d1f1
signature_bytes=64
ed25519_verify_ok=1
tampered_message_rejected=1
tag_only_swap_accepted=1
full_commit_swap_rejected=1
hmac_forged_signature_accepted=1
ed25519_forge_rejected=1
statement_subject=6283d8a07acd
statement_verify_ok=1
statement_after_swap_rejected=1
chain_ok=1

# ลายเซ็นครอบอะไร — และเพราะอะไรจึงพอหรือไม่พอ
tag-only   -> refs/tags/v0.9.0            ไม่ครอบ commit: ย้าย tag ได้
commit     -> tree+parent+author+message  ครอบทุกฟิลด์ที่ทำให้ commit ต่างกัน
statement  -> subject digest + builder + source commit + build inputs

# HMAC ตรวจได้เฉพาะคนที่ถือคีย์เดียวกับผู้เซ็น — ใน CI ที่ผู้ตรวจคือทุกคน
# คีย์จึงต้องเป็นคู่กุญแจ: ผู้เซ็นถือ private, ผู้ตรวจถือ public เท่านั้น
```

ตัวเลขที่ต้องอ่านพร้อมกันมีสามคู่: `tag_only_swap_accepted=1` กับ `full_commit_swap_rejected=1` (การตรวจผิดระดับยอมรับของปลอม การตรวจถูกระดับปฏิเสธ), `hmac_forged_signature_accepted=1` กับ `ed25519_forge_rejected=1` (คีย์สมมาตรทำให้ผู้ตรวจปลอมได้เอง) และ `statement_verify_ok=1` กับ `statement_after_swap_rejected=1` (attestation ผูก digest เข้ากับ source จนสลับ artifact ไม่ได้)

เหตุผลที่ HMAC ใช้ไม่ได้กับ provenance ไม่ใช่เรื่องความแข็งของ algorithm — HMAC-SHA256 แข็งแรงพอ · ปัญหาคือ **ความสมมาตร**: ผู้ตรวจทุกคนต้องถือคีย์เดียวกันกับผู้เซ็น ดังนั้นผู้ตรวจทุกคนจึงเซ็นได้ · ใน CI ที่ผู้ตรวจคือทุกคนที่รัน pipeline คีย์นั้นก็อยู่ในมือทุกคน และเมื่อคีย์อยู่ในมือทุกคน ลายเซ็นก็ไม่ใช่หลักฐานอีกต่อไป

### 3.6 เดโม 5: pinning — และเหตุผลที่ Go ไม่มีปัญหาเดียวกับ ecosystem อื่น

Go ใช้ **MVS**: ทุกบรรทัดใน `go.mod` คือ *ขั้นต่ำ* ที่เรายอมรับ และ MVS เลือกค่ามากสุดของขั้นต่ำทั้งหลาย — ผลลัพธ์คือเวอร์ชันต่ำสุดที่ทุกข้อกำหนดพอใจ จึงเรียกว่า minimal version selection · ผลข้างเคียงคือ **การเพิ่ม dependency หนึ่งตัวสามารถดันเวอร์ชันของ dependency ที่มีอยู่ขึ้นได้ โดยที่เราไม่ได้แก้โค้ดตัวเองเลย**

```go
// MVS เลือกเวอร์ชันสูงสุดของแต่ละ module จากข้อกำหนดทั้งหมด (minimum version selection)
// คืนค่า selected และจำนวนครั้งที่เวอร์ชันของ module หนึ่งถูกดันขึ้น
func MVS(root ModFile, byModule map[string]ModFile) (map[string]string, int) {
	sel := map[string]string{}
	bumps := 0
	queue := append([]Requirement{}, root.Requires...)
	for len(queue) > 0 {
		r := queue[0]
		queue = queue[1:]
		cur, ok := sel[r.Module]
		if ok && Compare(r.Version, cur) <= 0 {
			continue
		}
		if ok {
			bumps++
		}
		sel[r.Module] = r.Version
		if dep, exists := byModule[r.Module]; exists {
			queue = append(queue, dep.Requires...)
		}
	}
	return sel, bumps
}
```

ผลรัน:

```
# เดโม 5: dependency pinning — MVS, ช่วงเวอร์ชัน, hash ใน go.sum
modules_selected=6
direct=4
transitive=2
requested_mux=v1.2.0
selected_mux=v1.4.0
mvs_bumps=1
unpinned=0
pseudo_version=1
missing_hash=2
replace_directives=1
verify_problems=4
floating_resolutions=2
floating_diff=1
pinned_resolutions=2
pinned_diff=0
sum_mismatch=1
gate_refused=1

# ลำดับที่ MVS เลือก (สูงสุดของข้อกำหนดทั้งหมด)
  github.com/go-chi/chi/v5         v5.2.0
  github.com/gorilla/mux           v1.4.0
  github.com/havebit/legacy        v0.0.0-20240101120000-abcdef123456
  github.com/mattn/go-colorable    v0.1.14
  github.com/rs/zerolog            v1.0.0
  gopkg.in/yaml.v3                 v3.0.1

# ปัญหาที่ประตูจับได้
  missing_hash         github.com/gorilla/mux                         ไม่มี hash ของ v1.4.0 ใน go.sum — ตรวจว่าเนื้อโมดูลไม่ถูกเปลี่ยนไม่ได้
  missing_hash         gopkg.in/yaml.v3                               ไม่มี hash ของ v3.0.1 ใน go.sum — ตรวจว่าเนื้อโมดูลไม่ถูกเปลี่ยนไม่ได้
  pseudo_version       github.com/havebit/legacy                      pseudo-version ชี้ commit ที่อาจถูก force-push ทับได้
  replace_directive    gopkg.in/yaml.v3                               ถูกแทนด้วย ./vendor/yaml — ตรวจ provenance ของของจริงไม่ได้
  sum_mismatch         github.com/gorilla/mux v1.9.3                  hash ใน go.sum ไม่ตรงกับเนื้อที่ดาวน์โหลด

# ช่วง ^1.2.0: index รอบแรก -> v1.9.3 · รอบที่สอง -> v1.9.4
```

`requested_mux=v1.2.0` กับ `selected_mux=v1.4.0` คือสิ่งที่คนอ่าน go.mod มักไม่เห็น: เราไม่ได้ขอ v1.4.0 แต่ dependency ของเราขอ และ `mvs_bumps=1` คือจำนวนครั้งที่เรื่องนี้เกิดขึ้น · อีกสี่ค่าที่ต้องอ่านแยกกัน เพราะเป็นปัญหาคนละชนิดที่ Go ไม่ได้กันให้:

- `unpinned=0` — `go.mod` ไม่ยอมให้ใส่ช่วงเวอร์ชันตั้งแต่แรก ทุกบรรทัดจึงเป็นเวอร์ชันแน่นอน (ข้อดีของ Go ที่ ecosystem อื่นไม่มี)
- `pseudo_version=1` — pseudo-version (เลขเวอร์ชันที่ Go สร้างให้ commit ที่ยังไม่ติด tag: `v0.0.0-<เวลา UTC>-<commit 12 ตัวแรก>`) ชี้ commit ตรง ๆ ซึ่งถูก force-push ทับได้
- `replace_directives=1` — ชี้ไป `./vendor/yaml` ในเครื่อง จึงไม่มี provenance ให้ตรวจ
- `missing_hash=2` — สองโมดูลที่ build จริงไม่มี hash ใน `go.sum`: mux ที่ถูก MVS ดันเป็น v1.4.0 (ใน `go.sum` มีแต่ hash ของ v1.2.0 ที่เราประกาศไว้) และ yaml.v3 ที่ถูก replace

สรุปสั้น ๆ: Go ตัดปัญหา "ช่วงเวอร์ชัน" ออกไปได้จริง แต่เหลือสามด่านที่ต้องตรวจเอง — pseudo-version, replace และ hash ที่ต้องตรงกับเวอร์ชันที่ **ถูกเลือกจริง** ไม่ใช่เวอร์ชันที่เขียนไว้ใน `go.mod`

สังเกตว่าผลรันพิมพ์ปัญหาห้าบรรทัด แต่ `verify_problems=4` — เพราะสี่ข้อแรกมาจากการตรวจ `go.mod` ส่วน `sum_mismatch` เป็นการตรวจอีกชั้นที่ `go.sum` ซึ่งเดโมแยกออกมาแล้วบวกกลับเองใน `gate_refused` · ผมแยกให้เห็นเพราะในงานจริงสองชั้นนี้มักอยู่คนละเครื่องมือ (ตัวอ่าน go.mod กับตัวดาวน์โหลด) และการรวมตัวเลขสองชั้นเป็นก้อนเดียวทำให้ตามหาเจ้าของปัญหาระบุไม่ได้

![การปักหมุดเทียบกับช่วงเวอร์ชัน: ผลต่างระหว่างสอง index และ MVS ที่ดัน dependency เดิมขึ้น](/assets/diagrams/ep29-03-pinning.svg)

*ภาพที่ 3 — ช่วง `^1.2.0` ให้ผลต่างกันระหว่างสอง index (`floating_diff=1`) ขณะที่การปักหมุดให้ผลต่าง 0 · และ MVS ที่ดัน mux จาก v1.2.0 เป็น v1.4.0 · ตัวเลขจาก `out/05`*

**หมายเหตุเรื่อง `^1.2.0`:** `go.mod` ของ Go ไม่มีช่วงเวอร์ชัน (นั่นคือเหตุที่ `unpinned=0` ข้างบน) — `^1.2.0` ในเดโมนี้คือการจำลอง ecosystem ที่ใช้ caret range (npm, Cargo) เพื่อเทียบให้เห็นว่าปัญหาอยู่ที่ไหน · caret range หมายถึง "อย่างน้อย 1.2.0 แต่น้อยกว่า 2.0.0" (`>=1.2.0 <2.0.0`) ดังนั้นเมื่อ index มี v1.9.4 เพิ่ม การ resolve (ขั้นตอนที่ตัวจัดการแพ็กเกจเลือกเวอร์ชันจริงที่จะติดตั้ง) รอบใหม่จึงได้คนละเวอร์ชัน · ภาพที่ 3 จึงมีสองฝั่ง: ฝั่ง Go (MVS) กับฝั่ง ecosystem อื่น (caret) ไม่ใช่ของเดียวกัน

บรรทัดที่ผมอยากให้พกออกไปคือ `sum_mismatch=1`: go.sum มี hash ของเวอร์ชันหนึ่ง และเนื้อที่ดาวน์โหลดมาไม่ตรงกับ hash นั้น · นี่คือด่านที่จับ "เวอร์ชันเดิมแต่เนื้อเปลี่ยน" ซึ่งเป็นรูปแบบที่อันตรายที่สุดของการโจมตี supply chain เพราะทุกอย่างดูเหมือนเดิม — ชื่อเดิม เวอร์ชันเดิม ต่างแค่เนื้อ

### 3.7 ตัวตรวจของ repo และการรันซ้ำ

```bash
bash run_all.sh          # รันเดโมทั้งห้า เก็บผลลง out/ แล้ววาด SVG
python3 fix_fences.py    # เขียนบล็อกโค้ด/ผลรันในบทความจากไฟล์จริง
python3 verify_article.py
```

ตัวตรวจของ repo รวบรวมสิ่งที่พิสูจน์ได้ว่าตัวเลขในบทนี้ไม่ใช่การเล่า:

```
# ตัวตรวจ (gate): stdlib ล้วน · ไม่เปิดพอร์ต · ไม่แตะเครือข่าย · ไม่มีเวลาจริงในเส้นทางที่พิมพ์ผล
go_files=15
gofmt_unformatted=0
go_vet=ok
go_test=ok
external_deps=0
network_dial_calls=0
listen_calls=0
time_now_calls=0
child_process_calls=1
demo_programs=5
tests=29
lab_marked_files=2
secrets_actionable=5
secrets_allowlisted=6
secret_tree_revisions=1
secret_diff_revisions=2
gate_refused_file0644=1
mac_verify_ok=1
typosquat=1
artifact_match=0
unexpected_components=1
commit_swap_rejected=1
hmac_forged_accepted=1
mvs_bumps=1
floating_diff=1
sum_mismatch=1
```

และการรันซ้ำต้องได้ผลเดิม (ไม่มีการสุ่ม ไม่มีเวลาจริงในผลลัพธ์):

```
rerun_identical_leakscan=yes
rerun_identical_secretstore=yes
rerun_identical_sbom=yes
rerun_identical_attest=yes
rerun_identical_pin=yes
```

### 3.8 สิ่งที่เดโมนี้ยังไม่มี

ผมจะบอกสิ่งที่ขาดตรง ๆ เพราะบทความแบบนี้มักจบด้วยภาพที่ดูสมบูรณ์เกินจริง:

- **ไม่มี KMS/HSM จริง** — KMS (บริการจัดการคีย์บนคลาวด์) และ HSM (อุปกรณ์ฮาร์ดแวร์เก็บคีย์ที่ดึงออกมาไม่ได้) คือที่ที่คีย์หลักควรอยู่ · ในเดโมคีย์หลักเป็นสตริงคงที่ในไฟล์ (`demo_master_key_is_const=1`) ของจริงต้องอยู่ใน HSM/KMS ที่มี audit log และการแยกสิทธิ์
- **ไม่มีการหมุนอัตโนมัติ** — เดโมมี `Gen` เพื่อ *ตรวจ* การย้อนรุ่น แต่ไม่ได้ตั้งเวลา rot จริง
- **ไม่มี transparency log** — Sigstore (ชุดเครื่องมือเซ็นและตรวจ artifact) และ Rekor (log สาธารณะที่บันทึกว่าลายเซ็นถูกออกเมื่อไร) แก้ปัญหาที่สำคัญมาก: การพิสูจน์ว่า "ลายเซ็นนี้ถูกออกตอนไหน และใครเคยเห็น" ซึ่งป้องกันการเซ็นย้อนหลังได้
- **SBOM มาจากสคีมา/โครงสร้างข้อมูล (schema) ที่ผมเขียนเอง** — ของจริงควรมาจากเครื่องมือที่ผูกกับ build graph จริง (syft, `go version -m`, หรือ plugin ของ build system) ไม่งั้น SBOM จะกลายเป็นเอกสารที่คนเขียนขึ้น ไม่ใช่ผลพลอยได้จาก build
- **ไม่มี policy engine** — การตัดสิน "SBOM นี้ผ่านไหม" ในเดโมเป็น Go ตรง ๆ · ระบบใหญ่ใช้ OPA/Rego หรือ sigstore policy-controller เพื่อให้กฎตรวจสอบได้จากที่เดียว

## 4. ความผิดที่เจอซ้ำ ๆ

| สิ่งที่ทำ | ผลที่เกิดขึ้นจริง | สิ่งที่ควรทำ |
| --- | --- | --- |
| ลบไฟล์ที่มีความลับแล้ว commit | ความลับยังอยู่ 1 revision ใน snapshot และ 2 ใน diff | หมุนความลับก่อน แล้วเขียนประวัติใหม่ |
| เพิ่ม `.gitignore` หลังรั่ว | ไม่ลบอดีต และไม่ช่วยอะไรกับ clone ที่มีอยู่ | ถือว่ารั่วตั้งแต่ push ครั้งแรก |
| เก็บความลับในไฟล์ 0644 | ผู้ใช้คนอื่นในเครื่องอ่านได้ (`source_file0644_world_readable=1`) | 0600 หรือย้ายไปที่เก็บที่มีสิทธิ์แยก |
| ใช้ env เป็นที่เก็บระยะยาว | โปรเซสลูกทุกตัวเห็นค่า (`source_env_child_process_sees=1`) | env สำหรับ bootstrap เท่านั้น + lease |
| ตัดสินใจด้วยฟิลด์ที่ยังไม่ผ่าน MAC (หรือคืน error จากชั้นถัดไป) | error บอกใบ้ว่าด่านไหนผ่านแล้ว | ให้ MAC ผ่านก่อน แล้วจึงตัดสิน Gen และ lease |
| SBOM ที่ไม่มี hash | ตอบตอนเกิดเหตุไม่ได้ว่าตัวไหน | บังคับ version + hash ตั้งแต่ build |
| allowlist แบบรายชื่อดำ | typosquat ผ่านเพราะชื่อใหม่ | allowlist + ระยะใกล้เคียง |
| เซ็นแค่ชื่อ tag | สลับ commit ผ่าน (`tag_only_swap_accepted=1`) | เซ็นเนื้อ commit และตรวจเนื้อ |
| HMAC ใน CI | ผู้ตรวจทุกคนปลอมได้ | ed25519: private อยู่กับผู้เซ็น |
| `replace` ไป path ในเครื่อง | provenance หายทั้งเส้น | ใช้เฉพาะชั่วคราวและห้าม merge |
| pin เวอร์ชันโดยไม่มี hash | เวอร์ชันเดิมแต่เนื้อเปลี่ยนผ่านได้ | `go.sum` + ตรวจทุกครั้ง |

## 5. Checklist: ก่อน commit, ก่อน merge, ก่อน deploy, เมื่อรั่ว

**ก่อน commit**

1. ไม่มีค่าที่หน้าตาเป็นความลับใน diff — ติดตั้ง pre-commit hook ที่สแกน และแก้ที่ hook ไม่ใช่ที่วินัยคน
2. ค่าที่เป็นความลับถูกอ่านจากที่เก็บ ไม่ใช่จากค่าคงที่ในโค้ด
3. ไฟล์ `.env` อยู่ใน `.gitignore` และมี `.env.example` ที่มีแต่ชื่อ key

**ก่อน merge**

4. dependency ใหม่ทุกตัวมี version แน่นอนและมี hash ใน `go.sum`
5. ไม่มี `replace` ที่ชี้ path ในเครื่องค้างอยู่ใน go.mod
6. SBOM ที่ build ใหม่มี component ครบ และไม่มีชื่อที่ไม่อยู่ใน allowlist
7. ถ้าเพิ่ม dependency: ตรวจชื่อกับของจริงทีละตัวอักษร (typosquat ใช้ตาคนจับได้ยากกว่าที่คิด)

**ก่อน deploy**

8. digest ของ artifact ที่จะ deploy เท่ากับ digest ที่ build และมีบันทึกไว้
9. SBOM ที่ผูกกับ digest นั้นถูกเก็บไว้ด้วยกัน ไม่ใช่สร้างใหม่ตอนถาม
10. ลายเซ็น/attestation ตรวจผ่าน *ก่อน* rollout (ปล่อยของขึ้น production) และตรวจที่ปลายทาง ไม่ใช่แค่ที่ CI
11. มี component ที่ไม่ควรรันอยู่ไหม — ถ้ามี ให้หยุด deploys ทั้งหมดก่อนสอบสวน

**เมื่อรู้ว่ารั่ว**

12. หมุนความลับทันที และเพิกถอนของเก่า (ไม่ใช่แค่สร้างใหม่)
13. ตรวจ audit log ย้อนหลังว่ามีการใช้ความลับนั้นจากที่ไหน
14. เขียนประวัติใหม่ *หลัง* หมุนเสร็จ และประกาศให้ทุกคน force-clone (clone ใหม่ทั้งก้อนเพราะประวัติเดิมใช้ต่อไม่ได้)
15. เพิ่มกฎที่จับเคสนี้ และทดสอบว่ากฎยิงจริง (ไม่ใช่เพิ่มกฎแล้วถือว่าจบ)

## 6. โจทย์

### 6.1 Drill — ทำในเครื่องคุณ (~60-90 นาที)

1. **ทำนายก่อนรัน** — ในเดโม 1 ถ้าเราเพิ่ม commit ที่ 7 ซึ่ง *คัดลอก* บรรทัดความลับไปไว้ในไฟล์ใหม่ `docs/runbook.md` ค่าของ `secret_in_tree_revisions` กับ `secret_in_diff_revisions` จะเป็นเท่าไร · คำตอบ: tree เป็น **2** (commit 1 กับ commit 7) และ diff เป็น **3** (เพิ่มใน c1, ลบใน c2, เพิ่มใน c7) · คำถามต่อ: ตัวเลขคู่นี้บอกอะไรเกี่ยวกับลำดับการทำงาน (คำใบ้: การหมุนก่อนเขียนประวัติใหม่ทำให้ diff ที่เหลือไม่มีค่า)
2. **เพิ่มกฎที่ควรมี** — เขียนกฎจับ **connection string** ที่ฝังรหัสผ่าน (`postgres://app:S3cr3t-pg-value@db.internal/app`) แล้วรันกับประวัติเดิม · ต้องรายงานว่า `findings_total` เปลี่ยนจาก 11 เป็นเท่าไร และกฎใหม่ชนกับกฎเดิมหรือไม่ (ถ้าชน ให้ตัดสินด้วย `rank` แบบเดียวกับที่โค้ดทำ)
3. **ทำให้ allowlist แคบลงแล้วดูผล** — ถอด `testdata/` ออกจาก `isFixturePath` แล้วรัน · `findings_actionable` จะเพิ่มขึ้นกี่รายการ และเพราะอะไรการทำแบบนี้จึงทำให้ทีมเลิกใช้เครื่องมือ (ตอบด้วยตัวเลข ไม่ใช่ความรู้สึก)
4. **หาลำดับที่ผิดใน `Open`** — สลับให้ตรวจ `Gen` ก่อน `hmac.Equal` แล้วเขียน envelope ที่ `Gen=99` พร้อม MAC ที่ผิด · ประตูยังปฏิเสธไหม · ถ้ายังปฏิเสธ ให้อธิบายว่าทำไม (คำใบ้: MAC คำนวณจาก `canon` ที่มี `Gen` อยู่ด้วย) แล้วถามต่อว่ากรณีไหนที่ลำดับนี้สำคัญจริง
5. **สร้าง artifact ที่ digest ตรงแต่ SBOM ไม่ตรง** — แก้ `buildBOM` ให้เพิ่ม component ปลอมโดยไม่แตะ `artifactFiles` · รายงานว่า `artifact_match` กับ `unexpected_components` เป็นเท่าไร และอธิบายว่าทำไม SBOM ที่ไม่ผูกกับ digest จึงเป็นเอกสารที่ปลอมได้ฟรี
6. **ทำให้ tag-only ปลอดภัยขึ้นหนึ่งขั้น** — เปลี่ยน `VerifyReleaseRef` ให้รับ `commit Commit` และตรวจ `Verify(pub, commit.Body(), sig)` แทน · เขียนเทสต์ที่พิสูจน์ว่าการสลับ commit ถูกปฏิเสธ และอธิบายว่าทำไมวิธีนี้ยังไม่พอ (คำใบ้: ใครเป็นคนบอกว่า commit นี้คือ commit ที่อยู่ใน tag)
7. **ทดลอง MVS** — เพิ่ม dependency ใหม่ที่ขอ `mux v1.9.0` แล้วรัน · `selected_mux` เปลี่ยนเป็นอะไร และ `mvs_bumps` เพิ่มเป็นเท่าไร · จากนั้นตอบว่า "เราจะป้องกันไม่ให้ dependency ใหม่ดันของเดิมได้อย่างไร" (คำใบ้: pin + ตรวจ diff ของ go.mod ใน CI)

### 6.2 Mini-project — "ระบบปล่อยของที่ตรวจย้อนได้" (~8-12 ชั่วโมง)

สร้าง pipeline เล็ก ๆ สำหรับโปรเจกต์ของคุณเอง (repo เดียว เครื่องเดียวก็พอ) ที่ทำครบหกข้อ:

1. **สแกนก่อน commit** — เขียน hook ที่เรียกสแกนเนอร์ของคุณเอง (ใช้ `internal/leakscan` เป็นจุดเริ่ม หรือใช้เครื่องมือสำเร็จรูป) และ *ปฏิเสธ commit* เมื่อเจอค่าที่ actionable · วัดผล: จำนวนครั้งที่ hook บล็อกต่อสัปดาห์
2. **ย้ายความลับออกจาก repo** — เลือกความลับจริงหนึ่งตัวในโปรเจกต์คุณ เปลี่ยนไปใช้ envelope + lease (หรือ secret manager (บริการเก็บความลับกลางที่ให้สิทธิ์เป็นรายตัว) ของแพลตฟอร์ม) แล้วบันทึกว่าต้องแก้กี่จุด
3. **สร้าง SBOM จาก build จริง** — ใช้ `go version -m` กับไบนารีที่ build ได้ เพื่อดูข้อมูล module ที่ toolchain ฝังไว้ แล้วเขียนตัวแปลงเป็น JSON · เทียบกับรายการใน `go.mod` ว่าตรงกันไหม
4. **เซ็นและตรวจ** — สร้างคู่กุญแจ ed25519 เซ็น digest ของ artifact พร้อม statement ที่มี commit id และ build input · เขียนตัวตรวจที่ *ปฏิเสธ* เมื่อ digest ไม่ตรง
5. **ทำ deploy gate** — สคริปต์ที่ตรวจสามอย่างก่อนรัน: digest ตรง, SBOM ครบ, ลายเซ็นผ่าน · และปฏิเสธเมื่ออย่างใดอย่างหนึ่งไม่ผ่าน (fail closed)
6. **ซ้อมเหตุการณ์ "ความลับรั่ว"** — จำลองการ commit ความลับปลอมใน branch ทดสอบ แล้วเดินครบ: สแกน → หมุน → เขียนประวัติใหม่ → ประกาศ · จดเวลาที่ใช้แต่ละขั้น และตอบว่าขั้นไหนช้าที่สุด

ข้อ 5 กับข้อ 6 คือสองข้อที่โปรเจกต์ลักษณะนี้ตกมากที่สุด — เพราะข้อ 5 บังคับให้คุณยอมรับว่าด่านที่ไม่ได้อยู่ในเส้นทาง deploy ไม่ใช่ด่าน และข้อ 6 บังคับให้คุณรู้ว่าการเขียนประวัติใหม่กระทบคนอื่นกี่คน (ซึ่งมักเป็นคำตอบที่ทำให้ทีมเลือก "หมุนแล้วปล่อยประวัติไว้" แทน)

## 7. สรุป

สามประโยคที่ผมอยากให้คุณพกออกไป:

1. **การลบไม่ใช่การลืม** — ความลับตัวเดียวอยู่ 1 revision ใน snapshot และ 2 revision ใน diff · `.gitignore` เป็นกฎของอนาคต และการหมุนคือสิ่งเดียวที่กู้สถานการณ์ได้จริง · ตัวเลขที่ต้องรายงานจึงไม่ใช่ "จับได้กี่รายการ" แต่คือ "ต้องแก้กี่รายการ" (5 จาก 11)
2. **ลายเซ็นพิสูจน์เท่ากับสิ่งที่มันครอบ** — ลายเซ็นที่ครอบแค่ชื่อ tag ยอมรับการสลับ commit (1 เคส) ขณะที่ลายเซ็นที่ครอบเนื้อ commit ปฏิเสธ (1 เคส) · และ HMAC ทำให้ผู้ตรวจทุกคนปลอมได้ (1 เคส) เพราะความสมมาตรคือปัญหา ไม่ใช่ความแข็งของ algorithm
3. **ของที่ deploy ต้องพิสูจน์ได้ว่าคือของที่ build** — SBOM 10 component ที่มี hash ครบตอบได้ว่า "มีอะไร" แต่มีเพียง digest ที่เท่ากันและ attestation ที่ผูก source เท่านั้นที่ตอบว่า "ของเดียวกัน" · เมื่อ digest ไม่ตรง (`artifact_match=0`) และมี component เกินมา 1 ตัว เราไม่ต้องเดาเจตนา — เราแค่หยุด

ตอนหน้าเป็นตอนสุดท้ายของซีรีส์: **capstone** — เราจะเอาทุกอย่างที่เรียนมาใช้ audit โปรเจกต์จริงตั้งแต่ต้นจนจบ ตั้งแต่ threat model ถึงรายงานที่มีลำดับความสำคัญ และปิดท้ายด้วยภาพรวมเส้นทางสายงาน security ว่าจากตรงนี้ไปได้ทางไหนบ้าง

← ตอนก่อน: [Logging และการรับมือเหตุการณ์: log ที่สืบสวนได้ ถึง post-mortem ที่ไม่กล่าวโทษใคร (ตอนที่ 28)](/blog/post.html?slug=2026-11-06-software-security-28-logging-incident-response)

อ่านต่อย้อนหลัง: [Supply chain: Log4Shell และ SolarWinds (ตอนที่ 8)](/blog/post.html?slug=2026-10-16-software-security-08-supply-chain-log4shell-solarwinds) · [SAST/DAST และ dependency scanning (ตอนที่ 25)](/blog/post.html?slug=2026-11-03-software-security-25-sast-dast-dependency-scanning) · [Cryptography in practice: hash, HMAC, AEAD (ตอนที่ 24)](/blog/post.html?slug=2026-11-02-software-security-24-crypto-in-practice)

---

*บทความนี้เป็นส่วนหนึ่งของซีรีส์ Software Security: จากช่องโหว่สู่การป้องกันจริง · โค้ดและผลรันทั้งหมดอยู่ใน `code/ep29/` และสร้างใหม่ได้ด้วย `bash run_all.sh` · ตัวเลขทุกตัวในบทนี้มาจาก `out/` · ประวัติ git ที่จำลองขึ้นและไฟล์ความลับ 0644 ในเดโมเป็นโค้ดที่จงใจ insecure เพื่อการสอน — ห้ามนำไปใช้จริง และห้ามใช้เทคนิคในบทนี้กับระบบที่คุณไม่ได้รับอนุญาต*
