# Architecture

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INTERFACES                                   │
│  Login  ·  Patient Chat  ·  Patient / Doctor / Hospital / Platform  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   APPLICATION / AI LAYER                            │
│  AiAgentService  ·  MockAiAgentService  ·  ConversationService      │
│  → Understands intent, maintains conversation context,               │
│    selects capabilities, generates natural-language replies          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  CONTEXT + CAPABILITIES                             │
│  CapabilityRegistryService                                          │
│  · search_doctors      · check_availability                         │
│  · create_appointment  · get_appointment                            │
│  · cancel_appointment  · transfer_to_human                          │
│  · get_questionnaire   · submit_questionnaire                       │
│  Each capability: validates input, authorizes, executes, audits     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CORE SERVICES                                  │
│  SchedulingService      ·  AppointmentService                       │
│  PatientService         ·  DoctorService                            │
│  NotificationsService   ·  QuestionnairesService                    │
│  WorkflowsService                                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SCHEDULING                                     │
│  Real availability calculation                                      │
│  Slot reservation with pessimistic locking                          │
│  Idempotency enforcement                                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 INTEGRATION / CONNECTORS                            │
│  IntegrationService  (orchestration + verification)                 │
│  EhrConnector interface (abstraction)                               │
│    └── MockEhrConnector (today)                                     │
│    └── EpicConnector (future)                                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SYSTEMS                                │
│  Mock EHR (port 3001)                                               │
│  Deliberate failure injection (timeout / 500 / partial / auth)      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   EVENTS / WORKFLOWS                                │
│  WorkflowsService                                                   │
│  POST_BOOKING workflow: assign questionnaire → notify patient →     │
│  notify doctor → schedule reminder                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│             DATA / ANALYTICS / OBSERVABILITY                        │
│  PostgreSQL (22 tables)                                             │
│  AuditEvents · IntegrationOperations · CapabilityExecutions         │
│  Correlation IDs thread through every layer                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Principles

1. **AI logic contains no EHR-specific code.** It calls capabilities; the connector translates.
2. **Scheduling is independent from conversation.** The conversation asks "what slots exist?"; scheduling answers from real data.
3. **External integrations sit behind connector interfaces.** The platform never knows which EHR is behind it.
4. **Long-running workflows are asynchronous.** Booking returns quickly; the workflow fires in the background.
5. **Operational events are separate from transactional records.** Audit events are not business data.
6. **AI actions are structured and auditable.** Every capability call is recorded.

## Layered Boundaries

| Layer | Depends on | Must not depend on |
|-------|-----------|-------------------|
| Interfaces | Application / AI | Database directly |
| Application / AI | Capabilities | Database, EHR |
| Capabilities | Core Services | Database (except through services) |
| Core Services | ORM entities | AI, EHR, HTTP |
| Scheduling | ORM + transactions | AI, EHR |
| Integration | EHR connector interface | AI, Scheduling internals |
| Workflows | Core services | HTTP clients, AI |

## Data Flow — One Booking

```
1. Patient message arrives at /ai/chat
2. ConversationService loads/creates conversation + history
3. AiAgentService detects specialty from symptom keywords
4. CapabilityRegistryService.execute('search_doctors', input)
   → capability queries DoctorRepo + HospitalRepo + SpecialtyRepo
   → returns doctors with hospital name
   → CapabilityExecution record saved
5. AI presents doctors, user picks one (or auto-selects if only one)
6. check_availability
   → SchedulingService.getAvailableSlots(doctorId, from, to)
   → returns real slots
   → CapabilityExecution saved
7. User picks slot → create_appointment
   → SchedulingService.reserveSlot (pessimistic lock inside transaction)
   → IntegrationService.createAppointmentViaEhr
     → MockEhrConnector.createAppointment (HTTP to mock-ehr)
     → MockEhrConnector.getAppointmentById (VERIFY)
     → sync internal appointment state to CONFIRMED
     → IntegrationOperation records saved
     → ExternalIdMapping created
   → WorkflowsService.onAppointmentConfirmed (async)
     → QuestionnairesService.assign
     → NotificationsService.enqueue (patient)
     → NotificationsService.enqueue (doctor)
     → reminder scheduled in workflow state
   → CapabilityExecution saved
8. AI immediately fetches the questionnaire and starts asking questions
9. Patient answers one at a time
10. submit_questionnaire saves structured responses
11. Doctor Dashboard shows the responses
```

Every step shares a `correlationId`.

## Security / Tenant Model

### Three Levels of Isolation

1. **Application Level** — Every query that fetches tenant data scopes by `hospital_id`. See `dashboard.service.ts` for examples like `doctorsByHospital(hospitalId)`.

2. **Foreign Key Constraints**
   - `doctors.hospital_id` → `hospitals.id`
   - `appointments.hospital_id` → `hospitals.id`
   - `calendars.hospital_id` → `hospitals.id`
   - `questionnaires.hospital_id` → `hospitals.id`
   - `patients.hospital_id` → `hospitals.id` (nullable for cross-hospital patients)

3. **Frontend Routing** — Dropdowns on each dashboard scope the current view:
   - Patient Dashboard → patient dropdown
   - Doctor Dashboard → doctor dropdown
   - Hospital Admin → hospital dropdown
   - Platform Admin → cross-tenant view (admin only)

### External ID Mapping

The platform never assumes internal IDs equal external IDs. Every appointment has:

- **Internal** `appointments.id` — used everywhere in the platform
- **External** `appointments.external_appointment_id` — the ID returned by the EHR

`external_id_mappings` maintains a permanent record:

| Column | Purpose |
|--------|---------|
| `internal_entity_type` | "APPOINTMENT", "PATIENT", "DOCTOR" |
| `internal_id` | Internal UUID |
| `external_system` | "MOCK_EHR" |
| `external_id` | External UUID |

Doctors and patients also carry `external_provider_id` / `external_patient_id` on their own rows for fast lookup.

### Correlation IDs

Every capability call, integration operation, workflow execution, and audit event carries a `correlationId` (UUID v4). This is how a booking can be traced end-to-end:

```
Conversation (conversationId)
    ↓
AI decision
    ↓
CapabilityExecution(correlationId)
    ↓
IntegrationOperation(correlationId)
    ↓
EHR call
    ↓
Verification query (same correlationId)
    ↓
Appointment update
    ↓
WorkflowExecution(correlationId)
    ↓
Notification(s)
    ↓
AuditEvent(correlationId)
```

Query `GET /dashboard/trace/:correlationId` to see the full timeline of one booking.

## Appointment State Machine

```
REQUESTED → PENDING → CONFIRMED → COMPLETED
                ↓          ↓
              FAILED   CANCELLED
                ↓
              RESCHEDULED
                ↓
          SYNC_PENDING → RECONCILIATION_REQUIRED
```

Every transition is recorded in `appointment_history`.

## Privacy-Aware Logging

PII is scrubbed before writing to audit or integration tables:

- Patient IDs are replaced with `***`
- External patient IDs are replaced with `***`
- Notification bodies use only IDs, never names
- Request/response payloads are stripped of sensitive fields before storage

This satisfies Section 21 of the assignment: *"Avoid unnecessarily storing raw sensitive healthcare content in operational logs."*

