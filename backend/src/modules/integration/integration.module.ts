import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { MockEhrConnector } from './connectors/mock-ehr.connector';
import { IntegrationOperation } from './entities/integration-operation.entity';
import { ReconciliationRecord } from './entities/reconciliation-record.entity';
import { ExternalIdMapping } from './entities/external-id-mapping.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { AuditEvent } from '../audit/entities/audit-event.entity';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    TypeOrmModule.forFeature([
      IntegrationOperation,
      ReconciliationRecord,
      ExternalIdMapping,
      Appointment,
      AuditEvent,
    ]),
  ],
  providers: [
    IntegrationService,
    MockEhrConnector,
    {
      provide: 'EHR_CONNECTOR',
      useExisting: MockEhrConnector,
    },
  ],
  controllers: [IntegrationController],
  exports: [IntegrationService],
})
export class IntegrationModule {}

