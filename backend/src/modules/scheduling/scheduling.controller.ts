import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { AvailableSlotsDto } from './dto/available-slots.dto';
import { ReserveSlotDto } from './dto/reserve-slot.dto';
import { randomUUID } from 'crypto';

@Controller('scheduling')
export class SchedulingController {
  constructor(private scheduling: SchedulingService) {}

  @Post('available-slots')
  async availableSlots(@Body() dto: AvailableSlotsDto) {
    const from = new Date(dto.fromDate);
    const to = new Date(dto.toDate);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    if (from >= to) {
      throw new BadRequestException('fromDate must be before toDate');
    }

    const slots = await this.scheduling.getAvailableSlots(
      dto.doctorId,
      from,
      to,
      dto.durationMinutes,
    );

    return {
      doctorId: dto.doctorId,
      fromDate: from,
      toDate: to,
      count: slots.length,
      slots,
    };
  }

  @Post('reserve')
  async reserve(@Body() dto: ReserveSlotDto) {
    const start = new Date(dto.startDatetime);
    const end = new Date(dto.endDatetime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid datetime format');
    }
    if (start >= end) {
      throw new BadRequestException('startDatetime must be before endDatetime');
    }

    const correlationId = randomUUID();

    const appointment = await this.scheduling.reserveSlot({
      hospitalId: dto.hospitalId,
      doctorId: dto.doctorId,
      patientId: dto.patientId,
      startDatetime: start,
      endDatetime: end,
      appointmentType: dto.appointmentType,
      idempotencyKey: dto.idempotencyKey,
      correlationId,
    });

    return {
      success: true,
      correlationId,
      appointment: {
        id: appointment.id,
        status: appointment.status,
        startDatetime: appointment.startDatetime,
        endDatetime: appointment.endDatetime,
      },
    };
  }
}

