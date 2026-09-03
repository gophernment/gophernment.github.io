---
title: "มี repo Frontend อยู่แล้ว จะเริ่มเขียน Playwright test ยังไง — ไล่ขั้นตอนให้ครบจนถึง CI"
date: 2026-09-03
tags: [playwright, testing, e2e, frontend]
description: "สอนทีละขั้นตอนว่าถ้ามี repo Frontend อยู่แล้ว จะเริ่มเขียน Playwright test ได้ยังไง ตั้งแต่ตรวจ Node version ติดตั้ง เขียน config เขียน test แรก ไปจนถึงรันบน GitHub Actions"
---

> 📅 เขียนเมื่อ: กันยายน 2026 | Playwright 1.62.1, @playwright/test 1.62.1
> ⚠️ ตรวจสอบข้อมูล ณ วันที่ 3 กันยายน 2026 จาก npm registry และเอกสารทางการของ Playwright — เวอร์ชันและ API อาจเปลี่ยนเมื่อคุณอ่านบทความนี้

สมมติว่าเรามี repo Frontend ตัวหนึ่งที่ทำงานจริงมาสักพักแล้ว — มี React หรือ Vue หรืออะไรก็แล้วแต่ โตขึ้นทุก sprint มี feature ใหม่ตลอด แต่ยังไม่มี end-to-end test สักตัว เวลาแก้หน้าไหนทีก็ต้องเปิด browser กดเองทุกอย่าง กว่าจะไล่คลิกครบ flow สำคัญก็ครึ่งชั่วโมง แล้วบางทีก็ลืมกด path ที่พัง

บทความนี้จะพาไล่ทีละขั้นตอน ตั้งแต่เปิด terminal ไปจนถึงมี Playwright test รันบน GitHub Actions ทุกครั้งที่ push — โดยไม่ต้องสร้างโปรเจกต์ใหม่ ใช้ repo เดิมนี่แหละ

## ขั้นที่ 1 — ตรวจ Node.js version ก่อน

Playwright เป็นเครื่องมือที่รันบน Node.js (โปรแกรมที่ทำให้ JavaScript รันนอก browser ได้) ฉะนั้นเรื่องแรกคือดูว่าเครื่องเรา (หรือ CI) ใช้ Node รุ่นไหนอยู่

```bash
node -v
```

ถ้าขึ้นประมาณ `v24.x.x` ก็สบายใจได้ สำหรับคนที่ได้ version เก่า ขอเตือนก่อนว่า**บทความยุคแรก ๆ ของ Playwright (รวมถึงของเราเอง) มักบอกว่า "Node 18 ก็พอ" แต่ตอนนั้นไม่ใช่แล้ว** — ผมเช็คจาก npm registry เมื่อ 3 กันยายน 2026 พบว่า package `@playwright/test@1.62.1` ประกาศค่า `engines: node >=20` ไว้ในตัว package เอง ส่วนเอกสารทางการของ Playwright ก็แนะนำให้ใช้ Node LTS รุ่นล่าสุดซึ่งตอนนี้คือ **22.x, 24.x หรือ 26.x**

แปลง่าย ๆ ว่า: ถ้า repo ยังค้างอยู่ที่ Node 18 หรือ 19 ให้อัปเกรด Node ก่อนทำอย่างอื่น ไม่งั้นจะเจอ error ตอน install หรือตอนรันทีหลัง

> สำหรับเพื่อนที่เพิ่งเริ่ม: ถ้าเครื่องมีหลายโปรเจกต์ที่ใช้ Node ต่างรุ่นกัน แนะนำให้ใช้ version manager อย่าง nvm หรือ fnm ไว้สลับรุ่น แทนที่จะลง Node ทับเครื่องเดียว แล้วต้องมานั่งแก้ทีละโปรเจกต์ เวลาจะอัปก็แค่ `nvm install --lts && nvm use --lts`

## ขั้นที่ 2 — ติดตั้ง Playwright เข้าไปใน repo

เปิด terminal เข้าไปที่ root ของ repo (ที่อยู่ ๆ ของ `package.json`) แล้วเลือกทางใดทางหนึ่ง:

**ทางที่ 1 — ใช้ตัวช่วยสร้าง (แนะนำสำหรับครั้งแรก):**

```bash
npm init playwright@latest
```

คำสั่งนี้เป็นตัว wizard ที่จะถามเราสองสามคำถาม เช่น จะใช้ TypeScript หรือ JavaScript, จะเก็บ test ไว้โฟลเดอร์อะไร (ค่า default คือ `tests` แต่ถ้า repo มีโฟลเดอร์ `tests` อยู่แล้ว เช่นใช้กับ unit test ของ Vitest มันจะเสนอ `e2e` ให้แทน — เลือก `e2e` ไปเลยจะได้ไม่ปนกัน), จะเพิ่ม GitHub Actions workflow ให้ไหม และจะติดตั้ง browser ตอนนี้เลยไหม

สำคัญตรงที่เจ้านี่**ไม่ได้สร้างโปรเจกต์ใหม่ทับ** — มันแค่เพิ่ม dependency เข้าไปใน `package.json` เดิมของเรา สร้าง `playwright.config.ts` กับ test ตัวอย่างมาให้หนึ่งไฟล์ ถ้ารันซ้ำก็ไม่ไปทับ test ที่เขียนไว้แล้ว

**ทางที่ 2 — ลงมือเองแบบมินิมอล:**

```bash
npm install -D @playwright/test
```

ได้แค่ตัว package ไว้ก่อน ไฟล์ config เราจะเขียนเองในขั้นที่ 4

## ขั้นที่ 3 — ดาวน์โหลด browser

ตัว package Playwright ไม่ได้ฝัง browser มาให้ ต้องสั่งดาวน์โหลดเองอีกที:

```bash
npx playwright install
```

คำสั่งนี้จะโหลด Chromium, Firefox และ WebKit (ตัว engine ที่ใช้รัน Safari) ลงในโฟลเดอร์ cache แยกของเครื่อง — ไม่ไปยุ่งกับ Chrome หรือ Safari ที่เราเปิดใช้ประจำวัน ถ้าอยากได้แค่ตัวเดียวเพื่อประหยัดเวลา/พื้นที่ก็ระบุชื่อได้ เช่น `npx playwright install chromium`

> สำหรับเพื่อนที่เพิ่งเริ่ม: เวลาเจอ error ประเภท "Executable doesn't exist" หรือ "browser not found" ให้จำไว้ก่อนเลยว่ามักจะมาจากการลืมรันคำสั่งนี้ หรือไม่ก็อัปเวอร์ชัน Playwright แล้วไม่รันใหม่ — เพราะ**แต่ละเวอร์ชันของ Playwright ผูกกับ browser build รุ่นเฉพาะ** เพื่อให้ผลการรัน reproducible ไม่ขึ้นกับว่าเครื่องใครลง Chrome อะไรไว้

ถ้าอยากเช็คว่าได้เวอร์ชันอะไร ก็รัน `npx playwright --version` ดูได้

## ขั้นที่ 4 — เขียน playwright.config.ts

ถ้าใช้ wizard ในขั้นที่ 2 มันจะสร้างไฟล์นี้ไว้ให้แล้ว แต่เราควรเข้าใจว่าแต่ละบรรทัดคืออะไรเพื่อปรับให้เข้ากับ repo ของเรา ไฟล์นี้เก็บไว้ที่ root ของโปรเจกต์ ตัวอย่างหน้าตาแบบที่ใช้กับ repo Frontend ที่มีอยู่แล้ว:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // โฟลเดอร์ที่เก็บไฟล์ test (เราเลือก e2e เพื่อไม่ให้ปนกับ unit test)
  testDir: './e2e',

  // รันทุกไฟล์ test ขนานกัน
  fullyParallel: true,

  // ถ้ารันบน CI แล้วมี test.only หลงเหลืออยู่ ให้ fail ทันที
  forbidOnly: !!process.env.CI,

  // เทสต์ที่ fail จะถูกรันซ้ำอีก 2 รอบ — เฉพาะบน CI
  retries: process.env.CI ? 2 : 0,

  // บน CI รันทีละ 1 worker เพื่อความเสถียร
  workers: process.env.CI ? 1 : undefined,

  // HTML report ไว้เปิดดูหน้าตาเทสต์ทั้งหมด
  reporter: 'html',

  use: {
    // พอตั้ง baseURL แล้ว ใน test เขียนแค่ page.goto('/') ก็พอ
    baseURL: 'http://localhost:3000',

    // เทสต์ไหน fail แล้วถูกรันซ้ำ จะบันทึก trace ไว้ให้เปิดดูย้อนหลัง
    trace: 'on-first-retry',
  },

  // รันบน Chromium ก่อน ถ้าอยากได้ Firefox/WebKit ค่อยเพิ่ม project
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // ให้ Playwright เปิด dev server ให้เองก่อนรันเทสต์ แล้วปิดให้หลังจบ
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

จุดที่ต้องปรับให้เข้ากับ repo จริงคือ `command` กับ `url` ใน `webServer` — ดูว่าโปรเจกต์เราเปิด dev server ที่ port ไหน (Next.js ส่วนใหญ่ใช้ 3000, Vite ค่า default เป็น 5173) แล้วแก้ให้ตรง ถ้าโปรเจกต์ไหนมี build + start script สำหรับ production ก็ใช้ตัวนั้นรันเทสต์ได้เหมือนกัน จะได้ไม่เจอความช้าตอน dev server compile รอบแรก

ของสองอย่างที่คนใหม่มักสับสนระหว่าง `baseURL` กับ `webServer`: `baseURL` แค่ทำให้เราเขียน path สั้น ๆ ใน test ได้ (`page.goto('/')` แทนการพิมพ์ URL เต็ม) แต่**มันไม่ใช่คนเปิด server** ส่วน `webServer` คือคนที่สั่งรันแอปให้ตอนเริ่มเทสต์และปิดให้ตอนจบ — ถ้าเราเป็นคนเปิด dev server เองอยู่แล้ว และไม่อยากให้ Playwright เปิดซ้ำ ก็ใส่ `reuseExistingServer: true` ไว้ มันจะเห็นว่า server รันอยู่ที่ url นั้นแล้วก็ข้ามไป

สุดท้าย เพิ่ม script ใน `package.json` ให้เรียกง่าย ๆ:

```json
"scripts": {
  "test:e2e": "playwright test"
}
```

## ขั้นที่ 5 — เขียน test แรก

สร้างไฟล์ `e2e/example.spec.ts` (นามสกุล `.spec.ts` หรือ `.test.ts` ก็ได้ Playwright จับไฟล์ทั้งสองแบบ) สมมติว่า repo ของเรามีหน้าแรกที่ path `/` ซึ่งมี heading ชื่อ "ของดีต้องรีบสั่ง" และลิงก์ "เข้าไปดูสินค้า" ที่พาไปหน้า `/products`:

```ts
import { test, expect } from '@playwright/test';

test('หน้าแรกเปิดได้และมีหัวข้อหลัก', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'ของดีต้องรีบสั่ง' })
  ).toBeVisible();
});

test('คลิกเข้าไปดูสินค้าแล้วเจอหน้ารายการ', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'เข้าไปดูสินค้า' }).click();

  await expect(page).toHaveURL(/\/products/);
  await expect(page.getByRole('heading', { name: 'สินค้าทั้งหมด' })).toBeVisible();
});
```

สังเกตว่าวิธีหาองค์ประกอบคือ `getByRole('heading', { name: '...' })` หรือ `getByRole('link', { name: '...' })` — เราเรียกเจ้าพวกนี้ว่า **locator** ซึ่งมันมองหาองค์ประกอบด้วยบทบาทและชื่อที่**ผู้ใช้มองเห็นจริง** ไม่ใช่ class หรือ id ใน HTML ที่เวลา refactor แล้วพังบ่อย

ส่วน `expect(...).toBeVisible()` หรือ `toHaveURL(...)` นั้นเป็น **web-first assertion** — มันจะ**รอ**จนกว่าเงื่อนไขจะเป็นจริง (ภายใน timeout ที่ตั้งไว้) แทนที่จะเช็คปุ๊บแล้วพังปั๊บ จึงไม่ค่อยมีปัญหา race condition แบบที่เขียน test เองด้วย sleep แล้วเดาเอา

> สำหรับเพื่อนที่เพิ่งเริ่ม: สังเกตพารามิเตอร์ `{ page }` — ตรงนี้คือ test fixture ที่ Playwright เตรียมไว้ให้ โดยทุก test จะได้ browser context ใหม่คนละอัน (เหมือนเปิด browser profile ใหม่สด ๆ) ฉะนั้น state จาก test ก่อนหน้าไม่รั่วมาปน — ไม่ต้องเขียนโค้ดล้างข้อมูลเอง

## ขั้นที่ 6 — รันเทสต์

```bash
npx playwright test
```

หรือถ้าเพิ่ม script ในขั้นที่ 4 แล้ว ก็ `npm run test:e2e` ได้ ครั้งแรกมันจะรันแบบ headless (ไม่มีหน้าต่าง browser โผล่) รันทุกไฟล์ใน `e2e/` ขนานกัน แล้วสรุปผลบน terminal

คำสั่งที่ใช้บ่อยตอนเริ่มต้น:

```bash
npx playwright test                       # รันทั้งหมด
npx playwright test e2e/example.spec.ts    # รันแค่ไฟล์เดียว
npx playwright test --headed               # รันแบบโชว์ browser ให้เห็นว่ามันทำอะไร
npx playwright test --ui                   # เปิด UI mode: เห็น step ทีละขั้น ย้อนเวลา debug ได้
npx playwright show-report                 # เปิด HTML report ของรอบล่าสุด
```

ถ้าเทสต์ผ่านแล้ว ลองจงใจทำให้ fail ดูสักครั้ง (เช่นเปลี่ยนข้อความใน expect ให้ผิด) เพื่อดูว่า report กับ error message หน้าตาเป็นยังไง — เพราะตอนนี้แหละคือช่วงที่ปลอดภัยที่สุดให้พลาด แล้วจะได้รู้ว่าตอนเจอของจริงต้องอ่านอะไร

## ขั้นที่ 7 — ใส่ CI ด้วย GitHub Actions

พอ test รันผ่านในเครื่อง ก็ถึงเวลาทำให้มันรันอัตโนมัติทุกครั้งที่ push หรือเปิด pull request — ไม่งั้นเดี๋ยวก็ลืมรันเองอีก สร้างไฟล์ `.github/workflows/playwright.yml` (workflow ด้านล่างเป็นตัวอย่างทางการของ Playwright ที่ปรับเล็กน้อย):

```yaml
name: Playwright Tests
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: lts/*
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright Browsers
        run: npx playwright install --with-deps
      - name: Run Playwright tests
        run: npx playwright test
      - uses: actions/upload-artifact@v5
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

ไล่ให้ดูทีละ step: `setup-node` ติดตั้ง Node รุ่น LTS, `npm ci` ติดตั้ง dependency จาก lockfile (แปลว่า repo ต้อง commit `package-lock.json` ไว้ด้วย ถ้าโปรเจกต์ใช้ yarn หรือ pnpm ก็เปลี่ยนเป็นคำสั่งของตัวนั้น), ส่วน `npx playwright install --with-deps` นั้นสำคัญ — บน Linux นอกเหนือจากตัว browser แล้วยังต้องลง system library อีกชุดหนึ่ง `--with-deps` จะจัดการให้ทั้งหมด และ step สุดท้ายคืออัปโหลด HTML report ขึ้นมาเป็น artifact เผื่อเทสต์แดงจะได้กดดูได้ว่า fail ตรงไหน

มีจุดเด่นอีกอย่างคือ config ที่เราเขียนในขั้นที่ 4 มันทำงานอัตโนมัติบน CI — เพราะ GitHub Actions ตั้ง environment variable `CI=true` ให้เอง เมื่อไหร่ที่รันบน CI มันจะบังคับ `workers = 1` (รันเรียงกันเพื่อความเสถียร), เปิด retries ให้ 2 รอบ (กันเทสต์ที่หลุดเพราะ environment วูบวาบ), และถ้ามี `test.only` หลงเหลืออยู่ในโค้ดจะ fail ทันที

## ของแถมที่ควรรู้ไว้

- **Reporter** — ค่า default คือ `html` ซึ่งพอใช้ไปสักพักอาจอยากได้แบบที่อ่านใน terminal แล้วเข้าใจง่ายกว่า (`reporter: 'line'`) หรือส่งผลให้ CI tool อื่น (`junit`) ก็เปลี่ยนได้ที่ config ตัวเดียว
- **Trace** — ค่า `trace: 'on-first-retry'` ที่ตั้งไว้หมายความว่าเทสต์ที่ fail แล้วถูก run ซ้ำจะถูกบันทึกทุกการคลิก ทุก network request ให้เราเปิดดูใน HTML report ได้แบบ time-travel — ไว้สำหรับวันนั้นที่เทสต์แดงแล้วมึนว่าทำไม
- **อย่าลืม .gitignore** — เพิ่ม `playwright-report/` และ `test-results/` (โฟลเดอร์เก็บ artifact ตอนรัน) ลงไปด้วย จะได้ไม่เผลอ commit report เก่า ๆ เข้า repo
- **อัปเดตเวอร์ชัน** — เวลาอัป Playwright ให้ทำสองคำสั่งคู่กันเสมอ: `npm install -D @playwright/test@latest` แล้วตามด้วย `npx playwright install` เพื่อดาวน์โหลด browser build ที่เข้ากับเวอร์ชันใหม่

ครบแล้ว — ตั้งแต่ `node -v` ไปจนถึงเทสต์แรกเขียวบน GitHub Actions เส้นทางของ repo ไหนก็ตามที่เริ่มต้นจากศูนย์แบบนี้ ถ้าอยากต่อยอดจากตรงนี้ ลำดับถัดไปที่น่าสนใจคือลอง `npx playwright codegen` (ให้มันบันทึกการคลิกเราเป็นโค้ด test ให้อัตโนมัติ), จำลอง mobile viewport, หรือจัดการ login state ไว้ใช้ข้าม test — เดี๋ยวไว้มาเล่าต่อ

### แหล่งอ้างอิง (ตรวจสอบ 3 กันยายน 2026)

- [Playwright — Installation & System requirements](https://playwright.dev/docs/intro) — ระบุ Node.js 22.x / 24.x / 26.x
- [Playwright — Test configuration](https://playwright.dev/docs/test-configuration) — testDir, use, webServer, reporter
- [Playwright — Writing tests](https://playwright.dev/docs/writing-tests) — locator, web-first assertions
- [Playwright — Continuous Integration](https://playwright.dev/docs/ci) — GitHub Actions workflow
- [npm registry — @playwright/test 1.62.1](https://www.npmjs.com/package/@playwright/test) — `engines.node >= 20`
