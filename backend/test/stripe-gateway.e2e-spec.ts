import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeGateway } from '../src/payments/stripe.gateway';

const config = (values: Record<string, unknown>) =>
  ({
    get: (key: string) => values[key],
    getOrThrow: (key: string) => values[key],
  }) as unknown as ConfigService;

describe('StripeGateway', () => {
  it('throws 503 when Stripe is disabled', () => {
    const gateway = new StripeGateway(config({ STRIPE_ENABLED: false }));
    expect(() => gateway.requireClient()).toThrow(ServiceUnavailableException);
  });

  it('builds a client when enabled', () => {
    const gateway = new StripeGateway(
      config({
        STRIPE_ENABLED: true,
        STRIPE_SECRET_KEY: 'sk_test_x',
        STRIPE_WEBHOOK_SECRET: 'whsec_x',
      }),
    );
    expect(gateway.requireClient()).toBeTruthy();
  });
});
