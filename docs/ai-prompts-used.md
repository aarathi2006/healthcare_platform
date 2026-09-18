# AI Prompts Used During Submission

This document transparently lists the prompts used with AI assistants (ChatGPT / Claude) during development of this submission. It demonstrates:

1. **How AI was used** — as a pair-programming partner, not an autopilot
2. **Where human judgment was applied** — every prompt was reviewed, iterated, and validated
3. **What was NOT delegated to AI** — business logic, safety boundaries, architecture decisions

**Important:** These are the **development-time** prompts. The **runtime** prompts used by the AI agent inside the product are documented separately in [`docs/ai.md`](ai.md) and [`docs/ai-tools-and-usage.md`](ai-tools-and-usage.md).

---

## Table of Contents

- [Development Workflow](#development-workflow)
- [Prompt Categories](#prompt-categories)
- [Architecture Prompts](#architecture-prompts)
- [Entity & Data Model Prompts](#entity--data-model-prompts)
- [Scheduling Prompts](#scheduling-prompts)
- [Integration Prompts](#integration-prompts)
- [AI Agent Prompts](#ai-agent-prompts)
- [Auth & Security Prompts](#auth--security-prompts)
- [Frontend Prompts](#frontend-prompts)
- [Debugging Prompts](#debugging-prompts)
- [Documentation Prompts](#documentation-prompts)
- [Prompts NOT Used](#prompts-not-used)
- [Ethical Notes](#ethical-notes)
- [Summary](#summary)

---

## Development Workflow

Every prompt followed this pattern:

```
1. Read the requirement from the assignment PDF
2. Formulate a specific, well-scoped prompt for the AI
3. Review the AI response against the requirement
4. Iterate on the prompt if needed
5. Validate the code / design manually
6. Test end-to-end
7. Document the final decision
```

**The AI was never asked to "build the whole thing."** Every prompt targeted one specific concern.

---

## Prompt Categories

| Category | Count | Purpose |
|----------|-------|---------|
| Architecture | 12 | Layering, module boundaries, connector design |
| Entity / Data Model | 15 | TypeORM entities, relationships, indexes |
| Scheduling | 8 | Availability, slot locking, idempotency |
| Integration | 14 | EHR connector, verification, recovery, reconciliation |
| AI Agent | 18 | Intent detection, capability schema, prompts, questionnaire flow |
| Auth & Security | 10 | JWT, RBAC, tenant isolation |
| Frontend | 12 | HTML dashboards, role routing, iframes |
| Debugging | 25+ | Error diagnosis, fixing TypeScript/Postgres issues |
| Documentation | 8 | README, architecture, AI, integration docs |
| **Total** | **~120** | |

---

## Architecture Prompts

### Prompt 1 — Overall Layering

> "Design a layered architecture for a multi-tenant healthcare platform where an AI agent coordinates booking, a scheduling service manages availability, and integrations sit behind a connector interface. Show the layers, what each depends on, and what each must NOT depend on. The AI must never touch the database directly."

**What came back:** A layered diagram (Interfaces → AI → Capabilities → Core Services → Scheduling → Integration → External Systems).

**What was changed:** I tightened the "must not depend on" column to enforce that Capabilities never query the DB directly — only through core services.

### Prompt 2 — Capability vs Service

> "What's the difference between a 'capability' and a 'service' in an AI-native system? When should the AI call a capability vs a service directly?"

**What came back:** The AI should only call capabilities (structured, audited, validated). Services are internal implementation details.

**What was changed:** Nothing — matched the assignment's Section 10.

### Prompt 3 — Connector Interface

> "Design a TypeScript interface for an EHR connector that would support a Mock EHR today and an Epic FHIR connector tomorrow without changing any calling code. Include: createAppointment, getAppointmentById, findByCriteria, cancelAppointment, updateAppointment. Use a discriminated union for the result to distinguish SUCCESS / FAILED / UNKNOWN."

**What came back:** The `EhrConnector` interface plus `EhrOperationResult<T>`.

**What was changed:** Added the `UNKNOWN` status — the initial answer had only SUCCESS/FAILED, but the assignment requires distinguishing timeouts.

### Prompt 4 — State Separation

> "Section 23 of my assignment requires that transactional state, conversational state, workflow state, integration state, and operational state be kept separate. Show me where each should live in a NestJS + TypeORM + PostgreSQL app."

**What came back:** Each state type maps to a separate table or column.

**What was changed:** Chose to store conversational state in `conversations.context` jsonb (AI initially suggested a separate table, but Section 23 allows jsonb).

### Prompt 5 — Module Boundaries

> "Propose the NestJS module structure for a healthcare platform with: hospitals, doctors, patients, appointments, scheduling, capabilities, AI agent, EHR integration, workflows, questionnaires, notifications, audit, auth, dashboard. Each module should be self-contained."

**What came back:** A tree of modules, each with entities, service, controller.

**What was changed:** Merged `scheduling` and `calendars` because they're tightly coupled in the data model.

---

## Entity & Data Model Prompts

### Prompt 6 — Appointment Entity

> "Design a TypeORM entity for `appointments` with:
> - UUID primary key
> - hospital_id, doctor_id, patient_id (indexed)
> - status enum: REQUESTED, PENDING, CONFIRMED, RESCHEDULED, CANCELLED, COMPLETED, NO_SHOW, FAILED, SYNC_PENDING, RECONCILIATION_REQUIRED
> - start_datetime, end_datetime as timestamptz
> - unique idempotency_key
> - indexed correlation_id
> - external_appointment_id (nullable)
> - created_at, updated_at"

**What came back:** A complete entity file.

**What was changed:** Changed `timestamp` to `timestamptz` after discovering a timezone round-trip bug (Prompt 42).

### Prompt 7 — Questionnaire JSONB

> "Design a TypeORM entity for `questionnaires` where each questionnaire has an array of questions. Each question has: id, type (yes_no / choice / numeric / short_text), question text, options (for choice), required flag. Use jsonb."

**What came back:** The entity with a `questions: any[]` jsonb column.

**What was changed:** Standardized the question object shape across all questionnaires.

### Prompt 8 — External ID Mapping

> "Design a table that maps internal IDs to external IDs across multiple systems. It should support APPOINTMENT / PATIENT / DOCTOR mappings and allow querying in both directions."

**What came back:** The `external_id_mappings` table with `internal_entity_type`, `internal_id`, `external_system`, `external_id`.

**What was changed:** Added direct columns on `doctors.external_provider_id` and `patients.external_patient_id` for fast lookup during booking.

### Prompt 9 — Audit Event Metadata

> "Design an audit_events table. Columns: correlation_id (nullable), actor_type (AI/USER/SYSTEM), actor_id, action, entity_type, entity_id, metadata (jsonb). Metadata should support arbitrary context but must be scrubbable of PII."

**What came back:** The entity with `metadata: any` jsonb.

**What was changed:** Added a `scrub()` function in the service layer that removes known PII fields before saving.

---

## Scheduling Prompts

### Prompt 10 — Availability Calculation

> "In NestJS with TypeORM, write a method that computes available 30-minute slots for a doctor between two dates. Inputs: doctor's calendar, working hours (day of week + start/end time), blocked slots, existing appointments. Output: array of Date objects representing free slot starts."

**What came back:** A `getAvailableSlots()` method using `createQueryBuilder`.

**What was changed:** Added handling for past slots (skip if start < now), and made the duration configurable per doctor.

### Prompt 11 — Double-Booking Prevention

> "How do I prevent two concurrent bookings of the same slot in TypeORM + PostgreSQL? The requirement is that only one booking succeeds, and the other gets a clear error."

**What came back:** Three options — pessimistic lock, optimistic lock, unique constraint on (doctor_id, start_datetime).

**Chosen:** Pessimistic write lock inside a transaction with `SELECT FOR UPDATE`, because a unique constraint would be too rigid.

### Prompt 12 — Idempotency

> "Design an idempotency mechanism for appointment booking. When the same request (identified by an idempotency key) is sent twice, only one appointment should be created. The second request should return the existing appointment."

**What came back:** A UNIQUE index on `idempotency_key` plus an early check that returns the existing row.

**What was changed:** Applied the same mechanism to the Mock EHR so both sides dedup independently.

### Prompt 13 — Slot Reservation State

> "When a booking is in progress, should the slot be reserved immediately or after EHR verification? What state should the appointment be in during the gap?"

**What came back:** Reserve immediately (PENDING), then transition to CONFIRMED after verification. If verification fails, mark SYNC_PENDING or FAILED.

**What was changed:** Added the SYNC_PENDING status specifically for the gap between internal reservation and external verification.

---

## Integration Prompts

### Prompt 14 — Verification Step

> "Section 13 of my assignment says: 'A successful API response does not automatically mean the external operation succeeded.' Design a verification step for EHR appointment creation. After the EHR returns 200, what should we do to confirm the appointment actually exists?"

**What came back:** Query the EHR by ID after creation and compare.

**What was changed:** Added a second query by `idempotencyKey` in the recovery flow — if the create call times out, the EHR might have created the record with a different ID we don't know.

### Prompt 15 — Error Classification

> "Given an axios error from an HTTP call to an external system, how do I classify it as either 'definitely failed' or 'unknown outcome'? Which status codes and error codes indicate each?"

**What came back:**
- FAILED: 400, 401, 403, 404, 409
- UNKNOWN: timeouts (ECONNABORTED, ETIMEDOUT), network errors (ECONNREFUSED, ENOTFOUND), 5xx

**What was changed:** Nothing — implemented as-is.

### Prompt 16 — Unknown Outcome Recovery

> "Design a recovery flow for when an EHR call times out and we don't know if the appointment was created. The flow must NOT create a duplicate. Show the branching logic."

**What came back:**
1. Query EHR by idempotency key → if found, sync internal state
2. If not found, safe to retry once
3. If still unknown, create reconciliation record

**What was changed:** Added correlation ID propagation through the recovery flow so the entire path is traceable.

### Prompt 17 — Reconciliation Records

> "Design a table for reconciliation records — cases where the external state can't be determined automatically and a human must intervene. Include: correlation_id, appointment_id, reason, status (OPEN/IN_PROGRESS/RESOLVED/ESCALATED), assigned_to, resolution_notes."

**What came back:** The entity as described.

**What was changed:** Nothing.

### Prompt 18 — Mock EHR Failure Injection

> "Design a mechanism for a Mock EHR to inject failures for testing. The caller should be able to send a header to simulate: timeout, 500, partial success (creates record then returns 500), duplicate, auth failure. The header should not affect the response if not present."

**What came back:** A `FailureInjector` utility class with a `check(mode)` method and `afterPartialOrThrow(mode, result)`.

**What was changed:** The "partial" mode is the most important one — it simulates the exact unknown-outcome scenario the assignment calls out.

---

## AI Agent Prompts

### Prompt 19 — Specialty Inference

> "Design a rule-based mapping from patient symptom keywords to medical specialties. For example: 'shoulder' → Orthopedics, 'heart' → Cardiology. Include at least 5 specialties. The AI must not diagnose — it only maps keywords to administrative specialties."

**What came back:** A `SYMPTOM_TO_SPECIALTY` array with keyword lists.

**What was changed:** Added explicit comments that this is NOT diagnosis — it's administrative routing.

### Prompt 20 — State Machine

> "Design a state machine for the AI conversation. Stages: idle, awaiting_doctor_selection, awaiting_slot_selection, awaiting_confirmation, booked, questionnaire_answering. When does each transition fire?"

**What came back:** A clear state diagram with transitions.

**What was changed:** Added `questionnaire_answering` as a loopback state that returns to `booked` after all questions are answered.

### Prompt 21 — System Prompt (Runtime)

> "Write a system prompt for an AI healthcare booking assistant. Requirements:
> - Administrative only (never diagnoses, prescribes, or recommends treatment)
> - Never invents appointment slots
> - Asks clarifying questions when ambiguous
> - Confirms before booking
> - Escalates emergencies immediately
> - Keeps replies short
> - Never reveals raw UUIDs"

**What came back:** A 10-rule system prompt.

**What was changed:** Tightened rule 1 (added the distinction between "you reported chest discomfort" vs "you have a heart condition") and added rule 10 (confirm by name, not ID).

### Prompt 22 — Emergency Keywords

> "List red-flag medical phrases that should trigger immediate human escalation in an administrative healthcare assistant. Be conservative — better to escalate unnecessarily than miss something."

**What came back:** A list of ~15 phrases.

**What was changed:** Kept 12 that were clearly red flags: severe chest pain, difficulty breathing, cannot breathe, severe bleeding, stroke, unconscious, suicidal, suicide, heart attack, severe allergic, crushing chest pain.

### Prompt 23 — Capability Schema

> "Design a TypeScript interface for an AI capability. Include: name, description, inputSchema (JSON Schema), requiresConfirmation flag, handler function. The handler receives (input, context) where context has correlationId, conversationId, patientId."

**What came back:** The `CapabilityDefinition<TInput, TOutput>` interface.

**What was changed:** Nothing — implemented as-is.

### Prompt 24 — Capability Registry

> "Design a service that registers all capabilities and exposes them for the AI to call. It should:
> - List capabilities in OpenAI tool-call format
> - Execute a capability by name with input validation
> - Log every execution to a capability_executions table (with PII scrubbed)
> - Handle errors gracefully"

**What came back:** `CapabilityRegistryService` with `listForAI()`, `execute()`, and a `scrub()` method.

**What was changed:** Added duration tracking (`durationMs`) so we can monitor latency per capability.

### Prompt 25 — Questionnaire Answering Flow

> "Design an AI flow where, after a successful booking, the AI immediately asks the patient's specialty-specific questionnaire questions one at a time. The AI records each answer, asks the next question, and after all questions are done, calls submit_questionnaire. The patient can skip by saying 'skip' or 'later'."

**What came back:** A new state `questionnaire_answering` with sub-state tracking `currentQuestionIndex` and `answers`.

**What was changed:** Added a fallback where partial answers are saved if the patient skips.

### Prompt 26 — Context Persistence

> "Design a persistent conversation context in PostgreSQL using a jsonb column. It should store: current stage, selected doctor, selected slot, active appointment, current question index, and answers. Include the shape."

**What came back:** The `conversations.context.mockState` schema.

**What was changed:** Kept it under a `mockState` key so a future OpenAI agent can store its own state alongside without conflicting.

### Prompt 27 — Avoiding Diagnosis

> "How do I ensure the AI never diagnoses in a healthcare assistant? Give me concrete rules and examples of correct vs incorrect responses."

**What came back:**
- Never offer a diagnosis
- Reflect patient input ("You mentioned X") without interpreting it
- Refuse out-of-scope questions and escalate
- Use only administrative language

**What was changed:** Nothing — baked into the system prompt.

### Prompt 28 — Human Escalation

> "Design a `transfer_to_human` capability. Inputs: reason, urgency (LOW/MEDIUM/HIGH), patientId. Output: confirmation. It should log to audit_events and (in production) trigger a paging system."

**What came back:** The capability as described.

**What was changed:** Added a `metadata.urgency` field to audit so operators can sort by urgency.

---

## Auth & Security Prompts

### Prompt 29 — JWT Auth

> "Design a JWT-based authentication module for NestJS with:
> - Login endpoint (email + password)
> - bcrypt password hashing
> - JWT token with user ID, email, role
> - Global JwtAuthGuard protecting all endpoints by default
> - @Public() decorator for public endpoints
> - @CurrentUser() decorator to access the authenticated user"

**What came back:** A complete auth module.

**What was changed:** Nothing — implemented as-is.

### Prompt 30 — Role-Based Access

> "Design a @Roles() decorator and RolesGuard for NestJS that restricts endpoints to specific roles. Example: @Roles('PLATFORM_ADMIN') should only allow platform admins."

**What came back:** The decorator + guard.

**What was changed:** Nothing.

### Prompt 31 — Tenant Isolation

> "Section 21 of my assignment requires that Hospital A never access Hospital B's data. Design a three-level tenant isolation strategy:
> 1. Application level
> 2. Foreign key level
> 3. Frontend routing level"

**What came back:** A strategy where every query filters by hospital_id, every table has a foreign key, and every dashboard has a hospital dropdown.

**What was changed:** Added `hospital_id` to the `patients` table (nullable) so patients have a "home" hospital for dashboard filtering.

### Prompt 32 — Privacy-Aware Logging

> "Design a PII scrubber for audit events. Given a payload, it should remove or mask: patient IDs, external patient IDs, names, and any string that looks like an email or phone number."

**What came back:** A `scrub()` function that replaces known PII fields with `***`.

**What was changed:** Limited scrubbing to known fields (patientId, externalPatientId) to avoid over-redacting admin data.

### Prompt 33 — Password Hashing

> "What's the recommended bcrypt cost factor for passwords in 2026?"

**What came back:** 10–12 rounds.

**Chosen:** 10 rounds — standard for prototypes.

### Prompt 34 — JWT Secret

> "What are best practices for JWT secret management in Node.js?"

**What came back:** Long random string (≥32 chars), stored in environment variables, never in source code, rotated periodically.

**What was changed:** Nothing — README documents this and `.env` is gitignored.

---

## Frontend Prompts

### Prompt 35 — Dashboard Structure

> "Design 4 role-based dashboards for a healthcare platform: Patient, Doctor, Hospital Admin, Platform Admin. Each should be a single HTML file (no build step) using vanilla JS + fetch. Include the tab structure for each."

**What came back:** A detailed structure for each dashboard with tabs.

**What was changed:** Added hospital/doctor/patient dropdowns to enable the multi-tenant cascade.

### Prompt 36 — Frontend Auth Helper

> "Design a small `auth.js` file that:
> - Stores JWT in sessionStorage
> - Attaches the token to every fetch call
> - Redirects to login on 401
> - Provides a `requireLogin()` helper with optional role check
> - Provides a `logout()` function"

**What came back:** The `HealthAuth` object.

**What was changed:** Nothing — implemented as-is.

### Prompt 37 — Hospital Cascade

> "Design a frontend cascade where selecting a hospital in the Hospital Admin dashboard filters the Patient Dashboard to show only that hospital's patients. Use iframe `postMessage` to communicate between tabs."

**What came back:** A `hospital-changed` message that the parent listens to and reloads the Patient iframe.

**What was changed:** Added the `?hospitalId=` URL param so direct links also work.

### Prompt 38 — Questionnaire Form

> "Design a questionnaire form in vanilla HTML that renders each question according to its type: yes_no (dropdown), choice (dropdown), numeric (number input), short_text (text input). On submit, send all answers to the backend."

**What came back:** The `loadQuestionnaires()` function with dynamic input rendering.

**What was changed:** Added a "pending" state display so partially-answered questionnaires are visible.

---

## Debugging Prompts

### Prompt 39 — uuid_generate_v4 Error

> "TypeORM says: `function uuid_generate_v4() does not exist`. How do I fix this?"

**Fix:** Install the `uuid-ossp` extension in PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Prompt 40 — TS1272 (Type-Only Imports)

> "I'm getting `TS1272: A type referenced in a decorated signature must be imported with 'import type'`. This happens with an injected interface in a NestJS service. How do I fix it?"

**Fix:**

```typescript
import type { EhrConnector } from './connectors/ehr-connector.interface';
```

### Prompt 41 — NestJS Circular Dependency

> "NestJS says it can't resolve the EhrConnector dependency in IntegrationService. How do I fix it?"

**Fix:** Register the connector with a string token:

```typescript
{
  provide: 'EHR_CONNECTOR',
  useExisting: MockEhrConnector,
}
```

Then inject with `@Inject('EHR_CONNECTOR')`.

### Prompt 42 — Postgres timestamp vs timestamptz

> "PostgreSQL stores '04:30 UTC' as '10:00 IST' but reads it back as '03:30 UTC'. What's the issue?"

**Fix:** Change column type from `timestamp` to `timestamptz`. The `timestamp` type ignores timezone; `timestamptz` stores UTC and converts on read.

### Prompt 43 — UnknownDependenciesException

> "NestJS says: `Cannot resolve dependencies of SearchDoctorsCapability (..., ?, DepartmentRepository)`. How do I fix it?"

**Fix:** Add `Department` to the module's `TypeOrmModule.forFeature([...])` list.

### Prompt 44 — Empty `kill -9`

> "Bash: `kill -9 $(sudo lsof -t -i:3000)` errors with 'Usage: kill'. What's wrong?"

**Fix:** The substitution is empty when nothing is on the port. Use `fuser -k 3000/tcp` or guard the kill with a conditional.

### Prompt 45 — Duplicate `PlatformUser` Import

> "I get `TS2300: Duplicate identifier 'PlatformUser'` in seed.ts. How do I fix it?"

**Fix:** Delete one of the two import lines. The one with `UserRole` is the correct one to keep.

### Prompt 46 — Timezone Round-Trip Bug

> "TypeORM stores dates with an offset of ±5:30 when using `timestamp` columns. How do I make the round-trip lossless?"

**Fix:** Use `timestamptz` (timestamp with time zone) everywhere. The `timestamp` type loses timezone context.

### Prompt 47 — `ERR_REQUIRE_CYCLE_MODULE`

> "Node v22.14.0 throws `ERR_REQUIRE_CYCLE_MODULE` on `nest new backend`. How do I fix it?"

**Fix:** Downgrade to Node 20 LTS via NVM. The bug is in Node 22.14.0's `require(esm)` implementation.

### Prompt 48 — `EADDRINUSE`

> "NestJS says `EADDRINUSE: address already in use :::3000`. What should I do?"

**Fix:** Kill the old process: `sudo fuser -k 3000/tcp`. Restart.

### Prompt 49 — Missing `hospitalName` in Reply

> "My AI reply says 'at undefined'. Where does the undefined come from?"

**Diagnosis:** The capability returns `{ hospital: ... }` but the frontend reads `d.hospitalName`. Key mismatch.

**Fix:** Update the capability to return `hospitalName`, or update the frontend to read `hospital`.

### Prompt 50 — pg Deprecation Warning

> "I see: `Calling client.query() when the client is already executing a query is deprecated`. What's causing this?"

**Diagnosis:** TypeORM's query runner mixing concurrent queries on the same connection.

**Fix:** Wrap sequential queries in `await Promise.all` instead of firing them in parallel through the same connection. Not urgent for a prototype.

---

## Documentation Prompts

### Prompt 51 — README Structure

> "Design the structure of a README for a healthcare platform prototype submission. Sections required by the assignment: overview, features, architecture, tech stack, setup, env vars, AI setup, voice setup, mock EHR, workflows, tests, deployment, demo accounts, known limitations, future improvements."

**What came back:** A full outline.

**What was changed:** Kept every section and added "Running the System" as a separate heading.

### Prompt 52 — Architecture Doc

> "Draft the architecture documentation for a platform where AI calls capabilities, scheduling is the source of truth for availability, and integrations sit behind a connector. Include high-level diagram, layered boundaries, data flow, security model."

**What came back:** A first draft.

**What was changed:** Added explicit "must not depend on" columns to the layer table — a specific requirement from Section 24.

### Prompt 53 — Data Model Doc

> "Document all 22 tables in a healthcare platform: purpose, columns, types, indexes, tenant keys. Group them by domain."

**What came back:** A long table-based doc.

**What was changed:** Added a "Tenant Isolation Summary" section so a reviewer can scan which tables are tenant-scoped.

### Prompt 54 — AI Doc

> "Document the AI agent for a healthcare platform: role, safety boundaries, capabilities, state machine, prompts, evaluation approach."

**What came back:** A first draft.

**What was changed:** Added the "Two implementations" section (rule-based vs OpenAI) with a swap guide.

### Prompt 55 — Integration Doc

> "Document the EHR integration layer: connector abstraction, booking flow, verification, failure classification, recovery, reconciliation, idempotency."

**What came back:** A first draft.

**What was changed:** Added a "Real EHR integration path" section showing how to swap the Mock for Epic.

### Prompt 56 — Demo Scenarios

> "Write 10 end-to-end demo scenarios for a healthcare booking platform. Each should list steps, expected outputs, and what it proves."

**What came back:** A list of 10 scenarios.

**What was changed:** Reorganized to put the most impressive scenarios (partial failure recovery, multi-hospital booking) first.

### Prompt 57 — AI Tools & Usage Doc

> "Draft a document describing AI tools used during development, runtime AI in the product, prompts, and evaluation. Distinguish clearly between development-time AI and runtime AI."

**What came back:** A first draft structured as Parts A / B / C.

**What was changed:** Tightened the ethical notes section to explicitly state what was NOT delegated.

### Prompt 58 — This Document

> "Draft a document listing the AI prompts used during the submission process, grouped by category, with context on what was asked and what was changed."

**What came back:** A first draft.

**What was changed:** Added the "Prompts NOT Used" section to be transparent about boundaries of AI assistance.

---

## Prompts NOT Used

These are the prompts deliberately **not** used, to preserve human judgment:

- ❌ "Build the whole project" — every requirement handled as a scoped task
- ❌ "Generate all entities at once" — each entity designed individually
- ❌ "Write the AI system prompt" (without review) — the prompt was iterated manually against Section 20
- ❌ "Decide the security model" — the three-level isolation approach was designed by hand
- ❌ "Choose the tech stack" — NestJS + Postgres + TypeORM chosen based on the assignment's emphasis on transactions, modularity, and reliability
- ❌ "Write the tests" — test scenarios derived from the assignment's demo requirements
- ❌ "Answer the assignment's review questions" — all responses authored by the developer

**Rule of thumb:** If the AI's answer would be hard to defend in an interview, it was not used as-is.

---

## Ethical Notes

### Transparency

Every use of AI is documented. This is not a "no AI" submission — it's an "AI as tool" submission. The distinction matters:

- **AI as author** — generate code, submit without review
- **AI as tool** — generate code, review, understand, adapt, own

This submission follows the second pattern.

### Human Accountability

Every line of code was reviewed by the developer before submission:

- The `reserveSlot()` method with pessimistic locking was manually tested for concurrency
- The recovery flow was traced through the partial-failure scenario multiple times
- The system prompt was checked against Section 20 line-by-line
- The tenant isolation was verified by querying different hospital IDs

### What Would Change in Production

- All AI-generated code would go through a code review process
- All prompts would be version-controlled with evaluation gates
- PII redaction would be enforced before any LLM call
- A Business Associate Agreement (BAA) would be required for any third-party LLM

### Not a Replacement for Engineering

AI tools accelerated boilerplate, debugging, and documentation. They did not replace:

- Understanding the problem
- Designing the architecture
- Making trade-off decisions
- Validating end-to-end behavior
- Owning the outcome

---

## Summary

| Category | Purpose | Count |
|----------|---------|-------|
| Architecture | Layering, boundaries, connectors | ~12 |
| Entity / Data Model | Schema design | ~15 |
| Scheduling | Availability, concurrency, idempotency | ~8 |
| Integration | EHR, verification, recovery | ~14 |
| AI Agent | Intent, capabilities, prompts, flow | ~18 |
| Auth & Security | JWT, RBAC, isolation | ~10 |
| Frontend | HTML dashboards, cascade | ~12 |
| Debugging | Error diagnosis and fixes | ~25 |
| Documentation | README, architecture, ai, integration | ~8 |
| **Total** | | **~120** |

**Every prompt was scoped, reviewed, and validated.** The AI was a tool, not the author.

---

## Related Documents

- [`docs/ai.md`](ai.md) — runtime AI agent documentation (systems, capabilities, prompts)
- [`docs/ai-tools-and-usage.md`](ai-tools-and-usage.md) — AI tools used during development + runtime AI overview
- [`docs/architecture.md`](architecture.md) — high-level architecture
- [`docs/integration.md`](integration.md) — EHR connector, verification, recovery
- [`docs/data-model.md`](data-model.md) — full schema of all 22 tables
- [`docs/demo-scenarios.md`](demo-scenarios.md) — end-to-end demo walkthroughs

