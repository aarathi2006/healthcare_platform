# AI Documentation

The AI is the patient's front door to the platform. It understands natural-language requests, detects administrative intent, discovers doctors, checks real availability, books appointments, and collects pre-visit questionnaire answers.

**The AI never touches the database or EHR directly.** It only calls **capabilities** — controlled, audited functions.

---

## Table of Contents

- [The AI's Role](#the-ais-role)
- [Safety Boundaries](#safety-boundaries)
- [Two Agent Implementations](#two-agent-implementations)
- [Rule-Based Agent (Mock)](#rule-based-agent-mock)
- [OpenAI Agent](#openai-agent)
- [System Prompt](#system-prompt)
- [Capabilities](#capabilities)
- [Conversation State](#conversation-state)
- [Evaluation Approach](#evaluation-approach)
- [Emergency Handling](#emergency-handling)
- [Voice (Deferred)](#voice-deferred)

---

## The AI's Role

The AI is the patient's front door. It:

- Understands natural-language requests
- Detects administrative intent (not clinical)
- Discovers doctors across hospitals
- Checks real availability (never invents)
- Books through controlled capabilities
- Collects pre-visit questionnaire answers
- Escalates to humans when needed

**It coordinates the process, but does not make clinical decisions.**

---

## Safety Boundaries

Section 20 of the assignment defines what the AI **may** and **must not** do.

### The AI May

- Find hospitals and doctors
- Find available appointments
- Book, reschedule, cancel appointments
- Answer approved administrative questions
- Ask approved pre-visit questions
- Record structured patient responses
- Trigger workflows
- Communicate appointment status
- Escalate to humans

### The AI Must Not

- Diagnose
- Prescribe
- Change medication
- Recommend treatment
- Make independent clinical assessments
- Invent clinical information

### Example Distinction

The AI should distinguish:

- ✅ **"You reported chest discomfort."** (reflects patient input)
- ❌ **"You have a heart condition."** (unsupported clinical conclusion)

### Enforcement

- The **system prompt** (for the OpenAI agent) explicitly states the boundary
- The **rule-based agent** never interprets symptoms medically — it only maps keywords to specialties
- **Emergency keywords** immediately trigger human escalation instead of continued conversation
- The **capability registry** only exposes administrative actions

---

## Two Agent Implementations

The platform ships with two agent implementations behind the same interface.

| Agent | When to Use | API Cost |
|-------|-------------|----------|
| **MockAiAgentService** | Default for demo — deterministic, no cost | $0 |
| **AiAgentService** | When you have an OpenAI API key | Pay per token |

Both agents:

- Receive the same `AgentTurnResult` interface
- Call the same capabilities
- Persist conversation state to `conversations.context`
- Log every capability call to `capability_executions`

**Swapping agents is a one-line change** (in `ai.module.ts`).

---

## Rule-Based Agent (Mock)

The default agent is deterministic and rule-based. It handles these flows:

### 1. Emergency Detection

Emergency keywords trigger immediate `transfer_to_human` with HIGH urgency:

```
"severe chest pain", "crushing chest pain",
"difficulty breathing", "can't breathe", "cannot breathe",
"severe bleeding", "stroke", "unconscious", "suicidal", "suicide",
"heart attack", "severe allergic"
```

The AI responds: *"I'm connecting you to a human operator right away. Please stay on the line."*

### 2. Specialty Inference

Symptoms are mapped to specialties via keyword matching:

| Keywords | Specialty |
|----------|-----------|
| shoulder, knee, back, bone, joint, fracture, sprain | Orthopedics |
| heart, cardio, blood pressure, palpitation, chest tightness, chest discomfort | Cardiology |
| skin, rash, acne, eczema | Dermatology |
| headache, migraine, brain, neuro, dizzy, seizure | Neurology |
| child, baby, kid, pediatric | Pediatrics |

If no keyword matches, the AI asks a **clarifying question**:

> *"I can help you find a doctor. Could you tell me a bit more about the issue — for example, which part of the body or what kind of specialist you're looking for?"*

### 3. Doctor Discovery

Calls `search_doctors` with the inferred specialty. Returns doctors across all hospitals with hospital name and specialty.

If **one doctor** matches → skip to availability.
If **multiple doctors** match → present them and ask the patient to pick.

### 4. Availability Lookup

Calls `check_availability` with the selected doctor's ID and the next 7 days. Returns real slots.

The AI presents the **top 3 slots** and asks "Which works for you?"

### 5. Booking Confirmation

When the patient confirms (says "yes", "confirm", "book it"), the AI calls `create_appointment`. The capability:

1. Reserves the slot internally (pessimistic lock)
2. Calls the EHR integration
3. Verifies the appointment exists in the EHR
4. Synchronizes internal state
5. Fires the post-booking workflow

### 6. Questionnaire Answering

After a successful booking, the AI immediately:

1. Calls `get_questionnaire` for the appointment
2. Transitions to `questionnaire_answering` state
3. Asks **Question 1 of N** in natural language
4. Records each answer
5. Asks the next question
6. After all questions, calls `submit_questionnaire`
7. Confirms: *"Thanks — your responses have been saved. Dr. [Name] will review them before your visit."*

The patient can skip by saying **"skip"**, **"later"**, **"not now"**, or **"no thanks"**. Partial answers are saved.

### 7. Cancellation

If the patient says "cancel" and there's an active appointment in context, the AI calls `cancel_appointment`.

### 8. Human Escalation

If the patient says "human", "agent", "representative", "talk to someone", or "operator", the AI calls `transfer_to_human`.

### 9. Slot Selection by Number or Name

The AI accepts numeric selection ("1", "2", "3") and name-based selection ("Dr. Rao", "Priya").

### State Machine

```
idle
  → awaiting_doctor_selection
  → awaiting_slot_selection
  → awaiting_confirmation
  → booked
  → questionnaire_answering  (loops through questions)
  → booked
```

---

## OpenAI Agent

The `AiAgentService` uses OpenAI's chat completions API with **function calling**.

### How It Works

1. Loads the capability registry as OpenAI "tools"
2. Passes conversation history + context
3. The model decides which capability to call
4. Loops on tool calls until it produces a final reply
5. Persists conversation state to `conversations.context`

### Enabling the OpenAI Agent

1. Set `OPENAI_API_KEY` in `backend/.env`
2. In `backend/src/modules/ai/ai.module.ts`, change the provider:

```typescript
// Before
providers: [MockAiAgentService, ConversationService],

// After
providers: [AiAgentService, ConversationService],
```

3. In `backend/src/modules/ai/ai.controller.ts`, change the import:

```typescript
import { AiAgentService } from './ai-agent.service';
// ...
constructor(private agent: AiAgentService) {}
```

4. Restart the backend.

### Model

Default: `gpt-4o-mini`. Change via `OPENAI_MODEL` in `.env`.

### Cost

Approximate cost per conversation (5 turns):

| Model | Cost per 1M tokens | Cost per conversation |
|-------|--------------------|-----------------------|
| gpt-4o-mini | ~$0.15 input / $0.60 output | ~$0.002 |
| gpt-4o | ~$2.50 input / $10 output | ~$0.04 |

For the demo, the rule-based agent costs $0.

---

## System Prompt

The full system prompt used by the OpenAI agent:

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

### Why These Rules?

| Rule | Assignment Reference |
|------|---------------------|
| 1 (no diagnosis) | Section 20 — AI safety |
| 2 (real slots) | Section 7 — AI must never invent availability |
| 3 (search first) | Section 9 — discover before booking |
| 4 (clarify) | Section 3 — clarification over guessing |
| 5 (confirm) | Section 10 — controlled capabilities |
| 6 (emergency) | Section 20 — escalate urgent situations |
| 7 (out of scope) | Section 9 — human escalation |
| 8 (short replies) | Section 11 — natural conversational turn-taking |
| 9 (no raw UUIDs) | UX — speak to patients naturally |
| 10 (confirm booking) | UX — patient clarity |

---

## Capabilities

The AI never touches the database. It only calls capabilities.

Each capability defines:

- **Name** — for the AI to call it by
- **Description** — for the AI to know when to use it
- **Input schema** — JSON Schema for validation
- **`requiresConfirmation`** — flag indicating a write action
- **Handler** — the actual implementation

### Full Capability List

| Capability | Purpose | Requires Confirmation |
|-----------|---------|----------------------|
| `search_doctors` | Find doctors by specialty/hospital/name | No |
| `check_availability` | Get real slots for a doctor | No |
| `create_appointment` | Book a slot (calls scheduling + EHR) | **Yes** |
| `get_appointment` | Look up appointment by ID or list for patient | No |
| `cancel_appointment` | Cancel an appointment | **Yes** |
| `transfer_to_human` | Escalate to operator | No |
| `get_questionnaire` | Fetch pre-visit questionnaire for an appointment | No |
| `submit_questionnaire` | Save structured responses | No |

### Every Capability Call Is Audited

Each invocation is recorded in `capability_executions` with:

- `correlationId` — ties it to the rest of the request
- `capabilityName`
- `input` (PII-scrubbed)
- `output` (PII-scrubbed)
- `status` (SUCCESS / FAILED)
- `durationMs`
- `error` (if any)

This makes every AI action traceable and auditable.

---

## Conversation State

The AI tracks state per conversation in `conversations.context` (jsonb):

```json
{
  "mockState": {
    "stage": "awaiting_confirmation",
    "specialty": "Cardiology",
    "doctors": [
      {
        "id": "9c798aa3-...",
        "name": "Dr. Anil Mehta",
        "hospitalName": "Nova Care Hospital",
        "specialtyName": "Cardiology"
      }
    ],
    "selectedDoctorId": "9c798aa3-...",
    "selectedDoctorName": "Dr. Anil Mehta",
    "selectedDoctorHospital": "Nova Care Hospital",
    "slots": { "slots": [...], "total": 93 },
    "selectedSlot": "2026-09-17T06:00:00.000Z",
    "activeAppointmentId": "...",
    "questionnaireId": "...",
    "questionnaireQuestions": [...],
    "currentQuestionIndex": 0,
    "answers": { "q1": "Yes", "q2": "Right shoulder" }
  }
}
```

### State Separation (Section 23)

The assignment requires that different types of state be kept separate. Here's how:

| State Type | Where It Lives |
|------------|---------------|
| **Transactional** (appointment is CONFIRMED) | `appointments.status` |
| **Conversational** (user selected Dr. Mehta) | `conversations.context.mockState` |
| **User context** (prefers mornings) | `conversations.context.preferences` |
| **Workflow** (reminder scheduled) | `workflow_executions.state` |
| **Integration** (EHR verified) | `integration_operations.status` |
| **Operational** (reconciliation required) | `reconciliation_records.status` |

**They are never mixed.** Each is independently queryable, updatable, and auditable.

---

## Evaluation Approach

### Live Evaluation (Platform Admin Dashboard)

The **🎯 AI Evaluation** tab in the Platform Admin dashboard provides:

- **Total calls** — count of all capability invocations
- **Success rate** — percentage of SUCCESS vs FAILED
- **Failures** — count of failed calls
- **Per-capability metrics** — total, success, avg latency, verdict (PASS / WARN / FAIL)

Verdicts are computed as:

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

- **Intent classification accuracy** — on a golden set of patient messages
- **Clarification behavior** — does the AI ask when ambiguous?
- **Emergency escalation** — does the AI trigger on red-flag keywords?
- **Safety boundary adherence** — does the AI ever diagnose?
- **Capability F1 score** — did the AI pick the right capability for each intent?
- **Task completion rate** — did the patient successfully book?

These require a labeled dataset of patient messages and expected AI behavior.

### Recommended Future Evaluation Harness

1. **Golden conversations** — 100 patient scenarios with expected flows
2. **Automated tests** — run each scenario, assert on capability calls
3. **Safety tests** — ensure the AI never outputs diagnostic language
4. **Regression tracking** — compare prompt versions against metrics
5. **Cost tracking** — per-conversation LLM cost

---

## Emergency Handling

### Detection

Emergency keywords are checked **first**, before any other intent handling.

```
"severe chest pain", "crushing chest pain",
"difficulty breathing", "can't breathe", "cannot breathe",
"severe bleeding", "stroke", "unconscious", "suicidal", "suicide",
"heart attack", "severe allergic"
```

### Response

Immediate `transfer_to_human` with HIGH urgency:

```json
{
  "capability": "transfer_to_human",
  "input": {
    "reason": "Emergency keyword detected",
    "urgency": "HIGH",
    "patientId": "..."
  }
}
```

The AI replies: *"I'm connecting you to a human operator right away. Please stay on the line."*

**No appointment is created. No diagnosis is offered.**

### Audit

Every emergency escalation is recorded in `audit_events` with `action = "TRANSFER_TO_HUMAN"` and `urgency = "HIGH"`.

### Policy Reference

Section 15 of the assignment: *"Potentially urgent information should follow a predefined escalation policy."*

---

## Voice (Deferred)

Web voice and telephony are **not implemented in this prototype**. The text chat demonstrates the same AI + capability flow.

### How Voice Would Be Added

```
Patient → Audio / Telephone → STT → AI Agent → Capabilities → TTS → Patient
```

### The AI Code Is Reusable

The `POST /ai/chat` endpoint is the single entry point. A voice layer would:

1. Transcribe audio → text
2. Call `POST /ai/chat`
3. Synthesize the reply → audio
4. Stream back to the patient

**No changes to the AI agent or capabilities are needed.**

### Requirements

- Streaming STT (partial transcriptions)
- Streaming TTS (partial speech)
- Turn-taking detection
- Interruption / barge-in
- Silence handling
- Sub-2s perceived latency target
- Long-running operation handling

### Recommended Stack

| Component | Option |
|-----------|--------|
| Web voice | WebRTC (browser mic + speaker) |
| Telephone | Twilio Programmable Voice |
| STT | Deepgram, OpenAI Whisper, Google Speech |
| TTS | ElevenLabs, OpenAI TTS, Google Speech |
| Orchestration | Vapi or Retell (managed) |

---

## Summary

| Aspect | Implementation |
|--------|----------------|
| Models used | Rule-based (default) + OpenAI GPT-4o-mini (optional) |
| Voice tech | Deferred — text chat demonstrates the flow |
| AI dev tools | OpenAI SDK (tool calling) |
| Runtime AI | NestJS service + capability registry |
| Important prompts | System prompt in `ai-agent.service.ts` |
| Evaluation approach | Live metrics in Platform Admin + future golden set |
| Safety | System prompt + emergency keywords + capability limits |
| State | Separated per type — never one blob |

