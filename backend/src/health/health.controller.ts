import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async healthCheck(@Res({ passthrough: true }) res: Response) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        db: 'up',
      };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);

      return {
        status: 'error',
        db: 'down',
      };
    }
  }
}
