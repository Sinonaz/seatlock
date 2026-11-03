import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CheckoutService } from './checkout.service';
import { RefundsService } from './refunds.service';

@Injectable()
export class PaymentsMaintenanceService {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly refunds: RefundsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async maintainPayments() {
    await this.checkout.closeStaleSessions();
    await this.refunds.refundCancelledEvents();
  }
}
