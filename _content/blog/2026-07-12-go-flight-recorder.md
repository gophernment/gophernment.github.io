---
title: "Flight Recorder ใน Go 1.25: debug production ย้อนหลังโดยไม่ต้องเก็บ trace ทั้งเส้นทาง"
date: 2026-07-12
tags: [go, tracing, debugging, observability, production]
---

`runtime/trace` เป็นเครื่องมือ debug ที่ทรงพลังของ Go มานาน แต่มีข้อจำกัดหนึ่งที่ทำให้ใช้กับ production service ยาก: ต้องรู้ล่วงหน้าว่าจะมีปัญหา ถึงจะเรียก `trace.Start` ทัน — บทความนี้สรุปฟีเจอร์ **Flight Recorder** ที่ Go 1.25 เพิ่มเข้ามาแก้ปัญหานี้ตรง ๆ อ้างอิงจาก [Flight Recorder in Go 1.25](https://go.dev/blog/flight-recorder) (บล็อกทางการของทีม Go)

**ขอบเขต:** สรุปที่มา หลักการทำงาน API และวิธีใช้ ไม่ได้ลงลึกการอ่าน trace file ด้วย `go tool trace` แบบละเอียด — ส่วนนั้นอ่านต่อได้จากบทความต้นฉบับ

**คำว่า "trace" คนละความหมายกับบทความ observability:** ถ้าอ่าน [ความสำคัญของ Observability ใน AI Agent](/blog/post.html?slug=2026-07-12-observability-ai-agent-go) มาก่อน ระวังสับสน — trace ในบทความนั้นคือ **distributed trace** ของ OpenTelemetry ตาม request ข้าม service/function call เพื่อดู business logic ส่วน `runtime/trace` ในบทความนี้คือ **execution tracer ของ Go runtime เอง** บันทึกพฤติกรรมระดับ goroutine scheduling, GC, syscall ภายใน process เดียว คนละ layer คนละเครื่องมือ แต่ใช้เสริมกันได้ เช่น OTel span บอกว่า tool call ไหนช้า ส่วน `runtime/trace` บอกว่าตอนนั้น goroutine ไปติดอยู่กับอะไรในระดับ runtime จริง ๆ

## ที่มา: ทำไมต้องมี Flight Recorder

ปัญหาของ `trace.Start`/`trace.Stop` แบบเดิมคือ timing เก็บ trace ทั้งเส้นทางได้ก็จริง แต่ใช้กับ long-running service ไม่ได้จริง ตามที่ทีม Go อธิบายไว้:

> "in long-running web services, the kinds of applications Go is known for, that's not good enough. Web servers might be up for days or even weeks, and collecting a trace of the entire execution would produce far too much data to sift through. Often just one part of the program's execution goes wrong, like a request timing out or a failed health check. By the time it happens it's already too late to call `Start`!"

โปรแกรมมักจะ "รู้" ว่ามีบางอย่างผิดปกติ (request timeout, health check fail) แต่สาเหตุจริงอาจเกิดไปแล้วหลายวินาทีก่อนหน้า — เก็บ trace ย้อนหลังไม่ได้ด้วยวิธีเดิม Flight Recorder แก้ตรงนี้:

> "A program often knows when something has gone wrong, but the root cause may have happened long ago. The flight recorder lets you collect a trace of the last few seconds of execution leading up to the moment a program detects there's been a problem."

ชื่อ "flight recorder" มาจาก black box บนเครื่องบินตรง ๆ — อัดวนไปเรื่อย ๆ ตลอดเวลา เก็บแค่ช่วงล่าสุด พอเกิดเหตุค่อยดึงข้อมูลช่วงนั้นออกมาดู

## หลักการทำงาน

> "The flight recorder collects the execution trace as normal, but instead of writing it out to a socket or a file, it buffers the last few seconds of the trace in memory. At any point, the program can request the contents of the buffer and snapshot exactly the problematic window of time."

สรุปเป็นกลไก: เก็บ trace ต่อเนื่องลง **ring buffer ในหน่วยความจำ** (ไม่เขียนลง disk ตลอดเวลาแบบ `trace.Start`) ข้อมูลเก่ากว่าที่ config ไว้ถูกเขียนทับ พอโปรแกรม detect ปัญหา (เช่น request ช้าเกิน threshold) ค่อยสั่ง snapshot buffer ทั้งก้อนออกมาเป็นไฟล์ trace ปกติที่เปิดด้วย `go tool trace` ได้ทันที

ที่ทำแบบนี้ได้โดย overhead ต่ำ เพราะโครงสร้าง trace format เปลี่ยนไปตั้งแต่ Go 1.22 — [release notes ของ Go 1.22](https://go.dev/doc/go1.22) ระบุไว้ว่า "Execution traces are now partitioned regularly on-the-fly and as a result may be processed in a streamable way." คือข้อมูล trace ถูกแบ่งเป็นช่วง (partition) แทนที่จะเป็นสตรีมยาวก้อนเดียวเหมือนก่อนหน้า runtime จึงตัดข้อมูลช่วงเก่าทิ้งออกจาก ring buffer ได้ โดยไม่ต้องหยุดเขียนข้อมูลใหม่เข้ามาแทน — นี่คือฐานที่ทำให้ Flight Recorder เก็บข้อมูลวนทับได้จริงใน Go 1.25

## API — package `runtime/trace`

```go
fr := trace.NewFlightRecorder(trace.FlightRecorderConfig{
	MinAge:   200 * time.Millisecond,
	MaxBytes: 1 << 20, // 1 MiB
})
fr.Start()
```

- `MinAge` — ระยะเวลาขั้นต่ำที่รับประกันว่าข้อมูลจะยังอยู่ใน buffer ตั้งเป็นประมาณ 2 เท่าของ time window ที่สนใจจะ debug
- `MaxBytes` — ขนาด buffer สูงสุดในหน่วยความจำ (fixed, ไม่โตไม่หยุด) ทีม Go ให้ตัวเลขอ้างอิงคร่าว ๆ ว่า trace data ผลิตประมาณไม่กี่ MB ต่อวินาที ไปจนถึง ~10 MB/s สำหรับ service ที่งานหนัก ใช้ประกอบตั้งค่า `MaxBytes` ให้พอกับ `MinAge` ที่ต้องการ

Method อื่นที่ใช้:

- `fr.Enabled() bool` — เช็คว่า recorder กำลังทำงานอยู่ก่อนสั่ง snapshot
- `fr.WriteTo(w io.Writer) (int64, error)` — เขียน snapshot ของ buffer ปัจจุบันออกเป็น trace file
- `fr.Stop()` — หยุด recorder

## ตัวอย่างใช้งาน

โจทย์จากบทความต้นฉบับ: HTTP service ที่บางครั้ง response ช้าผิดปกติ แต่ไม่รู้สาเหตุ — ตั้ง flight recorder ไว้ตอน start แล้ว snapshot เฉพาะตอนเจอ request ที่ช้าเกิน threshold:

```go
// ต้อง import เพิ่ม: sync/atomic, path/filepath
var snapshotting atomic.Bool

func captureSnapshot(fr *trace.FlightRecorder) {
	filename := filepath.Join(os.TempDir(),
		fmt.Sprintf("flight-snapshot-%s.trace", time.Now().Format("20060102-150405")))

	f, err := os.Create(filename)
	if err != nil {
		log.Printf("opening snapshot file failed: %s", err)
		return
	}
	defer f.Close()

	if _, err := fr.WriteTo(f); err != nil {
		log.Printf("writing snapshot failed: %s", err)
		return
	}

	fr.Stop()
	log.Printf("captured a flight recorder snapshot to %s", filename)
}
```

ใน handler เรียก snapshot เมื่อ request ช้าเกิน threshold:

```go
start := time.Now()
// ... ทำงานของ handler ...

if fr.Enabled() && time.Since(start) > 100*time.Millisecond {
	if snapshotting.CompareAndSwap(false, true) {
		go captureSnapshot(fr)
	}
}
```

โค้ดต้นฉบับของ Go blog ใช้ `sync.Once` กันซ้ำ ซึ่งถูกในแง่ correctness แต่บน production ที่ concurrency สูง ถ้า request ช้าพร้อมกันหลายร้อยตัว ทุก request จะพยายามสปอว์น goroutine แล้วมาชนกันที่ lock ภายในของ `sync.Once` เกิด goroutine ค้างรอโดยไม่จำเป็น (goroutine stampede) เปลี่ยนมาเช็ค `atomic.Bool` ด้วย `CompareAndSwap` **ก่อน** สปอว์น goroutine แทน จะกันได้ตั้งแต่ต้นทางแบบ lock-free ไม่ต้องเสีย goroutine ไปฟรี ๆ

อีกจุดที่ปรับจากต้นฉบับ: เขียนไฟล์ลง `os.TempDir()` พร้อม timestamp ในชื่อไฟล์ แทน `os.Create("snapshot.trace")` ตรง ๆ ใน current working directory — เพราะ container ส่วนใหญ่ (Docker/Kubernetes) มักรัน root filesystem แบบ read-only เขียนไฟล์ที่ CWD ไม่ได้ และถ้าไม่ใส่ timestamp ไฟล์เก่าจะโดนทับ

## เคสจริงจากบทความ: bug ที่ trace เห็นแต่โค้ดไม่บอก

บทความต้นฉบับยกตัวอย่าง HTTP service ที่ background goroutine ส่ง report ทุกนาที วนล็อก mutex ของแต่ละ bucket:

```go
func sendReport(buckets []bucket) {
	counts := make([]int, len(buckets))
	for index := range buckets {
		b := &buckets[index]
		b.mu.Lock()
		defer b.mu.Unlock() // ตัวปัญหา

		counts[index] = b.guesses
	}
	// ... marshal แล้ว http.Post ส่ง report ...
}
```

`defer b.mu.Unlock()` ใน loop คือปัญหา — `defer` ทำงานตอน `sendReport` จบทั้งฟังก์ชัน ไม่ใช่ตอนจบ loop iteration แต่ละรอบ ดังนั้น lock ของ bucket แรกจะไม่ถูกปล่อยจนกว่าทั้งฟังก์ชันจะ return ซึ่งรวมเวลา `http.Post` ส่ง report ออกไปด้วย — mutex ทุกตัวถูกถือค้างไว้ตลอดช่วง network call ทำให้ HTTP handler ตัวอื่นที่พยายาม lock bucket เดียวกันค้างรอ

โค้ดแบบนี้อ่านผ่าน ๆ ไม่รู้สึกผิดปกติ (compile ผ่าน, logic ถูกต้อง) แต่ trace จาก flight recorder เห็นตรง ๆ ว่า goroutine ถูก block นานผิดปกติช่วงไหน — นี่คือคุณค่าหลักของเครื่องมือนี้: ไม่ต้องเดาว่าปัญหาอยู่ตรงไหน เห็นจาก timeline จริง

## เทียบกับ `trace.Start`/`trace.Stop` แบบเดิม

| ประเด็น | `runtime/trace` แบบเดิม | Flight Recorder |
| --- | --- | --- |
| ต้องรู้ล่วงหน้าไหมว่าจะมีปัญหา | ต้องรู้ก่อน (เรียก Start ก่อนเหตุการณ์) | ไม่ต้อง — เก็บ ring buffer ตลอดเวลา |
| ปริมาณข้อมูล | ทั้งช่วงที่ Start-Stop | เฉพาะ `MinAge` วินาทีล่าสุด |
| หน่วยความจำ | โตตามเวลาที่ trace | fixed ตาม `MaxBytes` |
| เหมาะกับ | test, benchmark, CLI ที่ควบคุม timing เองได้ | long-running service ที่ debug production |

ไม่ใช่ตัวแทนกัน — ใช้คนละสถานการณ์ Flight Recorder เสริมจุดที่ `trace.Start` ทำไม่ได้ (debug เหตุการณ์ที่ไม่รู้ล่วงหน้า) ไม่ได้มาแทนที่

## สิ่งที่ต้องทำถ้าจะเอาไปใช้

1. **ตั้ง `MinAge` ตาม debug window ที่ต้องการ** — เผื่อ 2 เท่าของช่วงเวลาที่คาดว่าปัญหาสะสม เช่นถ้าคิดว่า root cause เกิดก่อนหน้า timeout ประมาณ 1-2 วินาที ตั้ง `MinAge` สัก 3-4 วินาที
2. **คำนวณ `MaxBytes` จาก throughput จริง** — ใช้ตัวเลขอ้างอิง ไม่กี่ MB/s ถึง ~10 MB/s สำหรับ service งานหนัก คูณกับ `MinAge` ที่ตั้งไว้ แล้วเผื่อ margin
3. **นิยาม trigger condition ให้ชัด** — อะไรคือ "ผิดปกติ" ที่ควร snapshot (latency threshold, error, timeout ใกล้ครบ) ต้องเขียน logic ดักจับเอง ระบบไม่ auto-detect ให้
4. **กันการ snapshot ซ้ำ** — ใช้ `atomic.Bool` (หรือ rate limit) เช็คก่อนสปอว์น goroutine เพราะ `WriteTo`/`Stop` ไม่ได้ออกแบบมาให้เรียกซ้ำวนไป และการปล่อยให้ทุก request ที่เข้าเงื่อนไขสปอว์น goroutine พร้อมกันจะเสีย resource ฟรี ๆ
5. **ตัดสินใจเรื่อง `Stop()` ให้ชัด** — ตัวอย่างในบทความ (ทั้งต้นฉบับและบทความนี้) เรียก `fr.Stop()` หลัง snapshot สำเร็จ เหมาะกับ debug ครั้งเดียวจบ แต่ถ้าต้องการ monitor ต่อเนื่องตลอดอายุ process (เผื่อปัญหาเกิดซ้ำ) ไม่ควร `Stop()` — ปล่อยให้ recorder รันต่อ แล้วคุมความถี่ของการ snapshot ด้วย rate limit แทน (เช่น อนุญาต snapshot ใหม่ได้ทุก 5 นาที) ไม่ใช่ปิด recorder ทิ้งหลัง incident แรก
6. **เปิดดูด้วย `go tool trace snapshot.trace`** — ได้ UI เดียวกับ trace ปกติ ไม่ต้องเรียนเครื่องมือใหม่

## ข้อจำกัด

- ยังมี **runtime overhead** จากการ trace ต่อเนื่อง (ลดลงมากตั้งแต่ Go 1.21 แต่ไม่ใช่ศูนย์) ต้องชั่งน้ำหนักกับ production ที่ sensitive เรื่อง latency มาก ๆ
- เก็บได้แค่ **หน้าต่างเวลาสั้น ๆ** ตาม `MinAge`/`MaxBytes` ที่ตั้งไว้ ถ้า root cause เกิดไกลกว่านั้น (เช่น memory leak สะสมเป็นชั่วโมง) เครื่องมือนี้ช่วยได้จำกัด
- ต้อง **เขียน trigger logic เอง** ไม่ใช่ระบบอัตโนมัติ 100% — คุณภาพของ debug ขึ้นอยู่กับว่า trigger condition ที่ตั้งไว้ครอบคลุมเคสจริงแค่ไหน

## สรุป

Flight Recorder เติมช่องว่างของ `runtime/trace` สำหรับ long-running service โดยเฉพาะ — เก็บ trace วนใน ring buffer ตลอดเวลาแบบ fixed memory แล้ว snapshot เฉพาะช่วงที่มีปัญหาจริง ไม่ต้องเดาล่วงหน้าเหมือนเดิม เหมาะกับ debug latency spike, timeout, lock contention ที่เกิดเป็นครั้งคราวใน production และหาสาเหตุด้วยการอ่าน log อย่างเดียวไม่พอ

ใช้ประกอบกับ agent control loop ก็ได้เช่นกัน — agent ตามโครงสร้างใน [โครงสร้าง AI Agent](/blog/post.html?slug=2026-07-12-ai-agent-architecture-go) ถ้าวน tool call ใกล้ชน `maxSteps` หรือ LLM call ค้างนานผิดปกติ ก็ trigger snapshot ตรงจุดนั้นได้เหมือนกับตัวอย่าง HTTP handler ในบทความนี้ ได้เห็น goroutine ระดับ runtime ว่าไปติดอยู่ตรงไหนจริง ๆ ไม่ใช่แค่ระดับ business logic ที่ OTel span เห็น

**หมายเหตุ:** Flight Recorder เป็นฟีเจอร์ใหม่ใน Go 1.25 ทีม Go ระบุว่ามีแผนเพิ่ม programmatic parsing API และ integration กับเครื่องมืออย่าง gotraceui ในอนาคต รายละเอียด API อาจเปลี่ยนแปลงได้ ควรเช็ค [เอกสาร `runtime/trace`](https://pkg.go.dev/runtime/trace) เวอร์ชันล่าสุดก่อนใช้งานจริง

**อ้างอิง:**

- Go Team (2025). [Flight Recorder in Go 1.25](https://go.dev/blog/flight-recorder). go.dev/blog
- golang/go Issue [#63185: runtime/trace: flight recording](https://github.com/golang/go/issues/63185) — proposal ต้นทางของฟีเจอร์นี้ (API ใน proposal เป็น draft เริ่มต้น เช่น `SetMinAge`/`SetMaxBytes` แบบ setter ก่อนถูกปรับเป็น `FlightRecorderConfig` ตามที่ shipped จริงในบล็อกด้านบน)
- Go Team. [Go 1.22 Release Notes](https://go.dev/doc/go1.22) — ที่มาของ trace format แบบ partitioned ที่ทำให้ Flight Recorder overhead ต่ำ
