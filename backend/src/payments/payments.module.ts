import { Module } from '@nestjs/common';
import { StripeGateway } from './stripe.gateway';
import { CheckoutService } from './checkout.service';
import { RefundsService } from './refunds.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsMaintenanceService } from './payments-maintenance.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    StripeGateway,
    CheckoutService,
    RefundsService,
    PaymentsService,
    PaymentsMaintenanceService,
  ],
  exports: [CheckoutService, RefundsService],
})
export class PaymentsModule {}
