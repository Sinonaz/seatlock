import { apiClient } from './client';
import type { Booking, CheckoutResponse, CreateBookingDto } from '@/types';

export const bookingsApi = {
  // The caller generates idempotencyKey once per user intent and reuses it on retries,
  // so a double click or a network retry never creates a second booking.
  async createBooking(dto: CreateBookingDto, idempotencyKey: string): Promise<Booking> {
    const response = await apiClient.post<Booking>('/bookings', dto, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return response.data;
  },

  async getMyBookings(): Promise<Booking[]> {
    const response = await apiClient.get<Booking[]>('/bookings/my');
    return response.data;
  },

  async getBooking(id: string): Promise<Booking> {
    const response = await apiClient.get<Booking>(`/bookings/${id}`);
    return response.data;
  },

  async cancelBooking(id: string): Promise<Booking> {
    const response = await apiClient.post<Booking>(`/bookings/${id}/cancel`);
    return response.data;
  },

  // Returns a Stripe Checkout URL (or /mock-checkout/:id in mock mode)
  async payBooking(id: string): Promise<CheckoutResponse> {
    const response = await apiClient.post<CheckoutResponse>(`/bookings/${id}/pay`);
    return response.data;
  },
};
