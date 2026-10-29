import { apiClient } from './client';
import type { Paginated, Role, User, UsersQuery } from '@/types';

export const adminApi = {
  async getUsers(query: UsersQuery = {}): Promise<Paginated<User>> {
    const response = await apiClient.get<Paginated<User>>('/admin/users', { params: query });
    return response.data;
  },

  async changeRole(userId: string, role: Role): Promise<User> {
    const response = await apiClient.patch<User>(`/admin/users/${userId}/role`, { role });
    return response.data;
  },
};
