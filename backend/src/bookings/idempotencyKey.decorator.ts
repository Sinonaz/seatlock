import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Request } from 'express';

export const IdempotencyKey = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const key = ctx.switchToHttp().getRequest<Request>().headers[
      'idempotency-key'
    ];
    if (typeof key !== 'string' || !isUUID(key)) {
      throw new BadRequestException(
        'Idempotency-Key header is required and must be a UUID',
      );
    }
    return key;
  },
);
