# Integration Documentation

The platform integrates with an external healthcare system (EHR). The prototype uses a **Mock EHR** — a separate NestJS service with its own PostgreSQL database. The architecture allows a real connector to replace the mock later.

---

## Table of Contents

- [Connector Abstraction](#connector-abstraction)
- [The Booking Flow](#the-booking-flow)
- [External Verification](#external-verification)
- [Failure Classification](#failure-classification)
- [Recovery Flow (Unknown Outcome)](#recovery-flow-unknown-outcome)
- [Reconciliation Records](#reconciliation-records)
- [External ID Mapping](#external-id-mapping)
- [Mock EHR Endpoints](#mock-ehr-endpoints)
- [Idempotency](#idempotency)
- [Timeout Handling](#timeout-handling)
- [Audit Trail](#audit-trail)
- [Real EHR Integration Path](#real-ehr-integration-path)

---

## Connector Abstraction

External integrations sit behind the `EhrConnector` interface. The platform depends on the interface, never on a specific implementation.

```typescript
interface EhrConnector {
  createAppointment(input): Promise<EhrOperationResult<ExternalAppointment>>;
  getAppointmentById(id): Promise<EhrOperationResult<ExternalAppointment>>;
  findByCriteria(criteria): Promise<EhrOperationResult<ExternalAppointment[]>>;
  cancelAppointment(id): Promise<EhrOperationResult<void>>;
  updateAppointment(id, update): Promise<EhrOperationResult<ExternalAppointment>>;
}
```

### Implementations

| Implementation | Description |
|----------------|-------------|
| `MockEhrConnector` | Talks to the Mock EHR at `http://localhost:3001` |
| `EpicConnector` (future) | Would talk to Epic via FHIR |
| `CernerConnector` (future) | Would talk to Cerner via FHIR |

### Swapping the Connector

The `IntegrationService` depends on `EHR_CONNECTOR` (a string token), not the concrete class. Swap the mock for a real connector by changing one provider in `integration.module.ts`:

```typescript
providers: [
  IntegrationService,
  MockEhrConnector,
  {
    provide: 'EHR_CONNECTOR',
    useExisting: MockEhrConnector,   // ← Change to EpicConnector for production
  },
],
```

---

## The Booking Flow

```
1. AI calls create_appointment capability
   ↓
2. SchedulingService.reserveSlot()
   → pessimistic DB lock (SELECT FOR UPDATE)
   → reject if slot already booked
   → create appointment with status PENDING
   ↓
3. IntegrationService.createAppointmentViaEhr()
   → EhrConnector.createAppointment()
   → Mock EHR creates the appointment
   ↓
4. Verification step:
   → EhrConnector.getAppointmentById(external_id)
   → confirm the record actually exists
   ↓
5. If verified:
   → update internal appointment to CONFIRMED
   → save ExternalIdMapping
   → write IntegrationOperation (status=SUCCESS)
   ↓
6. If not verified or error:
   → classify error (FAILED vs UNKNOWN)
   → recovery flow (see below)
   ↓
7. Fire POST_BOOKING workflow (async)
   ↓
8. Patient sees confirmation
```

---

## External Verification

**A successful API response does not mean the external operation succeeded.**

After every EHR call, we **verify** by re-querying:

```typescript
async verifyAppointment(externalId: string): Promise<boolean> {
  const result = await this.ehr.getAppointmentById(externalId);
  return (
    result.status === EhrOperationStatus.SUCCESS &&
    !!result.data &&
    result.data.id === externalId
  );
}
```

Only after verification succeeds do we update the internal appointment to `CONFIRMED`.

### Why This Matters

Consider the **partial failure** scenario:

1. Platform calls EHR `createAppointment`
2. EHR **creates the appointment**
3. EHR returns **HTTP 500** (simulated failure)
4. A naive client would say "failed, retry"
5. Retry would create a **duplicate appointment**

The platform's verification flow prevents this (see [Recovery Flow](#recovery-flow-unknown-outcome)).

---

## Failure Classification

The connector classifies errors as one of two types:

### FAILED (definitely did not succeed)

- HTTP 400, 401, 403, 404, 409
- Safe to mark the appointment as failed
- No verification needed

```typescript
return {
  status: EhrOperationStatus.FAILED,
  errorCode: String(code),
  errorMessage: message,
};
```

### UNKNOWN (we don't know)

- Timeout (`ECONNABORTED`, `ETIMEDOUT`)
- Network error (`ECONNREFUSED`, `ENOTFOUND`)
- HTTP 5xx (500, 502, 503, 504)

For UNKNOWN, we **cannot** blindly retry — the operation may have succeeded. Instead, we run recovery.

```typescript
if (
  code === 'ECONNABORTED' ||
  code === 'ETIMEDOUT' ||
  code === 'ECONNREFUSED' ||
  code === 'ENOTFOUND' ||
  err?.response?.status === 500 ||
  err?.response?.status === 502 ||
  err?.response?.status === 503 ||
  err?.response?.status === 504
) {
  return { status: EhrOperationStatus.UNKNOWN, ... };
}
```

---

## Recovery Flow (Unknown Outcome)

When the outcome is UNKNOWN, we don't retry — we **query the EHR** to find out what actually happened.

```
1. Unknown outcome from EHR
   ↓
2. Query EHR: findByCriteria(providerId, idempotencyKey, startDatetime)
   ↓
3a. Found → the operation succeeded
    → sync internal state
    → do NOT create a duplicate
   ↓
3b. Not found → safe to retry once
    → call createAppointment again with the same idempotency key
   ↓
3c. Still unknown → create reconciliation record + escalate
```

### Implementation

```typescript
private async recoverUnknownOutcome(...) {
  const lookup = await this.ehr.findByCriteria({
    providerId: input.externalProviderId,
    idempotencyKey: input.appointment.idempotencyKey,
    startDatetime: input.appointment.startDatetime,
  });

  // 3a. Found → the original request actually succeeded
  if (lookup.status === SUCCESS && lookup.data && lookup.data.length > 0) {
    const found = lookup.data[0];
    await this.syncInternalState(input.appointment.id, found.id, correlationId);
    return { success: true, status: 'CONFIRMED', ... };
  }

  // 3b. Not found → safe to retry once
  if (lookup.status === SUCCESS) {
    const retry = await this.ehr.createAppointment({...});
    if (retry.status === SUCCESS && retry.data) {
      await this.syncInternalState(...);
      return { success: true, status: 'CONFIRMED', ... };
    }
  }

  // 3c. Cannot determine → escalate
  await this.reconcileRepo.save({
    correlationId,
    appointmentId: input.appointment.id,
    reason: 'Unknown outcome after EHR call and recovery query',
    status: ReconciliationStatus.OPEN,
  });
  return { success: false, status: 'RECONCILIATION_REQUIRED', ... };
}
```

### Demo

The Mock EHR can simulate partial failure via the `X-Simulate: partial` header. It **creates the appointment and then returns a 500**. The recovery flow:

1. Classifies the 500 as UNKNOWN
2. Queries the EHR via `findByCriteria(idempotencyKey)`
3. **Finds the record**
4. Syncs internal state
5. Does **not** create a duplicate

See [`docs/demo-scenarios.md`](demo-scenarios.md) for the full demo steps.

---

## Reconciliation Records

When the outcome cannot be determined even after recovery, the platform creates a `reconciliation_records` entry:

```typescript
await this.reconcileRepo.save({
  correlationId,
  appointmentId: input.appointment.id,
  reason: 'Unknown outcome after EHR call and recovery query',
  status: ReconciliationStatus.OPEN,
});
```

The appointment status is set to `RECONCILIATION_REQUIRED`.

**An operator sees this in the Platform Admin dashboard → Integrations tab and manually verifies the external state.**

### Reconciliation Lifecycle

```
OPEN → IN_PROGRESS → RESOLVED
                  → ESCALATED
```

Every transition is recorded. Once resolved, the operator updates the internal appointment status.

---

## External ID Mapping

The platform never assumes internal IDs equal external IDs. Every successful operation is recorded in `external_id_mappings`:

| internal_entity_type | internal_id | external_system | external_id |
|---------------------|-------------|-----------------|-------------|
| APPOINTMENT | `app_abc123` | MOCK_EHR | `ehr_xyz789` |
| PATIENT | `pat_111` | MOCK_EHR | `ehr_pat_222` |
| DOCTOR | `doc_333` | MOCK_EHR | `ehr_prov_444` |

Doctors and patients also carry their external IDs directly:

- `doctors.external_provider_id` — the EHR's UUID for this provider
- `patients.external_patient_id` — the EHR's UUID for this patient
- `appointments.external_appointment_id` — the EHR's UUID for this appointment

**Fast lookup:** the direct columns are used during booking. `external_id_mappings` is used for historical records and reverse lookups.

---

## Mock EHR Endpoints

The Mock EHR is a separate NestJS service running on port 3001 with its own PostgreSQL database (`ehr_main`).

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/ehr/patients` | Create patient |
| GET | `/ehr/patients` | List patients |
| GET | `/ehr/patients/:id` | Get patient |
| GET | `/ehr/patients/mrn/:mrn` | Get by MRN |
| POST | `/ehr/providers` | Create provider |
| GET | `/ehr/providers` | List providers |
| GET | `/ehr/providers/:id` | Get provider |
| POST | `/ehr/appointments` | Create appointment |
| GET | `/ehr/appointments` | Search appointments |
| GET | `/ehr/appointments/:id` | **Verify appointment (used in recovery)** |
| PUT | `/ehr/appointments/:id` | Reschedule |
| DELETE | `/ehr/appointments/:id` | Cancel |

All endpoints require the `x-api-key` header matching `process.env.API_KEY` in the Mock EHR.

### Failure Injection

| Mode | Behavior |
|------|----------|
| `timeout` | Hangs for 60s then returns (simulates slow response) |
| `500` | Immediate 500, no record created |
| `partial` | **Creates the record, then returns 500** (dangerous) |
| `duplicate` | Returns a conflict error |
| `auth` | Returns 401 |

Send the mode in the `X-Simulate` header:

```bash
curl -X POST http://localhost:3001/ehr/appointments \
  -H "x-api-key: dev-ehr-key-12345" \
  -H "x-simulate: partial" \
  -H "Content-Type: application/json" \
  -d '{"patientId":"...","providerId":"...","startDatetime":"...","endDatetime":"...","idempotencyKey":"..."}'
```

### Test Endpoints via Curl

```bash
# Create appointment
curl -X POST http://localhost:3001/ehr/appointments \
  -H "x-api-key: dev-ehr-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "<EHR_PATIENT_ID>",
    "providerId": "<EHR_PROVIDER_ID>",
    "startDatetime": "2026-09-20T05:00:00.000Z",
    "endDatetime": "2026-09-20T05:30:00.000Z",
    "idempotencyKey": "test-001"
  }'

# Verify
curl -X GET http://localhost:3001/ehr/appointments/<ID> \
  -H "x-api-key: dev-ehr-key-12345"
```

---

## Idempotency

Every external mutation carries an `idempotencyKey`. The Mock EHR dedups on this key:

```typescript
if (data.idempotencyKey) {
  const existing = await this.repo.findOne({
    where: { idempotencyKey: data.idempotencyKey }
  });
  if (existing) return existing;
}
```

The platform generates the key once per booking attempt:

```typescript
const idempotencyKey = `ai-${correlationId}`;
```

Even if the request is retried (network glitch, timeout), the same key is used → the EHR returns the existing record → **no duplicate**.

### Where Idempotency Is Enforced

| Layer | Key | Effect |
|-------|-----|--------|
| Platform | `appointments.idempotency_key` UNIQUE | Prevents duplicate bookings from retries at the DB level |
| Mock EHR | `ehr_appointments.idempotency_key` | Returns existing record for the same key |

---

## Timeout Handling

The connector has an 8-second timeout:

```typescript
private readonly timeoutMs = 8000;
```

After 8s, axios throws `ECONNABORTED` → classified as UNKNOWN → recovery flow kicks in.

### Client-Side vs Server-Side Timeouts

- **Client timeout (8s)** — the platform gives up waiting for the EHR
- **Server timeout (60s simulated)** — the Mock EHR hangs, then responds

In practice, the platform's 8s timeout fires first, and the appointment is marked UNKNOWN → recovery flow kicks in.

### Testing the Timeout Flow

```bash
time curl --max-time 5 -s -X POST http://localhost:3001/ehr/appointments \
  -H "x-api-key: dev-ehr-key-12345" \
  -H "x-simulate: timeout" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

With `--max-time 5`, curl gives up after 5 seconds — mimicking the platform's timeout.

---

## Audit Trail

Every integration operation is recorded in `integration_operations`:

```typescript
await this.opRepo.save({
  correlationId,
  operationType: 'CREATE_APPOINTMENT',
  requestPayload: scrubbed,      // PII removed
  responsePayload: scrubbed,     // PII removed
  status: 'SUCCESS' | 'FAILED' | 'UNKNOWN' | 'VERIFIED' | 'RECONCILED',
  errorMessage,
  retryCount,
});
```

These records appear in:

- **Platform Admin → Integrations tab** — full list with status, error, retries
- **Platform Admin → Operational Health** — aggregated counts
- **`GET /dashboard/trace/:correlationId`** — timeline of one booking

### What the Audit Answers

- **Did the EHR call succeed?**
- **How many retries?**
- **What was the error?**
- **Was it verified?**
- **Was it reconciled?**

---

## Real EHR Integration Path

To swap the Mock EHR for a real system (e.g. Epic):

### 1. Implement the `EhrConnector` Interface

Create `EpicConnector` in `backend/src/modules/integration/connectors/epic.connector.ts`:

```typescript
@Injectable()
export class EpicConnector implements EhrConnector {
  async createAppointment(input): Promise<EhrOperationResult<ExternalAppointment>> {
    // Call Epic FHIR API: POST /Appointment
    // ...
  }

  async getAppointmentById(id): Promise<EhrOperationResult<ExternalAppointment>> {
    // Call Epic FHIR API: GET /Appointment/:id
    // ...
  }

  // ... other methods
}
```

### 2. Register It

In `integration.module.ts`:

```typescript
providers: [
  IntegrationService,
  EpicConnector,
  {
    provide: 'EHR_CONNECTOR',
    useExisting: EpicConnector,
  },
],
```

### 3. Update Config

Add Epic-specific env vars:

```env
EPIC_BASE_URL=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
EPIC_CLIENT_ID=...
EPIC_CLIENT_SECRET=...
```

### 4. Nothing Else Changes

The `IntegrationService`, `create-appointment.capability.ts`, and all the verification/recovery logic work unchanged. That's the whole point of the connector abstraction.

### FHIR Alignment

The Mock EHR is intentionally FHIR-shaped:

| Mock EHR | FHIR |
|----------|------|
| `/ehr/patients` | `Patient` resource |
| `/ehr/providers` | `Practitioner` resource |
| `/ehr/appointments` | `Appointment` resource |

Migrating from Mock to Epic is a matter of URL translation and OAuth flow — the platform's business logic stays the same.

---

## Summary

| Aspect | Implementation |
|--------|----------------|
| Connector | `EhrConnector` interface + `MockEhrConnector` implementation |
| Verification | After every mutation, re-query the EHR to confirm |
| Failure classification | FAILED (4xx) vs UNKNOWN (timeouts, 5xx) |
| Recovery | Query EHR by idempotency key → sync or retry or reconcile |
| Reconciliation | Record + escalate when the outcome can't be determined |
| Idempotency | Every mutation carries an idempotency key; EHR dedups |
| Timeout | 8s client-side; UNKNOWN on timeout |
| Audit | Every operation recorded in `integration_operations` with correlation ID |
| Future | Swap `MockEhrConnector` for `EpicConnector` — one provider change |

