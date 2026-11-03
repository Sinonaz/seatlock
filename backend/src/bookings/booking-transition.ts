import { BookingStatus, Prisma } from '@prisma/client';

const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['PAID', 'CANCELLED', 'EXPIRED'],
  PAID: ['REFUNDED'],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return transitions[from].includes(to);
}

export async function transitionBooking(
  tx: Prisma.TransactionClient,
  id: string,
  from: BookingStatus,
  to: BookingStatus,
  data: Prisma.BookingUpdateManyMutationInput = {},
): Promise<boolean> {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal booking transition ${from} -> ${to}`);
  }
  const { count } = await tx.booking.updateMany({
    where: { id, status: from },
    data: { ...data, status: to },
  });
  return count === 1;
}
