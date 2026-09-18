import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EhrPatient } from './entities/ehr-patient.entity';
import { EhrPatientsService } from './patients.service';
import { EhrPatientsController } from './patients.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EhrPatient])],
  providers: [EhrPatientsService],
  controllers: [EhrPatientsController],
  exports: [EhrPatientsService],
})
export class EhrPatientsModule {}

