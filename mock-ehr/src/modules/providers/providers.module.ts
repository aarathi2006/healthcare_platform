import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EhrProvider } from './entities/ehr-provider.entity';
import { EhrProvidersService } from './providers.service';
import { EhrProvidersController } from './providers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EhrProvider])],
  providers: [EhrProvidersService],
  controllers: [EhrProvidersController],
  exports: [EhrProvidersService],
})
export class EhrProvidersModule {}

