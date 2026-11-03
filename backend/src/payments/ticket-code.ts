import { randomInt } from 'node:crypto';

export function generateTicketCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () =>
    Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(
      '',
    );
  return `SL-${part()}-${part()}`;
}
