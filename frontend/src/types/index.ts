// Contracts shared with the NestJS backend. See backend/TECHNICAL_SPECIFICATION.md, section 4.

export type Role = 'USER' | 'ORGANIZER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string; // ISO Date
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto extends LoginDto {
  name: string;
}

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';

export interface EventItem {
  id: string;
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: string; // ISO Date
  priceCents: number; // money is stored in minor units: 2500 = $25.00
  currency: string; // "usd"
  capacity: number;
  availableSeats: number;
  coverImageUrl: string | null;
  status: EventStatus;
  organizer: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface OrganizerEventStats {
  paidSeats: number;
  pendingSeats: number;
  revenueCents: number;
}

export interface OrganizerEvent extends EventItem {
  stats: OrganizerEventStats;
}

export interface CreateEventDto {
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: string;
  priceCents: number;
  capacity: number;
  coverImageUrl?: string | null;
}

export type UpdateEventDto = Partial<CreateEventDto>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface EventsQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export type BookingStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';

export interface BookingEventSummary {
  id: string;
  title: string;
  startsAt: string;
  venue: string;
  city: string;
  coverImageUrl: string | null;
}

export interface Booking {
  id: string;
  status: BookingStatus;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  currency: string;
  expiresAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  ticketCode: string | null;
  createdAt: string;
  event: BookingEventSummary;
}

export interface CreateBookingDto {
  eventId: string;
  quantity: number;
}

export interface CheckoutResponse {
  checkoutUrl: string;
}

export interface UsersQuery {
  page?: number;
  limit?: number;
  search?: string;
}

// Error body produced by the backend exception filter
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  code?: ApiErrorCode;
}

export type ApiErrorCode =
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'EVENT_NOT_AVAILABLE'
  | 'NOT_ENOUGH_SEATS'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'BOOKING_NOT_PENDING'
  | 'BOOKING_EXPIRED'
  | 'REFUND_WINDOW_CLOSED'
  | 'EVENT_LOCKED'
  | 'INVALID_STATUS_TRANSITION'
  | 'CANNOT_CHANGE_OWN_ROLE';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
  duration?: number;
}
