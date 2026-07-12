---
title: "ความสำคัญของ Observability ใน AI Agent (ตัวอย่างด้วย Go)"
date: 2026-07-12
tags: [ai, agent, observability, go, monitoring, tracing]
---

AI agent ต่างจาก service ทั่วไปตรงที่ behavior ไม่ deterministic — input เดียวกัน รันสองครั้งอาจได้ output ต่างกัน, จำนวน step ไม่คงที่, agent ตัดสินใจเองว่าจะเรียก tool ไหน กี่รอบ ก่อนตอบ เมื่อ bug เกิดขึ้น log ทั่วไปแบบ "request in, response out" ไม่พอสืบสาเหตุ ต้องเห็น **ทุก step ของ reasoning loop**

บทความนี้อธิบายว่าทำไม observability จำเป็นกับ AI agent, ตัวอย่างการ instrument ด้วย Go, แล้วปิดท้ายด้วย trade-off เรื่องค่าใช้จ่าย **ขอบเขต**: เน้น operational observability (trace, metric, log ของ agent loop) เป็นหลัก ไม่รวมการวัด reasoning quality เช่น hallucination detection หรือ semantic drift ซึ่งต้องอาศัย evaluation layer แยกต่างหาก

## ทำไมจำเป็น

Agent loop ทั่วไปมีลักษณะ: รับ input → เรียก LLM → LLM ตัดสินใจเรียก tool → เรียก tool → ส่งผลกลับให้ LLM → วนซ้ำ จนกว่าจะได้คำตอบสุดท้าย

จุดที่ปัญหาซ่อนตัวได้เยอะกว่า service ปกติ:

- **Non-determinism** — bug reproduce ยาก ถ้าไม่มี trace ของ prompt/response แต่ละรอบ ก็ debug ไม่ได้เลยว่ารอบไหนที่ agent เริ่มหลุด
- **Unbounded steps** — agent อาจวน tool call 20 รอบโดยไม่รู้ตัว (infinite loop แบบ soft) ถ้าไม่ track จำนวน step กับ latency สะสม จะไม่รู้จนกว่า bill มา
- **Cost ที่มองไม่เห็น** — token usage ผูกกับเงินตรง ๆ ไม่มี metric แยกตาม step/tool ก็ไม่รู้ว่าเงินหายไปกับ step ไหน
- **Partial failure** — tool call หนึ่งล้มเหลว แต่ agent อาจ retry เอง หรือเปลี่ยน strategy โดยไม่ throw error ขึ้นมาที่ระดับบนเลย ถ้าไม่ trace จะไม่เห็นว่ามันล้มแล้ว recover เอง

สรุปคือ: **agent ที่ไม่มี observability คือ black box สองชั้น** — เดาไม่ได้ทั้ง business logic และ LLM decision

## ตัวอย่างด้วย Go

ใช้ `OpenTelemetry Go SDK` เป็นหลัก เพราะเป็นมาตรฐานที่ export ไป backend ไหนก็ได้ (Jaeger, Tempo, Datadog, etc.)

### 1. Trace แต่ละ step ของ agent loop

```go
package agent

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

var tracer = otel.Tracer("agent")

func (a *Agent) Run(ctx context.Context, task string) (string, error) {
	ctx, span := tracer.Start(ctx, "agent.run",
		trace.WithAttributes(attribute.String("task", task)))
	defer span.End()

	for step := 0; step < a.maxSteps; step++ {
		decision, err := a.think(ctx, step)
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			return "", err
		}
		if decision.Done {
			span.SetAttributes(attribute.Int("total_steps", step+1))
			stepHistogram.Record(ctx, int64(step+1)) // metric ที่จะแนะนำในหัวข้อที่ 3
			return decision.FinalAnswer, nil
		}
		if err := a.callTool(ctx, decision.Tool, decision.Args); err != nil {
			span.RecordError(err) // record แล้วไปต่อ ไม่ fail ทั้ง run
		}
	}
	span.SetAttributes(attribute.Bool("hit_max_steps", true))
	span.SetStatus(codes.Error, ErrMaxStepsExceeded.Error())
	return "", ErrMaxStepsExceeded
}
```

จุดสำคัญ: แต่ละ tool call ควรเป็น **child span แยก** ไม่ใช่รวมอยู่ใน span เดียวกับ `think` เพราะ tool call กับ LLM call มี latency profile คนละแบบ แยกกันจะเห็นว่าเวลาไปหมดกับฝั่งไหน

```go
func (a *Agent) callTool(ctx context.Context, name string, args map[string]any) error {
	ctx, span := tracer.Start(ctx, "agent.tool_call",
		trace.WithAttributes(
			attribute.String("tool.name", name),
			attribute.Int("tool.args_count", len(args)),
		))
	defer span.End()

	result, err := a.tools[name].Execute(ctx, args)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}
	span.SetAttributes(attribute.Int("tool.result_bytes", len(result)))
	return nil
}
```

สังเกตว่า `Run()` เรียก `span.RecordError(err)` เฉย ๆ ตอน tool call fail (ไม่ตามด้วย `SetStatus`) ทั้งที่กฎทั่วไปคือต้อง set status คู่กันเสมอ — จุดนี้ตั้งใจ เพราะ error นี้ recoverable: `callTool`'s span เองถูก mark เป็น error status ไปแล้ว (ดูโค้ดด้านบน) ส่วน `agent.run` span จะ error ก็ต่อเมื่อทั้ง run ล้มเหลวจริง ไม่ใช่แค่ tool call ครั้งเดียวที่ agent recover ได้ — หลักการคือ **set status error ที่ span ซึ่งเป็นตัวแทนของสิ่งที่ fail จริง เท่านั้น** ไม่ไล่ set ทุกระดับ ไม่งั้น trace ที่จริง ๆ สำเร็จ (agent ลอง tool อื่นแล้วตอบได้) จะโดน mark เป็น error ไปด้วย ทำให้ error rate เพี้ยน

### 2. Structured log ผูกกับ trace_id

Log ควรมี `trace_id` เดียวกับ span เพื่อ jump จาก log entry ไปดู full trace ได้ทันที

```go
func (a *Agent) think(ctx context.Context, step int) (Decision, error) {
	ctx, span := tracer.Start(ctx, "agent.think")
	defer span.End()

	logger := a.logger.With(
		"trace_id", span.SpanContext().TraceID().String(),
		"step", step,
	)

	logger.Info("calling llm", "model", a.model)
	resp, err := a.llm.Complete(ctx, a.buildPrompt(step))
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logger.Error("llm call failed", "error", err)
		return Decision{}, err
	}

	logger.Info("llm decision",
		"action", resp.Action,
		"prompt_tokens", resp.Usage.PromptTokens,
		"completion_tokens", resp.Usage.CompletionTokens,
	)
	recordUsage(ctx, a.model, resp.Usage.PromptTokens, resp.Usage.CompletionTokens) // metric ที่จะแนะนำในหัวข้อถัดไป
	return parseDecision(resp)
}
```

`slog` (Go stdlib ตั้งแต่ 1.21) พอสำหรับ structured logging แล้ว ไม่จำเป็นต้องพึ่ง library ภายนอกถ้าไม่มี requirement พิเศษ

หมายเหตุ: OpenTelemetry มีมาตรฐาน [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (`gen_ai.request.model`, `gen_ai.usage.input_tokens`, ฯลฯ) สำหรับตั้งชื่อ attribute ของ LLM call โดยเฉพาะ ถ้าต้องการให้ trace เข้ากันได้กับเครื่องมือ LLM observability สำเร็จรูป (Arize Phoenix, LangSmith, OpenLLMetry) ควรศึกษาแล้วตั้งชื่อ attribute ตามมาตรฐานนี้แทนตั้งเอง

### 3. Metric สำหรับ token usage และ cost

Trace บอก "เกิดอะไรขึ้นใน run เดียว" ส่วน metric บอก "แนวโน้มในภาพรวม" — สอง layer นี้ตอบคำถามคนละแบบ

```go
package agent

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

var (
	tokenCounter  metric.Int64Counter
	stepHistogram metric.Int64Histogram
)

func init() {
	meter := otel.Meter("agent")
	tokenCounter, _ = meter.Int64Counter("agent.tokens_used",
		metric.WithDescription("token consumed per LLM call"))
	stepHistogram, _ = meter.Int64Histogram("agent.steps_per_run",
		metric.WithDescription("number of reasoning steps per agent run"))
}

func recordUsage(ctx context.Context, model string, promptTok, completionTok int64) {
	tokenCounter.Add(ctx, promptTok,
		metric.WithAttributes(attribute.String("model", model), attribute.String("token.type", "prompt")))
	tokenCounter.Add(ctx, completionTok,
		metric.WithAttributes(attribute.String("model", model), attribute.String("token.type", "completion")))
}
```

`recordUsage` ถูกเรียกจาก `think()` ทันทีที่ได้ `resp.Usage` มา (โค้ดหัวข้อที่ 2) ส่วน `stepHistogram` ถูก record ใน `Run()` ตอน agent จบงาน (โค้ดหัวข้อที่ 1) — ทั้งสอง metric ผูกกับจุดที่ข้อมูลเกิดขึ้นจริง ไม่ใช่คำนวณย้อนหลัง

`model` เป็น attribute ที่ cardinality ต่ำ ปลอดภัยจะใส่ แต่ **ห้ามใส่ user_id หรือ prompt content เป็น metric label** เดี๋ยว cardinality ระเบิด (รายละเอียดถัดไป)

เครื่องมือ trace/log/metric ครบแล้ว คำถามต่อไปคือใช้แค่ไหนถึงจะคุ้ม — เพราะ observability เองก็มีต้นทุน

## Trade-off เรื่องค่าใช้จ่าย

Observability ไม่ฟรี ต้องชั่งน้ำหนัก 3 อย่าง: **storage cost, latency overhead, cardinality**

### Storage cost

Agent ที่วน 10-20 step ต่อ run สร้าง span เยอะกว่า HTTP service ทั่วไปหลายเท่า ถ้า trace ทุก run แบบ 100% กับ traffic สูง ค่า storage backend (Tempo/Datadog/etc.) จะพุ่งเร็วกว่าที่คิด

แนวทาง: **sampling แบบ tail-based** — เก็บทุก trace ที่ error หรือ latency สูงผิดปกติ 100% แต่ trace ที่สำเร็จปกติ sample แค่ 5-10% พอ เพราะ trace ที่ "ปกติ" ให้ข้อมูล debug น้อยกว่า trace ที่ fail

```go
// ตัวอย่าง config แนวคิด ไม่ใช่ production-ready
sampler := sdktrace.ParentBased(
	sdktrace.TraceIDRatioBased(0.1), // 10% baseline
)
```

ส่วน tail-based sampling จริงต้องทำที่ collector (เช่น OTel Collector's `tailsamplingprocessor`) ไม่ใช่ที่ SDK เพราะต้องเห็น trace จบก่อนถึงจะรู้ว่า error หรือเปล่า

### Latency overhead

ทุก span, ทุก log line มี cost เล็กน้อยต่อ CPU/memory และถ้า export แบบ synchronous จะเพิ่ม latency ให้ response โดยตรง

แนวทาง: ใช้ `BatchSpanProcessor` ไม่ใช่ `SimpleSpanProcessor` — export เป็น batch แบบ async, ไม่ block agent loop

```go
bsp := sdktrace.NewBatchSpanProcessor(exporter,
	sdktrace.WithMaxExportBatchSize(512),
	sdktrace.WithBatchTimeout(5*time.Second),
)
```

### Cardinality

จุดนี้พังบ่อยสุด: ใส่ high-cardinality field (user_id, session_id, raw prompt text) เป็น metric label ทำให้ time-series ระเบิดเป็นล้าน series — metric backend ส่วนใหญ่ (Prometheus โดยเฉพาะ) รับไม่ไหว บิลพุ่ง หรือ query ช้าจนใช้งานไม่ได้

กฎง่าย ๆ: **high-cardinality data ไปอยู่ใน trace/log เท่านั้น ไม่ใช่ metric label** metric label ควรเป็นค่าจำกัด เช่น `model`, `tool_name`, `status` — ส่วน user_id, prompt content ใส่เป็น span attribute หรือ log field แทน ค้นด้วย trace_id ทีหลังได้ ไม่ต้องพึ่ง metric query

### สรุป trade-off

| ต้องการ | ต้นทุน | ทางออก |
|---|---|---|
| เห็นทุก run แบบละเอียด | storage พุ่ง | tail-based sampling, เก็บ error 100% เก็บ success บางส่วน |
| เห็น real-time โดยไม่กระทบ response time | latency overhead | batch + async export |
| slice ข้อมูลได้ละเอียด | cardinality ระเบิด | high-cardinality → trace/log, low-cardinality → metric |

## สรุป

AI agent debug ยากกว่า service ปกติเพราะ non-deterministic และมีหลาย step ที่มองไม่เห็นจากภายนอก observability คือทางเดียวที่ทำให้ agent ไม่ใช่ black box — แต่ต้องออกแบบให้ถูกจุดตั้งแต่แรก (sampling strategy, cardinality ของ label) ไม่งั้นค่าใช้จ่ายด้าน infra จะโตเร็วกว่า value ที่ได้กลับมา

ถ้าจะเริ่ม: **trace ก่อน** — แค่ครอบ agent loop กับ tool call ด้วย span ก็เห็นปัญหาส่วนใหญ่แล้ว ค่อยเพิ่ม **metric** เมื่อเริ่มมี cost ที่ต้อง track จริงจัง และทำ **structured log** ให้ครบเมื่อทีมโตขึ้นจนต้องแชร์ dashboard ร่วมกัน ไม่ต้องทำครบทุกอย่างตั้งแต่วันแรก
