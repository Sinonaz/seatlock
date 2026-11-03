import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/domain.exception';
import { toUserResponse } from '../users/users.service';
import { UsersQueryDto } from './dto/users-query.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  constructor(private readonly prisma: PrismaService) {}

  async getUsers({ page, limit, search }: UsersQueryDto) {
    const where: Prisma.UserWhereInput = search
      ? {
          OR: ['email', 'name'].map((field) => ({
            [field]: { contains: search, mode: 'insensitive' },
          })),
        }
      : {};
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: users.map(toUserResponse),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async changeRole(actorId: string, id: string, role: Role) {
    if (actorId === id)
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_CHANGE_OWN_ROLE',
        'You cannot change your own role',
      );
    const user = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id },
        data: { role },
      });
      if (!count) throw new NotFoundException('User not found');
      return tx.user.findUniqueOrThrow({ where: { id } });
    });
    this.logger.log(`User ${id} role changed to ${role} by ${actorId}`);
    return toUserResponse(user);
  }
}
