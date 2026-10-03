export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';

export function authMode(): 'dev' | 'supabase' {
  return process.env.NEXT_PUBLIC_AUTH_MODE === 'supabase' ? 'supabase' : 'dev';
}

export function readToken(): string | null {
  if (typeof document === 'undefined') return null;
  const fromCookie = document.cookie
    .split('; ')
    .find((part) => part.startsWith('dt_token='))
    ?.slice('dt_token='.length);
  if (fromCookie) return decodeURIComponent(fromCookie);
  return window.localStorage.getItem('dt_token');
}

export function writeToken(token: string | null) {
  if (typeof document === 'undefined') return;
  if (!token) {
    document.cookie = 'dt_token=; path=/; max-age=0; samesite=lax';
    window.localStorage.removeItem('dt_token');
    return;
  }
  document.cookie = `dt_token=${encodeURIComponent(token)}; path=/; max-age=2592000; samesite=lax`;
  window.localStorage.setItem('dt_token', token);
}

export function devToken() {
  return `dev:${DEV_USER_ID}`;
}
