import {
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { DomainException } from '../common/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import { toUserResponse, UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  generateRefreshToken,
  hashToken,
  newFamilyId,
} from './refresh-token.util';
import { AuthUser } from './decorators/current-user.decorator';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async me(user: AuthUser) {
    const found = await this.usersService.findById(user.id);
    if (!found) {
      throw new UnauthorizedException();
    }

    return toUserResponse(found);
  }

  async register(dto: RegisterDto, userAgent?: string) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'EMAIL_TAKEN',
        'This email is already registered',
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
          'This email is already registered',
        );
      }
      throw error;
    }

    return this.issueTokens(user, undefined, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Invalid email or password',
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
        'Invalid email or password',
      );
    }

    return this.issueTokens(user, undefined, userAgent);
  }

  async refresh(rawToken: string | undefined, userAgent?: string) {
    if (!rawToken) throw new UnauthorizedException();

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException();
    }

    // Reuse of an already rotated token means it leaked: revoke the whole family
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}`,
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Compare-and-set: only one concurrent refresh with this token may win
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new UnauthorizedException();

    return this.issueTokens(stored.user, stored.familyId, userAgent);
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    user: User,
    familyId: string = newFamilyId(),
    userAgent?: string,
  ) {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = generateRefreshToken();
    const ttlDays = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
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
