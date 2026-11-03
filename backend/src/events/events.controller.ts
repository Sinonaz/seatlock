import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { EventsQuery } from './events.service';
import { EventsService } from './events.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

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
