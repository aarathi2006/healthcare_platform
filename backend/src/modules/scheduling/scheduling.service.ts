import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Calendar } from '../calendars/entities/calendar.entity';
import { WorkingHours } from './entities/working-hours.entity';
import { BlockedSlot } from './entities/blocked-slot.entity';
import {
  Appointment,
  AppointmentStatus,
} from '../appointments/entities/appointment.entity';
import { Doctor, DoctorStatus } from '../doctors/entities/doctor.entity';

@Injectable()
export class SchedulingService {
  private logger = new Logger(SchedulingService.name);

  constructor(
    @InjectRepository(Calendar)
    private calRepo: Repository<Calendar>,
    @InjectRepository(WorkingHours)
    private whRepo: Repository<WorkingHours>,
    @InjectRepository(BlockedSlot)
    private blockRepo: Repository<BlockedSlot>,
    @InjectRepository(Appointment)
    private apptRepo: Repository<Appointment>,
    @InjectRepository(Doctor)
    private doctorRepo: Repository<Doctor>,
    private dataSource: DataSource,
  ) {}

  /**
   * Returns real available slots for a doctor between two dates.
   * A slot is available ONLY when:
   *  - Doctor is ACTIVE
   *  - Calendar is ACTIVE
   *  - Slot falls within working hours
   *  - Slot is not blocked
   *  - Slot is not already booked
   *  - Slot is not in the past
   */
  async getAvailableSlots(
    doctorId: string,
    fromDate: Date,
    toDate: Date,
    durationMinutes?: number,
  ): Promise<Date[]> {
    // 1. Doctor must be active
    const doctor = await this.doctorRepo.findOne({ where: { id: doctorId } });
    if (!doctor) throw new BadRequestException('Doctor not found');
    if (doctor.status !== DoctorStatus.ACTIVE) {
      throw new BadRequestException('Doctor is not active');
    }

    const duration = durationMinutes || doctor.appointmentDurationMinutes || 30;

    // 2. Get active calendar
    const calendar = await this.calRepo.findOne({
      where: { doctorId, isActive: true },
    });
    if (!calendar) return [];

    // 3. Get all working hours for this calendar
    const workingHours = await this.whRepo.find({
      where: { calendarId: calendar.id },
    });

    // 4. Get blocked slots overlapping the range
    const blocked = await this.blockRepo
      .createQueryBuilder('b')
      .where('b.calendar_id = :cid', { cid: calendar.id })
      .andWhere('b.end_datetime > :from', { from: fromDate })
      .andWhere('b.start_datetime < :to', { to: toDate })
      .getMany();

    // 5. Get existing appointments overlapping the range
    const booked = await this.apptRepo
      .createQueryBuilder('a')
      .where('a.doctor_id = :did', { did: doctorId })
      .andWhere('a.status IN (:...statuses)', {
        statuses: [
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.PENDING,
          AppointmentStatus.SYNC_PENDING,
          AppointmentStatus.REQUESTED,
        ],
      })
      .andWhere('a.end_datetime > :from', { from: fromDate })
      .andWhere('a.start_datetime < :to', { to: toDate })
      .getMany();

    // 6. Generate candidate slots, filter
    const slots: Date[] = [];
    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);

    const now = new Date();

    while (cursor <= toDate) {
      const dayOfWeek = cursor.getDay(); // 0 = Sunday
      const todaysHours = workingHours.filter((w) => w.dayOfWeek === dayOfWeek);

      for (const wh of todaysHours) {
        const [startH, startM] = wh.startTime.split(':').map(Number);
        const [endH, endM] = wh.endTime.split(':').map(Number);

        const dayStart = new Date(cursor);
        dayStart.setHours(startH, startM, 0, 0);
        const dayEnd = new Date(cursor);
        dayEnd.setHours(endH, endM, 0, 0);

        let slotStart = new Date(dayStart);
        while (
          slotStart.getTime() + duration * 60000 <=
          dayEnd.getTime()
        ) {
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);

          const isPast = slotStart <= now;
          const isBlocked = blocked.some(
            (b) => slotStart < b.endDatetime && slotEnd > b.startDatetime,
          );
          const isBooked = booked.some(
            (a) => slotStart < a.endDatetime && slotEnd > a.startDatetime,
          );

          if (!isPast && !isBlocked && !isBooked) {
            slots.push(new Date(slotStart));
          }

          slotStart = new Date(slotStart.getTime() + duration * 60000);
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return slots;
  }

  /**
   * Atomically reserve a slot.
   * Uses a database transaction with a PESSIMISTIC WRITE lock so that
   * two concurrent bookings for the same slot cannot both succeed.
   */
  async reserveSlot(params: {
    hospitalId: string;
    doctorId: string;
    patientId: string;
    startDatetime: Date;
    endDatetime: Date;
    appointmentType: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<Appointment> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Idempotency: if this key was already used, return the existing appointment
      const existingByKey = await manager.findOne(Appointment, {
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existingByKey) {
        this.logger.log(
          `Idempotent hit for key ${params.idempotencyKey} — returning existing appointment`,
        );
        return existingByKey;
      }

      // 2. Lock overlapping appointments to prevent race
      const overlapping = await manager
        .createQueryBuilder(Appointment, 'a')
        .setLock('pessimistic_write')
        .where('a.doctor_id = :did', { did: params.doctorId })
        .andWhere('a.start_datetime < :end', { end: params.endDatetime })
        .andWhere('a.end_datetime > :start', { start: params.startDatetime })
        .andWhere('a.status IN (:...statuses)', {
          statuses: [
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.PENDING,
            AppointmentStatus.SYNC_PENDING,
            AppointmentStatus.REQUESTED,
          ],
        })
        .getMany();

      if (overlapping.length > 0) {
        throw new BadRequestException('Slot is no longer available');
      }

      // 3. Reject past slots
      if (params.startDatetime <= new Date()) {
        throw new BadRequestException('Cannot book a slot in the past');
      }

      // 4. Create the appointment
      const appt = manager.create(Appointment, {
        hospitalId: params.hospitalId,
        doctorId: params.doctorId,
        patientId: params.patientId,
        startDatetime: params.startDatetime,
        endDatetime: params.endDatetime,
        appointmentType: params.appointmentType,
        status: AppointmentStatus.PENDING,
        idempotencyKey: params.idempotencyKey,
        correlationId: params.correlationId,
      });

      return manager.save(appt);
    });
  }
}

