import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { EhrPatient } from '../modules/patients/entities/ehr-patient.entity';
import { EhrProvider } from '../modules/providers/entities/ehr-provider.entity';
import { EhrAppointment } from '../modules/appointments/entities/ehr-appointment.entity';

dotenv.config();

async function seed() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [EhrPatient, EhrProvider, EhrAppointment],
    synchronize: false,
  });

  await ds.initialize();
  console.log('📦 Mock EHR DataSource connected');

  const patientRepo = ds.getRepository(EhrPatient);
  const providerRepo = ds.getRepository(EhrProvider);
  const apptRepo = ds.getRepository(EhrAppointment);

  // Clean (drop existing rows to avoid conflicts)
  await apptRepo.clear();
  await patientRepo.clear();
  await providerRepo.clear();

  // ═══════════ Hospital A — Aarathi ═══════════

  const patientA = await patientRepo.save(
    patientRepo.create({
      mrn: 'MRN-A-0001',
      firstName: 'Rahul',
      lastName: 'Kumar',
      dateOfBirth: new Date('1990-05-15'),
      phone: '+91-98765-43210',
      email: 'rahul@example.com',
    }),
  );
  console.log(`👤 EHR Patient A (Rahul Kumar): ${patientA.id}`);

  const providerA = await providerRepo.save(
    providerRepo.create({
      npi: 'NPI-A-100001',
      firstName: 'Priya',
      lastName: 'Rao',
      specialty: 'Orthopedic Surgery',
      department: 'Orthopedics',
      facilityId: null,
    }),
  );
  console.log(`👨‍⚕️ EHR Provider A (Dr. Priya Rao): ${providerA.id}`);

  // ═══════════ Hospital B — Nova Care ═══════════

  const patientB = await patientRepo.save(
    patientRepo.create({
      mrn: 'MRN-B-0001',
      firstName: 'Priya',
      lastName: 'Sharma',
      dateOfBirth: new Date('1985-08-20'),
      phone: '+91-99999-12345',
      email: 'priya@example.com',
    }),
  );
  console.log(`👤 EHR Patient B (Priya Sharma): ${patientB.id}`);

  const providerB = await providerRepo.save(
    providerRepo.create({
      npi: 'NPI-B-100001',
      firstName: 'Anil',
      lastName: 'Mehta',
      specialty: 'Cardiology',
      department: 'Cardiology',
      facilityId: null,
    }),
  );
  console.log(`👨‍⚕️ EHR Provider B (Dr. Anil Mehta): ${providerB.id}`);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Mock EHR seed complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`EHR_PATIENT_A_ID=${patientA.id}`);
  console.log(`EHR_PROVIDER_A_ID=${providerA.id}`);
  console.log(`EHR_PATIENT_B_ID=${patientB.id}`);
  console.log(`EHR_PROVIDER_B_ID=${providerB.id}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await ds.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

