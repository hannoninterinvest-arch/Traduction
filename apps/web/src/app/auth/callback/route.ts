import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const response = NextResponse.redirect(new URL('/en/dashboard', url.origin));
  if (!code || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    return response;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach((cookie) =>
            response.cookies.set(cookie.name, cookie.value, cookie.options),
          );
        },
      },
    },
  );
  const { data } = await supabase.auth.exchangeCodeForSession(code);
  const token = data.session?.access_token;
  if (token)
    response.cookies.set('dt_token', token, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });
  return response;
}
