import { BookingStatus } from '@prisma/client';
import { canTransition } from './booking-transition';

describe('Booking transitions', () => {
  const allowed = new Set([
    'PENDING:PAID',
    'PENDING:CANCELLED',
    'PENDING:EXPIRED',
    'PAID:REFUNDED',
  ]);
  it.each(
    Object.values(BookingStatus).flatMap((from) =>
      Object.values(BookingStatus).map((to) => [from, to]),
    ),
  )('%s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(allowed.has(`${from}:${to}`));
  });
});
