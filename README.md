# 🏥 Healthcare Platform — AI-Native Patient Access & Operations

A multi-tenant, AI-native healthcare access platform where hospitals configure their services, doctors control availability, patients book through natural-language conversation, and every action is verified against an external EHR system.

Built as a prototype for a recruitment assignment demonstrating **depth of one complete reliable workflow** over breadth of disconnected features.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [AI Setup](#ai-setup)
- [Voice Setup](#voice-setup)
- [Mock EHR](#mock-ehr)
- [Workflows](#workflows)
- [Tests](#tests)
- [Deployment](#deployment)
- [Credentials / Demo Accounts](#credentials--demo-accounts)
- [Known Limitations](#known-limitations)
- [Future Improvements](#future-improvements)

---

## Overview

The platform supports four roles:

| Role | Responsibilities |
|------|------------------|
| **Platform Admin** | Approves hospitals, monitors platform health, AI, integrations, workflows, and audit |
| **Hospital Admin** | Configures hospital, doctors, calendars, availability, questionnaires, integrations |
| **Doctor** | Manages own calendar, views appointments and pre-visit questionnaire responses |
| **Patient** | Registers, talks to AI, books/reschedules/cancels, completes questionnaires |

The AI is the patient's front door. It understands administrative intent from natural language, asks clarifying questions, discovers doctors across hospitals, checks real availability, and executes bookings through controlled capabilities.

**Critical principle:** The AI is administrative only. It never diagnoses, prescribes, or recommends treatment.

---

## Features

### Core Platform

- **Multi-tenant hospitals** with strict tenant isolation at every layer
- **Real availability calculation** from working hours, blocked slots, and existing bookings
- **Concurrency-safe booking** using pessimistic database locks (prevents double-booking)
- **Idempotency** — the same request key never creates duplicate appointments
- **Full audit trail** with correlation IDs threaded through every layer
- **JWT-based authentication** with bcrypt-hashed passwords
- **Role-based access control** via `@Roles()` guards
- **Privacy-aware logging** — PII scrubbing in audit events

### AI Agent

- **Natural-language booking** — patients describe their problem in plain English
- **Specialty inference** from symptom keywords ("shoulder" → Orthopedics, "heart" → Cardiology)
- **Multi-hospital discovery** — the AI finds the right doctor at the right hospital
- **AI-driven questionnaire collection** — after booking, the AI asks pre-visit questions one at a time
- **Emergency escalation** — red-flag keywords trigger immediate human transfer
- **Human escalation** — patients can request a human at any time
- **Rule-based agent** for demo (LLM-swappable via the same interface)

### Integration & Reliability

- **External EHR integration** with a connector abstraction (Mock EHR today; Epic/Cerner tomorrow)
- **External verification** — after every EHR call, query the EHR again to confirm
- **Unknown outcome recovery** — when a call times out or errors, query the EHR to see if it succeeded
- **Reconciliation records** — when the outcome can't be determined, escalate to a human operator
- **Failure injection** in the Mock EHR for testing the above

### Dashboards

- **Patient Dashboard** — home, appointments, questionnaires, profile
- **Patient Chat** — standalone AI chat
- **Doctor Dashboard** — today's schedule, calendar, availability, blocked time, questionnaire responses
- **Hospital Admin Dashboard** — hospital-scoped view with dropdown to switch hospitals
- **Platform Admin Dashboard** — cross-tenant view: applications, AI activity, integrations, workflows, analytics, evaluation, health, audit

---

## Architecture

```
Interfaces (Login, Chat, 4 Role Dashboards)
    ↓
AI Agent (rule-based; LLM-swappable)
    ↓
Capabilities (controlled action wrappers — validation, authorization, audit)
    ↓
Core Services (Scheduling, Appointments, Patients, Doctors, Questionnaires, Workflows)
    ↓
Integration Layer (EHR connector abstraction)
    ↓
External Systems (Mock EHR)
    ↓
Events / Workflows (async processing)
    ↓
Data / Analytics / Observability
```

**Key separation principles:**

- AI logic contains **no** vendor-specific EHR logic
- Scheduling is independent from conversation logic
- External integrations sit behind connector interfaces
- Long-running workflows are asynchronous
- Operational events are separate from transactional records
- AI actions are structured and auditable

See [`docs/architecture.md`](docs/architecture.md) for detailed diagrams.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | NestJS (Node.js 20, TypeScript) | Modular, DI, built-in validation, testable |
| Database | PostgreSQL 16 | Transactions, row-level locking, JSONB, strong ACID |
| ORM | TypeORM | Entity-first modeling, migration-ready |
| AI | Rule-based agent (LLM-swappable via `AiAgentService` interface) | Deterministic, no API cost for demo |
| Voice | Deferred (WebRTC/Twilio planned) | Text chat demonstrates the flow |
| Frontend | Vanilla HTML + fetch | No build step, fast to deploy, matches "not a large frontend exercise" |
| Auth | JWT + bcrypt | Industry standard for role-based access |
| Observability | Correlation IDs, structured logs, audit events | Traceable end-to-end |

---

## Project Structure

```
healthcare-platform/
├── backend/                     # Main API + AI + scheduling
│   ├── src/
│   │   ├── modules/
│   │   │   ├── ai/              # AI agent + conversation
│   │   │   ├── appointments/    # Appointment state machine
│   │   │   ├── audit/           # Audit events
│   │   │   ├── auth/            # JWT auth + guards + decorators
│   │   │   ├── capabilities/    # Capability registry + implementations
│   │   │   ├── calendars/       # Doctor calendars
│   │   │   ├── conversations/   # Conversation state
│   │   │   ├── dashboard/       # Read-only dashboard APIs
│   │   │   ├── departments/     # Hospital departments
│   │   │   ├── doctors/         # Doctors
│   │   │   ├── hospitals/       # Hospitals
│   │   │   ├── integration/     # EHR connector + verification
│   │   │   ├── notifications/   # Notification queue
│   │   │   ├── patients/        # Patients
│   │   │   ├── platform-users/  # Auth users (4 roles)
│   │   │   ├── questionnaires/  # Pre-visit questionnaires
│   │   │   ├── scheduling/      # Availability + slot locking
│   │   │   ├── specialties/     # Specialties
│   │   │   └── workflows/       # Post-booking workflows
│   │   ├── seed/                # Seed script
│   │   ├── app.module.ts
│   │   └── main.ts
│   └── .env
│
├── mock-ehr/                    # Fake external hospital system
│   ├── src/
│   │   ├── modules/
│   │   │   ├── appointments/    # EHR appointments
│   │   │   ├── failures/        # Failure injection
│   │   │   ├── patients/        # EHR patients
│   │   │   └── providers/       # EHR providers
│   │   └── main.ts
│   └── .env
│
├── public/                      # Static frontend (no build)
│   ├── login.html               # Login page (4 role quick-logins)
│   ├── auth.js                  # Shared frontend auth helper
│   ├── index.html               # Landing page
│   ├── app.html                 # Unified hub with 5 role tabs
│   ├── patient-dashboard.html   # Patient workspace
│   ├── patient-chat.html        # Standalone AI chat
│   ├── doctor-dashboard.html    # Doctor workspace
│   ├── hospital-admin.html      # Hospital admin view
│   └── platform-admin.html      # Platform admin view
│
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── ai.md
│   ├── integration.md
│   └── demo-scenarios.md
│
└── README.md
```

---

## Setup

### Prerequisites

- Node.js v20 LTS (via [NVM](https://github.com/nvm-sh/nvm) recommended)
- PostgreSQL 16
- Redis 7 (optional — for production workflows)

### 1. Install Node.js 20

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20
```

### 2. Install PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS:**
```bash
brew install postgresql@16
brew services start postgresql@16
```

### 3. Create databases and enable uuid extension

```bash
sudo -u postgres psql
```

Inside psql:
```sql
CREATE USER healthcare WITH PASSWORD 'healthcare123';
CREATE USER ehr WITH PASSWORD 'ehr123';
CREATE DATABASE healthcare_main OWNER healthcare;
CREATE DATABASE ehr_main OWNER ehr;
\c healthcare_main
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
\c ehr_main
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
\q
```

### 4. Clone and install

```bash
git clone <your-repo-url>
cd healthcare-platform

# Backend
cd backend
npm install
cp .env.example .env

# Mock EHR
cd ../mock-ehr
npm install
cp .env.example .env
```

### 5. Seed the databases

**Stop any running backends first.**

```bash
# Platform database
cd backend
npm run seed

# Save the printed IDs (HOSPITAL_ID, DOCTOR_ID, PATIENT_ID, etc.)

# Mock EHR database
cd ../mock-ehr
npm run seed

# Save the printed IDs (EHR_PATIENT_A_ID, EHR_PROVIDER_A_ID, EHR_PATIENT_B_ID, EHR_PROVIDER_B_ID)
```

### 6. Link patients and doctors to their EHR records

The Mock EHR seed produces new UUIDs each time. Link them to the platform database:

```bash
# Get the EHR IDs
PGPASSWORD=ehr123 psql -U ehr -h localhost -d ehr_main -c "SELECT id, npi, first_name, last_name FROM ehr_providers ORDER BY npi;"
PGPASSWORD=ehr123 psql -U ehr -h localhost -d ehr_main -c "SELECT id, mrn, first_name, last_name FROM ehr_patients ORDER BY mrn;"
```

Then run the linking SQL (replace placeholders with the IDs above):

```sql
UPDATE doctors SET external_provider_id = '<EHR_PROVIDER_A_ID>'
WHERE name = 'Dr. Priya Rao';

UPDATE doctors SET external_provider_id = '<EHR_PROVIDER_B_ID>'
WHERE name = 'Dr. Anil Mehta';

UPDATE patients SET external_patient_id = '<EHR_PATIENT_A_ID>'
WHERE name = 'Rahul Kumar';

UPDATE patients SET external_patient_id = '<EHR_PATIENT_B_ID>'
WHERE name = 'Priya Sharma';

-- Link patients to their home hospital
UPDATE patients SET hospital_id = (SELECT id FROM hospitals WHERE name = 'Aarathi General Hospital')
WHERE name = 'Rahul Kumar';

UPDATE patients SET hospital_id = (SELECT id FROM hospitals WHERE name = 'Nova Care Hospital')
WHERE name = 'Priya Sharma';
```

### 7. Run the system

See the [Running the System](#running-the-system) section below.

---

## Environment Variables

### `backend/.env`

```env
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=healthcare
DB_PASSWORD=healthcare123
DB_NAME=healthcare_main

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT (must be at least 32 chars)
JWT_SECRET=change_me_to_32_char_random_string_abc123
JWT_EXPIRES_IN=7d

# Mock EHR
EHR_BASE_URL=http://localhost:3001
EHR_API_KEY=dev-ehr-key-12345

# AI (optional — not required for demo)
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
```

### `backend/.env.example`

```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=healthcare_main
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_jwt_secret_at_least_32_chars
JWT_EXPIRES_IN=7d
EHR_BASE_URL=http://localhost:3001
EHR_API_KEY=your_ehr_api_key
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4o-mini
```

### `mock-ehr/.env`

```env
NODE_ENV=development
PORT=3001

DB_HOST=localhost
DB_PORT=5432
DB_USER=ehr
DB_PASSWORD=ehr123
DB_NAME=ehr_main

API_KEY=dev-ehr-key-12345
```

### `mock-ehr/.env.example`

```env
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_ehr_db_user
DB_PASSWORD=your_ehr_db_password
DB_NAME=ehr_main
API_KEY=your_ehr_api_key
```

**Never commit `.env` files.** They're in `.gitignore`.

---

## Running the System

You need **2 terminals**:

**Terminal 1 — Backend:**
```bash
cd backend
npm run start:dev
```

**Terminal 2 — Mock EHR:**
```bash
cd mock-ehr
npm run start:dev
```

**Open the app:**

```bash
xdg-open public/login.html
```

Or in your browser, navigate to:
```
file:///home/<you>/healthcare-platform/public/login.html
```

**Backend** runs on `http://localhost:3000`
**Mock EHR** runs on `http://localhost:3001`

---

## AI Setup

### Two Agent Implementations

1. **`MockAiAgentService`** — rule-based, deterministic, no API cost. **Used by default in this prototype.**
2. **`AiAgentService`** — OpenAI-based, tool-calling. Ready when a real API key is provided.

### Activating the OpenAI Agent

1. Set `OPENAI_API_KEY` in `backend/.env`:

   ```env
   OPENAI_API_KEY=sk-your-real-key-here
   OPENAI_MODEL=gpt-4o-mini
   ```

2. In `backend/src/modules/ai/ai.module.ts`, change the provider:

   ```typescript
   // Before
   providers: [MockAiAgentService, ConversationService],

   // After
   providers: [AiAgentService, ConversationService],
   ```

3. In `backend/src/modules/ai/ai.controller.ts`, change the import:

   ```typescript
   // Before
   import { MockAiAgentService } from './mock-ai-agent.service';
   ...
   constructor(private agent: MockAiAgentService) {}

   // After
   import { AiAgentService } from './ai-agent.service';
   ...
   constructor(private agent: AiAgentService) {}
   ```

4. Restart the backend.

### Safety Boundaries (Enforced in the System Prompt)

The AI is administrative only. It must NOT:

- Diagnose
- Prescribe
- Change medication
- Recommend treatment
- Make independent clinical assessments
- Invent clinical information

It distinguishes patient-reported symptoms from clinical conclusions:

- ✅ "You reported chest discomfort."
- ❌ "You have a heart condition."

See [`docs/ai.md`](docs/ai.md) for the full system prompt and evaluation approach.

### Rule-Based Agent Capabilities

- **Emergency keyword detection** — "severe chest pain", "difficulty breathing", "stroke", "suicidal" → immediate `transfer_to_human` with HIGH urgency
- **Specialty inference** — "shoulder" → Orthopedics, "heart" → Cardiology, "skin" → Dermatology, "headache" → Neurology, "child" → Pediatrics
- **Doctor discovery** — calls `search_doctors`
- **Availability lookup** — calls `check_availability`
- **Slot selection** — by number or by name
- **Confirmation** — "yes" / "confirm" / "book it"
- **Cancellation** — "cancel"
- **Human escalation** — "human" / "agent" / "representative"
- **Questionnaire answering** — after booking, asks pre-visit questions one at a time

---

## Voice Setup

**Voice is not implemented in this prototype.** The text-based chat demonstrates the same AI + capability flow that a voice interface would use.

### How Voice Would Be Added

```
Patient → Audio / Telephone → Speech Recognition (STT)
    → AI Agent (same capabilities, same logic)
    → Speech Generation (TTS) → Patient
```

### Recommended Stack

| Component | Option |
|-----------|--------|
| **Web Voice** | WebRTC (browser mic + speaker) |
| **Telephone** | Twilio Programmable Voice |
| **STT** | Deepgram, OpenAI Whisper, Google Speech |
| **TTS** | ElevenLabs, OpenAI TTS, Google Speech |
| **Orchestration** | Vapi or Retell (managed) OR custom WebSocket |

### Requirements for Production Voice

- **Streaming** — partial transcriptions, partial speech
- **Turn-taking** — detect end of patient's utterance (silence threshold)
- **Interruption / barge-in** — patient can interrupt the AI mid-sentence
- **Silence handling** — retry prompts on silence, hang up after N timeouts
- **Sub-2s latency** — perceived latency for normal conversational turns
- **Long-running operations** — handle 5+ second tool calls without dead air
- **Call failure handling** — retry, transfer to human, log the failure

### Where It Would Plug In

The `AiController.chat` endpoint is the single entry point. A voice layer would:

1. Take audio → transcribe to text
2. Call `POST /ai/chat` with the transcribed text
3. Take the AI's reply → synthesize to speech
4. Stream the audio back to the patient

**No changes to the AI agent or capabilities are needed.** The same code handles text and voice.

---

## Mock EHR

The Mock EHR simulates the hospital's external system.

### Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/ehr/patients` | Create patient |
| GET | `/ehr/patients/:id` | Get patient |
| GET | `/ehr/patients/mrn/:mrn` | Get patient by MRN |
| POST | `/ehr/providers` | Create provider |
| GET | `/ehr/providers/:id` | Get provider |
| POST | `/ehr/appointments` | Create appointment |
| GET | `/ehr/appointments/:id` | Verify appointment (used in recovery) |
| GET | `/ehr/appointments?providerId=...` | Search appointments |
| PUT | `/ehr/appointments/:id` | Reschedule |
| DELETE | `/ehr/appointments/:id` | Cancel |

All endpoints require the `x-api-key` header matching `process.env.API_KEY` in the Mock EHR.

### Failure Injection

Send the `x-simulate` header with one of these values to trigger a failure:

| Mode | Behavior |
|------|----------|
| `timeout` | Hangs for 60s then returns (simulates a slow response) |
| `500` | Immediate 500, no record created |
| `partial` | **Creates the record, then returns 500** (the dangerous one) |
| `duplicate` | Returns a conflict error |
| `auth` | Returns 401 |

### Testing Partial Failure

```bash
curl -X POST http://localhost:3001/ehr/appointments \
  -H "x-api-key: dev-ehr-key-12345" \
  -H "x-simulate: partial" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"...","providerId":"...","startDatetime":"...","endDatetime":"...","idempotencyKey":"..."}'
```

The response says 500, but querying the EHR reveals the appointment **was** created. This is the unknown-outcome scenario that the platform's recovery flow handles.

### Seeding the Mock EHR

```bash
cd mock-ehr
npm run seed
```

Creates:
- Rahul Kumar (Aarathi's patient)
- Dr. Priya Rao (Aarathi's provider)
- Priya Sharma (Nova Care's patient)
- Dr. Anil Mehta (Nova Care's provider)

---

## Workflows

### POST_BOOKING Workflow

Triggered automatically after an appointment is confirmed.

**Steps:**

1. **Assign questionnaire** — finds the right questionnaire for the hospital + appointment type
2. **Notify patient** — "Your appointment with [doctor] is confirmed"
3. **Notify doctor** — "New appointment: [patient] at [time]"
4. **Schedule reminder** — records a reminder to fire 24h before the appointment

**State machine:**

```
RUNNING → COMPLETED
       → FAILED
       → RETRYING
```

Every workflow execution is recorded in `workflow_executions` with:
- `workflowName`
- `correlationId`
- `status`
- `state` (jsonb, includes all steps and their results)
- `attempts`

**Failure handling:** If a step fails, the workflow records the failure and the exception. Post-booking workflows don't retry by default in this prototype — production would use BullMQ with exponential backoff.

### Retries and Idempotency

- Workflows are idempotent — running the same workflow twice on the same appointment won't create duplicate notifications.
- Notification queue records every send with a status (`QUEUED` → `SENT` / `FAILED`).

---

## Tests

Manual test scenarios are documented in [`docs/demo-scenarios.md`](docs/demo-scenarios.md):

| # | Scenario | What It Proves |
|---|----------|----------------|
| 1 | Shoulder pain → Aarathi | Multi-hospital AI booking |
| 2 | Heart pain → Nova Care | Different specialty, different hospital |
| 3 | Emergency "severe chest pain" | Immediate escalation |
| 4 | Partial failure | Recovery without duplicate |
| 5 | EHR down | Reconciliation record created |
| 6 | Concurrency | Only one of two simultaneous bookings wins |
| 7 | Idempotency | Same key → same appointment |
| 8 | Multi-tenant isolation | Hospital A can't see Hospital B |
| 9 | Questionnaire flow | AI collects answers → doctor sees them |
| 10 | Full traceability | Correlation ID ties everything together |

### Running the Tests

**Unit / integration tests** would be run with:

```bash
cd backend
npm test
```

**Manual API tests** — see [`docs/demo-scenarios.md`](docs/demo-scenarios.md) for curl commands.

**End-to-end test** — open `public/login.html`, log in as Patient, chat with the AI, verify the appointment appears in the Doctor and Hospital Admin dashboards.

---

## Deployment

### Backend (Render / Railway / Fly.io)

1. Push repo to GitHub
2. Create a **web service** pointing at `backend/`
3. Add env vars from `.env.example`
4. Deploy command: `npm run start:prod`
5. Build command: `npm install && npm run build`

### Mock EHR

Deploy as a second web service pointing at `mock-ehr/` on port 3001.

### Frontend

Static files in `public/` — any static host works (Netlify, Vercel, GitHub Pages, S3).

**Important:** If deploying backend separately, update the `API` constant in `public/auth.js` to point to the production backend URL.

```javascript
// auth.js
const API = window.location.origin === 'file://'
  ? 'http://localhost:3000'   // ← Change this for production
  : window.location.origin;
```

### Database

Use a managed PostgreSQL (Neon, Supabase, Railway Postgres). Run the seed after deploy.

```bash
# Production seed
PGPASSWORD=<prod-password> psql -h <prod-host> -U <prod-user> -d <prod-db> -f migrations/seed.sql
```

Or run the seed script from a shell on the deployed server.

### Environment Variables in Production

Set these in your hosting provider's dashboard:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET` (fresh random value, not the dev default)
- `EHR_BASE_URL`, `EHR_API_KEY`
- `OPENAI_API_KEY` (only if using the OpenAI agent)

**Do not commit `.env` files.** Use `.env.example` as the template.

---

## Credentials / Demo Accounts

All accounts use password `password123`.

| Role | Email |
|------|-------|
| Patient | `patient@example.com` |
| Doctor | `doctor@example.com` |
| Hospital Admin | `hospital.admin@example.com` |
| Platform Admin | `platform.admin@example.com` |

**Login page:** `public/login.html` — click any of the "Quick Demo Login" buttons to sign in instantly.

**Role → Landing Tab:**

| Role | Lands On |
|------|----------|
| Patient | `app.html#chat` (chat) |
| Doctor | `app.html#doctor` |
| Hospital Admin | `app.html#hospital` |
| Platform Admin | `app.html#platform` |

**Hospital, Doctor, and Patient dropdowns** inside each dashboard let you switch context without re-logging in.

---

## Known Limitations

1. **Frontend is vanilla HTML** — no framework, no state management. A production app would use React/Next.js.
2. **No real voice** — text chat demonstrates the AI flow. WebRTC/Twilio is planned.
3. **No real email/SMS** — notifications are recorded in DB and logged. Production would use SendGrid/Twilio.
4. **LLM agent is rule-based** — deterministic but not as flexible as GPT. Ready to swap in one line.
5. **No migrations** — uses `synchronize: true` in development. Production requires TypeORM migrations.
6. **No Redis-based job queue** — workflows run inline. Production would use BullMQ.
7. **Hospital applications approval is API-only** — no UI to click Approve/Reject.
8. **No AI evaluation dataset** — the "AI Evaluation" dashboard aggregates capability metrics; a real eval would test intent classification accuracy on a golden set.
9. **Doctors have a hardcoded fallback in the AI agent** — the demo assumes one doctor per specialty per hospital.
10. **Seed script re-creates all data on every run** — full truncate + insert.
11. **No password reset flow** — out of scope for the prototype.
12. **No rate limiting** — production would add `@nestjs/throttler` or reverse-proxy limits.
13. **Auth tokens are stored in `sessionStorage`** — fine for demo; production would use HttpOnly cookies + refresh tokens.
14. **CORS is set to `origin: '*'`** — production should whitelist specific origins.

---

## Future Improvements

### Voice & Multichannel

- **Web voice** — WebRTC + streaming STT/TTS
- **Telephone** — Twilio Programmable Voice with barge-in support
- **SMS** — fallback for low-bandwidth users
- **WhatsApp / messaging apps** — additional conversational surfaces

### Integrations

- **Real EHR connectors** — FHIR/HL7 adapters for Epic, Cerner, Athenahealth
- **SMART on FHIR** — standard auth flow for EHR data
- **Insurance verification** — real-time eligibility checks
- **Payment processing** — Stripe / Razorpay for copays

### Platform

- **Full RBAC** — resource ownership checks, per-user tenant claims
- **Migrations** — versioned TypeORM migrations instead of `synchronize`
- **Queue-based workflows** — BullMQ for reliable retries + delayed jobs
- **Questionnaire builder** — UI for hospital admins to author questionnaires
- **Notification templates** — admin-configurable email/SMS templates
- **Advanced scheduling** — recurring appointments, waitlists, cancellation policies
- **Multi-language AI** — internationalization for patient conversations
- **Accessibility** — WCAG-compliant voice + text UX

### Safety & Compliance

- **Clinical safety layer** — symptom classification prompts + urgent escalation policy
- **Audit export** — one-click SIEM export for compliance
- **Data retention policies** — automatic scrubbing of old PII
- **HIPAA/GDPR compliance tools** — consent management, right-to-be-forgotten

### Observability & Evaluation

- **OpenTelemetry traces** — span every request end-to-end
- **Prometheus metrics + Grafana** — real-time dashboards
- **AI evaluation harness** — golden conversations, intent accuracy, capability F1
- **A/B testing** — compare LLM prompts against rule-based agent
- **Cost tracking** — per-conversation LLM cost attribution

---

## License

Prototype for recruitment assignment. Not for clinical use.



