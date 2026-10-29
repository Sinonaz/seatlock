import { apiClient } from './client';
import type {
  CreateEventDto,
  EventItem,
  EventsQuery,
  OrganizerEvent,
  Paginated,
  UpdateEventDto,
} from '@/types';

export const eventsApi = {
  // Public catalog: only PUBLISHED upcoming events
  async getEvents(query: EventsQuery = {}): Promise<Paginated<EventItem>> {
    const response = await apiClient.get<Paginated<EventItem>>('/events', { params: query });
    return response.data;
  },

  async getEvent(id: string): Promise<EventItem> {
    const response = await apiClient.get<EventItem>(`/events/${id}`);
    return response.data;
  },

  // Organizer area: own events in any status, with sales stats
  async getMyEvents(): Promise<OrganizerEvent[]> {
    const response = await apiClient.get<OrganizerEvent[]>('/organizer/events');
    return response.data;
  },

  async getMyEvent(id: string): Promise<OrganizerEvent> {
    const response = await apiClient.get<OrganizerEvent>(`/organizer/events/${id}`);
    return response.data;
  },

  async createEvent(dto: CreateEventDto): Promise<EventItem> {
    const response = await apiClient.post<EventItem>('/events', dto);
    return response.data;
  },

  async updateEvent(id: string, dto: UpdateEventDto): Promise<EventItem> {
    const response = await apiClient.patch<EventItem>(`/events/${id}`, dto);
    return response.data;
  },

  async publishEvent(id: string): Promise<EventItem> {
    const response = await apiClient.post<EventItem>(`/events/${id}/publish`);
    return response.data;
  },

  async cancelEvent(id: string): Promise<EventItem> {
    const response = await apiClient.post<EventItem>(`/events/${id}/cancel`);
    return response.data;
  },
};
