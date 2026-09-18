import {
  Body,
  Controller,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { IntegrationService } from './integration.service';
import { Appointment, AppointmentStatus } from '../appointments/entities/appointment.entity';
import { ExternalIdMapping } from './entities/external-id-mapping.entity';
import { Public } from '../auth/decorators/public.decorator';

interface BookAndIntegrateDto {
  appointmentId: string;
  externalPatientId: string;
  externalProviderId: string;
  externalFacilityId?: string;
  failureMode?: string;
}

@Controller('integration')
export class IntegrationController {
  constructor(
    private readonly integration: IntegrationService,
    @InjectRepository(Appointment)
    private readonly apptRepo: Repository<Appointment>,
    @InjectRepository(ExternalIdMapping)
    private readonly mappingRepo: Repository<ExternalIdMapping>,
  ) {}

  @Public()
  @Post('book-and-integrate')
  async bookAndIntegrate(@Body() dto: BookAndIntegrateDto) {
    const appointment = await this.apptRepo.findOne({
      where: { id: dto.appointmentId },
    });
    if (!appointment) throw new BadRequestException('Appointment not found');

    if (!appointment.idempotencyKey) {
      appointment.idempotencyKey = randomUUID();
      await this.apptRepo.save(appointment);
    }
    if (!appointment.correlationId) {
      appointment.correlationId = randomUUID();
      await this.apptRepo.save(appointment);
    }

    await this.apptRepo.update(appointment.id, {
      status: AppointmentStatus.SYNC_PENDING,
    });

    const result = await this.integration.createAppointmentViaEhr({
      appointment,
      externalPatientId: dto.externalPatientId,
      externalProviderId: dto.externalProviderId,
      externalFacilityId: dto.externalFacilityId || null,
    });

    const final = await this.apptRepo.findOne({
      where: { id: appointment.id },
    });

    return {
      ...result,
      finalInternalStatus: final?.status,
      externalAppointmentId: final?.externalAppointmentId,
    };
  }

  @Public()
  @Post('book-and-integrate-failure-test')
  async bookAndIntegrateWithFailure(
    @Body() dto: BookAndIntegrateDto & { failureMode?: string },
  ) {
    const appointment = await this.apptRepo.findOne({
      where: { id: dto.appointmentId },
    });
    if (!appointment) throw new BadRequestException('Appointment not found');

    if (!appointment.idempotencyKey) {
      appointment.idempotencyKey = randomUUID();
      await this.apptRepo.save(appointment);
    }
    if (!appointment.correlationId) {
      appointment.correlationId = randomUUID();
      await this.apptRepo.save(appointment);
    }

    await this.apptRepo.update(appointment.id, {
      status: AppointmentStatus.SYNC_PENDING,
    });

    const result = await this.integration.createAppointmentViaEhr(
      {
        appointment,
        externalPatientId: dto.externalPatientId,
        externalProviderId: dto.externalProviderId,
        externalFacilityId: dto.externalFacilityId || null,
      },
      dto.failureMode,
    );

    const final = await this.apptRepo.findOne({
      where: { id: appointment.id },
    });

    return {
      ...result,
      finalInternalStatus: final?.status,
      externalAppointmentId: final?.externalAppointmentId,
      failureModeTested: dto.failureMode,
    };
  }

  @Public()
  @Post('lookup-mapping')
  async lookupMapping(@Body() body: { internalId: string }) {
    return this.mappingRepo.find({ where: { internalId: body.internalId } });
  }
}


