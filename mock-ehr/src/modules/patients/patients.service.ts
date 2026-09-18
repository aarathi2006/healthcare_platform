import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EhrPatient } from './entities/ehr-patient.entity';

@Injectable()
export class EhrPatientsService {
  constructor(
    @InjectRepository(EhrPatient)
    private repo: Repository<EhrPatient>,
  ) {}

  async create(data: Partial<EhrPatient>): Promise<EhrPatient> {
    return this.repo.save(this.repo.create(data));
  }

  async findAll(): Promise<EhrPatient[]> {
    return this.repo.find();
  }

  async findById(id: string): Promise<EhrPatient> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Patient not found');
    return p;
  }

  async findByMrn(mrn: string): Promise<EhrPatient | null> {
    return this.repo.findOne({ where: { mrn } });
  }
}

