import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private svc: DashboardService) {}

  @Get('overview')
  overview() {
    return this.svc.overview();
  }

  @Get('analytics')
  analytics() {
    return this.svc.analytics();
  }

  @Get('hospital-applications')
  hospitalApplications() {
    return this.svc.hospitalApplications();
  }

  @Get('appointments')
  appointments(@Query('limit') limit?: string) {
    return this.svc.appointments(limit ? parseInt(limit, 10) : 50);
  }

  @Get('integration-operations')
  integrationOperations(@Query('limit') limit?: string) {
    return this.svc.integrationOperations(limit ? parseInt(limit, 10) : 50);
  }

  @Get('reconciliations')
  reconciliations() {
    return this.svc.reconciliations();
  }

  @Get('workflows')
  workflows(@Query('limit') limit?: string) {
    return this.svc.workflows(limit ? parseInt(limit, 10) : 50);
  }

  @Get('notifications')
  notifications(@Query('limit') limit?: string) {
    return this.svc.notifications(limit ? parseInt(limit, 10) : 50);
  }

  @Get('capability-executions')
  capabilityExecutions(@Query('limit') limit?: string) {
    return this.svc.capabilityExecutions(limit ? parseInt(limit, 10) : 50);
  }

  @Get('audit-events')
  auditEvents(@Query('limit') limit?: string) {
    return this.svc.auditEvents(limit ? parseInt(limit, 10) : 100);
  }

  @Get('conversations')
  conversations(@Query('limit') limit?: string) {
    return this.svc.conversations(limit ? parseInt(limit, 10) : 20);
  }

  @Get('questionnaire-responses')
  questionnaireResponses(@Query('limit') limit?: string) {
    return this.svc.questionnaireResponses(limit ? parseInt(limit, 10) : 50);
  }

  @Get('hospitals/:hospitalId/overview')
  hospitalOverview(@Param('hospitalId') hospitalId: string) {
    return this.svc.hospitalOverview(hospitalId);
  }

  @Get('hospitals/:hospitalId/doctors')
  doctorsByHospital(@Param('hospitalId') hospitalId: string) {
    return this.svc.doctorsByHospital(hospitalId);
  }

  @Get('hospitals/:hospitalId/calendars')
  calendarsByHospital(@Param('hospitalId') hospitalId: string) {
    return this.svc.calendarsByHospital(hospitalId);
  }

  @Get('hospitals/:hospitalId/appointments')
  appointmentsByHospital(
    @Param('hospitalId') hospitalId: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.appointmentsByHospital(hospitalId, limit ? parseInt(limit, 10) : 50);
  }

  @Get('hospitals/:hospitalId/questionnaires')
  questionnairesByHospital(@Param('hospitalId') hospitalId: string) {
    return this.svc.questionnairesByHospital(hospitalId);
  }

  @Get('hospitals/:hospitalId/questionnaire-responses')
  questionnaireResponsesByHospital(@Param('hospitalId') hospitalId: string) {
    return this.svc.questionnaireResponsesByHospital(hospitalId);
  }

  @Get('hospitals/:hospitalId/patients')
  patientsByHospital(@Param('hospitalId') hospitalId: string) {
    return this.svc.allPatients(hospitalId);
  }

  @Get('all-doctors')
  allDoctors() {
    return this.svc.allDoctors();
  }

  @Get('doctors/:doctorId/profile')
  doctorProfile(@Param('doctorId') doctorId: string) {
    return this.svc.doctorProfile(doctorId);
  }

  @Get('doctors/:doctorId/appointments')
  appointmentsByDoctor(
    @Param('doctorId') doctorId: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.appointmentsByDoctor(doctorId, limit ? parseInt(limit, 10) : 100);
  }

  @Get('doctors/:doctorId/calendar')
  doctorCalendar(@Param('doctorId') doctorId: string) {
    return this.svc.doctorCalendar(doctorId);
  }

  @Get('doctors/:doctorId/questionnaires')
  doctorQuestionnaires(@Param('doctorId') doctorId: string) {
    return this.svc.doctorQuestionnaires(doctorId);
  }

  @Get('all-patients')
  allPatients(@Query('hospitalId') hospitalId?: string) {
    return this.svc.allPatients(hospitalId);
  }

  @Get('patients/:patientId/profile')
  patientProfile(@Param('patientId') patientId: string) {
    return this.svc.patientProfile(patientId);
  }

  @Get('patients/:patientId/appointments')
  appointmentsByPatient(
    @Param('patientId') patientId: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.appointmentsByPatient(patientId, limit ? parseInt(limit, 10) : 100);
  }

  @Get('patients/:patientId/questionnaires')
  patientQuestionnaires(@Param('patientId') patientId: string) {
    return this.svc.patientQuestionnaires(patientId);
  }

  @Post('patients/:patientId/questionnaires/:appointmentId/submit')
  submitPatientQuestionnaire(
    @Param('patientId') patientId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() body: { responses: Record<string, any> },
  ) {
    return this.svc.submitPatientQuestionnaire(patientId, appointmentId, body.responses);
  }

  @Get('trace/:correlationId')
  trace(@Param('correlationId') correlationId: string) {
    return this.svc.traceByCorrelation(correlationId);
  }
}

