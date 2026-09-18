import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { EhrAppointmentsService } from './appointments.service';
import { FailureInjector } from '../failures/failure-injector';

@Controller('ehr/appointments')
export class EhrAppointmentsController {
  constructor(private svc: EhrAppointmentsService) {}

  private checkApiKey(key?: string) {
    if (key !== process.env.API_KEY) {
      throw new UnauthorizedException('Invalid API key');
    }
  }

  @Post()
  async create(
    @Body() body: any,
    @Headers('x-api-key') apiKey: string,
    @Headers('x-simulate') simulate?: string,
  ) {
    this.checkApiKey(apiKey);
    await FailureInjector.check(simulate);

    const payload = {
      patientId: body.patientId,
      providerId: body.providerId,
      facilityId: body.facilityId,
      startDatetime: new Date(body.startDatetime),
      endDatetime: new Date(body.endDatetime),
      idempotencyKey: body.idempotencyKey,
    };

    const created = await this.svc.create(payload);

    // Handle "partial" mode: record was created, but error is returned
    return FailureInjector.afterPartialOrThrow(simulate, created);
  }

  @Get()
  async findAll(
    @Headers('x-api-key') apiKey: string,
    @Query('patientId') patientId?: string,
    @Query('providerId') providerId?: string,
  ) {
    this.checkApiKey(apiKey);
    return this.svc.findAll({ patientId, providerId });
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Headers('x-api-key') apiKey: string) {
    this.checkApiKey(apiKey);
    return this.svc.findById(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-api-key') apiKey: string,
    @Headers('x-simulate') simulate?: string,
  ) {
    this.checkApiKey(apiKey);
    await FailureInjector.check(simulate);
    const updated = await this.svc.update(id, body);
    return FailureInjector.afterPartialOrThrow(simulate, updated);
  }

  @Delete(':id')
  async cancel(
    @Param('id') id: string,
    @Headers('x-api-key') apiKey: string,
    @Headers('x-simulate') simulate?: string,
  ) {
    this.checkApiKey(apiKey);
    await FailureInjector.check(simulate);
    const cancelled = await this.svc.cancel(id);
    return FailureInjector.afterPartialOrThrow(simulate, cancelled);
  }
}

