import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CapabilityRegistryService } from '../capabilities/capability-registry.service';
import { ConversationService } from './conversation.service';
import { MessageRole } from '../conversations/entities/conversation-message.entity';
import { AgentTurnResult } from './ai-agent.interface';

interface DoctorSummary {
  id: string;
  name: string;
  hospitalId: string;
  hospitalName: string;
  hospitalAddress?: string | null;
  specialtyName?: string | null;
  departmentName?: string | null;
  experienceYears?: number;
  appointmentDurationMinutes?: number;
  [key: string]: any;
}

interface QuestionnaireQuestion {
  id: string;
  type: string;
  question: string;
  required?: boolean;
  options?: string[];
}

interface MockState {
  stage: string;
  specialty?: string;
  doctors?: DoctorSummary[];
  selectedDoctorId?: string;
  selectedDoctorName?: string;
  selectedDoctorHospital?: string;
  slots?: { slots: string[]; total: number };
  selectedSlot?: string;
  activeAppointmentId?: string;

  questionnaireId?: string;
  questionnaireQuestions?: QuestionnaireQuestion[];
  currentQuestionIndex?: number;
  answers?: Record<string, any>;
}

const EMERGENCY_KEYWORDS = [
  'severe chest pain', 'crushing chest pain',
  'difficulty breathing', "can't breathe", 'cannot breathe',
  'severe bleeding', 'stroke', 'unconscious', 'suicidal', 'suicide',
  'heart attack', 'severe allergic',
];

const SYMPTOM_TO_SPECIALTY: Array<{ keywords: string[]; specialty: string }> = [
  { keywords: ['shoulder', 'knee', 'back', 'bone', 'joint', 'fracture', 'sprain', 'ortho'], specialty: 'Orthopedics' },
  { keywords: ['heart', 'cardio', 'blood pressure', 'palpitation', 'chest tightness', 'chest discomfort'], specialty: 'Cardiology' },
  { keywords: ['skin', 'rash', 'acne', 'eczema', 'derma'], specialty: 'Dermatology' },
  { keywords: ['headache', 'migraine', 'brain', 'neuro', 'dizzy', 'seizure'], specialty: 'Neurology' },
  { keywords: ['child', 'baby', 'kid', 'pediatric'], specialty: 'Pediatrics' },
];

const CONFIRM_WORDS = ['yes', 'confirm', 'book it', 'book that', 'go ahead', 'sure', 'ok', 'proceed', 'yep', 'yeah'];
const CANCEL_WORDS = ['cancel', 'cancelled', 'call it off'];
const HUMAN_WORDS = ['human', 'agent', 'representative', 'talk to someone', 'operator'];
const SKIP_Q_WORDS = ['skip', 'skip questions', 'later', 'not now', 'no thanks'];

@Injectable()
export class MockAiAgentService {
  private readonly logger = new Logger(MockAiAgentService.name);

  constructor(
    private capabilities: CapabilityRegistryService,
    private conversations: ConversationService,
  ) {}

  async handleMessage(params: {
    message: string;
    conversationId?: string;
    patientId: string;
  }): Promise<AgentTurnResult> {
    const correlationId = randomUUID();
    const conversation = await this.conversations.getOrCreate(
      params.conversationId,
      params.patientId,
    );

    await this.conversations.addMessage(
      conversation.id,
      MessageRole.USER,
      params.message,
    );

    const context = await this.conversations.getContext(conversation.id);
    const state: MockState = context.mockState || { stage: 'idle' };
    const text = params.message.toLowerCase().trim();

    const capabilityCalls: AgentTurnResult['capabilityCalls'] = [];
    let reply = '';

    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY 1: Emergency — always first
    // ═══════════════════════════════════════════════════════════════════
    if (EMERGENCY_KEYWORDS.some((kw) => text.includes(kw))) {
      const result = await this.capabilities.execute(
        'transfer_to_human',
        { reason: 'Emergency keyword', urgency: 'HIGH', patientId: params.patientId },
        { correlationId, conversationId: conversation.id, patientId: params.patientId },
      );
      capabilityCalls.push({ name: 'transfer_to_human', input: {}, success: result.success, output: result.data });
      reply = "I'm connecting you to a human operator right away. Please stay on the line.";
      await this.finalize(conversation.id, reply, state, correlationId);
      return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY 2: Questionnaire answering mode
    // ═══════════════════════════════════════════════════════════════════
    if (state.stage === 'questionnaire_answering' && state.questionnaireQuestions) {
      if (SKIP_Q_WORDS.some((kw) => text.includes(kw))) {
        const partial = state.answers || {};
        if (Object.keys(partial).length > 0 && state.activeAppointmentId) {
          await this.capabilities.execute(
            'submit_questionnaire',
            { appointmentId: state.activeAppointmentId, responses: partial },
            { correlationId, conversationId: conversation.id, patientId: params.patientId },
          );
        }
        reply =
          "No problem — I've saved what you've provided so far. You can complete the rest anytime by asking me. " +
          (state.selectedDoctorName ? `Dr. ${state.selectedDoctorName} ` : '') +
          'will still see your appointment.';
        state.stage = 'idle';
        state.questionnaireQuestions = undefined;
        state.currentQuestionIndex = undefined;
        state.answers = undefined;
        state.specialty = undefined;
        state.selectedDoctorId = undefined;
        state.selectedDoctorName = undefined;
        state.selectedDoctorHospital = undefined;
        state.selectedSlot = undefined;
        state.slots = undefined;
        state.doctors = undefined;
        await this.finalize(conversation.id, reply, state, correlationId);
        return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
      }

      const idx = state.currentQuestionIndex ?? 0;
      const currentQ = state.questionnaireQuestions[idx];

      if (currentQ) {
        state.answers = state.answers || {};
        let answer: any = params.message.trim();
        if (currentQ.type === 'yes_no') {
          const lower = answer.toLowerCase();
          if (lower.startsWith('y')) answer = 'Yes';
          else if (lower.startsWith('n')) answer = 'No';
        } else if (currentQ.type === 'numeric') {
          const n = parseFloat(answer.replace(/[^0-9.\-]/g, ''));
          if (!isNaN(n)) answer = n;
        }
        state.answers[currentQ.id] = answer;
        state.currentQuestionIndex = idx + 1;
      }

      const nextIdx = state.currentQuestionIndex ?? 0;
      if (nextIdx < state.questionnaireQuestions.length) {
        const nextQ = state.questionnaireQuestions[nextIdx];
        const total = state.questionnaireQuestions.length;
        const options = nextQ.options && nextQ.options.length > 0 ? '\n(' + nextQ.options.join(' / ') + ')' : '';
        reply = `Question ${nextIdx + 1} of ${total}: ${nextQ.question}${options}`;
        await this.finalize(conversation.id, reply, state, correlationId);
        return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
      }

      if (state.activeAppointmentId && state.answers) {
        const result = await this.capabilities.execute(
          'submit_questionnaire',
          { appointmentId: state.activeAppointmentId, responses: state.answers },
          { correlationId, conversationId: conversation.id, patientId: params.patientId },
        );
        capabilityCalls.push({ name: 'submit_questionnaire', input: {}, success: result.success, output: result.data });
      }

      reply = `Thanks — your responses have been saved. Dr. ${
        state.selectedDoctorName || 'your doctor'
      } will review them before your visit.`;

      // Reset everything — fresh conversation state
      state.stage = 'idle';
      state.questionnaireQuestions = undefined;
      state.currentQuestionIndex = undefined;
      state.answers = undefined;
      state.specialty = undefined;
      state.selectedDoctorId = undefined;
      state.selectedDoctorName = undefined;
      state.selectedDoctorHospital = undefined;
      state.selectedSlot = undefined;
      state.slots = undefined;
      state.doctors = undefined;

      await this.finalize(conversation.id, reply, state, correlationId);
      return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Human escalation
    // ═══════════════════════════════════════════════════════════════════
    if (HUMAN_WORDS.some((kw) => text.includes(kw))) {
      const result = await this.capabilities.execute(
        'transfer_to_human',
        { reason: 'User requested', urgency: 'MEDIUM', patientId: params.patientId },
        { correlationId, conversationId: conversation.id, patientId: params.patientId },
      );
      capabilityCalls.push({ name: 'transfer_to_human', input: {}, success: result.success, output: result.data });
      reply = 'Of course — let me transfer you to a human assistant.';
      await this.finalize(conversation.id, reply, state, correlationId);
      return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
    }

    // Cancel
    if (CANCEL_WORDS.some((kw) => text.includes(kw)) && state.activeAppointmentId) {
      const result = await this.capabilities.execute(
        'cancel_appointment',
        { appointmentId: state.activeAppointmentId, reason: 'User requested' },
        { correlationId, conversationId: conversation.id, patientId: params.patientId },
      );
      capabilityCalls.push({ name: 'cancel_appointment', input: {}, success: result.success, output: result.data });
      reply = 'Your appointment has been cancelled. Would you like to book another one?';
      state.activeAppointmentId = undefined;
      state.stage = 'idle';
      await this.finalize(conversation.id, reply, state, correlationId);
      return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
    }

    // Confirm booking → after success, start questionnaire
    if (
      CONFIRM_WORDS.some((kw) => text.includes(kw)) &&
      state.selectedSlot &&
      state.selectedDoctorId &&
      state.stage === 'awaiting_confirmation'
    ) {
      const result = await this.capabilities.execute(
        'create_appointment',
        {
          doctorId: state.selectedDoctorId,
          patientId: params.patientId,
          startDatetime: state.selectedSlot,
        },
        { correlationId, conversationId: conversation.id, patientId: params.patientId },
      );
      capabilityCalls.push({ name: 'create_appointment', input: {}, success: result.success, output: result.data });

      if (result.data?.appointmentId) state.activeAppointmentId = result.data.appointmentId;
      const status = result.data?.status || 'CONFIRMED';

      if (status === 'CONFIRMED' || status === 'RECONCILIATION_REQUIRED') {
        const bookingMsg =
          status === 'CONFIRMED'
            ? `Done — your appointment with ${state.selectedDoctorName} at ${state.selectedDoctorHospital} is confirmed for ${new Date(state.selectedSlot).toLocaleString()}.`
            : `Your booking at ${state.selectedDoctorHospital} is submitted.`;

        if (state.activeAppointmentId) {
          const qResult = await this.capabilities.execute(
            'get_questionnaire',
            { appointmentId: state.activeAppointmentId },
            { correlationId, conversationId: conversation.id, patientId: params.patientId },
          );
          capabilityCalls.push({ name: 'get_questionnaire', input: {}, success: qResult.success, output: qResult.data });

          const questionnaire = qResult.data?.questionnaire;
          const questions: QuestionnaireQuestion[] = questionnaire?.questions || [];

          if (questions.length > 0 && qResult.data?.alreadySubmitted !== true) {
            state.stage = 'questionnaire_answering';
            state.questionnaireId = questionnaire.id;
            state.questionnaireQuestions = questions;
            state.currentQuestionIndex = 0;
            state.answers = {};

            const firstQ = questions[0];
            const options = firstQ.options && firstQ.options.length > 0 ? '\n(' + firstQ.options.join(' / ') + ')' : '';
            reply =
              bookingMsg +
              `\n\nBefore your visit, I'd like to ask ${questions.length} quick question${
                questions.length > 1 ? 's' : ''
              } so ${state.selectedDoctorName} can prepare.\n\nQuestion 1 of ${questions.length}: ${firstQ.question}${options}`;
          } else {
            reply = bookingMsg + ' You will receive a reminder before the visit.';
            state.stage = 'idle';
          }
        } else {
          reply = bookingMsg;
          state.stage = 'idle';
        }
      } else {
        reply = `Sorry, I couldn't complete the booking right now. Please try a different slot or ask for a human.`;
      }
      await this.finalize(conversation.id, reply, state, correlationId);
      return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
    }

    // Pick slot
    const slotList: string[] =
      state.slots && Array.isArray(state.slots.slots) ? state.slots.slots : [];

    if (slotList.length > 0 && state.selectedDoctorId && !state.selectedSlot) {
      const indexMatch = text.match(/(?:option|slot|number)?\s*(\d+)\b/i);
      let chosen: string | undefined;

      if (indexMatch) {
        const idx = parseInt(indexMatch[1], 10) - 1;
        if (idx >= 0 && idx < slotList.length) chosen = slotList[idx];
      }

      if (chosen) {
        state.selectedSlot = chosen;
        reply = `Great — I'll book ${state.selectedDoctorName} at ${state.selectedDoctorHospital} for ${new Date(chosen).toLocaleString()}. Confirm?`;
        state.stage = 'awaiting_confirmation';
        await this.finalize(conversation.id, reply, state, correlationId);
        return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
      }
    }

    // Pick doctor
    const doctors: DoctorSummary[] = Array.isArray(state.doctors) ? state.doctors : [];

    if (doctors.length > 0 && !state.selectedDoctorId) {
      let pick: DoctorSummary | undefined;

      const indexMatch = text.match(/^\s*(\d+)\s*$/);
      if (indexMatch) {
        const idx = parseInt(indexMatch[1], 10) - 1;
        if (idx >= 0 && idx < doctors.length) pick = doctors[idx];
      }

      if (!pick) {
        const lastNameMatch = doctors.find((d) => {
          const lastName = d.name.toLowerCase().split(' ').pop();
          return lastName && text.includes(lastName);
        });
        if (lastNameMatch) pick = lastNameMatch;
      }

      if (!pick && doctors.length === 1) pick = doctors[0];

      if (!pick) {
        const options = doctors
          .map((d, i) => `${i + 1}. ${d.name} — ${d.specialtyName || 'Specialist'} at ${d.hospitalName}`)
          .join('\n');
        reply = `I found ${doctors.length} options:\n${options}\n\nWhich one would you like to see? (reply with the number or the doctor's name)`;
        await this.finalize(conversation.id, reply, state, correlationId);
        return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
      }

      state.selectedDoctorId = pick.id;
      state.selectedDoctorName = pick.name;
      state.selectedDoctorHospital = pick.hospitalName;

      const from = new Date();
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = await this.capabilities.execute(
        'check_availability',
        { doctorId: pick.id, fromDate: from.toISOString(), toDate: to.toISOString() },
        { correlationId, conversationId: conversation.id, patientId: params.patientId },
      );
      capabilityCalls.push({ name: 'check_availability', input: {}, success: result.success, output: result.data });

      const slotsData: string[] | undefined = result.data?.slots;
      if (!slotsData || slotsData.length === 0) {
        reply = `${pick.name} at ${pick.hospitalName} has no available slots in the next week. Would you like to try another doctor?`;
        state.selectedDoctorId = undefined;
        state.selectedDoctorName = undefined;
        state.selectedDoctorHospital = undefined;
        state.stage = 'awaiting_doctor_selection';
        await this.finalize(conversation.id, reply, state, correlationId);
        return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
      }

      state.slots = result.data;
      const top = slotsData.slice(0, 3);
      const options = top.map((s: string, i: number) => `${i + 1}. ${new Date(s).toLocaleString()}`).join('\n');
      reply = `${pick.name} (${pick.specialtyName || 'Specialist'}) at ${pick.hospitalName} has openings this week:\n${options}\n\nWhich one works for you?`;
      state.stage = 'awaiting_slot_selection';
      await this.finalize(conversation.id, reply, state, correlationId);
      return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Initial: infer specialty from CURRENT message (always re-detect)
    // ═══════════════════════════════════════════════════════════════════
    let specialty: string | null = null;

    // ALWAYS detect from the current message first
    for (const mapping of SYMPTOM_TO_SPECIALTY) {
      if (mapping.keywords.some((kw) => text.includes(kw))) {
        specialty = mapping.specialty;
        break;
      }
    }

    // Fall back to previous state ONLY if mid-booking (not idle/booked)
    if (!specialty && state.specialty && state.stage !== 'idle' && state.stage !== 'booked') {
      specialty = state.specialty;
    }

    if (!specialty) {
      reply =
        "I can help you find a doctor. Could you tell me a bit more about the issue — for example, which part of the body or what kind of specialist you're looking for?";
      await this.finalize(conversation.id, reply, state, correlationId);
      return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
    }

    state.specialty = specialty;

    const searchResult = await this.capabilities.execute(
      'search_doctors',
      { specialty, limit: 10 },
      { correlationId, conversationId: conversation.id, patientId: params.patientId },
    );
    capabilityCalls.push({ name: 'search_doctors', input: { specialty }, success: searchResult.success, output: searchResult.data });

    const foundDoctors: DoctorSummary[] | undefined = searchResult.data?.doctors;
    if (!foundDoctors || foundDoctors.length === 0) {
      reply = `I couldn't find a ${specialty} specialist right now. Can you tell me a bit more, or try a different specialist?`;
      await this.finalize(conversation.id, reply, state, correlationId);
      return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
    }

    state.doctors = foundDoctors;
    state.stage = 'awaiting_doctor_selection';

    if (foundDoctors.length === 1) {
      const pick = foundDoctors[0];
      state.selectedDoctorId = pick.id;
      state.selectedDoctorName = pick.name;
      state.selectedDoctorHospital = pick.hospitalName;

      const from = new Date();
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const avail = await this.capabilities.execute(
        'check_availability',
        { doctorId: pick.id, fromDate: from.toISOString(), toDate: to.toISOString() },
        { correlationId, conversationId: conversation.id, patientId: params.patientId },
      );
      capabilityCalls.push({ name: 'check_availability', input: {}, success: avail.success, output: avail.data });

      const availSlots: string[] | undefined = avail.data?.slots;
      if (availSlots && availSlots.length > 0) {
        state.slots = avail.data;
        const top = availSlots.slice(0, 3);
        const options = top.map((s: string, i: number) => `${i + 1}. ${new Date(s).toLocaleString()}`).join('\n');
        reply = `I found ${pick.name} — ${pick.specialtyName || specialty} at ${pick.hospitalName}. Available slots:\n${options}\n\nWhich works for you?`;
        state.stage = 'awaiting_slot_selection';
      } else {
        reply = `I found ${pick.name} at ${pick.hospitalName}, but they have no open slots this week.`;
      }
    } else {
      const names = foundDoctors
        .map((d, i) => `${i + 1}. ${d.name} — ${d.specialtyName || specialty} at ${d.hospitalName}`)
        .join('\n');
      reply = `I found ${foundDoctors.length} ${specialty} specialists:\n${names}\n\nWhich one would you like to see? (reply with the number or the doctor's name)`;
    }

    await this.finalize(conversation.id, reply, state, correlationId);
    return this.buildReturn(reply, conversation.id, correlationId, capabilityCalls);
  }

  private buildReturn(
    reply: string,
    conversationId: string,
    correlationId: string,
    capabilityCalls: AgentTurnResult['capabilityCalls'],
  ): Promise<AgentTurnResult> {
    return this.conversations.getContext(conversationId).then((context) => ({
      reply,
      conversationId,
      correlationId,
      capabilityCalls,
      context,
    }));
  }

  private async finalize(
    conversationId: string,
    reply: string,
    state: MockState,
    correlationId: string,
  ) {
    await this.conversations.addMessage(conversationId, MessageRole.ASSISTANT, reply);
    await this.conversations.updateContext(conversationId, { mockState: state });
    this.logger.log(`[${correlationId}] stage=${state.stage} reply="${reply.slice(0, 80)}..."`);
  }
}

