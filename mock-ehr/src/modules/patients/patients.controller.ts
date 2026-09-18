import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { EhrPatientsService } from './patients.service';
import { FailureInjector } from '../failures/failure-injector';

@Controller('ehr/patients')
export class EhrPatientsController {
  constructor(private svc: EhrPatientsService) {}

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
    const created = await this.svc.create(body);
    return FailureInjector.afterPartialOrThrow(simulate, created);
  }

  @Get()
  async findAll(@Headers('x-api-key') apiKey: string) {
    this.checkApiKey(apiKey);
    return this.svc.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Headers('x-api-key') apiKey: string) {
    this.checkApiKey(apiKey);
    return this.svc.findById(id);
  }

  @Get('mrn/:mrn')
  async findByMrn(@Param('mrn') mrn: string, @Headers('x-api-key') apiKey: string) {
    this.checkApiKey(apiKey);
    const p = await this.svc.findByMrn(mrn);
    return p || { found: false };
  }
}

