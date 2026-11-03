import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Every lifecycle operation acquires the event lock before booking/payment locks.
export async function lockBookingEvent(
  tx: Prisma.TransactionClient,
  bookingId: string,
  userId?: string,
) {
  const booking = await tx.booking.findFirst({
    where: { id: bookingId, ...(userId ? { userId } : {}) },
  });
  if (!booking) throw new NotFoundException('Booking not found');
  await tx.$queryRaw`SELECT id FROM events WHERE id = ${booking.eventId} FOR UPDATE`;
  return tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { event: true, user: true },
  });
}
