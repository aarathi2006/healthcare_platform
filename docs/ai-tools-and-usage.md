# AI Tools & Usage Documentation

This document covers **two distinct areas**:

1. **AI tools used during development** — the assistants, LLMs, and utilities that helped build this prototype.
2. **Runtime AI in the product** — the AI agent that powers the patient conversation at runtime, plus the prompts, capabilities, and evaluation approach.

---

## Table of Contents

**Part A — AI Tools Used During Development**
- [Development AI Assistants](#development-ai-assistants)
- [Code Generation Workflow](#code-generation-workflow)
- [Debugging & Architecture Help](#debugging--architecture-help)
- [Documentation & Writing](#documentation--writing)

**Part B — Runtime AI in the Product**
- [AI Models (Runtime)](#ai-models-runtime)
- [Voice Technology](#voice-technology)
- [AI Development Tools (Runtime)](#ai-development-tools-runtime)
- [Runtime AI Architecture](#runtime-ai-architecture)
- [Important Prompts](#important-prompts)
- [Evaluation Approach](#evaluation-approach)

**Part C — Appendix**
- [Prompts Used With Development AI](#prompts-used-with-development-ai)
- [Cost & Latency Notes](#cost--latency-notes)
- [Attribution & Ethical Notes](#attribution--ethical-notes)

---

# Part A — AI Tools Used During Development

## Development AI Assistants

This prototype was developed with the help of conversational AI assistants as **pair-programming partners** — not as autopilot code generators. Every architectural decision, every business rule, and every safety boundary was reviewed manually.

| Tool | Role |
|------|------|
| **ChatGPT / Claude** (via API or web) | Primary pair-programming assistant. Used for: architecture discussion, NestJS boilerplate, TypeORM entity design, capability schema definition, prompt engineering, debugging. |
| **GitHub Copilot** (optional) | Inline code completion during typing. |
| **Cline / Cursor** (optional) | Multi-file edits and refactoring. |
| **Docs & LLM search** | Used to look up NestJS, TypeORM, OpenAI SDK, and PostgreSQL APIs. |

### How the AI Was Used

- **Architecture drafts** — the AI proposed the layered structure (Interfaces → AI → Capabilities → Core Services → Scheduling → Integration → External Systems). The developer validated the separation-of-concerns claims against the assignment requirements (Sections 10, 24).
- **Code scaffolding** — repetitive code (TypeORM entities, module wiring, controller methods) was generated from prompts describing the intended schema. All generated code was reviewed line-by-line.
- **Debugging** — error messages from NestJS, TypeORM, and PostgreSQL were pasted into the assistant for explanation and diagnosis. Fixes were chosen by the developer.
- **Prompt engineering** — the AI system prompt (see Part B) was iterated with the assistant, then tuned for the assignment's safety boundaries (Section 20).
- **Documentation** — README, architecture.md, data-model.md, ai.md, integration.md, demo-scenarios.md were drafted with the assistant's help and edited by the developer.

### What Was NOT Delegated to AI

- **Business logic** — availability calculation, slot locking, state machine transitions, idempotency design
- **Security decisions** — JWT design, bcrypt parameters, RBAC decorators, tenant isolation
- **Data model** — schema design and relationships
- **Safety boundaries** — what the AI may and may not do (Section 20)
- **Integration reliability** — verification step, recovery flow, reconciliation policy

**The AI was a multiplier, not the author.** Every line of code was reviewed and understood.

---

## Code Generation Workflow

The development flow followed this pattern:

```
1. Identify the requirement (from the assignment PDF)
2. Discuss the design with the AI assistant
3. Manually verify the design against assignment sections
4. Ask the AI to generate boilerplate (entities, DTOs, controllers)
5. Review every line of generated code
6. Test end-to-end
7. Fix bugs iteratively (AI-assisted debugging)
8. Document what was built
```

### Example: Building the Scheduling Service

1. **Requirement:** Section 7 — real availability + double-booking prevention.
2. **AI prompt:** "Design a NestJS service that computes available slots for a doctor given working hours, blocked slots, and existing appointments. Prevent double-booking using transactions."
3. **AI response:** proposed `getAvailableSlots()` and `reserveSlot()` methods, plus a pessimistic-write lock inside a transaction.
4. **Developer review:** verified the lock semantics, tested concurrent bookings, and confirmed only one succeeded.
5. **Integration:** wired into `SchedulingModule`, exposed via REST endpoints.

---

## Debugging & Architecture Help

The AI assistant was used for:

- **Error message explanation** — NestJS `UnknownDependenciesException`, TypeORM query errors, PostgreSQL `uuid_generate_v4()` missing extension
- **TypeScript compile errors** — `TS1272` (type-only imports with decorators), `TS2322` (jsonb typing)
- **Race condition diagnosis** — the timezone round-trip bug in `timestamp` vs `timestamptz` columns
- **Architecture questions** — "how should the connector interface be structured so a real Epic connector can drop in?"

In all cases, the developer made the final decision and understood the fix.

---

## Documentation & Writing

The AI assistant was used to:

- Draft initial outlines for each doc file
- Expand terse notes into full prose
- Format markdown tables and diagrams
- Suggest edge cases to document (failure modes, limitations)

Final content was edited by hand to match the specific implementation.

---

# Part B — Runtime AI in the Product

This part documents the AI that runs inside the platform and powers the patient conversation.

## AI Models (Runtime)

The platform supports **two runtime agent implementations** behind the same interface.

### 1. Rule-Based Agent (Default — Used in Demo)

- **File:** `backend/src/modules/ai/mock-ai-agent.service.ts`
- **Model:** None — deterministic keyword + state-machine logic
- **Cost:** $0
- **Latency:** < 5 ms per turn
- **When to use:** Demo, tests, low-latency requirements

Handles:

- Emergency keyword detection → immediate `transfer_to_human` (HIGH urgency)
- Specialty inference from symptom keywords ("shoulder" → Orthopedics, "heart" → Cardiology)
- Doctor discovery, availability lookup, slot selection
- Booking confirmation and cancellation
- Questionnaire answering (asks pre-visit questions one at a time)
- Human escalation

### 2. OpenAI Agent (Optional — Swap-In Ready)

- **File:** `backend/src/modules/ai/ai-agent.service.ts`
- **Model:** `gpt-4o-mini` (default), configurable via `OPENAI_MODEL`
- **API:** OpenAI Chat Completions with function calling
- **Cost:** ~$0.002 per 5-turn conversation (gpt-4o-mini)
- **Latency:** 500–1500 ms per turn
- **When to use:** Production, or when flexible natural language understanding is needed

### How to Swap

One-line change in `ai.module.ts` + `ai.controller.ts`. See [`docs/ai.md`](ai.md) for the full walkthrough.

---

## Voice Technology

Voice is **not implemented in this prototype**. The text-based chat demonstrates the same AI + capability flow that voice would use.

### Design Intent

The AI logic is **voice-agnostic** — the `POST /ai/chat` endpoint accepts text and returns text. A voice layer would sit in front of it:

```
Patient → Audio → Speech Recognition (STT) → Text
                                              ↓
                                        POST /ai/chat
                                              ↓
                                        Text reply
                                              ↓
                                Speech Generation (TTS) → Audio → Patient
```

**No changes to the AI agent or capabilities are needed.**

### Recommended Stack (Future)

| Component | Option |
|-----------|--------|
| Web voice | WebRTC (browser mic + speaker) |
| Telephone | Twilio Programmable Voice |
| STT | Deepgram, OpenAI Whisper, Google Speech-to-Text |
| TTS | ElevenLabs, OpenAI TTS, Google Text-to-Speech |
| Managed orchestration | Vapi or Retell |
| Latency target | Sub-2s perceived for normal turns |

### Voice Requirements (Documented for Future)

- Streaming (partial transcriptions and partial speech)
- Turn-taking detection
- Interruption / barge-in
- Silence handling
- Long-running operation handling
- Call failure handling

---

## AI Development Tools (Runtime)

The runtime AI uses a small set of tools:

| Tool | Purpose |
|------|---------|
| **OpenAI SDK** (`openai` npm package) | Chat completions + function calling (when the OpenAI agent is used) |
| **Function-calling schema** | Derived from the capability registry's `listForAI()` output — every capability's name, description, and input schema is passed to the model as a "tool" |
| **Conversation state** (`conversations.context` jsonb) | Persists context across turns (selected doctor, selected slot, current questionnaire question, etc.) |
| **Correlation ID** (UUID v4) | Threads through every capability call for traceability |
| **Capability registry** | The controlled toolbox the AI can call — the AI never touches the database or EHR directly |

---

## Runtime AI Architecture

```
Patient message
    ↓
POST /ai/chat (NestJS controller)
    ↓
AiAgentService.handleMessage()
    ↓
1. Load/create conversation (ConversationService)
2. Persist user message
3. Load history + context
    ↓
If using MockAiAgentService:
    → Rule-based intent detection
    → Capability selection
    ↓
If using AiAgentService:
    → OpenAI chat completions with tool calling
    → Loop until final reply
    ↓
CapabilityRegistryService.execute(capabilityName, input, ctx)
    ↓
Capability handler (e.g. create_appointment)
    ↓
SchedulingService / IntegrationService / QuestionnairesService
    ↓
Result persisted to capability_executions
    ↓
AI reply generated
    ↓
Persisted to conversation_messages
    ↓
Return to client
```

### Key Runtime Guarantees

- **The AI never touches the database or EHR directly.** All actions go through capabilities.
- **Every capability call is audited** in `capability_executions`.
- **Every capability call carries a `correlationId`** for end-to-end tracing.
- **PII is scrubbed** before writing to audit or integration tables.
- **Ambiguity is clarified** before guessing (missing specialty → clarifying question).
- **Emergency keywords escalate immediately** — no appointment is created.

---

## Important Prompts

### Runtime System Prompt (OpenAI Agent)

This is the full system prompt used by `AiAgentService`:

```
You are the AI Patient Access Assistant for a multi-tenant healthcare platform.

Your job is ADMINISTRATIVE ONLY. You help patients find doctors, check real
availability, and book/reschedule/cancel appointments. You may also ask approved
pre-visit questions.

You MUST follow these rules at all times:

1. NEVER diagnose, prescribe, change medication, or recommend treatment. If a
   user describes symptoms, acknowledge what they said ("You mentioned shoulder
   pain") but do NOT interpret it medically.
2. NEVER invent appointment slots. ALWAYS call check_availability to get real slots.
3. ALWAYS call search_doctors first to find a doctor before checking availability,
   unless the user already provided a doctorId.
4. When the user's request is ambiguous (missing doctor, missing date range, missing
   specialty), ASK a clarifying question instead of guessing.
5. Before calling create_appointment, confirm the exact slot with the user in one
   short sentence.
6. If the user describes a medical emergency (chest pain, difficulty breathing,
   severe bleeding, stroke symptoms, suicidal thoughts), immediately call
   transfer_to_human with urgency=HIGH.
7. If the user asks something outside your scope, call transfer_to_human.
8. Keep replies short (1-3 sentences). Speak naturally.
9. Do NOT reveal raw UUIDs to the user. Refer to doctors by name.
10. Confirm bookings by restating the doctor name and time, not the ID.
```

### Why Each Rule Exists

| Rule | Assignment Reference |
|------|---------------------|
| 1 | Section 20 — AI must not diagnose, prescribe, or recommend treatment |
| 2 | Section 7 — AI must never invent availability |
| 3 | Section 9 — discover doctors before booking |
| 4 | Section 3, principle 2 — clarification over guessing |
| 5 | Section 10 — controlled capability confirmation |
| 6 | Section 15, 20 — urgent escalation |
| 7 | Section 9 — out-of-scope → human |
| 8 | Section 11 — natural conversational turn-taking |
| 9 | UX — speak to patients naturally |
| 10 | UX — clear confirmation |

### Rule-Based Agent Logic (No LLM)

The rule-based agent uses **keyword + state machine** logic instead of a system prompt:

- **Emergency keywords:** `["severe chest pain", "difficulty breathing", "stroke", "suicidal", ...]`
- **Specialty mapping:**
  ```
  shoulder/knee/back/joint/bone → Orthopedics
  heart/cardio/blood pressure   → Cardiology
  skin/rash                     → Dermatology
  headache/migraine/brain       → Neurology
  child/baby/kid                → Pediatrics
  ```
- **Confirmation words:** `["yes", "confirm", "book it", "go ahead", "sure"]`
- **Cancellation words:** `["cancel", "cancelled", "call it off"]`
- **Human escalation words:** `["human", "agent", "representative", "operator"]`

Full source in `backend/src/modules/ai/mock-ai-agent.service.ts`.

### Development-Time Prompts

Prompts used with the AI assistant (ChatGPT / Claude) during development:

| Goal | Prompt Summary |
|------|---------------|
| Architecture | "Propose a layered NestJS architecture for a multi-tenant healthcare platform with an AI agent, scheduling, and EHR integration." |
| Entity design | "Design a TypeORM entity for appointments with state machine, idempotency key, and correlation ID." |
| Capability schema | "Define a capability interface with name, description, input schema, and handler for an AI agent." |
| Failure handling | "Design a recovery flow for when an EHR call times out — do not blindly retry, query first." |
| System prompt | "Write a system prompt for an AI healthcare booking assistant that never diagnoses or prescribes." |
| Documentation | "Draft an architecture document for a platform where AI calls capabilities and integrations sit behind connectors." |

Prompts were **iterated** — the first response was rarely used as-is. The developer added context, corrected assumptions, and validated outputs.

---

## Evaluation Approach

### Live Evaluation (Platform Admin Dashboard)

The **🎯 AI Evaluation** tab in the Platform Admin dashboard provides:

| Metric | What It Shows |
|--------|---------------|
| Total Calls | Count of every capability execution |
| Success Rate | SUCCESS vs FAILED percentage |
| Failures | Count of failed capability calls |
| Avg Latency | Mean duration in milliseconds |
| Per-Capability Metrics | Total, success count, avg latency, verdict |

**Verdicts:**

| Success Rate | Verdict |
|--------------|---------|
| ≥ 90% | PASS |
| 70–89% | WARN |
| < 70% | FAIL |

### What This Measures

- **Reliability** — do capabilities succeed?
- **Latency** — are responses fast enough?
- **Failure patterns** — which capabilities fail most?

### What This Does Not Measure (Future Work)

A production AI evaluation would test:

- **Intent classification accuracy** on a labeled golden set
- **Clarification behavior** — does the AI ask when ambiguous?
- **Emergency escalation** — does it trigger on red flags?
- **Safety boundary adherence** — never diagnoses
- **Capability F1 score** — did the AI pick the right capability?
- **Task completion rate** — did the patient successfully book?

### Recommended Future Harness

1. **Golden dataset** — 100 patient scenarios with expected flows
2. **Automated tests** — run each scenario, assert on capability calls
3. **Safety tests** — ensure no diagnostic language appears in outputs
4. **Regression tracking** — compare prompt versions against metrics
5. **Cost tracking** — per-conversation LLM cost attribution

### Manual Test Scenarios

The following scenarios have been tested end-to-end (see [`docs/demo-scenarios.md`](demo-scenarios.md)):

| # | Scenario | Expected AI Behavior |
|---|----------|---------------------|
| 1 | "I have shoulder pain" | Search orthopedics → Aarathi's Dr. Priya Rao → book → ask Ortho questions |
| 2 | "I have light heart pain" | Search cardiology → Nova Care's Dr. Anil Mehta → book → ask Cardio questions |
| 3 | "I have severe chest pain" | Emergency → immediate human escalation |
| 4 | "Book Dr. Rao" (no specialty) | Clarify → "Which Dr. Rao?" or "What kind of specialist?" |
| 5 | "Cancel my appointment" | Call cancel_appointment → confirm |

---

# Part C — Appendix

## Prompts Used With Development AI

Below are examples of prompts used during development. These are not exhaustive — they represent the general pattern.

### Architecture & Design

```
"Design a NestJS module structure for a multi-tenant healthcare platform
where an AI agent calls capabilities, capabilities call core services,
core services call integrations behind a connector interface."

"Propose an EHR connector interface that would support a Mock EHR today
and an Epic FHIR connector tomorrow without changing any calling code."

"What's the difference between a 'tool' and a 'capability' in an AI agent
system? When should each be used?"
```

### Code Generation

```
"Generate a TypeORM entity for `appointments` with:
- UUID primary key
- hospital_id, doctor_id, patient_id (indexed)
- status enum with these values: REQUESTED, PENDING, CONFIRMED, ...
- start_datetime, end_datetime as timestamptz
- unique idempotency_key
- indexed correlation_id"

"Write a NestJS controller that maps POST /dashboard/patients/:patientId/questionnaires/:appointmentId/submit
to a service method submitPatientQuestionnaire(patientId, appointmentId, responses)."
```

### Debugging

```
"I'm getting `TS1272: A type referenced in a decorated signature must be
imported with 'import type' or a namespace import'. How do I fix this
for an EhrConnector injected into a NestJS service constructor?"

"NestJS is throwing `UnknownDependenciesException` for DepartmentRepository
in CapabilitiesModule. What's the fix?"

"PostgreSQL stores '04:30 UTC' as '10:00 IST' but reads it back as '03:30 UTC'.
What's the issue with the `timestamp` column type?"
```

### Prompt Engineering

```
"Write a system prompt for an AI healthcare booking assistant that:
- Is administrative only (never diagnoses)
- Never invents slots
- Asks clarifying questions when ambiguous
- Escalates emergencies immediately
- Confirms before booking"

"Review this system prompt and identify any edge cases where the AI might
violate the safety boundary: [paste prompt]"
```

---

## Cost & Latency Notes

### Rule-Based Agent (Default)

| Metric | Value |
|--------|-------|
| Cost per conversation | $0 |
| Latency per turn | < 5 ms |
| Deterministic | Yes |
| Handles ambiguity | Limited (falls back to clarifying question) |

### OpenAI Agent (Optional)

| Metric | Value (gpt-4o-mini) | Value (gpt-4o) |
|--------|---------------------|----------------|
| Cost per 5-turn conversation | ~$0.002 | ~$0.04 |
| Latency per turn | 500–1500 ms | 800–2500 ms |
| Deterministic | No | No |
| Handles ambiguity | Yes | Yes |

**For a demo with 100 test bookings:**

- Rule-based: $0
- gpt-4o-mini: ~$0.20
- gpt-4o: ~$4.00

### Voice (Future)

| Component | Est. Cost | Est. Latency |
|-----------|-----------|--------------|
| STT (Deepgram) | $0.0043/min | 200 ms partial |
| TTS (ElevenLabs) | $0.30 / 1K chars | 300 ms first chunk |
| Twilio (phone) | $0.013/min | 50 ms |
| Total voice round trip | ~$0.02/min | 500–1500 ms (achievable sub-2s) |

---

## Attribution & Ethical Notes

### How AI Was Used Ethically

- **The AI was a tool, not the author.** Every line of code, every business rule, and every safety decision was reviewed and understood by the developer.
- **No AI-generated content was submitted blindly.** All prompts, responses, and generated code were validated against the assignment requirements.
- **AI was not used to diagnose or treat.** The runtime AI is strictly administrative — see the safety boundaries in Part B.
- **No patient data was processed by third-party LLMs.** The rule-based agent runs locally; the OpenAI agent (if enabled) would operate on administrative messages only, with PII scrubbing in audit logs.
- **Attribution is transparent.** This document explicitly states where AI was used and where it wasn't.

### What Would Change in Production

If this prototype were deployed as a real product:

1. **Explicit user consent** would be required before AI-based interaction
2. **HIPAA/GDPR compliance** would require a Business Associate Agreement with any LLM provider
3. **PII redaction** would happen before any LLM call, not just before logging
4. **Audit logs** would record every LLM prompt and response (with PII scrubbed)
5. **Human oversight** would be available 24/7 for escalated conversations
6. **Clinical safety** would require validation by medical professionals
7. **Bias testing** would be required on the AI's intent classification

---

## Summary


| Area | Detail |
|------|--------|
| **Dev AI tools** | ChatGPT / Claude as pair-programming partner; Copilot optional |
| **Dev AI usage** | Architecture drafts, code scaffolding, debugging, docs |
| **Runtime models** | Rule-based (default) + OpenAI GPT-4o-mini (optional) |
| **Voice technology** | Deferred; design documented for future |
| **Runtime AI tools** | OpenAI SDK, capability registry, conversation state, correlation IDs |
| **Important prompts** | System prompt (10 rules) + rule-based logic + development prompts |
| **Evaluation** | Live metrics in Platform Admin + future golden-set harness |
| **Safety** | Administrative only; emergency escalation; no diagnosis |
| **Cost** | $0 for demo (rule-based); ~$0.002/conversation with gpt-4o-mini |
