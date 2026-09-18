import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('working_hours')
export class WorkingHours {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'calendar_id', type: 'uuid' }) calendarId: string;

  @Column({ name: 'day_of_week', type: 'int' }) dayOfWeek: number;

  @Column({ name: 'start_time', type: 'time' }) startTime: string;

  @Column({ name: 'end_time', type: 'time' }) endTime: string;
}
