import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import {
  Hospital,
  HospitalStatus,
} from '../modules/hospitals/entities/hospital.entity';
import { Department } from '../modules/departments/entities/department.entity';
import { Specialty } from '../modules/specialties/entities/specialty.entity';
import {
  Doctor,
  DoctorStatus,
} from '../modules/doctors/entities/doctor.entity';
import { Calendar } from '../modules/calendars/entities/calendar.entity';
import { WorkingHours } from '../modules/scheduling/entities/working-hours.entity';
import { BlockedSlot } from '../modules/scheduling/entities/blocked-slot.entity';
import { Appointment } from '../modules/appointments/entities/appointment.entity';
import { AppointmentHistory } from '../modules/appointments/entities/appointment-history.entity';
import { Patient } from '../modules/patients/entities/patient.entity';
import { ExternalIdMapping } from '../modules/integration/entities/external-id-mapping.entity';
import { IntegrationOperation } from '../modules/integration/entities/integration-operation.entity';
import { ReconciliationRecord } from '../modules/integration/entities/reconciliation-record.entity';
import { AuditEvent } from '../modules/audit/entities/audit-event.entity';
import { CapabilityExecution } from '../modules/capabilities/entities/capability-execution.entity';
import { Conversation } from '../modules/conversations/entities/conversation.entity';
import { ConversationMessage } from '../modules/conversations/entities/conversation-message.entity';
import { Questionnaire } from '../modules/questionnaires/entities/questionnaire.entity';
import { QuestionnaireResponse } from '../modules/questionnaires/entities/questionnaire-response.entity';
import { Notification } from '../modules/notifications/entities/notification.entity';
import { WorkflowExecution } from '../modules/workflows/entities/workflow-execution.entity';
import { PlatformUser, UserRole } from '../modules/platform-users/entities/platform-user.entity';
import * as bcrypt from 'bcrypt';

dotenv.config();

async function seed() {
  const isProd = process.env.NODE_ENV === 'production';
  const useSSL = process.env.DB_HOST?.includes('neon.tech');

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [
      Hospital,
      Department,
      Specialty,
      Doctor,
      Calendar,
      WorkingHours,
      BlockedSlot,
      Appointment,
      AppointmentHistory,
      Patient,
      ExternalIdMapping,
      IntegrationOperation,
      ReconciliationRecord,
      AuditEvent,
      CapabilityExecution,
      Conversation,
      ConversationMessage,
      Questionnaire,
      QuestionnaireResponse,
      Notification,
      WorkflowExecution,
      PlatformUser,
    ],
    synchronize: true,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    extra: {
      family: 4,             // Force IPv4
      connectTimeoutMS: 30000,
    },
  });

  await ds.initialize();
  console.log('📦 DataSource connected');

  const hospitalRepo = ds.getRepository(Hospital);
  const deptRepo = ds.getRepository(Department);
  const specRepo = ds.getRepository(Specialty);
  const doctorRepo = ds.getRepository(Doctor);
  const calRepo = ds.getRepository(Calendar);
  const whRepo = ds.getRepository(WorkingHours);
  const patientRepo = ds.getRepository(Patient);
  const questionnaireRepo = ds.getRepository(Questionnaire);
  const userRepo = ds.getRepository(PlatformUser);

  console.log('🌱 Seeding database...');

  // 1. Hospital
  const hospital = await hospitalRepo.save(
    hospitalRepo.create({
      name: 'Aarathi General Hospital',
      address: '123 Main St, Bangalore',
      phone: '+91-80-1234-5678',
      email: 'info@aarathi-hospital.example',
      status: HospitalStatus.APPROVED,
    }),
  );
  console.log(`🏥 Hospital: ${hospital.id}`);

  // 2. Department
  const dept = await deptRepo.save(
    deptRepo.create({ hospitalId: hospital.id, name: 'Orthopedics' }),
  );

  // 3. Specialty
  const spec = await specRepo.save(
    specRepo.create({
      hospitalId: hospital.id,
      name: 'Orthopedic Surgery',
    }),
  );

  // 4. Doctor
  const doctor = await doctorRepo.save(
    doctorRepo.create({
      hospitalId: hospital.id,
      departmentId: dept.id,
      specialtyId: spec.id,
      name: 'Dr. Priya Rao',
      qualifications: 'MBBS, MS (Ortho)',
      experienceYears: 12,
      languages: ['English', 'Hindi', 'Kannada'],
      consultationTypes: ['IN_PERSON'],
      appointmentDurationMinutes: 30,
      status: DoctorStatus.ACTIVE,
      externalProviderId: null,
    }),
  );
  console.log(`👨‍⚕️ Doctor: ${doctor.id} (${doctor.name})`);

  // 5. Calendar
  const cal = await calRepo.save(
    calRepo.create({
      doctorId: doctor.id,
      hospitalId: hospital.id,
      isActive: true,
      timezone: 'Asia/Kolkata',
    }),
  );

  // 6. Working hours: Mon-Fri, 9am-5pm
  const workdays = [1, 2, 3, 4, 5];
  for (const day of workdays) {
    await whRepo.save(
      whRepo.create({
        calendarId: cal.id,
        dayOfWeek: day,
        startTime: '09:00:00',
        endTime: '17:00:00',
      }),
    );
  }
  console.log(`📅 Calendar with ${workdays.length} working days`);

  // 7. Patient
  const patient = await patientRepo.save(
    patientRepo.create({
      name: 'Rahul Kumar',
      email: 'rahul@example.com',
      phone: '+91-98765-43210',
      dateOfBirth: new Date('1990-05-15'),
      externalPatientId: null,
    }),
  );
  console.log(`👤 Patient: ${patient.id} (${patient.name})`);

  // 8. Questionnaire
  const questionnaire = await questionnaireRepo.save(
    questionnaireRepo.create({
      hospitalId: hospital.id,
      name: 'Pre-Visit Intake — Orthopedics',
      description: 'Basic intake questions for orthopedic consultations',
      assignedTo: 'APPOINTMENT_TYPE:CONSULT',
      questions: [
        {
          id: 'q1',
          type: 'yes_no',
          question: 'Have you had imaging (X-ray, MRI) done for this issue?',
          required: true,
        },
        {
          id: 'q2',
          type: 'short_text',
          question: 'Where exactly is the pain located?',
          required: true,
        },
        {
          id: 'q3',
          type: 'choice',
          question: 'How long have you had this issue?',
          options: [
            'Less than a week',
            '1-4 weeks',
            '1-6 months',
            'More than 6 months',
          ],
          required: true,
        },
        {
          id: 'q4',
          type: 'numeric',
          question: 'On a scale of 1-10, how severe is the pain today?',
          required: true,
        },
      ],
    }),
  );
  console.log(`📋 Questionnaire: ${questionnaire.id}`);

  // ═══════════ Hospital B — for tenant isolation demo ═══════════

  const hospitalB = await hospitalRepo.save(
    hospitalRepo.create({
      name: 'Nova Care Hospital',
      address: '456 Park Ave, Mumbai',
      phone: '+91-22-9999-8888',
      email: 'info@novacare.example',
      status: HospitalStatus.APPROVED,
    }),
  );
  console.log(`🏥 Hospital B: ${hospitalB.id}`);

  const deptB = await deptRepo.save(
    deptRepo.create({ hospitalId: hospitalB.id, name: 'Cardiology' }),
  );

  const specB = await specRepo.save(
    specRepo.create({
      hospitalId: hospitalB.id,
      name: 'Cardiology',
    }),
  );

  const doctorB = await doctorRepo.save(
    doctorRepo.create({
      hospitalId: hospitalB.id,
      departmentId: deptB.id,
      specialtyId: specB.id,
      name: 'Dr. Anil Mehta',
      qualifications: 'MBBS, MD (Cardio)',
      experienceYears: 15,
      languages: ['English', 'Hindi'],
      consultationTypes: ['IN_PERSON'],
      appointmentDurationMinutes: 30,
      status: DoctorStatus.ACTIVE,
      externalProviderId: null,
    }),
  );
  console.log(`👨‍⚕️ Doctor B: ${doctorB.id} (${doctorB.name})`);

  const calB = await calRepo.save(
    calRepo.create({
      doctorId: doctorB.id,
      hospitalId: hospitalB.id,
      isActive: true,
      timezone: 'Asia/Kolkata',
    }),
  );

  for (const day of [1, 2, 3, 4, 5]) {
    await whRepo.save(
      whRepo.create({
        calendarId: calB.id,
        dayOfWeek: day,
        startTime: '10:00:00',
        endTime: '18:00:00',
      }),
    );
  }

  const patientB = await patientRepo.save(
    patientRepo.create({
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '+91-99999-12345',
      dateOfBirth: new Date('1985-08-20'),
      externalPatientId: null,
    }),
  );
  console.log(`👤 Patient B: ${patientB.id} (${patientB.name})`);

  const questionnaireB = await questionnaireRepo.save(
    questionnaireRepo.create({
      hospitalId: hospitalB.id,
      name: 'Pre-Visit Intake — Cardiology',
      description: 'Basic intake questions for cardiology consultations',
      assignedTo: 'APPOINTMENT_TYPE:CONSULT',
      questions: [
        {
          id: 'q1',
          type: 'yes_no',
          question: 'Are you currently taking blood pressure medication?',
          required: true,
        },
        {
          id: 'q2',
          type: 'short_text',
          question: 'Describe any chest discomfort you have experienced.',
          required: true,
        },
        {
          id: 'q3',
          type: 'numeric',
          question: 'What is your most recent systolic blood pressure reading?',
          required: true,
        },
      ],
    }),
  );
  console.log(`📋 Questionnaire B: ${questionnaireB.id}`);

  // ═══════════ Seed Auth Users ═══════════

  const passwordHash = await bcrypt.hash('password123', 10);

  await userRepo.save([
    userRepo.create({
      email: 'patient@example.com',
      passwordHash,
      role: UserRole.PATIENT,
      isActive: true,
    }),
    userRepo.create({
      email: 'doctor@example.com',
      passwordHash,
      role: UserRole.DOCTOR,
      isActive: true,
    }),
    userRepo.create({
      email: 'hospital.admin@example.com',
      passwordHash,
      role: UserRole.HOSPITAL_ADMIN,
      isActive: true,
    }),
    userRepo.create({
      email: 'platform.admin@example.com',
      passwordHash,
      role: UserRole.PLATFORM_ADMIN,
      isActive: true,
    }),
  ]);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Seed complete. Save these IDs for testing:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`HOSPITAL_ID=${hospital.id}`);
  console.log(`DOCTOR_ID=${doctor.id}`);
  console.log(`PATIENT_ID=${patient.id}`);
  console.log(`QUESTIONNAIRE_ID=${questionnaire.id}`);
  console.log('');
  console.log(`HOSPITAL_B_ID=${hospitalB.id}`);
  console.log(`DOCTOR_B_ID=${doctorB.id}`);
  console.log(`PATIENT_B_ID=${patientB.id}`);
  console.log(`QUESTIONNAIRE_B_ID=${questionnaireB.id}`);
  console.log('');
  console.log('🔐 Auth users created (password: password123):');
  console.log('  patient@example.com');
  console.log('  doctor@example.com');
  console.log('  hospital.admin@example.com');
  console.log('  platform.admin@example.com');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await ds.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

