import { generateTicketCode } from './ticket-code';

describe('generateTicketCode', () => {
  it('uses the SL-XXXX-XXXX format with a collision-safe alphabet', () => {
    expect(generateTicketCode()).toMatch(
      /^SL-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/,
    );
  });

  it('produces unique codes', () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => generateTicketCode()),
    );
    expect(codes.size).toBe(500);
  });
});
