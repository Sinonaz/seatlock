import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { DomainException } from '../common/domain.exception';
import { toUserResponse, UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'EMAIL_TAKEN',
        'Этот email уже зарегистрирован',
      );
    }

    const passwordHash = await argon2.hash(dto.password);

    let user: User;
    try {
      user = await this.usersService.create({
        email,
        name: dto.name.trim(),
        passwordHash,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'EMAIL_TAKEN',
          'Этот email уже зарегистрирован',
        );
      }
      throw error;
    }

    const accessToken = await this.signAccessToken(user);
    return {
      accessToken,
      user: toUserResponse(user),
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Неверный email или пароль',
      );
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );
    if (!isPasswordValid) {
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Неверный email или пароль',
      );
    }

    const accessToken = await this.signAccessToken(user);
    return {
      accessToken,
      user: toUserResponse(user),
    };
  }

  private signAccessToken(user: User): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user.id, role: user.role },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.getOrThrow('JWT_ACCESS_TTL'),
      },
    );
  }
}
