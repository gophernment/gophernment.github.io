---
title: "โครงสร้าง AI Agent: หลักการสร้าง Agent ด้วยตัวเอง (สำหรับนักพัฒนา Go)"
date: 2026-07-12
tags: [ai, agent, architecture, go, llm]
---

Agent framework สำเร็จรูปมีให้เลือกเยอะ แต่ framework ซ่อนโครงสร้างจริงไว้ข้างหลัง abstraction จนหลายคนเรียก `agent.Run()` ได้โดยไม่รู้ว่าข้างในมันทำอะไร บทความนี้แกะโครงสร้างของ AI agent ออกมาเป็นส่วนประกอบพื้นฐาน พร้อมตัวอย่าง Go ให้ประกอบเป็น agent ของตัวเองได้ โดยไม่ต้องพึ่ง framework ใด ๆ

**ขอบเขต:** เน้นโครงสร้างและหลักการออกแบบ (architecture) ไม่ใช่การ deploy หรือ scale ระดับ production — เรื่อง observability สำหรับ agent ที่สร้างตามโครงสร้างนี้ อ่านต่อได้ที่ [ความสำคัญของ Observability ใน AI Agent](/blog/post.html?slug=2026-07-12-observability-ai-agent-go)

## Agent ต่างจาก chatbot ยังไง

Chatbot ทั่วไป: รับ input → ส่งเข้า LLM → ได้ output → จบ เป็น request-response ครั้งเดียว

Agent: มี **loop** — LLM ตัดสินใจเองว่าจะเรียก tool ไหน, ดูผลลัพธ์, แล้วคิดต่อว่าจะเรียก tool อีกหรือจะตอบเลย วนซ้ำจนกว่าจะจบงาน pattern นี้เรียกว่า **ReAct** (Reasoning + Acting) ตามที่ Yao et al. เสนอไว้ใน [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) (2022) — แนวคิดหลักคือให้ LLM สลับกันระหว่าง "คิดว่าต้องทำอะไรต่อ" กับ "ลงมือทำแล้วดูผล" แทนที่จะให้ตอบทีเดียวจบ

ความต่างเชิงโครงสร้าง: chatbot ไม่มี state ระหว่าง call, agent ต้องมี **memory** เก็บ history ของ step ที่ผ่านมา และต้องมี **control loop** ตัดสินใจว่าจะวนต่อหรือหยุด

## 4 ส่วนประกอบหลัก

Anthropic สรุปโครงสร้างนี้ไว้ใน [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) (2024) ว่า agent ที่ทำงานได้จริงส่วนใหญ่ประกอบจาก 4 ส่วน:

1. **Model** — LLM ที่ทำหน้าที่ reasoning และตัดสินใจ ว่าจะเรียก tool ไหน หรือตอบเลย
2. **Tools** — ฟังก์ชันที่ agent เรียกใช้ได้ (ค้นเว็บ, รัน code, เรียก API ภายใน)
3. **Memory** — บริบทที่ agent จำได้ ทั้งใน run เดียว (short-term) และข้าม run (long-term, ถ้าจำเป็น)
4. **Control loop / Orchestrator** — ตัวควบคุมว่าจะวน step ไหน ผ่านเงื่อนไขไหนถึงจบ

โครงสร้างการทำงานเป็นวงเป็นดังนี้:

![โครงสร้างการทำงานของ AI Agent (ReAct Loop)](/images/agent-loop-pencil.jpg)

ส่วนถัดไปแกะแต่ละส่วนเป็นโค้ด Go

## Tool — ทำให้ LLM เรียกใช้งานได้

Tool คือ interface เดียว ไม่ต้องซับซ้อน:

```go
package agent

import (
	"context"
	"fmt"
)

type Tool interface {
	Name() string
	Description() string
	Execute(ctx context.Context, args map[string]any) (string, error)
}
```

`Description()` สำคัญกว่าที่คิด — เป็นข้อความเดียวที่ LLM ใช้ตัดสินใจว่าจะเรียก tool นี้เมื่อไหร่ เขียนคลุมเครือ LLM จะเรียกผิดจังหวะ หรือไม่เรียกเลยทั้งที่ควรเรียก

```go
type SearchTool struct {
	client *SearchClient
}

func (t *SearchTool) Name() string { return "search" }

func (t *SearchTool) Description() string {
	return "ค้นหาข้อมูลบนเว็บ ใช้เมื่อ agent ต้องการข้อมูลที่ไม่มีใน context ปัจจุบัน"
}

func (t *SearchTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	query, ok := args["query"].(string)
	if !ok {
		return "", fmt.Errorf("missing required arg: query")
	}
	results, err := t.client.Search(ctx, query)
	if err != nil {
		return "", fmt.Errorf("search failed: %w", err)
	}
	return results.Summary(), nil
}
```

หลักออกแบบ tool ที่ดี:

- **ขอบเขตแคบ** — tool เดียวทำอย่างเดียว อย่ารวม "search-and-summarize-and-email" เป็น tool เดียว เพราะ LLM เลือก tool ผิดง่ายขึ้นเมื่อ scope กว้าง
- **คืนค่าเป็น string ที่ LLM อ่านต่อได้** — ไม่ใช่ struct ดิบ ๆ ที่ LLM parse ไม่ออก
- **error ต้องเป็นข้อความที่ LLM เอาไปตัดสินใจต่อได้** เช่น `"search failed: rate limited, retry later"` ดีกว่า `"error 429"` เฉย ๆ

## Memory — บริบทที่ agent จำได้

```go
type Message struct {
	Role    string // "user", "assistant", "tool"
	Content string
}

type Memory interface {
	Append(msg Message)
	History() []Message
}

type WindowMemory struct {
	messages []Message
	maxLen   int
}

func (m *WindowMemory) Append(msg Message) {
	m.messages = append(m.messages, msg)
	if len(m.messages) > m.maxLen {
		m.messages = m.messages[len(m.messages)-m.maxLen:]
	}
}

func (m *WindowMemory) History() []Message { return m.messages }
```

`WindowMemory` ง่าย ๆ แบบนี้พอสำหรับ agent ส่วนใหญ่ — เก็บ conversation history ไว้ใน context window ของ LLM เอง ไม่ต้องมี vector database หรือ long-term memory ตั้งแต่เริ่ม เพิ่มความซับซ้อนนี้ก็ต่อเมื่อ agent ต้องจำข้ามหลาย session จริง ๆ (เช่น personal assistant ที่ต้องจำ preference ของ user ข้ามวัน) — เริ่มจากง่ายที่สุดที่ใช้งานได้ก่อน

## Control loop — หัวใจของ agent

นี่คือส่วนที่ทำให้ agent ต่างจาก chatbot จริง ๆ:

```go
package agent

import (
	"context"
	"errors"
	"fmt"
)

var ErrMaxStepsExceeded = errors.New("max steps exceeded")

type ToolSchema struct {
	Name        string
	Description string
	Parameters  any
}

type ToolCall struct {
	Name string
	Args map[string]any
}

type LLMResponse struct {
	Content  string
	ToolCall *ToolCall
}

type LLMClient interface {
	Complete(ctx context.Context, history []Message, tools []ToolSchema) (LLMResponse, error)
}

type Decision struct {
	Done        bool
	FinalAnswer string
	ToolName    string
	ToolArgs    map[string]any
}

type Agent struct {
	llm      LLMClient
	tools    map[string]Tool
	mem      Memory
	maxSteps int
}

func (a *Agent) Run(ctx context.Context, task string) (string, error) {
	a.mem.Append(Message{Role: "user", Content: task})

	for step := 0; step < a.maxSteps; step++ {
		decision, err := a.think(ctx)
		if err != nil {
			return "", fmt.Errorf("think failed at step %d: %w", step, err)
		}
		if decision.Done {
			return decision.FinalAnswer, nil
		}

		a.mem.Append(Message{
			Role:    "assistant",
			Content: fmt.Sprintf("call tool %s(%v)", decision.ToolName, decision.ToolArgs),
		})

		tool, ok := a.tools[decision.ToolName]
		if !ok {
			a.mem.Append(Message{Role: "tool", Content: fmt.Sprintf("unknown tool: %s", decision.ToolName)})
			continue
		}

		result, err := tool.Execute(ctx, decision.ToolArgs)
		if err != nil {
			a.mem.Append(Message{Role: "tool", Content: fmt.Sprintf("error: %v", err)})
			continue // ให้ LLM เห็น error แล้วตัดสินใจเองว่าจะ retry หรือลองทางอื่น
		}
		a.mem.Append(Message{Role: "tool", Content: result})
	}
	return "", ErrMaxStepsExceeded
}

func (a *Agent) think(ctx context.Context) (Decision, error) {
	resp, err := a.llm.Complete(ctx, a.mem.History(), a.toolSchemas())
	if err != nil {
		return Decision{}, err
	}
	if resp.ToolCall == nil {
		return Decision{Done: true, FinalAnswer: resp.Content}, nil
	}
	return Decision{ToolName: resp.ToolCall.Name, ToolArgs: resp.ToolCall.Args}, nil
}

func (a *Agent) toolSchemas() []ToolSchema {
	schemas := make([]ToolSchema, 0, len(a.tools))
	for _, t := range a.tools {
		schemas = append(schemas, ToolSchema{Name: t.Name(), Description: t.Description()})
	}
	return schemas
}
```

สังเกตว่าก่อนเรียก tool จริง โค้ดบันทึก `Role: "assistant"` ลง memory ด้วย — ไม่ใช่แค่ user กับ tool เท่านั้น เพราะรอบ `think` ถัดไปต้องเห็นด้วยว่า LLM ตัดสินใจเรียก tool อะไรไปก่อนหน้า ไม่งั้น history ที่ส่งกลับเข้า LLM จะขาดตอน กลายเป็นคุยไม่ต่อเนื่อง (chat API ส่วนใหญ่คาดหวัง turn สลับ user/assistant/tool ให้ครบ ไม่ใช่แค่ user/tool)

จุดสำคัญที่มักพลาด: `a.llm.Complete(ctx, ..., a.toolSchemas())` ต้องส่ง schema ของ tool (ชื่อ, description, parameter ที่ต้องการ) ให้ LLM แบบ structured (function calling / tool use API ของ provider) ไม่ใช่ยัด description รวมเข้า prompt แล้วหวังให้ LLM ตอบ format ที่ parse เองได้ — structured output ทำให้ `resp.ToolCall` แม่นยำ ไม่ต้องเขียน parser เดารูปแบบข้อความ

Error ในลูปนี้แยกเป็นสองชั้น:
- **Recoverable error** — เช่น error จาก `tool.Execute`, LLM เรียก tool ที่ไม่มีจริง, หรือ args ที่ส่งมาไม่ผ่าน schema validation ป้อนกลับเข้า memory เป็น `Role: "tool"` เหมือนกรณีอื่น ๆ ให้ LLM เห็นแล้วแก้ไขเองรอบถัดไป (Self-Correction pattern) โดยไม่ต้องหยุดการทำงาน
- **Fatal error** — เช่น API ของ LLM ล่มทั้งหมด หรือ context ถูก cancel ซึ่งควร abort ทั้ง run ทันที เพราะไม่สามารถทำงานต่อได้จริง

## เงื่อนไขจบ และความปลอดภัย

`maxSteps` ใน struct ข้างบนคือเซฟตี้ขั้นต่ำสุด — ไม่มีมัน agent ที่หลุด loop จะวนไม่รู้จบ (ดู [ความสำคัญของ Observability ใน AI Agent](/blog/post.html?slug=2026-07-12-observability-ai-agent-go) ประกอบ เรื่อง unbounded steps)

สำหรับ tool ที่มีผลกระทบจริง (ส่ง email, ลบข้อมูล, สั่งซื้อ) ควรมีชั้น confirm ก่อนรันเสมอ ทำเป็น decorator ห่อ tool เดิมได้ด้วย embedding แบบ Go:

```go
package agent

import (
	"context"
	"errors"
)

type ConfirmTool struct {
	Tool // embed: ได้ Name() และ Description() มาฟรี
	ask  func(name string, args map[string]any) bool
}

func (t *ConfirmTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	if !t.ask(t.Name(), args) {
		return "", errors.New("user declined tool execution")
	}
	return t.Tool.Execute(ctx, args)
}
```

`ConfirmTool` ครอบ tool ไหนก็ได้โดยไม่ต้องแก้ tool เดิม — เป็น decorator pattern ที่ idiomatic กับ Go ผ่าน interface embedding: ได้ `Name()`/`Description()` มาฟรีจาก `Tool` ที่ embed ไว้ override เฉพาะ `Execute()`

## เมื่อไหร่ควรแตกเป็น multi-agent

Agent เดียวจัดการงานได้ส่วนใหญ่ถ้า scope ไม่กว้างเกินไป แตกเป็นหลาย agent ต่อเมื่อ system prompt เดียวเริ่มสับสนกับหลายบทบาทพร้อมกัน (เช่น coder ที่ต้องเป็น reviewer ในตัวเองด้วย) — แยกเป็น agent ต่างบทบาทแล้วให้ orchestrator ส่งงานต่อกันจะชัดกว่า

แต่ multi-agent เพิ่ม complexity เรื่อง coordination (ใครส่งต่อใคร, จบเมื่อไหร่) และ cost (หลาย LLM call ต่อ 1 งาน) ไม่ใช่ default ที่ควรเริ่มจากตรงนั้น เริ่มจาก single agent ก่อนเสมอ แล้วแตกเมื่อมีสัญญาณจริงว่า scope กว้างเกินไป

## สรุป

Agent ไม่ใช่เวทมนตร์ — เป็น loop ธรรมดาที่มี LLM ตัดสินใจแทน `if/else` ที่เคย hardcode ไว้ องค์ประกอบ 4 อย่าง (model, tools, memory, control loop) ประกอบกันแค่นี้ก็ได้ agent ที่ทำงานได้จริงแล้ว เริ่มจาก tool น้อย ๆ, memory แบบ conversation window ธรรมดา, `maxSteps` คุมไว้ก่อนเสมอ ค่อยขยายเมื่อมีความจำเป็นจริง

**หมายเหตุ (ณ กรกฎาคม 2026):** หลักการ ReAct loop และโครงสร้าง 4 ส่วนนี้เป็นแนวคิดพื้นฐานที่ยังใช้ได้ต่อไป รวมถึงการมาของโมเดลที่คิดล่วงหน้าในตัว (Reasoning/CoT models เช่น OpenAI o1/o3 หรือ DeepSeek-R1) แม้โมเดลกลุ่มนี้จะมีสเต็ปการคิดในตัวที่ฉลาดขึ้น แต่ตัว Control loop ภายนอกก็ยังจำเป็นในการประสานงาน (Orchestrator) และสั่งรัน Tool อยู่เช่นเดิม ทั้งนี้ API เฉพาะของแต่ละ LLM provider (รูปแบบ function calling, tool schema) เปลี่ยนแปลงอยู่เรื่อย ๆ ควรเช็ค documentation ล่าสุดของ provider ที่ใช้จริงเสมอ ก่อนเอาโค้ดตัวอย่างไปใช้ตรง ๆ

**อ้างอิง:**

- Yao, S. et al. (2022). *ReAct: Synergizing Reasoning and Acting in Language Models*. arXiv:2210.03629
- Anthropic (2024). *Building Effective Agents*. anthropic.com/research/building-effective-agents
