import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor, DoctorStatus } from '../../doctors/entities/doctor.entity';
import { Hospital } from '../../hospitals/entities/hospital.entity';
import { Specialty } from '../../specialties/entities/specialty.entity';
import { Department } from '../../departments/entities/department.entity';
import { CapabilityDefinition } from '../capability.interface';

export interface SearchDoctorsInput {
  specialty?: string;
  hospitalName?: string;
  doctorName?: string;
  limit?: number;
}

@Injectable()
export class SearchDoctorsCapability {
  constructor(
    @InjectRepository(Doctor) private doctorRepo: Repository<Doctor>,
    @InjectRepository(Hospital) private hospitalRepo: Repository<Hospital>,
    @InjectRepository(Specialty) private specialtyRepo: Repository<Specialty>,
    @InjectRepository(Department) private deptRepo: Repository<Department>,
  ) {}

  get definition(): CapabilityDefinition<SearchDoctorsInput> {
    return {
      name: 'search_doctors',
      description:
        'Search for doctors by specialty, hospital, or name. Returns active doctors with hospital name and specialty.',
      inputSchema: {
        type: 'object',
        properties: {
          specialty: { type: 'string' },
          hospitalName: { type: 'string' },
          doctorName: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
        },
      },
      requiresConfirmation: false,
      handler: async (input) => this.run(input),
    };
  }

  private async run(input: SearchDoctorsInput) {
    const qb = this.doctorRepo
      .createQueryBuilder('d')
      .where('d.status = :s', { s: DoctorStatus.ACTIVE })
      .limit(input.limit || 5);

    if (input.doctorName) {
      qb.andWhere('d.name ILIKE :n', { n: `%${input.doctorName}%` });
    }

    if (input.specialty) {
      const rootWords = input.specialty
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/s$/, '').slice(0, 8))
        .filter((w) => w.length >= 4);

      const specs = await this.specialtyRepo.createQueryBuilder('s').getMany();
      const matchingSpecs = specs.filter((s) => {
        const name = s.name.toLowerCase();
        return rootWords.some((root) => name.includes(root));
      });

      if (matchingSpecs.length === 0) return { doctors: [], count: 0 };
      qb.andWhere('d.specialty_id IN (:...sids)', {
        sids: matchingSpecs.map((s) => s.id),
      });
    }

    if (input.hospitalName) {
      const hospitals = await this.hospitalRepo
        .createQueryBuilder('h')
        .where('h.name ILIKE :n', { n: `%${input.hospitalName}%` })
        .getMany();
      if (hospitals.length === 0) return { doctors: [], count: 0 };
      qb.andWhere('d.hospital_id IN (:...hids)', {
        hids: hospitals.map((h) => h.id),
      });
    }

    const doctors = await qb.getMany();

    const results = await Promise.all(
      doctors.map(async (d) => {
        const hospital = await this.hospitalRepo.findOne({
          where: { id: d.hospitalId },
        });
        const specialty = d.specialtyId
          ? await this.specialtyRepo.findOne({ where: { id: d.specialtyId } })
          : null;
        const department = d.departmentId
          ? await this.deptRepo.findOne({ where: { id: d.departmentId } })
          : null;

        return {
          id: d.id,
          name: d.name,
          qualifications: d.qualifications,
          experienceYears: d.experienceYears,
          languages: d.languages,
          appointmentDurationMinutes: d.appointmentDurationMinutes,
          hospitalId: d.hospitalId,
          hospitalName: hospital ? hospital.name : 'Unknown Hospital',
          hospitalAddress: hospital ? hospital.address : null,
          specialtyName: specialty ? specialty.name : null,
          departmentName: department ? department.name : null,
        };
      }),
    );

    return { doctors: results, count: results.length };
  }
}

