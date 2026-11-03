import { Controller } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('organizer-events')
export class OrganizerEventsController {
  constructor(private eventsService: EventsService) {}
}
