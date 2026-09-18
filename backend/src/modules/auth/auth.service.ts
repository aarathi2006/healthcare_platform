import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PlatformUser, UserRole } from '../platform-users/entities/platform-user.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Patient } from '../patients/entities/patient.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(PlatformUser)
    private userRepo: Repository<PlatformUser>,
    @InjectRepository(Doctor) private doctorRepo: Repository<Doctor>,
    @InjectRepository(Patient) private patientRepo: Repository<Patient>,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('User is inactive');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload: any = {
      sub: user.id,
      email: user.email,
      role: user.role,
      hospitalId: null,
      patientId: null,
      doctorId: null,
    };

    // Resolve tenant context based on role
    if (user.role === UserRole.DOCTOR) {
      const doctor = await this.doctorRepo.findOne({ where: { userId: user.id } });
      // fallback by email if userId not linked
      const fallback = doctor || (await this.doctorRepo.findOne({ where: { name: user.email.split('@')[0] } }));
      if (doctor) {
        payload.doctorId = doctor.id;
        payload.hospitalId = doctor.hospitalId;
      }
    }

    if (user.role === UserRole.HOSPITAL_ADMIN) {
      // In a real system, hospital_users table would map admin → hospital.
      // For demo, we don't enforce a hospital — admin picks from dropdown.
    }

    const token = await this.jwt.signAsync(payload);

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async me(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}

