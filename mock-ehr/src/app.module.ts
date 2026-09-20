import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EhrPatientsModule } from './modules/patients/patients.module';
import { EhrProvidersModule } from './modules/providers/providers.module';
import { EhrAppointmentsModule } from './modules/appointments/appointments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbHost = config.get<string>('DB_HOST') || 'localhost';
        const useSSL =
          dbHost.includes('neon.tech') ||
          dbHost.includes('render.com') ||
          config.get<string>('NODE_ENV') === 'production';

        return {
          type: 'postgres',
          host: dbHost,
          port: parseInt(config.get<string>('DB_PORT') || '5432', 10),
          username: config.get<string>('DB_USER'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,  // ← IMPORTANT: false for Mock EHR
          logging: ['error', 'warn'],
          ssl: useSSL ? { rejectUnauthorized: false } : false,
        };
      },
    }),
    EhrPatientsModule,
    EhrProvidersModule,
    EhrAppointmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

