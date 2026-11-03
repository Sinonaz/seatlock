import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { BookingsService } from './bookings.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IdempotencyKey } from './idempotencyKey.decorator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CheckoutService } from '../payments/checkout.service';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';

@Controller('bookings')
@ApiTags('Bookings')
@ApiBearerAuth()
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly checkout: CheckoutService,
  ) {}

  @Post(':id/pay')
  @HttpCode(200)
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.checkout.createCheckout(user.id, id);
  }

  @Get('my')
  async getMyBookings(@CurrentUser() user: AuthUser) {
    return this.bookingsService.getMyBookings(user);
  }

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  async createBooking(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() key: string,
    @Body() dto: CreateBookingDto,
    @Res() res: Response,
  ) {
    const { booking, created } = await this.bookingsService.createBooking(
      user.id,
      dto,
      key,
    );
    return res.status(created ? 201 : 200).json(booking);
  }

  @Get(':id')
  getBooking(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.bookingsService.getBooking(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancelBooking(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.bookingsService.cancelBooking(user, id);
  }
}
