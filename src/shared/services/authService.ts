const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/auth`;

import { supabase } from '../utils/supabaseClient';

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  created_at: string;
  last_sign_in?: string;
}

export interface AuthResult {
  success: boolean;
  data?: {
    user: AuthUser;
    token: string;
  };
  message?: string;
  error?: string;
}

export interface SimpleResult {
  success: boolean;
  message?: string;
  error?: string;
}

// Safely parse JSON — returns a fallback error object if the body is empty or non-JSON
async function safeJson<T>(res: Response, fallback: T): Promise<T> {
  try {
    const text = await res.text();
    if (!text) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

async function apiPost(
  path: string,
  body: Record<string, unknown>,
  token?: string
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function apiGet(path: string, token: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await apiPost('/login', { email, password });
  return safeJson<AuthResult>(res, { success: false, error: 'Server did not return a response.' });
}

export async function register(
  email: string,
  password: string,
  username?: string
): Promise<AuthResult> {
  const res = await apiPost('/register', { email, password, username });
  return safeJson<AuthResult>(res, { success: false, error: 'Server did not return a response.' });
}

export async function forgotPassword(email: string): Promise<SimpleResult> {
  const res = await apiPost('/forgot-password', { email });
  return safeJson<SimpleResult>(res, { success: false, error: 'Server did not return a response.' });
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<SimpleResult> {
  const res = await apiPost('/reset-password', { token, newPassword });
  return safeJson<SimpleResult>(res, { success: false, error: 'Server did not return a response.' });
}

export async function getProfile(token: string): Promise<AuthResult> {
  const res = await apiGet('/profile', token);
  return safeJson<AuthResult>(res, { success: false, error: 'Server did not return a response.' });
}

export async function logout(token: string): Promise<SimpleResult> {
  const res = await apiPost('/logout', {}, token);
  return safeJson<SimpleResult>(res, { success: false });
}

/**
 * Initiate Google OAuth login via Supabase
 * Redirects user to Google login, then back to /auth/callback
 */
export async function loginWithGoogle(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      console.error('Google OAuth error:', error);
      throw new Error(error.message || 'Failed to initiate Google sign-in');
    }

    if (data?.url) {
      window.location.href = data.url;
    }
  } catch (error) {
    console.error('loginWithGoogle error:', error);
    throw error;
  }
}

/**
 * Get the current Supabase session (from OAuth callback)
 * Called after the user returns from Google login
 */
export async function getSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  } catch (error) {
    console.error('getSession error:', error);
    return null;
  }
}

/**
 * Verify and exchange Supabase OAuth session for app JWT token
 * This is called after successful Google OAuth
 */
export async function verifyGoogleSession(): Promise<AuthResult> {
  try {
    const session = await getSession();
    
    if (!session?.access_token) {
      return { success: false, error: 'No valid session found' };
    }

    // Send the Supabase access token to our backend to verify and get a JWT
    const res = await apiPost('/google/verify', { access_token: session.access_token });
    return safeJson<AuthResult>(res, { success: false, error: 'Server did not return a response.' });
  } catch (error) {
    console.error('verifyGoogleSession error:', error);
    return { success: false, error: 'Failed to verify Google session' };
  }
}