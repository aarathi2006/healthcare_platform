import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Appointment } from '../appointments/entities/appointment.entity';
import { IntegrationOperation } from '../integration/entities/integration-operation.entity';
import { ReconciliationRecord } from '../integration/entities/reconciliation-record.entity';
import { WorkflowExecution } from '../workflows/entities/workflow-execution.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { CapabilityExecution } from '../capabilities/entities/capability-execution.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { Hospital } from '../hospitals/entities/hospital.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Questionnaire } from '../questionnaires/entities/questionnaire.entity';
import { QuestionnaireResponse } from '../questionnaires/entities/questionnaire-response.entity';
import { Calendar } from '../calendars/entities/calendar.entity';
import { WorkingHours } from '../scheduling/entities/working-hours.entity';
import { BlockedSlot } from '../scheduling/entities/blocked-slot.entity';
import { Department } from '../departments/entities/department.entity';
import { Specialty } from '../specialties/entities/specialty.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Appointment) private apptRepo: Repository<Appointment>,
    @InjectRepository(IntegrationOperation) private intOpRepo: Repository<IntegrationOperation>,
    @InjectRepository(ReconciliationRecord) private recRepo: Repository<ReconciliationRecord>,
    @InjectRepository(WorkflowExecution) private wfRepo: Repository<WorkflowExecution>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(AuditEvent) private auditRepo: Repository<AuditEvent>,
    @InjectRepository(CapabilityExecution) private capRepo: Repository<CapabilityExecution>,
    @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
    @InjectRepository(Hospital) private hospRepo: Repository<Hospital>,
    @InjectRepository(Doctor) private docRepo: Repository<Doctor>,
    @InjectRepository(Patient) private patRepo: Repository<Patient>,
    @InjectRepository(Questionnaire) private qRepo: Repository<Questionnaire>,
    @InjectRepository(QuestionnaireResponse) private qrRepo: Repository<QuestionnaireResponse>,
    @InjectRepository(Calendar) private calRepo: Repository<Calendar>,
    @InjectRepository(WorkingHours) private whRepo: Repository<WorkingHours>,
    @InjectRepository(BlockedSlot) private blockRepo: Repository<BlockedSlot>,
    @InjectRepository(Department) private deptRepo: Repository<Department>,
    @InjectRepository(Specialty) private specRepo: Repository<Specialty>,
  ) {}

  async overview() {
    const [
      hospitals, doctors, patients, appointments,
      integrationOps, reconciliations, workflows,
      notifications, capabilityExecutions, conversations, auditEvents,
    ] = await Promise.all([
      this.hospRepo.count(),
      this.docRepo.count(),
      this.patRepo.count(),
      this.apptRepo.count(),
      this.intOpRepo.count(),
      this.recRepo.count(),
      this.wfRepo.count(),
      this.notifRepo.count(),
      this.capRepo.count(),
      this.convRepo.count(),
      this.auditRepo.count(),
    ]);

    return {
      hospitals, doctors, patients, appointments,
      integrationOperations: integrationOps,
      reconciliationRecords: reconciliations,
      workflows, notifications,
      capabilityExecutions, conversations, auditEvents,
    };
  }

  async hospitalApplications() {
    const hospitals = await this.hospRepo.find({
      order: { createdAt: 'DESC' },
    });
    return hospitals.map((h) => ({
      id: h.id,
      name: h.name,
      email: h.email,
      phone: h.phone,
      status: h.status,
      createdAt: h.createdAt,
    }));
  }

  async analytics() {
    const [appointments, capabilities, integrations, workflows, notifs] =
      await Promise.all([
        this.apptRepo.find(),
        this.capRepo.find(),
        this.intOpRepo.find(),
        this.wfRepo.find(),
        this.notifRepo.find(),
      ]);

    const apptByStatus: Record<string, number> = {};
    for (const a of appointments) apptByStatus[a.status] = (apptByStatus[a.status] || 0) + 1;

    const capByStatus: Record<string, number> = {};
    const capByCapability: Record<string, number> = {};
    for (const c of capabilities) {
      capByStatus[c.status] = (capByStatus[c.status] || 0) + 1;
      capByCapability[c.capabilityName] = (capByCapability[c.capabilityName] || 0) + 1;
    }

    const intByStatus: Record<string, number> = {};
    for (const i of integrations) intByStatus[i.status] = (intByStatus[i.status] || 0) + 1;

    const wfByStatus: Record<string, number> = {};
    for (const w of workflows) wfByStatus[w.status] = (wfByStatus[w.status] || 0) + 1;

    const notifByRecipient: Record<string, number> = {};
    for (const n of notifs) notifByRecipient[n.recipientType] = (notifByRecipient[n.recipientType] || 0) + 1;

    const avgLatencyMs = capabilities.length
      ? capabilities.reduce((sum, c) => sum + (c.durationMs || 0), 0) / capabilities.length
      : 0;

    return {
      appointments: { total: appointments.length, byStatus: apptByStatus },
      capabilities: {
        total: capabilities.length,
        byStatus: capByStatus,
        byCapability: capByCapability,
        avgLatencyMs: Math.round(avgLatencyMs),
      },
      integrations: { total: integrations.length, byStatus: intByStatus },
      workflows: { total: workflows.length, byStatus: wfByStatus },
      notifications: { total: notifs.length, byRecipient: notifByRecipient },
    };
  }

  async appointments(limit = 50) {
    return this.apptRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async integrationOperations(limit = 50) {
    return this.intOpRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async reconciliations() {
    return this.recRepo.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  async workflows(limit = 50) {
    return this.wfRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async notifications(limit = 50) {
    return this.notifRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async capabilityExecutions(limit = 50) {
    return this.capRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async auditEvents(limit = 100) {
    return this.auditRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async conversations(limit = 20) {
    return this.convRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async questionnaireResponses(limit = 50) {
    const responses = await this.qrRepo.find({ order: { createdAt: 'DESC' }, take: limit });
    return Promise.all(
      responses.map(async (r) => {
        const questionnaire = await this.qRepo.findOne({ where: { id: r.questionnaireId } });
        const patient = await this.patRepo.findOne({ where: { id: r.patientId } });
        const appointment = await this.apptRepo.findOne({ where: { id: r.appointmentId } });
        return { response: r, questionnaire, patient, appointment };
      }),
    );
  }

  async hospitalOverview(hospitalId: string) {
    const hospital = await this.hospRepo.findOne({ where: { id: hospitalId } });
    if (!hospital) return null;

    const [doctors, appointments, questionnaires, workflows, integrations] =
      await Promise.all([
        this.docRepo.find({ where: { hospitalId } }),
        this.apptRepo.find({ where: { hospitalId } }),
        this.qRepo.find({ where: { hospitalId } }),
        this.wfRepo.find(),
        this.intOpRepo.find(),
      ]);

    const apptByStatus: Record<string, number> = {};
    for (const a of appointments) apptByStatus[a.status] = (apptByStatus[a.status] || 0) + 1;

    return {
      hospital,
      counts: {
        doctors: doctors.length,
        appointments: appointments.length,
        questionnaires: questionnaires.length,
        workflows: workflows.length,
        integrations: integrations.length,
      },
      appointmentsByStatus: apptByStatus,
    };
  }

  async doctorsByHospital(hospitalId: string) {
    const doctors = await this.docRepo.find({ where: { hospitalId } });
    return Promise.all(
      doctors.map(async (d) => {
        const department = d.departmentId
          ? await this.deptRepo.findOne({ where: { id: d.departmentId } })
          : null;
        const specialty = d.specialtyId
          ? await this.specRepo.findOne({ where: { id: d.specialtyId } })
          : null;
        const calendar = await this.calRepo.findOne({
          where: { doctorId: d.id, isActive: true },
        });
        return {
          ...d,
          departmentName: department?.name,
          specialtyName: specialty?.name,
          hasActiveCalendar: !!calendar,
          calendarId: calendar?.id,
        };
      }),
    );
  }

  async calendarsByHospital(hospitalId: string) {
    const calendars = await this.calRepo.find({ where: { hospitalId } });
    return Promise.all(
      calendars.map(async (c) => {
        const doctor = await this.docRepo.findOne({ where: { id: c.doctorId } });
        const workingHours = await this.whRepo.find({ where: { calendarId: c.id } });
        const blockedSlots = await this.blockRepo.find({
          where: { calendarId: c.id },
          order: { startDatetime: 'ASC' },
        });
        return {
          calendar: c,
          doctor: doctor ? { id: doctor.id, name: doctor.name } : null,
          workingHours,
          blockedSlots,
        };
      }),
    );
  }

  async appointmentsByHospital(hospitalId: string, limit = 50) {
    return this.apptRepo.find({
      where: { hospitalId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async questionnairesByHospital(hospitalId: string) {
    return this.qRepo.find({ where: { hospitalId } });
  }

  async questionnaireResponsesByHospital(hospitalId: string) {
    const appointments = await this.apptRepo.find({ where: { hospitalId } });
    const appointmentIds = appointments.map((a) => a.id);
    if (appointmentIds.length === 0) return [];

    const responses = await this.qrRepo.find({
      where: { appointmentId: In(appointmentIds) },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      responses.map(async (r) => {
        const questionnaire = await this.qRepo.findOne({ where: { id: r.questionnaireId } });
        const patient = await this.patRepo.findOne({ where: { id: r.patientId } });
        const appointment = await this.apptRepo.findOne({ where: { id: r.appointmentId } });
        const doctor = appointment
          ? await this.docRepo.findOne({ where: { id: appointment.doctorId } })
          : null;
        return { response: r, questionnaire, patient, appointment, doctor };
      }),
    );
  }

  async allDoctors() {
    const doctors = await this.docRepo.find();
    return Promise.all(
      doctors.map(async (d) => {
        const hospital = await this.hospRepo.findOne({ where: { id: d.hospitalId } });
        const specialty = d.specialtyId
          ? await this.specRepo.findOne({ where: { id: d.specialtyId } })
          : null;
        return {
          id: d.id,
          name: d.name,
          hospitalId: d.hospitalId,
          hospitalName: hospital ? hospital.name : null,
          specialtyName: specialty ? specialty.name : null,
        };
      }),
    );
  }

  async appointmentsByDoctor(doctorId: string, limit = 100) {
    return this.apptRepo.find({
      where: { doctorId },
      order: { startDatetime: 'DESC' },
      take: limit,
    });
  }

  async doctorProfile(doctorId: string) {
    const doctor = await this.docRepo.findOne({ where: { id: doctorId } });
    if (!doctor) return null;
    const hospital = await this.hospRepo.findOne({ where: { id: doctor.hospitalId } });
    const specialty = doctor.specialtyId
      ? await this.specRepo.findOne({ where: { id: doctor.specialtyId } })
      : null;
    const department = doctor.departmentId
      ? await this.deptRepo.findOne({ where: { id: doctor.departmentId } })
      : null;
    const calendar = await this.calRepo.findOne({ where: { doctorId, isActive: true } });
    return { doctor, hospital, specialty, department, calendar };
  }

  async doctorCalendar(doctorId: string) {
    const calendar = await this.calRepo.findOne({ where: { doctorId, isActive: true } });
    if (!calendar) return null;
    const workingHours = await this.whRepo.find({ where: { calendarId: calendar.id } });
    const blockedSlots = await this.blockRepo.find({
      where: { calendarId: calendar.id },
      order: { startDatetime: 'ASC' },
    });
    const appointments = await this.apptRepo.find({
      where: { doctorId },
      order: { startDatetime: 'ASC' },
    });
    return { calendar, workingHours, blockedSlots, appointments };
  }

  async doctorQuestionnaires(doctorId: string) {
    const appointments = await this.apptRepo.find({ where: { doctorId } });
    const appointmentIds = appointments.map((a) => a.id);
    if (appointmentIds.length === 0) return [];

    const responses = await this.qrRepo.find({
      where: { appointmentId: In(appointmentIds) },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      responses.map(async (r) => {
        const questionnaire = await this.qRepo.findOne({ where: { id: r.questionnaireId } });
        const patient = await this.patRepo.findOne({ where: { id: r.patientId } });
        const appointment = await this.apptRepo.findOne({ where: { id: r.appointmentId } });
        return { response: r, questionnaire, patient, appointment };
      }),
    );
  }

  async allPatients(hospitalId?: string) {
    const where = hospitalId ? { hospitalId } : {};
    return this.patRepo.find({ where, order: { name: 'ASC' } });
  }

  async patientProfile(patientId: string) {
    const patient = await this.patRepo.findOne({ where: { id: patientId } });
    if (!patient) return null;
    return patient;
  }

  async appointmentsByPatient(patientId: string, limit = 100) {
    return this.apptRepo.find({
      where: { patientId },
      order: { startDatetime: 'DESC' },
      take: limit,
    });
  }

  async patientQuestionnaires(patientId: string) {
    const responses = await this.qrRepo.find({
      where: { patientId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      responses.map(async (r) => {
        const questionnaire = await this.qRepo.findOne({ where: { id: r.questionnaireId } });
        const appointment = await this.apptRepo.findOne({ where: { id: r.appointmentId } });
        return { response: r, questionnaire, appointment };
      }),
    );
  }

  async submitPatientQuestionnaire(patientId: string, appointmentId: string, responses: Record<string, any>) {
    const response = await this.qrRepo.findOne({
      where: { appointmentId, patientId },
    });
    if (!response) {
      return { error: 'No questionnaire assigned to this appointment' };
    }
    response.responses = { ...(response.responses || {}), ...responses };
    response.status = 'COMPLETED' as any;
    await this.qrRepo.save(response);
    return { success: true, responseId: response.id, status: response.status };
  }

  async traceByCorrelation(correlationId: string) {
    const [capabilities, integration, audit, workflows] = await Promise.all([
      this.capRepo.find({ where: { correlationId }, order: { createdAt: 'ASC' } }),
      this.intOpRepo.find({ where: { correlationId }, order: { createdAt: 'ASC' } }),
      this.auditRepo.find({ where: { correlationId }, order: { createdAt: 'ASC' } }),
      this.wfRepo.find({ where: { correlationId }, order: { createdAt: 'ASC' } }),
    ]);

    return {
      correlationId,
      timeline: {
        capabilities,
        integrationOperations: integration,
        auditEvents: audit,
        workflows,
      },
    };
  }
}

