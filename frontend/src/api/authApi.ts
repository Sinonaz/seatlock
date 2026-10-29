import { apiClient } from './client';
import type { AuthResponse, LoginDto, RegisterDto, User } from '@/types';

export const authApi = {
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', dto);
    return response.data;
  },

  async login(dto: LoginDto): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login', dto);
    return response.data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async me(): Promise<User> {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },
};
