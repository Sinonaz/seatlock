import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { EventsQuery } from './events.service';
import { EventsService } from './events.service';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles('ORGANIZER', 'ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.eventsService.createEvent(user, dto);
  }

  @Patch(':id')
  @Roles('ORGANIZER', 'ADMIN')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.updateEvent(user, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Roles('ORGANIZER', 'ADMIN')
  publish(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.eventsService.publishEvent(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('ORGANIZER', 'ADMIN')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.eventsService.cancelEvent(user, id);
  }

  @Get()
  @Public()
  async getEvents(@Query() query: EventsQuery) {
    return this.eventsService.getEvents(query);
  }

  @Get(':id')
  @Public()
  async getEventById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.eventsService.getEvent(id);
  }
}
