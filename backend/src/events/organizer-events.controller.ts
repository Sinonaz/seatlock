import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { EventsService } from './events.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

@Controller('organizer/events')
@Roles('ORGANIZER', 'ADMIN')
export class OrganizerEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  getEvents(@CurrentUser() user: AuthUser) {
    return this.eventsService.getOrganizerEvents(user);
  }

  @Get(':id')
  getEvent(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.eventsService.getOrganizerEvent(user, id);
  }
}
