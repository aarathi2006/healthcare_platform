import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Questionnaire } from './entities/questionnaire.entity';
import { QuestionnaireResponse } from './entities/questionnaire-response.entity';
import { QuestionnairesService } from './questionnaires.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Questionnaire, QuestionnaireResponse]),
  ],
  providers: [QuestionnairesService],
  exports: [QuestionnairesService],
})
export class QuestionnairesModule {}

