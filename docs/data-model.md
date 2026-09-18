# Data Model

The platform uses **22 tables** organized into 8 domains. Every tenant-scoped table carries a `hospital_id` for isolation.

## Entity Domains

| Domain | Tables | Purpose |
|--------|--------|---------|
| Multi-Tenant Base | hospitals, departments, specialties | The tenants and their org structure |
| Users & Actors | platform_users, doctors, patients | Auth users and clinical actors |
| Scheduling | calendars, working_hours, blocked_slots | When doctors are available |
| Appointments | appointments, appointment_history | Booked visits and state transitions |
| Integration | integration_operations, external_id_mappings, reconciliation_records | External EHR state |
| AI & Conversation | conversations, conversation_messages, capability_executions | Conversational state and AI audit |
| Questionnaires & Workflows | questionnaires, questionnaire_responses, workflow_executions, notifications | Post-booking flows |
| Observability | audit_events | Every important action |

---

## Table Schemas

### Multi-Tenant Base

#### `hospitals`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | varchar(200) | |
| address | text | |
| phone | varchar(30) | |
| email | varchar(200) | |
| status | enum | DRAFT / SUBMITTED / UNDER_REVIEW / APPROVED / REJECTED / SUSPENDED |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** `status` (for approvals), `name`

#### `departments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| hospital_id | uuid FK → hospitals.id | indexed |
| name | varchar(200) | |
| created_at | timestamptz | |

#### `specialties`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| hospital_id | uuid FK → hospitals.id | indexed |
| name | varchar(200) | e.g. "Orthopedic Surgery", "Cardiology" |
| created_at | timestamptz | |

---

### Users & Actors

#### `platform_users`

Auth users for all four roles.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| email | varchar(200) | unique, indexed |
| password_hash | varchar(255) | bcrypt |
| role | enum | PLATFORM_ADMIN / HOSPITAL_ADMIN / DOCTOR / PATIENT |
| is_active | boolean | default true |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** `email` (unique), `role`

#### `doctors`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| hospital_id | uuid FK → hospitals.id | indexed |
| department_id | uuid FK → departments.id | nullable |
| specialty_id | uuid FK → specialties.id | nullable |
| user_id | uuid FK → platform_users.id | nullable |
| name | varchar(200) | |
| photo_url | text | nullable |
| qualifications | text | e.g. "MBBS, MS (Ortho)" |
| experience_years | int | default 0 |
| languages | jsonb | array |
| consultation_types | jsonb | array |
| appointment_duration_minutes | int | default 30 |
| external_provider_id | varchar(200) | nullable — links to EHR provider UUID |
| status | enum | INVITED / ACTIVE / INACTIVE / SUSPENDED |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** `hospital_id`, `status`, `external_provider_id`

#### `patients`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| hospital_id | uuid FK → hospitals.id | nullable — "home" hospital |
| user_id | uuid FK → platform_users.id | nullable |
| name | varchar(200) | |
| email | varchar(200) | indexed |
| phone | varchar(30) | |
| date_of_birth | date | |
| communication_preference | enum | EMAIL / SMS / PHONE / NONE |
| external_patient_id | varchar(200) | nullable — links to EHR patient UUID |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** `hospital_id`, `email`, `external_patient_id`

**Note:** A patient can have appointments at multiple hospitals (cross-hospital visits). The `hospital_id` column represents the patient's "home" hospital for dashboard filtering.

---

### Scheduling

#### `calendars`

One active calendar per doctor.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| doctor_id | uuid FK → doctors.id | indexed |
| hospital_id | uuid FK → hospitals.id | indexed |
| is_active | boolean | default true |
| timezone | varchar(50) | e.g. "Asia/Kolkata" |
| created_at | timestamptz | |

#### `working_hours`

Day-of-week start/end times for a calendar.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| calendar_id | uuid FK → calendars.id | indexed |
| day_of_week | int | 0=Sun … 6=Sat |
| start_time | time | e.g. "09:00:00" |
| end_time | time | e.g. "17:00:00" |

#### `blocked_slots`

Doctor-declared leave / blocked periods.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| calendar_id | uuid FK → calendars.id | indexed |
| start_datetime | timestamptz | |
| end_datetime | timestamptz | |
| reason | varchar(300) | nullable |

---

### Appointments

#### `appointments`

Core appointment records with a full state machine.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| hospital_id | uuid FK → hospitals.id | indexed |
| doctor_id | uuid FK → doctors.id | indexed |
| patient_id | uuid FK → patients.id | indexed |
| appointment_type | varchar(100) | e.g. "CONSULT" |
| start_datetime | timestamptz | indexed |
| end_datetime | timestamptz | |
| status | enum | REQUESTED / PENDING / CONFIRMED / RESCHEDULED / CANCELLED / COMPLETED / NO_SHOW / FAILED / SYNC_PENDING / RECONCILIATION_REQUIRED |
| external_appointment_id | varchar(200) | nullable — links to EHR appointment UUID |
| idempotency_key | varchar(200) | unique, indexed |
| correlation_id | varchar(100) | indexed |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** `hospital_id`, `doctor_id`, `patient_id`, `(doctor_id, start_datetime)` composite, `idempotency_key` unique, `correlation_id`

**State machine:**
```
REQUESTED → PENDING → CONFIRMED → COMPLETED
                ↓          ↓
              FAILED   CANCELLED
                ↓
              RESCHEDULED
                ↓
          SYNC_PENDING → RECONCILIATION_REQUIRED
```

#### `appointment_history`

Every state transition over time.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| appointment_id | uuid FK → appointments.id | indexed |
| from_status | varchar(50) | nullable |
| to_status | varchar(50) | |
| reason | text | nullable |
| created_at | timestamptz | |

---

### Integration

#### `integration_operations`

Every external EHR call recorded with its outcome.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| correlation_id | varchar(100) | indexed |
| operation_type | varchar(100) | e.g. "CREATE_APPOINTMENT" |
| request_payload | jsonb | PII-scrubbed |
| response_payload | jsonb | PII-scrubbed |
| status | enum | STARTED / SUCCESS / FAILED / UNKNOWN / VERIFIED / RECONCILED |
| error_message | text | nullable |
| retry_count | int | default 0 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** `correlation_id`, `status`, `operation_type`

#### `external_id_mappings`

Permanent record linking internal IDs to external IDs.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| internal_entity_type | varchar(50) | "APPOINTMENT" / "PATIENT" / "DOCTOR" |
| internal_id | uuid | indexed |
| external_system | varchar(100) | "MOCK_EHR" |
| external_id | varchar(200) | indexed |
| created_at | timestamptz | |

**Indexes:** `internal_id`, `external_id`, `(internal_entity_type, internal_id)`

#### `reconciliation_records`

Unresolvable failures needing human review.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| correlation_id | varchar(100) | indexed |
| appointment_id | uuid FK → appointments.id | nullable |
| reason | text | why reconciliation was needed |
| status | enum | OPEN / IN_PROGRESS / RESOLVED / ESCALATED |
| assigned_to | uuid FK → platform_users.id | nullable |
| resolution_notes | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### AI & Conversation

#### `conversations`

Per-patient conversation session with persistent context.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| patient_id | uuid FK → patients.id | indexed |
| channel | enum | WEB_VOICE / PHONE / TEXT |
| status | enum | ACTIVE / ENDED |
| context | jsonb | conversation state (see below) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Context schema (jsonb):**
```json
{
  "mockState": {
    "stage": "awaiting_confirmation",
    "specialty": "Cardiology",
    "doctors": [...],
    "selectedDoctorId": "...",
    "selectedDoctorName": "Dr. Anil Mehta",
    "selectedDoctorHospital": "Nova Care Hospital",
    "slots": { "slots": [...], "total": 93 },
    "selectedSlot": "2026-09-17T06:00:00.000Z",
    "activeAppointmentId": "...",
    "questionnaireId": "...",
    "questionnaireQuestions": [...],
    "currentQuestionIndex": 0,
    "answers": { "q1": "Yes", "q2": "..." }
  }
}
```

**State machine:**
```
idle → awaiting_doctor_selection → awaiting_slot_selection
    → awaiting_confirmation → booked
    → questionnaire_answering → booked
```

#### `conversation_messages`

Message history.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| conversation_id | uuid FK → conversations.id | indexed |
| role | enum | USER / ASSISTANT / SYSTEM |
| content | text | |
| created_at | timestamptz | |

#### `capability_executions`

Every AI capability call (audited).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| correlation_id | varchar(100) | indexed |
| capability_name | varchar(100) | e.g. "search_doctors" |
| input | jsonb | PII-scrubbed |
| output | jsonb | PII-scrubbed |
| status | varchar(20) | SUCCESS / FAILED |
| error | text | nullable |
| duration_ms | int | default 0 |
| created_at | timestamptz | |

**Indexes:** `correlation_id`, `capability_name`, `status`, `created_at`

---

### Questionnaires & Workflows

#### `questionnaires`

Pre-visit questionnaire templates per hospital.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| hospital_id | uuid FK → hospitals.id | indexed |
| name | varchar(200) | e.g. "Pre-Visit Intake — Orthopedics" |
| description | text | nullable |
| questions | jsonb | array of question definitions (see below) |
| assigned_to | varchar(200) | e.g. "APPOINTMENT_TYPE:CONSULT" |
| created_at | timestamptz | |

**Questions schema (jsonb):**
```json
[
  {
    "id": "q1",
    "type": "yes_no",
    "question": "Have you had imaging (X-ray, MRI) done for this issue?",
    "required": true
  },
  {
    "id": "q2",
    "type": "short_text",
    "question": "Where exactly is the pain located?",
    "required": true
  },
  {
    "id": "q3",
    "type": "choice",
    "question": "How long have you had this issue?",
    "options": ["Less than a week", "1-4 weeks", "1-6 months", "More than 6 months"],
    "required": true
  },
  {
    "id": "q4",
    "type": "numeric",
    "question": "On a scale of 1-10, how severe is the pain today?",
    "required": true
  }
]
```

**Question types supported:** `yes_no`, `choice`, `multiple_choice`, `numeric`, `date`, `short_text`, `long_text`, `structured`

#### `questionnaire_responses`

Patient answers to a questionnaire.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| questionnaire_id | uuid FK → questionnaires.id | |
| appointment_id | uuid FK → appointments.id | indexed |
| patient_id | uuid FK → patients.id | indexed |
| responses | jsonb | key-value map: `{"q1": "Yes", "q2": "Right shoulder"}` |
| status | enum | PENDING / COMPLETED |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `workflow_executions`

Async workflow runs.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| workflow_name | varchar(100) | e.g. "POST_BOOKING" |
| correlation_id | varchar(100) | indexed |
| status | enum | RUNNING / COMPLETED / FAILED / RETRYING |
| state | jsonb | full workflow state with steps |
| attempts | int | default 0 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**State schema (jsonb):**
```json
{
  "appointmentId": "...",
  "steps": [
    { "step": "ASSIGN_QUESTIONNAIRE", "questionnaireId": "...", "status": "OK" },
    { "step": "NOTIFY_PATIENT", "status": "OK" },
    { "step": "NOTIFY_DOCTOR", "status": "OK" },
    { "step": "SCHEDULE_REMINDER", "reminderAt": "2026-09-15T07:00:00.000Z", "status": "OK" }
  ]
}
```

#### `notifications`

Queued and sent notifications.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| recipient_type | varchar(50) | "PATIENT" / "DOCTOR" / "HOSPITAL" |
| recipient_id | uuid | |
| channel | varchar(20) | "EMAIL" / "SMS" / "IN_APP" |
| title | varchar(300) | |
| body | text | PII-scrubbed |
| status | enum | QUEUED / SENT / FAILED |
| sent_at | timestamptz | nullable |
| created_at | timestamptz | |

**Indexes:** `(recipient_type, recipient_id)`, `status`

---

### Observability

#### `audit_events`

Every important action, filterable by correlation ID.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| correlation_id | varchar(100) | nullable, indexed |
| actor_type | varchar(50) | "AI" / "USER" / "SYSTEM" |
| actor_id | uuid | nullable |
| action | varchar(100) | e.g. "APPOINTMENT_SYNCED" |
| entity_type | varchar(100) | nullable |
| entity_id | uuid | nullable |
| metadata | jsonb | PII-scrubbed |
| created_at | timestamptz | indexed |

**Indexes:** `correlation_id`, `action`, `(entity_type, entity_id)`, `created_at`

---

## Relationships Diagram

```
hospitals 1───────N departments
hospitals 1───────N specialties
hospitals 1───────N doctors
hospitals 1───────N calendars
hospitals 1───────N appointments
hospitals 1───────N questionnaires
hospitals 1───────N patients         (nullable — home hospital)

doctors   1───────1 calendars
doctors   1───────N appointments

patients  1───────N appointments
patients  1───────N conversations
patients  1───────N questionnaire_responses

appointments 1────N appointment_history
appointments 1────1 questionnaire_responses
appointments 1────N external_id_mappings  (via internal_id)

conversations 1───N conversation_messages

questionnaires 1──N questionnaire_responses
```

---

## Tenant Isolation Summary

| Table | Tenant Key | Enforced Where |
|-------|-----------|----------------|
| hospitals | (self) | — |
| departments | hospital_id | app + FK |
| specialties | hospital_id | app + FK |
| doctors | hospital_id | app + FK |
| calendars | hospital_id | app + FK |
| appointments | hospital_id | app + FK |
| questionnaires | hospital_id | app + FK |
| patients | hospital_id (nullable) | app |
| working_hours | via calendar_id → calendars.hospital_id | app |
| blocked_slots | via calendar_id → calendars.hospital_id | app |
| questionnaire_responses | via appointment_id → appointments.hospital_id | app |
| integration_operations | via correlation_id | app |
| external_id_mappings | via internal_id | app |
| reconciliation_records | via appointment_id | app |
| conversations | (not tenant-scoped — patient-owned) | — |
| conversation_messages | via conversation_id | — |
| capability_executions | (cross-tenant audit — platform admin only) | — |
| workflow_executions | via correlation_id | — |
| notifications | (recipient-owned) | — |
| audit_events | (cross-tenant audit — platform admin only) | — |
| platform_users | (global auth) | — |

**Rule:** If a table has `hospital_id`, every query MUST filter by it. This is enforced at the service layer (`dashboard.service.ts`, `scheduling.service.ts`).

---

## Indexes Strategy

Key composite indexes for performance:

| Index | Table | Purpose |
|-------|-------|---------|
| `(doctor_id, start_datetime)` | appointments | Availability lookup — find booked slots for a doctor |
| `(hospital_id, start_datetime)` | appointments | Hospital admin — list recent appointments for one hospital |
| `idempotency_key` UNIQUE | appointments | Prevent duplicate bookings from retries |
| `(internal_entity_type, internal_id)` | external_id_mappings | Look up external IDs by internal ID |
| `correlation_id` | capability_executions, integration_operations, audit_events, workflow_executions | Trace a single booking end-to-end |
| `(recipient_type, recipient_id)` | notifications | List notifications for one recipient |
| `email` | platform_users | Fast login lookup |
| `email` | patients | Fast patient lookup |
| `email` | doctors | Fast doctor lookup |

---

## Migration Path

In production, `synchronize: true` is **not used**. Instead:

1. Set `synchronize: false` in `app.module.ts`
2. Add TypeORM migrations to `backend/src/migrations/`
3. Run `npm run migration:run` on deploy

Every entity has a clear schema, so migrations can be generated automatically from the current entities.

**Example migration command:**

```bash
npm run typeorm migration:generate -- -n InitialSchema
npm run typeorm migration:run
```

---

## Data Size Estimates (for production planning)

| Table | Est. rows/month (1 hospital) | Growth factor |
|-------|-----------------------------|---------------|
| appointments | ~2,000 | linear |
| appointment_history | ~4,000 | linear (2x appointments) |
| conversation_messages | ~10,000 | linear |
| capability_executions | ~15,000 | linear (5x messages) |
| audit_events | ~20,000 | linear |
| integration_operations | ~3,000 | linear |
| workflow_executions | ~2,000 | linear |
| notifications | ~5,000 | linear |
| questionnaire_responses | ~1,500 | linear |

**Total monthly growth (1 hospital):** ~62,000 rows. For 100 hospitals: ~6.2M rows/month. PostgreSQL handles this comfortably with proper indexes.

---

## JSONB Usage

Three tables use JSONB for flexible data:

| Table | Column | Why JSONB |
|-------|--------|-----------|
| `questionnaires` | `questions` | Question types vary; each questionnaire has a different structure |
| `questionnaire_responses` | `responses` | Key-value map of answers keyed by question ID |
| `conversations` | `context` | AI state changes shape as conversation progresses |
| `workflow_executions` | `state` | Workflow steps vary by workflow type |

**Queryable:** PostgreSQL GIN indexes can be added on these columns for advanced filtering:

```sql
CREATE INDEX idx_questionnaire_responses_gin ON questionnaire_responses USING GIN (responses);
```

