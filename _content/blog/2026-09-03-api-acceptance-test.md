---
title: "API ที่เขียนด้วย Go หรือ Java ก็เขียน acceptance test เป็นโค้ดได้ด้วย Playwright request fixture — ครบตั้งแต่ติดตั้งจนถึง CI"
date: 2026-09-03
tags: [api, testing, playwright, go, java]
description: "สอนเขียน API acceptance test แทน Postman/Newman ด้วย Playwright request fixture เหมาะกับ API ที่เขียนด้วย Go/Java ตั้งแต่ติดตั้ง config เขียน test แรก ไปจนถึง CI"
---

> 📅 เขียนเมื่อ: กันยายน 2026 | @playwright/test 1.62.1, Node 22 (เครื่องที่ใช้ทดสอบ v22.23.2)
> ⚠️ ตรวจสอบข้อมูล ณ วันที่ 3 กันยายน 2026 จาก npm registry และเอกสารทางการของ Playwright — เวอร์ชันและ API อาจเปลี่ยนเมื่อคุณอ่านบทความนี้

เคยเป็นไหม — เทสต์ API ทั้งหมดของทีมอยู่ใน Postman มี collection ชื่อว่า "Production Sanity" อยู่บนเครื่องของคนที่ออกจากบริษัทไปแล้ว เวลาใครแก้ endpoint ก็ต้องเดาเอาว่า collection ที่ตัวเองใช้อยู่เวอร์ชันล่าสุดหรือเปล่า ส่วนเพื่อนอีกคนที่อยากรันเทสต์บน CI ก็ต้องลาก Newman เข้ามา แล้วก็เจอว่าคำสั่งยิง API มันเขียนด้วยภาษาของ Postman (`pm.*`) ซึ่งไม่เหมือนกับโค้ดที่เราเขียนกันอยู่ทุกวัน — แก้ทีต้องเปิด GUI ก่อนเสมอ

จุดที่ Postman/Newman มันเจ็บไม่ใช่ตอนแรกเริ่ม แต่เป็นตอนที่ API โตขึ้น: collection เป็นไฟล์ JSON ที่ merge แล้วชนกันทุกครั้ง, เปิด pull request ที reviewer เห็นแต่โค้ดไม่เห็นเทสต์, แล้ว "เทสต์" ที่ว่านี้ก็รันได้แค่บนเครื่องคนที่เปิด Postman เป็น

วิธีที่ช่วยได้คือย้ายเทสต์พวกนี้มาเป็นโค้ด — เขียนเป็นไฟล์ TypeScript ปกติที่อยู่ใน repo เดียวกับ API แล้วปล่อยให้ test runner รันอัตโนมัติทุกครั้งที่ push บทความก่อนหน้าเราเล่าตัวเลือกอย่าง **Vitest + Supertest** ไปแล้ว แต่ถ้า API ของคุณเขียนด้วย **Go หรือ Java** ตัวนั้นจะใช้ไม่ได้ — Supertest ออกแบบมาให้ "ยิง request เข้า app Node/Express ใน process เดียวกัน" ซึ่งหมายความว่ามันต้อง import ตัว app เข้ามาเป็นโค้ด JavaScript ได้จริง ๆ ส่วน Go/Java เป็น server ที่ compile เป็น binary หรือรันบน JVM — เป็นกล่องดำที่มองไม่เห็นจากฝั่ง Node เราจึงต้องยิงมันผ่าน HTTP จริงเท่านั้น

ตัวที่เหมาะกว่าคือ **Playwright** — หลายคนรู้จักในฐานะเครื่องมือเทสต์ browser แต่ในตัวมันมี `request` fixture สำหรับเทสต์ API โดยเฉพาะ ซึ่งยิง HTTP จริงผ่าน network ไปที่ server ที่รันอยู่ ไม่สนใจเลยว่า server ข้างหลังเขียนด้วยภาษาอะไร — Go, Java, Rust, Node, Python ได้หมด บทความนี้จะพาไล่ทีละขั้น ตั้งแต่เปิด terminal จนถึงมีเทสต์รันอัตโนมัติบน GitHub Actions ทุกครั้งที่ push — ใช้ repo เดิม ไม่ต้องสร้างโปรเจกต์ใหม่ และที่สำคัญคือ**ไม่ต้องแตะโค้ด production เลยสักบรรทัด**

> สำหรับเพื่อนที่เพิ่งเริ่ม: acceptance test ในที่นี้คือเทสต์ที่ตรวจ "สัญญาจากมุมผู้ใช้ API" — ยิง GET/POST ไปที่ endpoint แล้วเช็คว่า status, header, body ถูกต้องตามที่ตกลงกันไว้ รวมถึงกรณี error ต่าง ๆ ซึ่งต่างจาก unit test ที่ยิงเข้าไปที่ฟังก์ชันภายในโดยตรง

## ขั้นที่ 1 — ตรวจ Node.js version ก่อน

ถึง API จะเป็น Go หรือ Java แต่ Playwright เป็นเครื่องมือที่รันบน Node.js (โปรแกรมที่ทำให้ JavaScript รันนอก browser ได้) เรื่องแรกจึงเป็นเดิมพันเดียวของบทความนี้ — ดูว่าเครื่องใช้ Node รุ่นไหนอยู่:

```bash
node -v
```

ตอนเขียนบทความนี้เครื่องที่ใช้ลองคือ `v22.23.2` ถ้าได้รุ่นประมาณนี้สบายใจได้ แต่ถ้ายังค้างอยู่ที่ Node 18 หรือ 19 ขอเตือนว่า**ต้องอัปเกรดก่อน** — ผมเช็คจาก npm registry เมื่อ 3 กันยายน 2026 พบว่า package `@playwright/test@1.62.1` (ตัวที่เราใช้ตอนเขียน) ประกาศค่า `"engines": { "node": ">=20" }` ไว้ในตัว package เอง รุ่น LTS อย่าง 22 หรือ 24 ยิ่งสบายใจได้ใหญ่

> สำหรับเพื่อนที่เพิ่งเริ่ม: ถ้าเครื่องมีหลายโปรเจกต์ที่ใช้ Node ต่างรุ่นกัน แนะนำ version manager อย่าง nvm หรือ fnm ไว้สลับรุ่น — เวลาอัปก็แค่ `nvm install --lts && nvm use --lts`

## ขั้นที่ 2 — ติดตั้ง @playwright/test (ไม่ต้องโหลด browser)

เปิด terminal เข้าไปที่ root ของ repo แล้วรัน:

```bash
npm install -D @playwright/test
```

ใน repo ที่เป็น Go/Java จะมี `package.json` โผล่เข้ามาเป็นครั้งแรก — ไม่ต้องตกใจ นี่คือวิธีบอก Node ว่ามี test runner อยู่ตรงนี้ และ**มันอยู่แค่ฝั่งเทสต์เท่านั้น ไม่ยุ่งกับโค้ด server ของเราเลย** ถ้า repo ยังไม่เคยมี package.json ให้รัน `npm init -y` ก่อนเพื่อสร้างมันขึ้นมา

จุดที่คนส่วนใหญ่ติดคือขั้นต่อไป — ถ้าคุณเคยติดตั้ง Playwright แบบ e2e มาก่อนจะคุ้นกับคำสั่ง `npx playwright install` ที่โหลด browser binaries (Chromium/Firefox/WebKit) ลงเครื่อง แต่**ชุดเทสต์ API ล้วนแบบนี้ไม่จำเป็นต้องโหลด browser เลย** เพราะ `request` fixture ยิง HTTP ผ่าน Node โดยตรง ไม่ได้เปิด browser สักตัว — ข้าม `npx playwright install` ไปได้เลย (บทความนี้รันเทสต์ผ่านมาแล้วโดยไม่เคยรันคำสั่งนั้นสักครั้ง) ถ้าบังเอิญเข้ามาทาง wizard `npm init playwright@latest` ซึ่งมันจะบังคับให้เลือก browser ก็เลือกแค่ chromium ตัวเดียวแล้วกัน หรือจะติดตั้งแบบ manual ตามบทความนี้ก็จบ ไม่มีคำถามให้ตอบ

ส่วน TypeScript ก็ไม่ต้องตั้งค่าอะไรเพิ่ม — Playwright ฝัง transpiler ของตัวเองไว้ รองรับไฟล์ `.ts` ทั้ง config และ test ออกกล่อง ไม่ต้องติดตั้ง typescript แยก หรือตั้ง tsconfig ให้วุ่น (ขอแค่ repo เราไม่มี tsconfig ที่ตั้งค่าแรง ๆ ไปขัดกับมัน)

## ขั้นที่ 3 — เขียน playwright.config.ts: baseURL + webServer เปิด API ให้เอง

สร้างไฟล์ `playwright.config.ts` ที่ root ของ repo:

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",

  use: {
    // request fixture จะเติม baseURL ให้ทุกคำขอ — ในเทสต์เขียนแค่ path เฉย ๆ ได้
    baseURL: "http://localhost:8080",
  },

  // รันเทสต์เมื่อไหร่ ค่อย ๆ สตาร์ท API ให้เองด้วยคำสั่งนี้
  webServer: {
    command: "go run .",
    url: "http://localhost:8080/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

ไล่ให้ดูทีละส่วน:

- **`testDir`** — โฟลเดอร์ที่ Playwright ใช้ค้นหาไฟล์เทสต์ (เราจะสร้าง `tests/` ในขั้นถัดไป)
- **`use.baseURL`** — URL ของ API ที่รันอยู่ เมื่อตั้งไว้แล้วในเทสต์เราส่งแค่ `request.get("/api/users/1")` ก็พอ Playwright ต่อ URL ให้เอง ไม่ต้องพิมพ์ `http://localhost:8080` ซ้ำทุกบรรทัด (ถ้าอยากยิง environment อื่น เช่น staging ก็เปลี่ยนบรรทัดนี้เป็น `process.env.API_BASE_URL ?? "http://localhost:8080"` ได้)
- **`webServer`** — หัวใจของ workflow: Playwright จะรันคำสั่ง `command` ให้ก่อนเทสต์ แล้วรอจนกว่า `url` จะตอบสนอง จึงค่อยเริ่มรันเทสต์ พอจบก็ฆ่า process ให้เอง — เราไม่ต้องเปิด terminal รอ `go run .` ค้างไว้อีกต่อไป
  - **`reuseExistingServer: !process.env.CI`** — ตอน local ถ้ามี server รันอยู่แล้ว (เช่นเราเปิด dev ไว้ใน terminal อีกตัว) Playwright จะไม่รันซ้ำ แต่ใช้ตัวที่มีอยู่ แทนที่จะชน port กัน ส่วนบน CI ไม่มี server เปิดอยู่แล้ว ก็ให้รันคำสั่งสดทุกครั้ง
  - **`timeout`** — เวลารอ server เริ่ม 60 วินาที ถ้าเครื่อง compile Go ช้า ๆ ก็เผื่อไว้นานหน่อยได้

ระวังกับดักเล็ก ๆ หนึ่งจุดที่ผมเจอตอนลองจริง: **`url` ต้องเป็น endpoint ที่ตอบกลับด้วย status ที่ "พร้อมใช้งาน"** ซึ่งตามเอกสารคือ 2xx, 3xx, 400, 401, 402 หรือ 403 — ตอนแรกผมตั้ง `url: "http://localhost:8080"` (root) แต่ Go `http.NewServeMux` ของเรามันตอบ 404 สำหรับ path ที่ไม่มี route ค้างอยู่ พอ Playwright เห็น 404 (ซึ่งไม่นับว่าพร้อม) มันก็รอจนครบ timeout แล้วฟ้อง `Timed out waiting 60000ms from config.webServer` พอชี้ `url` ไปที่ `/api/health` ซึ่งตอบ 200 เท่านั้นถึงจะผ่าน — จำไว้ว่าให้ชี้ไปที่ health check หรือ endpoint จริงของเรา

ส่วน repo ที่เป็น Java ก็เปลี่ยนแค่ `command` — เช่น `java -jar target/api-0.0.1-SNAPSHOT.jar` (ต้อง build jar มาก่อน) หรือถ้าใช้ Spring Boot ระหว่าง dev ก็ `./mvnw spring-boot:run` ได้ ส่วน `url` ก็ชี้ไปที่ health endpoint ของแอปนั้น ๆ เช่น `/actuator/health` — หลักการเดียวกันทุกอย่าง

> สำหรับเพื่อนที่เพิ่งเริ่ม: ที่ต้องมีไฟล์ config เพราะนี่คือที่รวม "ข้อตกลง" ของทั้งโปรเจกต์ — server อยู่ที่ไหน, เทสต์อยู่โฟลเดอร์ไหน, จะเปิด server เองหรือเปล่า พอ config อยู่ใน repo แล้ว ใคร clone ไปรัน `npx playwright test` ก็ได้ผลเหมือนกันทุกคน ไม่ต้องมานั่งจำว่าต้องเปิด server ก่อนหรือเปล่า

## ขั้นที่ 4 — เขียน acceptance test ตัวแรกด้วย request fixture

สร้างโฟลเดอร์ `tests/` แล้วสร้างไฟล์ `tests/api.spec.ts`:

```ts
// tests/api.spec.ts
import { test, expect } from "@playwright/test";

test.describe("GET /api/health", () => {
  test("returns 200 with status ok", async ({ request }) => {
    const res = await request.get("/api/health");

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

test.describe("GET /api/users/:id", () => {
  test("returns a user for a valid id", async ({ request }) => {
    const res = await request.get("/api/users/1");

    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(await res.json()).toEqual({ id: 1, name: "somchai" });
  });

  test("returns 400 for a non-numeric id", async ({ request }) => {
    const res = await request.get("/api/users/abc");

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "id must be a positive integer" });
  });

  test("returns 404 when the user does not exist", async ({ request }) => {
    const res = await request.get("/api/users/999");

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "user not found" });
  });
});
```

สิ่งที่เห็นใน callback ของ test — `async ({ request })` — คือ **fixture**:

> สำหรับเพื่อนที่เพิ่งเริ่ม: fixture คือของที่ Playwright เตรียมไว้ให้ก่อนเทสต์ แล้วเก็บกวาดให้เองหลังเทสต์จบ — แค่บอกชื่อมันในวงเล็บปีกกา (`{ request }`) ก็ได้ instance มาใช้โดยไม่ต้องสร้างหรือปิดอะไรเอง นี่คือจุดที่ต่างจากสไตล์ imperative ที่เราต้อง `new` แล้ว `close()` กันเองทุกครั้ง

`request` fixture สร้าง `APIRequestContext` ให้ **คนละ instance ต่อเทสต์** — แต่ละเทสต์ได้คุกกี้และ header ของตัวเองแยกกัน ไม่รั่วข้ามกัน (สำคัญมากเวลาเริ่มมี login มาขวาง) และมันอ่าน `baseURL` กับ `extraHTTPHeaders` จาก config ให้อัตโนมัติ พอจบเทสต์ก็ dispose ให้เอง — ถ้าอยากได้ context ที่แชร์กันทั้งไฟล์ (เช่น login ทีเดียวใน `beforeAll`) ค่อยไปใช้ `playwright.request.newContext()` แบบ manual แล้วปิดด้วย `dispose()` เอง

ส่วน response ที่ได้กลับมาเป็น object `APIResponse` ที่มี method ให้เรียก:

- `res.status()` — HTTP status code
- `res.ok()` — true ถ้า status อยู่ช่วง 200–299
- `res.headers()` — object ของ response headers
- `await res.json()` — แปลง body เป็น JSON
- `await res.text()` / `await res.body()` — body แบบ string หรือ Buffer

**จุดที่พลาดบ่อยสุด** (และเป็นความต่างจาก supertest ที่เพื่อน ๆ อาจเคยชิน): `res.json()` เป็น async — ต้อง `await` ทุกครั้ง ไม่งั้นจะได้ Promise แทน object แล้ว assert ไม่ตรงอะไรเลย

การ assert ใช้ `expect` ของ Playwright ตามปกติ ซึ่งมันมี matcher สำเร็จรูปสำหรับ response โดยเฉพาะด้วย — `await expect(res).toBeOK()` แปลว่า "ต้องตอบ 2xx" และเวลามัน fail จะพิมพ์ status + body จริงออกมาให้ดูเลย สะดวกกว่าการ `expect(res.status()).toBe(200)` ที่เห็นแค่ตัวเลขเฉย ๆ ในกรณีที่เราไม่ได้อยากตรวจค่าเฉพาะเจาะจง

> สำหรับเพื่อนที่เพิ่งเริ่ม: สังเกตว่าในเทสต์เราไม่เห็น "server ถูกเปิดที่ไหน" เลย — เพราะ config ในขั้นที่ 3 จัดการให้แล้ว: Playwright รัน `go run .` ขึ้นมาก่อน รอให้ `/api/health` ตอบ แล้วค่อยไล่รันเทสต์ ทุกอย่างที่เทสต์เห็นคือ server ที่ยิงผ่าน HTTP จริง ๆ (เรียกว่า black-box — มองไม่เห็นข้างใน เห็นแต่คำตอบ) เหมือนกับที่ Postman ยิงหาพอดี ต่างกันตรงที่คราวนี้ "คำสั่งยิง" อยู่ใน repo เป็นโค้ดที่ review ได้

## ขั้นที่ 5 — รันเทสต์

รันด้วยคำสั่ง:

```bash
npx playwright test
```

ผลลัพธ์ที่ได้จากเครื่องที่ลองเขียนบทความนี้ (กับ API ตัวอย่างที่เขียนด้วย Go — เน้นว่า**ตัวเทสต์ไม่รู้ ไม่แคร์** ว่า server เป็นภาษาอะไร):

```
[WebServer] API listening on http://localhost:8080

Running 4 tests using 1 worker

  ✓  1 tests/api.spec.ts:5:3 › GET /api/health › returns 200 with status ok (48ms)
  ✓  2 tests/api.spec.ts:14:3 › GET /api/users/:id › returns a user for a valid id (18ms)
  ✓  3 tests/api.spec.ts:22:3 › GET /api/users/:id › returns 400 for a non-numeric id (15ms)
  ✓  4 tests/api.spec.ts:29:3 › GET /api/users/:id › returns 404 when the user does not exist (26ms)

  4 passed (1.8s)
```

บรรทัด `[WebServer]` คือหลักฐานว่า Playwright สตาร์ท API ให้เอง ส่วนที่เหลือคือผลเทสต์ 4 ตัวผ่านในเวลาไม่ถึง 2 วินาที — เร็วพอที่จะรันทุกครั้งก่อน commit ได้เลย

ถ้าอยากให้เทสต์นี้เป็นคำสั่งที่เรียกง่าย (และใช้ใน CI ด้วย) เพิ่ม script ใน `package.json`:

```json
"scripts": {
  "test:api": "playwright test"
}
```

ต่อไปก็รันแค่ `npm run test:api` คำสั่งอื่น ๆ ที่ใช้บ่อย:

```bash
npx playwright test tests/api.spec.ts   # รันแค่ไฟล์เดียว
npx playwright test --grep "404"        # รันเฉพาะเทสต์ที่ชื่อตรงคำ
npx playwright test --workers=4         # บังคับจำนวน worker (รันขนาน)
```

คราวนี้ลองจงใจทำให้ fail ดูสักครั้ง (เช่นเปลี่ยน `toBe(200)` เป็น `toBe(201)`) แล้วดู error message — Playwright จะโชว์ทั้งค่าที่คาดกับค่าที่ได้มาให้เทียบกันชัดเจน ควรรู้หน้าตาไว้ก่อนเจอของจริง

## ขั้นที่ 6 — ใส่ CI ด้วย GitHub Actions

พอเทสต์เขียวในเครื่อง ก็ถึงเวลาทำให้มันรันเองทุกครั้งที่ push — ไม่งั้นเดี๋ยวก็ลืมรันอีก สร้างไฟล์ `.github/workflows/api-test.yml`:

```yaml
name: API tests
on:
  push:
    branches: [main, master]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - uses: actions/setup-go@v7
        with:
          go-version-file: go.mod
      - name: Install test dependencies
        run: npm ci
      - name: Run API acceptance tests
        run: npx playwright test
```

ต้องมี action ถึงสามตัวเพราะ repo เราเป็นของผสม: **setup-node** เพื่อรัน test runner ที่เขียนด้วย TypeScript, **setup-go** เพื่อให้ `go run .` ใน `webServer` ทำงานได้ (ถ้า repo เป็น Java ก็เปลี่ยนเป็น setup-java + build step ก่อนหน้าแทน), และ **checkout** สำหรับดึงโค้ด ซึ่งใช้ได้กับทั้ง Go, Java, หรือภาษาใดก็ตามที่ webServer สั่งรันได้

จุดที่บทความนี้ต่างจาก workflow e2e ทั่วไปคือ**เราไม่ต้องรัน `npx playwright install` เพื่อโหลด browser และไม่ต้องเตรียม service container อะไรเลย** — เพราะเทสต์ใช้แค่ `request` fixture ที่ยิง HTTP ล้วน ๆ `webServer` ใน config จะเป็นคนสตาร์ท API ให้บน runner เอง (บน CI ที่ `reuseExistingServer: false` มันจะรันสดทุกครั้งแล้วปิดให้เมื่อจบ) ข้อควรจำ: `npm ci` อ่าน dependency จาก lockfile — ฉะนั้นอย่าลืม commit `package-lock.json` ไว้ด้วย ถ้าใช้ yarn/pnpm ก็เปลี่ยนคำสั่งให้ตรงกัน

เท่านี้ทุก push และทุก pull request จะมีชุดเทสต์นี้รันให้อัตโนมัติ — reviewer เห็นเทสต์อยู่ใน PR เดียวกับโค้ดที่แก้ และถ้าใครไปทำ endpoint พัง เทสต์จะแดงบอกก่อน merge ทันที

## ของแถมที่ควรรู้ไว้

- **Postman ไม่ได้ไร้ค่า** — การยิง explore ดู response ครั้งเดียว หรือ debug ตอนเทสต์แดง ตัว GUI ยังสะดวกตรงเห็น structure ชัด ๆ เรื่องที่เราย้ายคือ "เทสต์ที่ต้องรันซ้ำและเป็นหลักประกัน" ไม่ใช่ตัว Postman
- **Newman เป็นสะพาน** — ถ้าทีมมี collection ใหญ่อยู่แล้วและยังย้ายไม่ทัน การให้ Newman รัน collection เดิมบน CI เป็นขั้นกลางที่รับได้ แต่ค่อย ๆ เขียนเทสต์ใหม่เป็นโค้ดทีละ endpoint เพราะของเดิมยังเป็นภาษาของ Postman ที่ review และ refactor ลำบาก
- **ของแถมที่คุ้มสุด: เทสต์ API + browser ในไฟล์เดียวกัน** — เพราะเราอยู่ใน Playwright อยู่แล้ว ถ้าวันไหนมี frontend ด้วย จะใช้ `request` เตรียม state ฝั่ง server (สร้าง user, สั่งลบของเก่า) แล้วค่อยเปิด `page` ไปตรวจ UI ก็ได้ — เทสต์เดียวครอบทั้ง backend และ frontend นี่คือเหตุผลที่ official docs เขาเรียกว่า "test your server API" ไม่ใช่แค่เทสต์ของนักเทสต์
- **Auth ไม่ใช่เรื่องยาก** — header ที่ต้องส่งทุกคำขอ (เช่น `Authorization`) ตั้งครั้งเดียวใน config ได้ที่ `use.extraHTTPHeaders` ส่วน flow login ก็ยิง `request.post("/login")` ใน `beforeAll` แล้วเก็บ token ใส่ header หรือใช้ `storageState()` แชร์ session ข้ามเทสต์ได้
- **ข้อควรรู้เรื่อง status code** — `request` fixture (ต่างจากบาง client) ไม่ throw เมื่อ server ตอบ 4xx/5xx มันคืน response มาให้เรา assert เองตามปกติ — ถ้าอยากให้ throw อัตโนมัติก็มี option `failOnStatusCode` ให้เปิดได้ แต่ในบทความนี้เราเลือก assert ทุก status อย่างชัดเจน เพราะ acceptance test ต้องตรวจกรณี error ด้วยอยู่แล้ว
- **Node บน CI กับเครื่องให้ตรงกัน** — ตั้ง `node-version` ใน workflow เท่ากับที่ dev ใช้ (หรือใช้ `lts/*` ก็ได้) ป้องกันเทสต์เขียวบนเครื่องแต่แดงบน CI เพราะคนละรุ่น Node

ครบแล้ว — จาก `node -v` ไปจนถึงเทสต์แรกเขียวบน GitHub Actions โดยไม่ต้องเปิด Postman สักครั้ง และ**ไม่ต้องแก้โค้ด Go/Java ของเราแม้แต่บรรทัดเดียว** เพราะเทสต์มอง server เป็นกล่องดำที่ยิงผ่าน HTTP จริง — ภาษา-agnostic นั่นเอง สิ่งที่ได้กลับมาคือเทสต์ที่อยู่ใน version control เดียวกับโค้ด ถูก review ใน PR เดียวกัน และรันซ้ำที่ไหนก็ได้บนโลกใบนี้ ถ้าอยากต่อยอด ลำดับถัดไปที่น่าสนใจคือเขียนเทสต์ครอบ flow ที่ต้อง authenticate ก่อน (ยิง login ก่อนแล้วส่ง token ต่อ), หรือใช้ service container ใน CI เพื่อเทสต์กับ database จริง — เดี๋ยวไว้มาเล่าต่อ

### แหล่งอ้างอิง (ตรวจสอบ 3 กันยายน 2026)

- [npm registry — @playwright/test 1.62.1](https://www.npmjs.com/package/@playwright/test) — `engines.node >=20`, ข้อมูลเวอร์ชัน ณ วันที่ตรวจ
- [Playwright — API testing](https://playwright.dev/docs/api-testing) — `request` fixture ในตัว, การใช้ `baseURL` + `extraHTTPHeaders`, ตัวอย่าง `request.get()/post()` และ `beforeAll`/`afterAll`
- [Playwright — Web server](https://playwright.dev/docs/test-webserver) — คุณสมบัติของ `webServer` (command, url, reuseExistingServer, timeout) และเงื่อนไข status ที่นับว่า server พร้อม (2xx/3xx/400/401/402/403)
- [Playwright — Fixtures](https://playwright.dev/docs/test-fixtures) — built-in fixture `request` เป็น isolated `APIRequestContext` ต่อเทสต์
- [Playwright — APIRequestContext](https://playwright.dev/docs/api/class-apirequestcontext) — method ของ response: `status()`, `ok()`, `headers()`, `json()`, `text()`, `body()`
- [GitHub Actions — setup-node (Marketplace, v7)](https://github.com/marketplace/actions/setup-node-js-environment) และ [setup-go (Releases, v7)](https://github.com/actions/setup-go/releases) — workflow ตัวอย่าง `checkout@v7` + `setup-node@v7` + `setup-go@v7`
