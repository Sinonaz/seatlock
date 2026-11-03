import { Prisma } from '@prisma/client';

export const BOOKING_INCLUDE = {
  event: {
    select: {
      id: true,
      title: true,
      startsAt: true,
      venue: true,
      city: true,
      coverImageUrl: true,
    },
  },
} as const;

export type BookingWithEvent = Prisma.BookingGetPayload<{
  include: typeof BOOKING_INCLUDE;
}>;

export function toBookingResponse(booking: BookingWithEvent) {
  const {
    id,
    status,
    quantity,
    unitPriceCents,
    totalCents,
    currency,
    expiresAt,
    paidAt,
    cancelledAt,
    ticketCode,
    createdAt,
    event,
  } = booking;
  return {
    id,
    status,
    quantity,
    unitPriceCents,
    totalCents,
    currency,
    expiresAt,
    paidAt,
    cancelledAt,
    ticketCode,
    createdAt,
    event,
  };
}
