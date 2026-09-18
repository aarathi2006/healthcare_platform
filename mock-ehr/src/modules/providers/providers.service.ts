import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EhrProvider } from './entities/ehr-provider.entity';

@Injectable()
export class EhrProvidersService {
  constructor(
    @InjectRepository(EhrProvider)
    private repo: Repository<EhrProvider>,
  ) {}

  async create(data: Partial<EhrProvider>): Promise<EhrProvider> {
    return this.repo.save(this.repo.create(data));
  }

  async findAll(): Promise<EhrProvider[]> {
    return this.repo.find();
  }

  async findById(id: string): Promise<EhrProvider> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Provider not found');
    return p;
  }

  async findByNpi(npi: string): Promise<EhrProvider | null> {
    return this.repo.findOne({ where: { npi } });
  }
}

