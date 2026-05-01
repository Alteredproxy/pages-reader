import type { ApiResponse } from '../types';
import supabase from '../lib/supabase';

const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL}/api/v1`;

class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: any,
  isFormData = false
): Promise<ApiResponse<T>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error("No active session");
  }

  const headers: HeadersInit = {
    'Authorization': `Bearer ${token}`
  };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      throw new Error(`Request failed with status ${response.status}`);
    }
    throw new ApiError(errorData.error?.code || 'UNKNOWN_ERROR', errorData.error?.message || 'An error occurred');
  }

  return response.json();
}
