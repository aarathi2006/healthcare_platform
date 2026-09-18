import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('blocked_slots')
export class BlockedSlot {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column({ name: 'calendar_id', type: 'uuid' })
  calendarId: string;

  @Column({ name: 'start_datetime', type: 'timestamptz' })
  startDatetime: Date;

  @Column({ name: 'end_datetime', type: 'timestamptz' })
  endDatetime: Date;

  @Column({ type: 'varchar', length: 300, nullable: true })
  reason: string | null;
}

