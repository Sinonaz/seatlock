import { HttpException, HttpStatus } from '@nestjs/common';

export type DomainErrorCode =
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'EVENT_NOT_AVAILABLE'
  | 'NOT_ENOUGH_SEATS'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'BOOKING_NOT_PENDING'
  | 'BOOKING_EXPIRED'
  | 'REFUND_WINDOW_CLOSED'
  | 'EVENT_LOCKED'
  | 'INVALID_STATUS_TRANSITION'
  | 'CANNOT_CHANGE_OWN_ROLE';

export class DomainException extends HttpException {
  constructor(status: HttpStatus, code: DomainErrorCode, message: string) {
    super(
      {
        statusCode: status,
        code,
        message,
      },
      status,
    );
  }
}
