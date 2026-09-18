import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EhrAppointment, EhrAppointmentStatus } from './entities/ehr-appointment.entity';

@Injectable()
export class EhrAppointmentsService {
  constructor(
    @InjectRepository(EhrAppointment)
    private repo: Repository<EhrAppointment>,
  ) {}

  async create(data: Partial<EhrAppointment>): Promise<EhrAppointment> {
    // Basic duplicate check
    if (data.idempotencyKey) {
      const existing = await this.repo.findOne({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) return existing;
    }

    // Overlap check for same provider
    if (data.providerId && data.startDatetime && data.endDatetime) {
      const conflict = await this.repo
        .createQueryBuilder('a')
        .where('a.provider_id = :pid', { pid: data.providerId })
        .andWhere('a.status = :s', { s: EhrAppointmentStatus.SCHEDULED })
        .andWhere('a.start_datetime < :end', { end: data.endDatetime })
        .andWhere('a.end_datetime > :start', { start: data.startDatetime })
        .getOne();
      if (conflict) throw new ConflictException('Provider already booked at that time');
    }

    return this.repo.save(this.repo.create(data));
  }

  async findById(id: string): Promise<EhrAppointment> {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Appointment not found');
    return a;
  }

  async findAll(filters: {
    patientId?: string;
    providerId?: string;
    startFrom?: Date;
  }): Promise<EhrAppointment[]> {
    const qb = this.repo.createQueryBuilder('a');
    if (filters.patientId) qb.andWhere('a.patient_id = :pid', { pid: filters.patientId });
    if (filters.providerId) qb.andWhere('a.provider_id = :prid', { prid: filters.providerId });
    if (filters.startFrom) qb.andWhere('a.start_datetime >= :sf', { sf: filters.startFrom });
    return qb.orderBy('a.start_datetime', 'ASC').getMany();
  }

  async update(id: string, data: Partial<EhrAppointment>): Promise<EhrAppointment> {
    const a = await this.findById(id);
    Object.assign(a, data);
    return this.repo.save(a);
  }

  async cancel(id: string): Promise<EhrAppointment> {
    const a = await this.findById(id);
    a.status = EhrAppointmentStatus.CANCELLED;
    return this.repo.save(a);
  }
}

