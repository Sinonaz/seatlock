import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsExpiryService } from './bookings-expiry.service';

@Module({
  imports: [PaymentsModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsExpiryService],
})
export class BookingsModule {}
