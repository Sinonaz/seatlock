import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeGateway {
  private readonly client: Stripe | undefined;

  constructor(private readonly config: ConfigService) {
    if (config.get<boolean>('STRIPE_ENABLED') === true) {
      this.client = new Stripe(config.getOrThrow<string>('STRIPE_SECRET_KEY'), {
        timeout: 15_000,
        maxNetworkRetries: 2,
      });
    }
  }

  requireClient(): Stripe {
    if (!this.client)
      throw new ServiceUnavailableException(
        'Stripe is disabled. Configure Stripe credentials and set STRIPE_ENABLED=true',
      );
    return this.client;
  }

  constructEvent(body: Buffer, signature: string): Stripe.Event {
    return this.requireClient().webhooks.constructEvent(
      body,
      signature,
      this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
    );
  }

  createCheckout(params: Stripe.Checkout.SessionCreateParams, key: string) {
    return this.requireClient().checkout.sessions.create(params, {
      idempotencyKey: key,
    });
  }

  retrieveCheckout(id: string) {
    return this.requireClient().checkout.sessions.retrieve(id);
  }

  expireCheckout(id: string) {
    return this.requireClient().checkout.sessions.expire(id);
  }

  refund(paymentIntent: string, key: string) {
    return this.requireClient().refunds.create(
      { payment_intent: paymentIntent },
      { idempotencyKey: key },
    );
  }
}
