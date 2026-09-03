---
title: "มี repo API อยู่แล้ว จะเขียน acceptance test แทน Postman/Newman ยังไง — ครบตั้งแต่ติดตั้งจนถึง CI"
date: 2026-09-03
tags: [api, testing, vitest, supertest]
description: "สอนเขียน API acceptance test แทน Postman/Newman ด้วย Vitest + Supertest ตั้งแต่ติดตั้ง แยก app ออกจาก listen เขียน test แรก ไปจนถึงรันบน CI"
---

> 📅 เขียนเมื่อ: กันยายน 2026 | Vitest 4.1.11, Supertest 7.2.2, @types/supertest 7.2.1
> ⚠️ ตรวจสอบข้อมูล ณ วันที่ 3 กันยายน 2026 จาก npm registry และเอกสารทางการ — เวอร์ชันและ API อาจเปลี่ยนเมื่อคุณอ่านบทความนี้

เคยเป็นไหม — เทสต์ API ทั้งหมดของทีมอยู่ใน Postman มี collection ชื่อว่า "Production Sanity" อยู่บนเครื่องของคนที่ออกจากบริษัทไปแล้ว เวลาใครแก้ endpoint ก็ต้องเดาเอาว่า collection ที่ตัวเองใช้อยู่เวอร์ชันล่าสุดหรือเปล่า ส่วนเพื่อนอีกคนที่อยากรันเทสต์บน CI ก็ต้องลาก Newman เข้ามา แล้วก็เจอว่าคำสั่งยิง API มันเขียนด้วยภาษาของ Postman (pm.*) ซึ่งไม่เหมือนกับโค้ดที่เราเขียนกันอยู่ทุกวัน — แก้ทีต้องเปิด GUI ก่อนเสมอ

จุดที่ Postman/Newman มันเจ็บไม่ใช่ตอนแรกเริ่ม แต่เป็นตอนที่ API โตขึ้น: collection เป็นไฟล์ JSON ที่ merge แล้วชนกันทุกครั้ง, เปิด pull request ที reviewer เห็นแต่โค้ดไม่เห็นเทสต์, แล้ว "เทสต์" ที่ว่านี้ก็รันได้แค่บนเครื่องคนที่เปิด Postman เป็น

วิธีที่ช่วยได้คือย้ายเทสต์พวกนี้มาเป็นโค้ด — เขียนเป็นไฟล์ TypeScript ปกติที่อยู่ใน repo เดียวกับ API เรานี่แหละ แล้วใช้ **Vitest** (test runner — ตัวเดิมที่เราใช้เขียน unit test) จับคู่กับ **Supertest** (ไลบรารีที่เอา HTTP request ยิงเข้า Express app ของเราได้โดยตรง โดยไม่ต้องมานั่งเปิด server รอ) บทความนี้จะพาไล่ทีละขั้น ตั้งแต่เปิด terminal ไปจนถึงมีเทสต์รันอัตโนมัติบน GitHub Actions ทุกครั้งที่ push — ใช้ repo เดิม ไม่ต้องสร้างโปรเจกต์ใหม่

> สำหรับเพื่อนที่เพิ่งเริ่ม: acceptance test ในที่นี้คือเทสต์ที่ตรวจ "สัญญาจากมุมผู้ใช้ API" — ยิง GET/POST ไปที่ endpoint แล้วเช็คว่า status, header, body ถูกต้องตามที่ตกลงกันไว้ รวมถึงกรณี error ต่าง ๆ ซึ่งต่างจาก unit test ที่ยิงเข้าไปที่ฟังก์ชันภายในโดยตรง

## ขั้นที่ 1 — ตรวจ Node.js version ก่อน

Supertest กับ Vitest เป็นเครื่องมือที่รันบน Node.js (โปรแกรมที่ทำให้ JavaScript รันนอก browser ได้) เรื่องแรกจึงเหมือนบทความ Playwright ของเรา — ดูว่าเครื่องใช้ Node รุ่นไหนอยู่:

```bash
node -v
```

ตอนเขียนบทความนี้เครื่องที่ใช้ลองคือ `v22.23.2` ถ้าได้รุ่นประมาณนี้สบายใจได้ แต่ถ้ายังค้างอยู่ที่ Node 18 หรือ 19 ขอเตือนว่า**ต้องอัปเกรดก่อน** — ผมเช็คจาก npm registry เมื่อ 3 กันยายน 2026 พบว่า package `vitest@4.1.11` ประกาศค่า `engines: node "^20.0.0 || ^22.0.0 || >=24.0.0"` ไว้ในตัว package เอง เอกสารทางการของ Vitest ก็ยืนยันว่าต้องใช้ Node 20 ขึ้นไป เช่นเดียวกับ Vite 6+ ที่มันพึ่งพา ส่วน `supertest@7.2.2` นั้นใจกว้างกว่าคือรับ Node 14.18+ แต่ตัวที่ชี้ขาดคือ Vitest — แปลว่า repo ต้องอยู่บน Node 20 ขึ้นไป (รุ่น LTS อย่าง 22 หรือ 24 ยิ่งดี)

> สำหรับเพื่อนที่เพิ่งเริ่ม: ถ้าเครื่องมีหลายโปรเจกต์ที่ใช้ Node ต่างรุ่นกัน แนะนำ version manager อย่าง nvm หรือ fnm ไว้สลับรุ่น — เวลาอัปก็แค่ `nvm install --lts && nvm use --lts`

## ขั้นที่ 2 — ติดตั้ง Vitest + Supertest

เปิด terminal เข้าไปที่ root ของ repo (ที่อยู่ ๆ ของ `package.json`) แล้วรัน:

```bash
npm install -D vitest supertest @types/supertest
```

สามตัวนี้คืออะไร:

- **vitest** — test runner ตัวรันเทสต์ รองรับ TypeScript ตรง ๆ ไม่ต้องตั้งค่า compile แยก
- **supertest** — ตัวยิง HTTP request ใส่ app ที่เราส่งให้ ทำงานกับ test framework ใดก็ได้
- **@types/supertest** — type definition สำหรับโปรเจกต์ TypeScript (ถ้า repo เราเป็น JavaScript ล้วน ข้ามตัวนี้ได้)

ยังไม่ต้องตั้งค่าอะไรเพิ่ม — ไม่ต้องสร้าง `vitest.config.ts` เพราะค่า default ของ Vitest คือ environment `node` ซึ่งเหมาะกับเทสต์ฝั่ง API อยู่แล้ว (การตั้งค่าเพิ่มมีไว้ตอนที่ repo บังคับ environment อย่างอื่น ดูในขั้นที่ 4)

## ขั้นที่ 3 — แยก app ออกจาก listen

นี่คือจุดที่ต้อง refactor เล็กน้อย และเป็นหัวใจของเทสต์แบบนี้ ถ้า repo Express/TypeScript ทั่วไป entrypoint มักหน้าตาประมาณนี้:

```ts
// index.ts — ก่อน refactor
import express from "express";

const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(3000, () => {
  console.log("API listening on http://localhost:3000");
});
```

ปัญหาคือ `app.listen(3000)` — พอเทสต์อยาก import `app` มาใช้ มันจะไปเปิด server จริง ๆ ที่ port 3000 ทันที (ซ้ำกับที่ dev เปิดอยู่ก็ชน port กัน หรือไม่ก็ค้างเป็น process ไม่จบ) เราจึงแยก "ตัว app" ออกจาก "ตัวที่รัน server" เป็นสองไฟล์:

```ts
// app.ts — export ตัว app (ไม่มี side effect ตอน import)
import express from "express";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/users/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "id must be a positive integer" });
      return;
    }
    res.json({ id, name: "somchai" });
  });

  return app;
}
```

```ts
// index.ts — entrypoint: จุดเดียวที่รู้เรื่อง port
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
```

เวลา dev หรือ deploy ก็รัน `index.ts` เหมือนเดิมทุกอย่าง ไม่มีอะไรเปลี่ยน — แค่ย้ายที่อยู่ของ `app` ออกมา หลักการนี้ไม่ได้มีไว้เพื่อเทสต์อย่างเดียว มันคือ **design for testability**: อยากเทสต์เมื่อไหร่ก็ import `createApp()` มาสร้าง instance สดใหม่ได้ตลอด

> สำหรับเพื่อนที่เพิ่งเริ่ม: ในตัวอย่าง import ลงท้ายด้วย `.js` (`import { createApp } from "./app.js"`) ทั้งที่ไฟล์จริงเป็น `.ts` — นี่คือกติกาของ repo ที่ใช้ ESM + module resolution แบบ NodeNext ถ้า repo เราใช้แบบ bundler (อย่าง Next.js หรือ Vite) จะเขียนแบบไม่มี `.js` ก็ได้ ขอแค่ดูตัวอย่างไฟล์อื่นใน repo แล้วทำตามแบบเดียวกัน

ถ้า repo เราไม่ได้ใช้ Express — สรุปสั้น ๆ ว่า supertest ทำงานกับ HTTP server หรือ Express-style app โดยตรง ส่วนคนที่อยู่ในโลก **Fastify** หรือ **Hono** อยู่แล้วอาจไม่ต้องพึ่ง supertest ด้วยซ้ำ เพราะทั้งคู่มีของเล่นในตัว: Fastify มี `app.inject()` (ยิง request เข้า app โดยไม่ผ่าน network เลย) และ Hono มี `app.request()` — ใครใช้สองตัวนี้ลองค้นดูได้ แต่บทความนี้ขอโฟกัส Express เพราะเป็นเคสที่เจอบ่อยสุด

## ขั้นที่ 4 — เขียน acceptance test ตัวแรก

สร้างไฟล์ `tests/api.spec.ts` — สังเกตว่าชื่อต้องมี `.spec.` หรือ `.test.` อยู่ในนั้น เพราะนี่คือกติกาที่ Vitest ใช้ค้นหาไฟล์เทสต์ (เราสร้างโฟลเดอร์ `tests/` ไว้ที่ root ซึ่งตรงกับค่า default อยู่แล้ว ไม่ต้อง config อะไร):

```ts
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// สร้าง app ครั้งเดียวแล้วยิงซ้ำได้ — supertest จะเปิด server ชั่วคราวให้เองทุก request
const app = createApp();

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/users/:id", () => {
  it("returns a user for a valid id", async () => {
    const res = await request(app).get("/api/users/1");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.id).toBe(1);
    expect(res.body.name).toBe("somchai");
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/users/abc");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("positive integer");
  });
});
```

ไล่ให้ดูทีละส่วน: `request(app)` คือการบอก supertest ว่าให้ยิง HTTP ไปที่ app ตัวไหน — จุดนี้แหละที่ต้องมีขั้นที่ 3 เพราะถ้า import ไฟล์ที่มัน `listen` อยู่จะเจอปัญหา ส่วน `.get("/api/health")` ก็คือ method กับ path ที่อยากยิง (มี `.post().send(...)` สำหรับส่ง body ด้วย) พอ `await` เสร็จ เราได้ `res` กลับมา ซึ่งมีทั้ง `res.status`, `res.headers`, และ `res.body` — ตัวหลังนี้ supertest แปลง JSON ให้เราแล้ว ไม่ต้อง `JSON.parse` เอง

ส่วนการ assert เราใช้ `expect` ของ Vitest ตามปกติ — ตรงนี้จะต่างจากสไตล์ของ Newman หน่อยตรงที่เราเขียนด้วยภาษาเดียวกับโค้ด production ทั้งหมด (supertest เองก็มี `.expect(200)` แบบลูกโซ่ในตัว แต่พอ assert body ซับซ้อนขึ้น การ `await` แล้วค่อยตรวจด้วย `expect` ของ Vitest จะอ่านง่ายกว่าและใช้ท่าที่มีอยู่แล้วใน unit test)

> สำหรับเพื่อนที่เพิ่งเริ่ม: สงสัยไหมว่า "ไม่เห็นเปิด server ที่ไหนเลย แล้ว request มันไปโดนอะไร?" — ความลับคือ supertest จะสร้าง HTTP server จริงขึ้นมาบน port ว่าง ๆ ชั่วคราว (ephemeral port) แล้วยิง request เข้าไปให้เราทุกครั้ง แล้วปิด server ทิ้งเมื่อจบ request — server เกิด-ดับพร้อมเทสต์ เราไม่ต้องยุ่งกับ port หรือ lifecycle เลย นี่คือความหมายของ "in-process" ตามที่เขาเรียกกัน

อีกกรณีที่ต้องรู้: ถ้า repo ของเรามี `vitest.config.ts` ที่ตั้ง environment อย่างอื่นไว้ทั้งโปรเจกต์ (เช่น repo ที่เขียน unit test ฝั่ง React/Next.js ด้วย jsdom มาก่อน) ให้บังคับไฟล์นี้ให้รันบน node ด้วยคอมเมนต์พิเศษบรรทัดแรก:

```ts
// @vitest-environment node
```

เทสต์ฝั่ง API ต้องรันบน environment `node` เพราะมันยิง HTTP จริง ไม่ได้แตะ DOM — ไม่งั้นจะช้าและอาจพังเพราะไปจำลอง browser มาครบชุดโดยไม่จำเป็น

## ขั้นที่ 5 — รันเทสต์

รันด้วยคำสั่ง:

```bash
npx vitest run
```

`run` ต่อท้ายแปลว่า "รันรอบเดียวแล้วจบ" — ต่างจาก `npx vitest` เฉย ๆ ที่จะเข้าโหมด watch (เฝ้าไฟล์ รันซ้ำอัตโนมัติทุกครั้งที่ save ซึ่งก็มีประโยชน์ตอน dev) ผลลัพธ์ที่ได้จากเครื่องที่ลองเขียนบทความนี้:

```
 RUN  v4.1.11 /tmp/apitest-lab

 Test Files  1 passed | 1 skipped (2)
      Tests  3 passed | 1 skipped (4)
```

ถ้าอยากให้เทสต์นี้เป็นคำสั่งที่เรียกง่าย (และใช้ใน CI ด้วย) เพิ่ม script ใน `package.json`:

```json
"scripts": {
  "test:api": "vitest run"
}
```

ต่อไปก็รันแค่ `npm run test:api` คำสั่งอื่น ๆ ที่ใช้บ่อย:

```bash
npx vitest run tests/api.spec.ts          # รันแค่ไฟล์เดียว
npm run test:api                          # รันทั้งหมดผ่าน script
```

คราวนี้ลองจงใจทำให้ fail ดูสักครั้ง (เช่นเปลี่ยน `toBe(200)` เป็น `toBe(201)`) แล้วดู error message — Vitest จะโชว์ diff ระหว่างค่าที่คาดกับค่าที่ได้ชัดเจนมาก ควรรู้หน้าตาไว้ก่อนเจอของจริง

## ขั้นที่ 6 — (เพิ่มเติม) เทสต์กับ server ที่รันอยู่จริงผ่าน env

เทสต์ที่เขียนในขั้นที่ 4 เรียกว่าเทสต์ **in-process** เพราะ server ผุดขึ้นมาพร้อมเทสต์ใน process เดียวกัน — เร็ว เปิด CI ได้ทันที ไม่ต้องพึ่งของนอก แต่ก็แลกกับสิ่งที่มันไม่เห็น: มันไม่รู้ว่า server ที่ deploy จริงเปิดด้วย config แบบไหน ต่อ database ตัวไหน

ถ้าอยากได้เทสต์แบบ **black-box** — ยิงผ่าน network เข้า server ที่รันอยู่จริง (ไม่ว่าจะเป็น `npm run dev` ในเครื่อง, docker compose, หรือ staging บน cloud) — ก็แยกอีกไฟล์หนึ่งที่ยิงด้วย `fetch` ธรรมดา (Node 20+ มี global fetch ให้แล้ว ไม่ต้องติดตั้งเพิ่ม) โดยอ่าน base URL จาก environment variable:

```ts
// tests/blackbox.spec.ts — เทสต์ผ่าน server ที่รันอยู่จริง
// ถ้าไม่ตั้ง API_BASE_URL ไว้ ไฟล์นี้จะถูกข้ามไป (อัตโนมัติ)
import { describe, expect, it } from "vitest";

const baseUrl = process.env.API_BASE_URL; // เช่น http://localhost:3000

describe.skipIf(!baseUrl)("acceptance ผ่าน server จริง", () => {
  it("GET /api/health ตอบ 200", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
  });
});
```

`describe.skipIf(!baseUrl)` แปลว่า "ถ้าไม่มี env นี้ ให้ข้ามทั้งกลุ่ม" — เทคนิคนี้ทำให้ repo เดียวรันได้สองโหมด: เปิด server เองแล้วสั่ง `API_BASE_URL=http://localhost:3000 npm run test:api` ก็ได้ชุด black-box เพิ่มขึ้นมา ส่วนตอน local ธรรมดาที่ไม่อยากเปิด server ก็รันเทสต์ in-process ตามปกติ กลุ่ม black-box จะถูกข้ามไปเงียบ ๆ โดยไม่ทำให้ suite แดง

> สำหรับเพื่อนที่เพิ่งเริ่ม: ระวังชื่อตัวแปรนิดหนึ่ง — ตอนแรกผมจะตั้งชื่อว่า `BASE_URL` แต่พอรันจริงพบว่าเทสต์มันไม่ยอม skip สักที เพราะ **Vitest สงวนชื่อ `BASE_URL` ไว้ใช้เองแล้ว** (มันมีค่าเป็น `/` สำหรับ base path ของ Vite เสมอ — ต่อให้ไม่ตั้ง env ก็ truthy) ใช้ชื่อ `API_BASE_URL` หรืออะไรที่เฉพาะกว่านี้จะไม่ชนกัน

ส่วนเรื่อง `.env` — จากที่ลองกับเวอร์ชัน 4.1.11 นั้น Vitest ไม่ได้อ่านไฟล์ `.env` ที่ root ให้อัตโนมัติแบบ Vite ตอนรัน dev สิ่งที่เทสต์เห็นคือ environment variable ของ shell ที่รันอยู่ ถ้าอยากพึ่ง `.env` ให้โหลดเอง เช่น `import "dotenv/config"` ในไฟล์เทสต์ หรือจะส่งค่าตอนรันแบบตัวอย่างด้านบนก็ง่ายสุด

## ขั้นที่ 7 — ใส่ CI ด้วย GitHub Actions

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
      - name: Install dependencies
        run: npm ci
      - name: Run API acceptance tests
        run: npm run test:api
```

จุดเด่นของแนวทางนี้คือ**เทสต์ใน-process รันบน CI ได้โดยไม่ต้องเปิด server หรือ container ใด ๆ** — `npm ci` ติดตั้ง dependency จาก lockfile (แปลว่า repo ต้อง commit `package-lock.json` ไว้ด้วย ถ้าใช้ yarn/pnpm ก็เปลี่ยนคำสั่งให้ตรงกัน) แล้ว `npm run test:api` จบ workflow ภายในไม่กี่วินาที ไม่เหมือนเทสต์แบบ GUI หรือ e2e ที่ต้องเตรียม environment เยอะ

ถ้า repo มีชุด black-box ที่ต้องยิง server จริงด้วย (มี staging environment หรือใช้ service container ใน CI) ก็แค่ส่ง env ให้ job:

```yaml
      - name: Run API acceptance tests (รวม black-box)
        env:
          API_BASE_URL: ${{ vars.API_BASE_URL }}
        run: npm run test:api
```

ตอนยังไม่มี `API_BASE_URL` ใน CI ชุด black-box จะถูก skip ไปก่อน แล้วค่อยมาเปิดเมื่อพร้อม — เทสต์หลักที่เขียนในขั้นที่ 4 ยังคุ้มครองเราได้ตั้งแต่ PR แรก

## ของแถมที่ควรรู้ไว้

- **Postman ไม่ได้ไร้ค่า** — การยิง explore ดู response ครั้งเดียว หรือ debug ตอนเทสต์แดง ตัว GUI ยังสะดวกตรงเห็น structure ชัด ๆ เรื่องที่เราย้ายคือ "เทสต์ที่ต้องรันซ้ำและเป็นหลักประกัน" ไม่ใช่ตัว Postman
- **Newman เป็นสะพาน** — ถ้าทีมมี collection ใหญ่อยู่แล้วและยังย้ายไม่ทัน การให้ Newman รัน collection เดิมบน CI เป็นขั้นกลางที่รับได้ แต่ค่อย ๆ เขียนเทสต์ใหม่เป็นโค้ดทีละ endpoint เพราะของเดิมยังเป็นภาษาของ Postman ที่ review และ refactor ลำบาก
- **ความสดของ app** — ตัวอย่างสร้าง app ครั้งเดียวตอน top-level เพราะ app เราไม่มี state ถ้า app มี cache หรือ state ที่อยากให้สดทุกเทสต์ ให้ย้ายไปสร้างใน `beforeEach` แทน
- **Node บน CI กับเครื่องให้ตรงกัน** — ตั้ง `node-version` ใน workflow เท่ากับที่ dev ใช้ (หรือใช้ `lts/*` ก็ได้) ป้องกันเทสต์เขียวบนเครื่องแต่แดงบน CI เพราะคนละรุ่น Node

ครบแล้ว — จาก `node -v` ไปจนถึงเทสต์แรกเขียวบน GitHub Actions โดยไม่ต้องเปิด Postman สักครั้ง สิ่งที่ได้กลับมาไม่ใช่แค่ "เทสต์ที่รันเองได้" แต่คือเทสต์ที่อยู่ใน version control เดียวกับโค้ด ถูก review ใน PR เดียวกัน และรันซ้ำที่ไหนก็ได้บนโลกใบนี้ ถ้าอยากต่อยอด ลำดับถัดไปที่น่าสนใจคือเขียนเทสต์ครอบ flow ที่ต้อง authenticate ก่อน (ยิง login ก่อนแล้วส่ง token ต่อ), หรือใช้ service container ใน CI เพื่อเทสต์กับ database จริง — เดี๋ยวไว้มาเล่าต่อ

### แหล่งอ้างอิง (ตรวจสอบ 3 กันยายน 2026)

- [npm registry — vitest 4.1.11](https://www.npmjs.com/package/vitest) — `engines.node ^20.0.0 || ^22.0.0 || >=24.0.0`
- [Vitest — Getting Started](https://vitest.dev/guide/) — ต้องใช้ Node 20+ และ Vite 6+, กติกาชื่อไฟล์ `.test.`/`.spec.`, โหมด `vitest run`
- [Vitest — Config: environment](https://vitest.dev/config/environment) — control comment `// @vitest-environment node` ระดับไฟล์
- [Supertest — GitHub README](https://github.com/ladjs/supertest) — ตัวอย่าง `request(app).get(...)`, การ bind port ชั่วคราว, รูปแบบ async/await, รองรับ HTTP/2
- [npm registry — supertest 7.2.2](https://www.npmjs.com/package/supertest) และ [@types/supertest 7.2.1](https://www.npmjs.com/package/@types/supertest)
- [GitHub Actions — setup-node (Marketplace, v7)](https://github.com/marketplace/actions/setup-node-js-environment) — workflow ตัวอย่าง `checkout@v7` + `setup-node@v7`
