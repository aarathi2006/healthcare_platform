import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Notification,
  NotificationStatus,
} from './entities/notification.entity';

interface EnqueueParams {
  recipientType: 'PATIENT' | 'DOCTOR' | 'HOSPITAL';
  recipientId: string;
  channel: 'EMAIL' | 'SMS' | 'IN_APP';
  title: string;
  body: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
  ) {}

  async enqueue(params: EnqueueParams): Promise<Notification> {
    const n = await this.repo.save(
      this.repo.create({
        recipientType: params.recipientType,
        recipientId: params.recipientId,
        channel: params.channel,
        title: params.title,
        body: params.body,
        status: NotificationStatus.QUEUED,
      }),
    );

    this.logger.log(
      `📨 [${n.recipientType}:${n.recipientId}] ${n.channel} | ${n.title}: ${n.body.slice(0, 80)}...`,
    );

    n.status = NotificationStatus.SENT;
    n.sentAt = new Date();
    await this.repo.save(n);

    return n;
  }

  async listFor(recipientType: string, recipientId: string) {
    return this.repo.find({
      where: { recipientType, recipientId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }
}

